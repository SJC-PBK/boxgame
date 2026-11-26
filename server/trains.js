// Boxworld Voxel Train & Rail Simulation Engine
// Supports: straight, curve, cross, switchable branch rails, red stop cards, yellow whistle cards,
// and multi-car connected trains that snake smoothly around curves and junctions!
import fs from 'node:fs';
import path from 'node:path';
import { RAIL_IDS } from './blocks.js';

const RAIL_SET = new Set(RAIL_IDS);
// 0=N(-Z), 1=E(+X), 2=S(+Z), 3=W(-X)
const DX = [0, 1, 0, -1];
const DZ = [-1, 0, 1, 0];
const YAW_FOR_DIR = [Math.PI, Math.PI / 2, 0, -Math.PI / 2];

export function isRailBlock(id) {
  return !!id && RAIL_SET.has(id);
}

function getRailConnections(blockId, facing) {
  const f = Number(facing || 0) & 3;
  if (blockId === 'rail_straight' || blockId === 'rail_card_red' || blockId === 'rail_card_yellow' || blockId === 'rail_card_green') {
    return (f === 0 || f === 2) ? [0, 2] : [1, 3];
  }
  if (blockId === 'rail_cross' || blockId === 'rail_xbranch' || blockId === 'rail_xbranch_turn') {
    return [0, 1, 2, 3];
  }
  if (blockId === 'rail_curve') {
    if (f === 0) return [0, 1];
    if (f === 1) return [1, 2];
    if (f === 2) return [2, 3];
    return [3, 0];
  }
  if (blockId === 'rail_branch' || blockId === 'rail_branch_turn') {
    // T-branch: stem rear=(f+2)&3, Left=(f+3)&3, Right=(f+1)&3
    return [(f + 2) & 3, (f + 3) & 3, (f + 1) & 3];
  }
  return [];
}

function chooseExitDir(blockId, facing, enterFrom) {
  const f = Number(facing || 0) & 3;
  const opp = (enterFrom + 2) & 3;
  if (blockId === 'rail_cross') return opp;
  if (blockId === 'rail_straight' || blockId === 'rail_card_red' || blockId === 'rail_card_yellow' || blockId === 'rail_card_green') {
    const conns = getRailConnections(blockId, f);
    if (conns.includes(opp)) return opp;
    return conns.find(c => c !== enterFrom) ?? opp;
  }
  if (blockId === 'rail_curve') {
    const conns = getRailConnections(blockId, f);
    if (conns[0] === enterFrom) return conns[1];
    if (conns[1] === enterFrom) return conns[0];
    return conns[0];
  }
  if (blockId === 'rail_branch' || blockId === 'rail_branch_turn') {
    // T-branch: Blue (L) -> Left (f+3)&3, Green (R) -> Right (f+1)&3
    const rear = (f + 2) & 3;
    const left = (f + 3) & 3;
    const right = (f + 1) & 3;
    const isR = blockId === 'rail_branch_turn';
    if (enterFrom === rear) return isR ? right : left;
    if (enterFrom === left) return isR ? right : rear;
    if (enterFrom === right) return isR ? rear : left;
    return opp;
  }
  if (blockId === 'rail_xbranch' || blockId === 'rail_xbranch_turn') {
    // X-branch (4-way switchable): Blue (L) turns Left from approaching direction, Green (R) turns Right!
    const fwd = opp;
    const isR = blockId === 'rail_xbranch_turn';
    return isR ? ((fwd + 1) & 3) : ((fwd + 3) & 3);
  }
  return opp;
}

export class TrainManager {
  constructor(store, dataDir) {
    this.store = store;
    this.filePath = path.join(path.resolve(dataDir), 'trains.json');
    this.trains = new Map(); // id -> train
    this.nextId = 1;
    this._load();
  }

  _load() {
    try {
      if (!fs.existsSync(this.filePath)) return;
      const raw = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      if (!Array.isArray(raw)) return;
      for (const t of raw) {
        if (!t || !t.id) continue;
        this.trains.set(t.id, t);
        const n = Number(String(t.id).replace('train-', ''));
        if (Number.isFinite(n) && n >= this.nextId) this.nextId = n + 1;
      }
    } catch (err) {
      console.error('[TrainManager] Load error:', err.message);
    }
  }

