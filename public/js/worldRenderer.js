import * as THREE from '../vendor/three/three.module.min.js';
import { getBaseBlock } from '../shared/terrainGen.js';

const CHUNK_SIZE = 16;

const FACES = [
  { dir: [1, 0, 0],  faceKind: 'side',   corners: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]] },
  { dir: [-1, 0, 0], faceKind: 'side',   corners: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
  { dir: [0, 1, 0],  faceKind: 'top',    corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
  { dir: [0, -1, 0], faceKind: 'bottom', corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { dir: [0, 0, 1],  faceKind: 'side',   corners: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
  { dir: [0, 0, -1], faceKind: 'side',   corners: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] }
];

const UVS = [[0, 0], [1, 0], [1, 1], [0, 1]];

export class WorldRenderer {
  constructor(scene, textures, catalog, bounds) {
    this.scene = scene;
    this.textures = textures;
    this.catalog = catalog;
    this.bounds = bounds;

    this.sizeX = bounds.maxX - bounds.minX + 1;
    this.sizeY = bounds.maxY - bounds.minY + 1;
    this.sizeZ = bounds.maxZ - bounds.minZ + 1;
    this.volume = this.sizeX * this.sizeY * this.sizeZ;

    this.streaming = false;
    this.viewRadius = 5; // chunks around player (5 -> 11x11 = 176x176 blocks)
    this.grid = null;    // Used in fixed RLE mode (Job Village)
    this.deltas = new Map();
    this.chunkData = new Map(); // "cx,cz" -> Uint8Array(16 * sizeY * 16)
    this.chunkGroups = new Map();

    this.numToId = {};
    this.idToNum = {};
    this.transparentNum = new Uint8Array(256);
    this.solidNum = new Uint8Array(256);

    for (const def of Object.values(catalog)) {
      if (def.kind === 'block' && def.numId) {
        this.numToId[def.numId] = def.id;
        this.idToNum[def.id] = def.numId;
        this.transparentNum[def.numId] = def.transparent ? 1 : 0;
        this.solidNum[def.numId] = def.solid ? 1 : 0;
      }
    }

    this.crossNums = new Set([
      this.idToNum['sapling'],
      this.idToNum['wheat_1'],
      this.idToNum['wheat_2'],
      this.idToNum['wheat_3'],
      this.idToNum['ladder'],
      this.idToNum['sign']
    ].filter(Boolean));

    this.worldGroup = new THREE.Group();
    this.scene.add(this.worldGroup);

    const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.01, 1.01, 1.01));
    this.highlightBox = new THREE.LineSegments(
      edges,
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 })
    );
    this.highlightBox.visible = false;
    this.scene.add(this.highlightBox);

    this.crackMat = new THREE.MeshBasicMaterial({
      map: this.textures.crackTextures?.[0] || null,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2
    });
    this.crackBox = new THREE.Mesh(new THREE.BoxGeometry(1.008, 1.008, 1.008), this.crackMat);
    this.crackBox.visible = false;
    this.scene.add(this.crackBox);

    this.particles = [];
    this.particlesEnabled = true;
    this.particleGeo = new THREE.BoxGeometry(0.14, 0.14, 0.14);
    this._lastCrackStage = -1;

    this.brushGroup = new THREE.Group();
    this.brushBoxes = [];
    const brushEdges = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.005, 1.005, 1.005));
    const brushMat = new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.9 });
    for (let i = 0; i < 25; i++) {
      const box = new THREE.LineSegments(brushEdges, brushMat);
      box.visible = false;
      this.brushGroup.add(box);
      this.brushBoxes.push(box);
    }
    this.scene.add(this.brushGroup);
  }

  setViewDistance(distBlocks) {
    this.viewRadius = Math.max(3, Math.min(8, Math.round(distBlocks / 24)));
  }

  inBounds(x, y, z) {
    return (
      x >= this.bounds.minX && x <= this.bounds.maxX &&
      y >= this.bounds.minY && y <= this.bounds.maxY &&
      z >= this.bounds.minZ && z <= this.bounds.maxZ
    );
  }

  flatIndex(x, y, z) {
    return (x - this.bounds.minX) + this.sizeX * ((z - this.bounds.minZ) + this.sizeZ * (y - this.bounds.minY));
  }

  _chunkLocalIdx(lx, y, lz) {
    return lx + CHUNK_SIZE * (lz + CHUNK_SIZE * (y - this.bounds.minY));
  }

  _ensureChunkData(cx, cz) {
    const ck = `${cx},${cz}`;
    let data = this.chunkData.get(ck);
    if (data) return data;

    data = new Uint8Array(CHUNK_SIZE * this.sizeY * CHUNK_SIZE);
    const baseX = cx * CHUNK_SIZE;
    const baseZ = cz * CHUNK_SIZE;

    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      const wx = 0;
      const wz = baseZ + lz;
      if (wz < this.bounds.minZ || wz > this.bounds.maxZ) continue;
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const x = baseX + lx;
        if (x < this.bounds.minX || x > this.bounds.maxX) continue;
        for (let y = this.bounds.minY; y <= this.bounds.maxY; y++) {
          const k = `${x},${y},${wz}`;
          const id = this.deltas.has(k) ? this.deltas.get(k) : getBaseBlock(x, y, wz);
          if (id) data[this._chunkLocalIdx(lx, y, lz)] = this.idToNum[id] || 0;
        }
      }
      void wx;
    }

    this.chunkData.set(ck, data);
    return data;
  }

  getNum(x, y, z) {
    if (!this.inBounds(x, y, z)) return 0;
    if (!this.streaming) {
      return this.grid ? this.grid[this.flatIndex(x, y, z)] : 0;
    }
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    const data = this.chunkData.get(`${cx},${cz}`);
    if (data) {
      const lx = x - cx * CHUNK_SIZE;
      const lz = z - cz * CHUNK_SIZE;
      return data[this._chunkLocalIdx(lx, y, lz)];
    }
    const k = `${x},${y},${z}`;
    const id = this.deltas.has(k) ? this.deltas.get(k) : getBaseBlock(x, y, z);
    return id ? (this.idToNum[id] || 0) : 0;
  }

  getBlock(x, y, z) {
    const num = this.getNum(x, y, z);
    return num === 0 ? null : (this.numToId[num] || null);
  }

  isSolid(x, y, z) {
    const num = this.getNum(x, y, z);
    return num !== 0 && this.solidNum[num] === 1;
  }

  _clearAllChunks() {
    for (const g of this.chunkGroups.values()) {
      this._disposeGroup(g);
      this.worldGroup.remove(g);
    }
    this.chunkGroups.clear();
    this.chunkData.clear();
  }

  // Fixed RLE mode (used by Job Experience Village 64x24x64)
  loadFromRLE(rle) {
    this.streaming = false;
    this._clearAllChunks();
    this.grid = new Uint8Array(this.volume);

    let pos = 0;
    for (let i = 0; i < rle.length; i += 2) {
      const val = rle[i];
      const count = rle[i + 1];
      this.grid.fill(val, pos, Math.min(this.volume, pos + count));
      pos += count;
      if (pos >= this.volume) break;
    }

    const minCx = Math.floor(this.bounds.minX / CHUNK_SIZE);
    const maxCx = Math.floor(this.bounds.maxX / CHUNK_SIZE);
    const minCz = Math.floor(this.bounds.minZ / CHUNK_SIZE);
    const maxCz = Math.floor(this.bounds.maxZ / CHUNK_SIZE);
    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cz = minCz; cz <= maxCz; cz++) this.rebuildChunk(cx, cz);
    }
  }

  // Dynamic Chunk Streaming mode (used by 1024x96x1024 Sandbox World!)
  loadStreaming(deltasObj, initialPos) {
    this.streaming = true;
    this.grid = null;
    this._clearAllChunks();
    this.deltas.clear();
    for (const [k, v] of Object.entries(deltasObj || {})) {
      this.deltas.set(k, v);
    }
    // Synchronously build immediate 3x3 chunks around spawn so the ground is ready on frame 1!
    const pcx = Math.floor((initialPos?.x || 0) / CHUNK_SIZE);
    const pcz = Math.floor((initialPos?.z || 0) / CHUNK_SIZE);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        this._ensureChunkData(pcx + dx, pcz + dz);
        this.rebuildChunk(pcx + dx, pcz + dz);
      }
    }
  }

  // Called each frame: streams in up to 3 nearest chunks & unloads distant chunks
  updateStreaming(playerPos) {
    if (!this.streaming) return;
    const pcx = Math.floor(playerPos.x / CHUNK_SIZE);
    const pcz = Math.floor(playerPos.z / CHUNK_SIZE);
    const r = this.viewRadius;
    const unloadR = r + 2;

    const minCx = Math.floor(this.bounds.minX / CHUNK_SIZE);
    const maxCx = Math.floor(this.bounds.maxX / CHUNK_SIZE);
    const minCz = Math.floor(this.bounds.minZ / CHUNK_SIZE);
    const maxCz = Math.floor(this.bounds.maxZ / CHUNK_SIZE);

    // 1. Unload distant chunks
    for (const ck of [...this.chunkGroups.keys()]) {
      const [cx, cz] = ck.split(',').map(Number);
      if (Math.abs(cx - pcx) > unloadR || Math.abs(cz - pcz) > unloadR) {
        const g = this.chunkGroups.get(ck);
        if (g) { this._disposeGroup(g); this.worldGroup.remove(g); }
        this.chunkGroups.delete(ck);
        this.chunkData.delete(ck);
      }
    }

    // 2. Find closest unloaded chunks within viewRadius
    const missing = [];
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (dx * dx + dz * dz > r * r + 2) continue;
        const cx = pcx + dx, cz = pcz + dz;
        if (cx < minCx || cx > maxCx || cz < minCz || cz > maxCz) continue;
        const ck = `${cx},${cz}`;
        if (!this.chunkGroups.has(ck)) {
          missing.push({ cx, cz, distSq: dx * dx + dz * dz });
        }
      }
    }

    if (missing.length === 0) return;
    missing.sort((a, b) => a.distSq - b.distSq);

    const budget = 3; // Build 3 chunks per frame for silky 60fps streaming
    for (let i = 0; i < Math.min(budget, missing.length); i++) {
      const { cx, cz } = missing[i];
      this._ensureChunkData(cx, cz);
      this.rebuildChunk(cx, cz);
    }
  }

  _writeBlockInternal(x, y, z, blockId) {
    const num = blockId ? (this.idToNum[blockId] || 0) : 0;
    if (!this.streaming) {
      if (this.grid) this.grid[this.flatIndex(x, y, z)] = num;
      return;
    }
    const k = `${x},${y},${z}`;
    this.deltas.set(k, blockId || null);
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    const data = this.chunkData.get(`${cx},${cz}`);
    if (data) {
      data[this._chunkLocalIdx(x - cx * CHUNK_SIZE, y, z - cz * CHUNK_SIZE)] = num;
    }
  }

  setBlock(x, y, z, blockId) {
    if (!this.inBounds(x, y, z)) return;
    this._writeBlockInternal(x, y, z, blockId);

    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    const toRebuild = new Set([`${cx},${cz}`]);
    const localX = ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const localZ = ((z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    if (localX === 0) toRebuild.add(`${cx - 1},${cz}`);
    if (localX === CHUNK_SIZE - 1) toRebuild.add(`${cx + 1},${cz}`);
    if (localZ === 0) toRebuild.add(`${cx},${cz - 1}`);
    if (localZ === CHUNK_SIZE - 1) toRebuild.add(`${cx},${cz + 1}`);

    for (const ck of toRebuild) {
      if (!this.streaming || this.chunkGroups.has(ck)) {
        const [rx, rz] = ck.split(',').map(Number);
        this.rebuildChunk(rx, rz);
      }
    }
  }

  applyBatch(changes) {
    const dirty = new Set();
    for (const c of changes) {
      if (!this.inBounds(c.x, c.y, c.z)) continue;
      this._writeBlockInternal(c.x, c.y, c.z, c.block);
      const cx = Math.floor(c.x / CHUNK_SIZE);
      const cz = Math.floor(c.z / CHUNK_SIZE);
      dirty.add(`${cx},${cz}`);
      const lx = ((c.x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
      const lz = ((c.z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
      if (lx === 0) dirty.add(`${cx - 1},${cz}`);
      if (lx === CHUNK_SIZE - 1) dirty.add(`${cx + 1},${cz}`);
      if (lz === 0) dirty.add(`${cx},${cz - 1}`);
      if (lz === CHUNK_SIZE - 1) dirty.add(`${cx},${cz + 1}`);
    }
    for (const ck of dirty) {
      if (!this.streaming || this.chunkGroups.has(ck)) {
        const [rx, rz] = ck.split(',').map(Number);
        this.rebuildChunk(rx, rz);
      }
    }
  }

  _disposeGroup(group) {
    group.traverse((obj) => { if (obj.geometry) obj.geometry.dispose(); });
  }

  rebuildChunk(cx, cz) {
    const ck = `${cx},${cz}`;
    const oldGroup = this.chunkGroups.get(ck);
    if (oldGroup) {
      this._disposeGroup(oldGroup);
      this.worldGroup.remove(oldGroup);
      this.chunkGroups.delete(ck);
    }

    const startX = Math.max(this.bounds.minX, cx * CHUNK_SIZE);
    const endX = Math.min(this.bounds.maxX, cx * CHUNK_SIZE + CHUNK_SIZE - 1);
    const startZ = Math.max(this.bounds.minZ, cz * CHUNK_SIZE);
    const endZ = Math.min(this.bounds.maxZ, cz * CHUNK_SIZE + CHUNK_SIZE - 1);
    if (startX > endX || startZ > endZ) return;

    const cData = this.streaming ? this._ensureChunkData(cx, cz) : null;
    const baseX = cx * CHUNK_SIZE;
    const baseZ = cz * CHUNK_SIZE;

    const buckets = new Map();
    const getBucket = (blockId, faceKind) => {
      const key = `${blockId}:${faceKind}`;
      let buf = buckets.get(key);
      if (!buf) {
        buf = { blockId, faceKind, positions: [], normals: [], uvs: [], indices: [] };
        buckets.set(key, buf);
      }
      return buf;
    };

    for (let y = this.bounds.minY; y <= this.bounds.maxY; y++) {
      for (let z = startZ; z <= endZ; z++) {
        for (let x = startX; x <= endX; x++) {
          const num = cData
            ? cData[this._chunkLocalIdx(x - baseX, y, z - baseZ)]
            : this.grid[this.flatIndex(x, y, z)];
          if (num === 0) continue;
          const blockId = this.numToId[num];
          if (!blockId) continue;

          if (this.crossNums.has(num)) {
            const buf = getBucket(blockId, 'side');
            const quads = [
              [[0.15, 0, 0.15], [0.85, 0, 0.85], [0.85, 0.92, 0.85], [0.15, 0.92, 0.15]],
              [[0.85, 0, 0.15], [0.15, 0, 0.85], [0.15, 0.92, 0.85], [0.85, 0.92, 0.15]]
            ];
            for (const q of quads) {
              const base = buf.positions.length / 3;
              for (let i = 0; i < 4; i++) {
                buf.positions.push(x + q[i][0], y + q[i][1], z + q[i][2]);
                buf.normals.push(0, 1, 0);
                buf.uvs.push(UVS[i][0], UVS[i][1]);
              }
              buf.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
            }
            continue;
          }

          const selfTrans = this.transparentNum[num] === 1;
          for (let f = 0; f < 6; f++) {
            const face = FACES[f];
            const nx = x + face.dir[0];
            const ny = y + face.dir[1];
            const nz = z + face.dir[2];

            let nNum;
            if (cData && nx >= baseX && nx < baseX + CHUNK_SIZE && nz >= baseZ && nz < baseZ + CHUNK_SIZE && ny >= this.bounds.minY && ny <= this.bounds.maxY) {
              nNum = cData[this._chunkLocalIdx(nx - baseX, ny, nz - baseZ)];
            } else {
              nNum = this.getNum(nx, ny, nz);
            }

            if (nNum !== 0) {
              const nTrans = this.transparentNum[nNum] === 1;
              if (!nTrans) continue;
              if (selfTrans && nNum === num) continue;
            }

            const buf = getBucket(blockId, face.faceKind);
            const base = buf.positions.length / 3;
            for (let i = 0; i < 4; i++) {
              const c = face.corners[i];
              buf.positions.push(x + c[0], y + c[1], z + c[2]);
              buf.normals.push(face.dir[0], face.dir[1], face.dir[2]);
              buf.uvs.push(UVS[i][0], UVS[i][1]);
            }
            buf.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
          }
        }
      }
    }

    const group = new THREE.Group();
    for (const buf of buckets.values()) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(buf.positions, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(buf.normals, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(buf.uvs, 2));
      geo.setIndex(buf.indices);
      const mat = this.textures.getFaceMaterial(buf.blockId, buf.faceKind);
      const mesh = new THREE.Mesh(geo, mat);
      if (buf.blockId === 'water') mesh.renderOrder = 2;
      group.add(mesh);
    }
    this.chunkGroups.set(ck, group);
    this.worldGroup.add(group);
  }

  raycast(origin, direction, maxDist = 7) {
    let x = Math.floor(origin.x), y = Math.floor(origin.y), z = Math.floor(origin.z);
    const stepX = direction.x > 0 ? 1 : (direction.x < 0 ? -1 : 0);
    const stepY = direction.y > 0 ? 1 : (direction.y < 0 ? -1 : 0);
    const stepZ = direction.z > 0 ? 1 : (direction.z < 0 ? -1 : 0);
    const tDeltaX = stepX !== 0 ? Math.abs(1 / direction.x) : Infinity;
    const tDeltaY = stepY !== 0 ? Math.abs(1 / direction.y) : Infinity;
    const tDeltaZ = stepZ !== 0 ? Math.abs(1 / direction.z) : Infinity;
    let tMaxX = stepX > 0 ? (x + 1 - origin.x) * tDeltaX : (stepX < 0 ? (origin.x - x) * tDeltaX : Infinity);
    let tMaxY = stepY > 0 ? (y + 1 - origin.y) * tDeltaY : (stepY < 0 ? (origin.y - y) * tDeltaY : Infinity);
    let tMaxZ = stepZ > 0 ? (z + 1 - origin.z) * tDeltaZ : (stepZ < 0 ? (origin.z - z) * tDeltaZ : Infinity);

    let dist = 0, nx = 0, ny = 0, nz = 0;
    const waterNum = this.idToNum['water'] || -1;

    while (dist <= maxDist) {
      const num = this.getNum(x, y, z);
      if (num !== 0 && num !== waterNum) {
        return { x, y, z, block: this.numToId[num], placeX: x + nx, placeY: y + ny, placeZ: z + nz };
      }
      if (tMaxX < tMaxY && tMaxX < tMaxZ) {
        dist = tMaxX; tMaxX += tDeltaX; x += stepX; nx = -stepX; ny = 0; nz = 0;
      } else if (tMaxY < tMaxZ) {
        dist = tMaxY; tMaxY += tDeltaY; y += stepY; nx = 0; ny = -stepY; nz = 0;
      } else {
        dist = tMaxZ; tMaxZ += tDeltaZ; z += stepZ; nx = 0; ny = 0; nz = -stepZ;
      }
    }
    return null;
  }

  updateBrushPreview(positions) {
    if (!positions || positions.length === 0) {
      for (const b of this.brushBoxes) b.visible = false;
      return;
    }
    for (let i = 0; i < this.brushBoxes.length; i++) {
      if (i < positions.length) {
        const p = positions[i];
        this.brushBoxes[i].position.set(p.x + 0.5, p.y + 0.5, p.z + 0.5);
        this.brushBoxes[i].visible = true;
      } else {
        this.brushBoxes[i].visible = false;
      }
    }
  }

  updateHighlight(hit, miningProgress = 0) {
    if (hit) {
      this.highlightBox.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
      this.highlightBox.visible = true;
      if (miningProgress > 0.01 && this.textures.crackTextures?.length) {
        const stage = Math.min(9, Math.floor(miningProgress * 10));
        if (stage !== this._lastCrackStage) {
          this._lastCrackStage = stage;
          this.crackMat.map = this.textures.crackTextures[stage];
          this.crackMat.needsUpdate = true;
        }
        this.crackBox.position.copy(this.highlightBox.position);
        this.crackBox.visible = true;
      } else {
        this._lastCrackStage = -1;
        this.crackBox.visible = false;
      }
    } else {
      this._lastCrackStage = -1;
      this.highlightBox.visible = false;
      this.crackBox.visible = false;
    }
  }

  spawnBreakParticles(x, y, z, blockId, count = 12) {
    if (!this.particlesEnabled) return;
    const mat = this.textures.getFaceMaterial(blockId, 'side');
    if (!mat) return;
    const MAX_PARTICLES = 140;
    const toSpawn = Math.min(count, Math.max(0, MAX_PARTICLES - this.particles.length));
    for (let i = 0; i < toSpawn; i++) {
      const m = new THREE.Mesh(this.particleGeo, mat);
      m.position.set(x + 0.2 + Math.random() * 0.6, y + 0.2 + Math.random() * 0.6, z + 0.2 + Math.random() * 0.6);
      this.scene.add(m);
      this.particles.push({
        mesh: m,
        vx: (Math.random() - 0.5) * 4.2,
        vy: 1.8 + Math.random() * 3.2,
        vz: (Math.random() - 0.5) * 4.2,
        life: 0.45 + Math.random() * 0.35
      });
    }
  }

  updateParticles(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        this.particles.splice(i, 1);
        continue;
      }
      p.vy -= 14 * dt;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;
      p.mesh.rotation.x += dt * 7;
      p.mesh.rotation.y += dt * 5;
      p.mesh.scale.setScalar(Math.min(1, p.life * 2.5));
    }
  }
}