  save() {
    try {
      const tmp = `${this.filePath}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify([...this.trains.values()]), 'utf8');
      fs.renameSync(tmp, this.filePath);
    } catch (err) {
      console.error('[TrainManager] Save error:', err.message);
    }
  }

  _findRailNeighbor(x, y, z, preferDir) {
    const order = [preferDir, (preferDir + 1) & 3, (preferDir + 3) & 3, (preferDir + 2) & 3];
    for (const d of order) {
      const nx = x + DX[d], nz = z + DZ[d];
      if (isRailBlock(this.store.getBlock(nx, y, nz))) {
        return { x: nx, y, z: nz, dir: d };
      }
    }
    return null;
  }

  _buildInitialPath(x, y, z, dir, count) {
    const pathTiles = [{ x, y, z, dir }];
    let cx = x, cy = y, cz = z, backDir = (dir + 2) & 3;
    for (let i = 1; i < Math.max(count + 1, 2); i++) {
      const nx = cx + DX[backDir], nz = cz + DZ[backDir];
      if (isRailBlock(this.store.getBlock(nx, cy, nz))) {
        const blk = this.store.getBlock(nx, cy, nz);
        const f = this.store.facings[`${nx},${cy},${nz}`] || 0;
        const enterFrom = (backDir + 2) & 3;
        const nextBack = chooseExitDir(blk, f, enterFrom);
        pathTiles.push({ x: nx, y: cy, z: nz, dir: (backDir + 2) & 3 });
        cx = nx; cz = nz; backDir = nextBack;
      } else {
        pathTiles.push({ x: cx + DX[backDir], y: cy, z: cz + DZ[backDir], dir });
        cx += DX[backDir]; cz += DZ[backDir];
      }
    }
    return pathTiles;
  }

  spawnTrain(x, y, z, dir = 1, cars = 1, owner = 'System', autoMove = false) {
    if (!isRailBlock(this.store.getBlock(x, y, z))) return null;
    const id = `train-${this.nextId++}`;
    const d = Number(dir) & 3;
    const cCount = Math.max(1, Math.min(6, Number(cars) || 1));
    const railBlk = this.store.getBlock(x, y, z);
    const railF = this.store.facings[`${x},${y},${z}`] || 0;
    const conns = getRailConnections(railBlk, railF);
    const useDir = conns.includes(d) ? d : (conns[0] ?? d);
    const train = {
      id,
      owner,
      cars: cCount,
      moving: !!autoMove,
      speed: 3.1, // blocks per second
      prog: 0,    // 0..1 interpolation between path[0] and nextTile
      skipRedOnce: false,
      path: this._buildInitialPath(x, y, z, useDir, cCount + 2),
      nextTile: null
    };
    train.nextTile = this._computeNextTile(train);
    this.trains.set(id, train);
    this.save();
    return train;
  }

  _computeNextTile(train) {
    const head = train.path[0];
    if (!head) return null;
    const dir = head.dir;
    const nx = head.x + DX[dir];
    const ny = head.y;
    const nz = head.z + DZ[dir];
    const nextBlk = this.store.getBlock(nx, ny, nz);
    if (!isRailBlock(nextBlk)) return null;
    const nextFacing = this.store.facings[`${nx},${ny},${nz}`] || 0;
    const enterFrom = (dir + 2) & 3;
    const exitDir = chooseExitDir(nextBlk, nextFacing, enterFrom);
    return { x: nx, y: ny, z: nz, dir: exitDir, block: nextBlk };
  }

  coupleCarToTrain(trainId) {
    const t = this.trains.get(trainId);
    if (!t) return { error: '기차를 찾을 수 없습니다.' };
    if (t.cars >= 6) return { error: '기차는 최대 6칸(기관차 1 + 객차 5)까지 연결할 수 있습니다!' };
    t.cars += 1;
    // Extend path if needed
    while (t.path.length < t.cars + 2) {
      const last = t.path[t.path.length - 1];
      const back = (last.dir + 2) & 3;
      t.path.push({ x: last.x + DX[back], y: last.y, z: last.z + DZ[back], dir: last.dir });
    }
    this.save();
    return { train: t };
  }

  findTrainNear(x, y, z, maxDist = 4.5) {
    let best = null, bestD = maxDist * maxDist;
    for (const t of this.trains.values()) {
      for (let i = 0; i < Math.min(t.cars, t.path.length); i++) {
        const p = t.path[i];
        const dx = p.x - x, dy = p.y - y, dz = p.z - z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < bestD) { bestD = d2; best = t; }
      }
    }
    return best;
  }

  toggleTrain(trainId) {
    const t = this.trains.get(trainId);
    if (!t) return null;
    if (t.moving) {
      t.moving = false;
      this.save();
      return { train: t, started: false };
    }
    // Try moving forward; if blocked at end of track, reverse direction!
    t.nextTile = this._computeNextTile(t);
    if (!t.nextTile) {
      const head = t.path[0];
      const revDir = (head.dir + 2) & 3;
      head.dir = revDir;
      t.nextTile = this._computeNextTile(t);
    }
    if (!t.nextTile) return { train: t, started: false, blocked: true };
    t.moving = true;
    t.skipRedOnce = true;
    this.save();
    return { train: t, started: true };
  }

  removeTrain(trainId) {
    const t = this.trains.get(trainId);
    if (!t) return null;
    this.trains.delete(trainId);
    this.save();
    return { engine: 1, cars: Math.max(0, t.cars - 1) };
  }

  // Advance all moving trains by dt seconds; returns list of triggered card/stop events
  tick(dt) {
    const events = [];
    let anyMoved = false;
    for (const t of this.trains.values()) {
      if (!t.moving) continue;
      if (!t.nextTile) {
        t.nextTile = this._computeNextTile(t);
        if (!t.nextTile) {
          // Reached dead-end rail -> stop cleanly
          t.moving = false;
          t.prog = 0;
          events.push({ event: 'stop_end', trainId: t.id, x: t.path[0].x, y: t.path[0].y, z: t.path[0].z });
          continue;
        }
      }

      t.prog += t.speed * dt;
      anyMoved = true;

      if (t.prog >= 1.0) {
        t.prog -= 1.0;
        const arrived = t.nextTile;
        t.path.unshift({ x: arrived.x, y: arrived.y, z: arrived.z, dir: arrived.dir });
        const maxLen = Math.max(8, t.cars + 3);
        if (t.path.length > maxLen) t.path.length = maxLen;

        // Check Action Card on arrived rail tile!
        const blk = this.store.getBlock(arrived.x, arrived.y, arrived.z);
        if (blk === 'rail_card_red' && !t.skipRedOnce) {
          t.moving = false;
          t.prog = 0;
          t.nextTile = this._computeNextTile(t);
          events.push({ event: 'stop_red', trainId: t.id, x: arrived.x, y: arrived.y, z: arrived.z });
          continue;
        }
        t.skipRedOnce = false;
        if (blk === 'rail_card_yellow') {
          events.push({ event: 'whistle', trainId: t.id, x: arrived.x, y: arrived.y, z: arrived.z });
        }
        if (blk === 'rail_card_green' && !t.skipGreenOnce) {
          // Green Reverse Action Card: reverse the entire train consist cleanly backwards along the track!
          const active = t.path.slice(0, Math.min(t.cars, t.path.length)).reverse().map((node) => ({
            x: node.x, y: node.y, z: node.z, dir: (node.dir + 2) & 3
          }));
          t.path = active;
          t.prog = 0;
          t.skipGreenOnce = true;
          t.nextTile = this._computeNextTile(t);
          events.push({ event: 'reverse', trainId: t.id, x: arrived.x, y: arrived.y, z: arrived.z });
          continue;
        }
        t.skipGreenOnce = false;

        // Compute next tile along track (handles live branch switches!)
        t.nextTile = this._computeNextTile(t);
        if (!t.nextTile) {
          t.moving = false;
          t.prog = 0;
          events.push({ event: 'stop_end', trainId: t.id, x: arrived.x, y: arrived.y, z: arrived.z });
        }
      }
    }
    return { anyMoved, events };
  }

  // Serialize interpolated car positions & orientations for all trains
  serializeAll() {
    const out = [];
    for (const t of this.trains.values()) {
      const units = [];
      const p = Math.max(0, Math.min(1, t.prog || 0));
      for (let i = 0; i < t.cars; i++) {
        const cur = t.path[i] || t.path[t.path.length - 1];
        const target = (i === 0) ? (t.nextTile || cur) : (t.path[i - 1] || cur);
        const useP = (t.moving && target) ? p : 0;
        const x = cur.x + 0.5 + (target.x - cur.x) * useP;
        const y = cur.y + 0.10 + (target.y - cur.y) * useP;
        const z = cur.z + 0.5 + (target.z - cur.z) * useP;
        const moveDx = target.x - cur.x;
        const moveDz = target.z - cur.z;
        const yaw = (moveDx !== 0 || moveDz !== 0)
          ? Math.atan2(moveDx, moveDz)
          : (YAW_FOR_DIR[cur.dir & 3] || 0);
        units.push({ x, y, z, yaw, isEngine: i === 0 });
      }
      out.push({ id: t.id, moving: t.moving, cars: t.cars, units });
    }
    return out;
  }
}
