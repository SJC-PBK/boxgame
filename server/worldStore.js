import fs from 'node:fs';
import path from 'node:path';
import {
  BLOCKS, SMELT_MAP, FUEL_POWER, WORLD_BOUNDS, CHEST_SIZE
} from './blocks.js';
import {
  generateDefaultBlueprints, generateDefaultSkins, keyOf
} from './defaultData.js';
import { getBaseBlock, SURFACE_BASE } from '../shared/terrainGen.js';

// Kept for Job Village compact RLE encoding
export function encodeRLE(grid) {
  const out = [];
  if (grid.length === 0) return out;
  let cur = grid[0];
  let run = 1;
  for (let i = 1; i < grid.length; i++) {
    if (grid[i] === cur) run++;
    else { out.push(cur, run); cur = grid[i]; run = 1; }
  }
  out.push(cur, run);
  return out;
}

const DEFAULT_BEACONS = {
  '-6,37,6':   { x: -6, y: 37, z: 6,   owner: 'System', stealth: true },
  '-6,37,-6':  { x: -6, y: 37, z: -6,  owner: 'System', stealth: true },
  '6,37,-6':   { x: 6,  y: 37, z: -6,  owner: 'System', stealth: true },
  '11,37,-5':  { x: 11, y: 37, z: -5,  owner: 'System', stealth: true },
  '19,37,-5':  { x: 19, y: 37, z: -5,  owner: 'System', stealth: true },
  '19,37,4':   { x: 19, y: 37, z: 4,   owner: 'System', stealth: true },
  '11,37,4':   { x: 11, y: 37, z: 4,   owner: 'System', stealth: true },
  '6,37,6':    { x: 6,  y: 37, z: 6,   owner: 'System', stealth: true },
  '-9,37,-7':  { x: -9, y: 37, z: -7,  owner: 'System', stealth: true },
  '-9,37,-11': { x: -9, y: 37, z: -11, owner: 'System', stealth: true },
  '-13,37,-11':{ x: -13,y: 37, z: -11, owner: 'System', stealth: true },
  '-13,37,-7': { x: -13,y: 37, z: -7,  owner: 'System', stealth: true }
};

export class WorldStore {
  constructor(dataDir) {
    this.dataDir = path.resolve(dataDir);
    fs.mkdirSync(this.dataDir, { recursive: true });

    this.files = {
      deltas: path.join(this.dataDir, 'world-deltas.json'),
      chests: path.join(this.dataDir, 'chests.json'),
      furnaces: path.join(this.dataDir, 'furnaces.json'),
      signs: path.join(this.dataDir, 'signs.json'),
      signPosts: path.join(this.dataDir, 'sign_posts.json'),
      signOverrides: path.join(this.dataDir, 'sign_overrides.json'),
      centerFurn: path.join(this.dataDir, 'center_furn.json'),
      portals: path.join(this.dataDir, 'portals.json'),
      beacons: path.join(this.dataDir, 'beacons.json'),
      facings: path.join(this.dataDir, 'facings.json'),
      regions: path.join(this.dataDir, 'regions.json'),
      blueprints: path.join(this.dataDir, 'blueprints.json'),
      skins: path.join(this.dataDir, 'skins.json'),
      config: path.join(this.dataDir, 'config.json')
    };

    // Delta overrides on top of deterministic 1024x96x1024 terrainGen:
    // "x,y,z" -> blockId (string) | null (dug air)
    this.deltas = new Map();
    this.chests = {};
    this.furnaces = {};
    this.signs = {};
    this.signPosts = {};
    this.signOverrides = {};
    this.centerFurn = {};
    this.portals = {};
    this.beacons = {};
    this.facings = {};
    this.regions = [];
    this.blueprints = [];
    this.skins = [];
    this.config = {
      supplyEnabled: false,
      unlimitedBlocks: false,
      saboSwordEnabled: false
    };

    this._saveTimers = {};
    this._loadAll();
  }

  _readJson(filePath) {
    if (!fs.existsSync(filePath)) return null;
    try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
    catch (err) { console.error(`[WorldStore] Parse error ${filePath}:`, err.message); return null; }
  }

  _writeJsonAtomic(filePath, data) {
    const tmpPath = `${filePath}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(data), 'utf8');
    fs.renameSync(tmpPath, filePath);
  }

  _scheduleSave(kind, delayMs = 400) {
    if (this._saveTimers[kind]) return;
    this._saveTimers[kind] = setTimeout(() => {
      delete this._saveTimers[kind];
      this.saveNow(kind);
    }, delayMs);
  }

  saveNow(kind) {
    try {
      if (kind === 'world') this._writeJsonAtomic(this.files.deltas, Object.fromEntries(this.deltas));
      else if (kind === 'chests') this._writeJsonAtomic(this.files.chests, this.chests);
      else if (kind === 'furnaces') this._writeJsonAtomic(this.files.furnaces, this.furnaces);
      else if (kind === 'signs') this._writeJsonAtomic(this.files.signs, this.signs);
      else if (kind === 'signPosts') this._writeJsonAtomic(this.files.signPosts, this.signPosts);
      else if (kind === 'signOverrides') this._writeJsonAtomic(this.files.signOverrides, this.signOverrides);
      else if (kind === 'centerFurn') this._writeJsonAtomic(this.files.centerFurn, this.centerFurn);
      else if (kind === 'portals') this._writeJsonAtomic(this.files.portals, this.portals);
      else if (kind === 'beacons') this._writeJsonAtomic(this.files.beacons, this.beacons);
      else if (kind === 'facings') this._writeJsonAtomic(this.files.facings, this.facings);
      else if (kind === 'regions') this._writeJsonAtomic(this.files.regions, this.regions);
      else if (kind === 'blueprints') this._writeJsonAtomic(this.files.blueprints, this.blueprints);
      else if (kind === 'skins') this._writeJsonAtomic(this.files.skins, this.skins);
      else if (kind === 'config') this._writeJsonAtomic(this.files.config, this.config);
    } catch (err) {
      console.error(`[WorldStore] Save error (${kind}):`, err);
    }
  }

  flushAll() {
    for (const kind of Object.keys(this._saveTimers)) {
      clearTimeout(this._saveTimers[kind]);
      delete this._saveTimers[kind];
      this.saveNow(kind);
    }
  }

  _loadAll() {
    const savedDeltas = this._readJson(this.files.deltas);
    const savedChests = this._readJson(this.files.chests);
    const savedFurnaces = this._readJson(this.files.furnaces);
    const savedSigns = this._readJson(this.files.signs);
    const savedSignPosts = this._readJson(this.files.signPosts);
    this.signPosts = (savedSignPosts && typeof savedSignPosts === 'object') ? savedSignPosts : {};
    const savedSignOverrides = this._readJson(this.files.signOverrides);
    this.signOverrides = (savedSignOverrides && typeof savedSignOverrides === 'object') ? savedSignOverrides : {};
    const savedCenterFurn = this._readJson(this.files.centerFurn);
    this.centerFurn = (savedCenterFurn && typeof savedCenterFurn === 'object') ? savedCenterFurn : {};
    const savedPortals = this._readJson(this.files.portals);
    const savedBeacons = this._readJson(this.files.beacons);
    const savedFacings = this._readJson(this.files.facings);
    const savedRegions = this._readJson(this.files.regions);
    const savedBlueprints = this._readJson(this.files.blueprints);
    const savedSkins = this._readJson(this.files.skins);

    if (savedDeltas && typeof savedDeltas === 'object') {
      for (const [k, v] of Object.entries(savedDeltas)) this.deltas.set(k, v);
      this.chests = savedChests || {};
      this.furnaces = savedFurnaces || {};
      this.signs = savedSigns || {};
      this.portals = savedPortals || {};
      this.beacons = savedBeacons || {};
      this.facings = savedFacings || {};
    } else {
      console.log('[WorldStore] Initializing 1024x96x1024 Streaming Multi-Biome World...');
      const starterChestSlots = Array(CHEST_SIZE).fill(null);
      starterChestSlots[0] = { block: 'stone_pickaxe', count: 1 };
      starterChestSlots[1] = { block: 'coal', count: 16 };
      starterChestSlots[2] = { block: 'raw_iron', count: 8 };
      starterChestSlots[3] = { block: 'iron_ingot', count: 6 };
      starterChestSlots[4] = { block: 'brick', count: 64 };
      starterChestSlots[5] = { block: 'glass', count: 32 };
      starterChestSlots[6] = { block: 'wool_red', count: 32 };
      starterChestSlots[7] = { block: 'wool_yellow', count: 32 };
      starterChestSlots[8] = { block: 'lamp', count: 16 };

      const sy = SURFACE_BASE + 1; // 37
      this.chests = {
        [`3,${sy},3`]: {
          x: 3, y: sy, z: 3,
          label: '공용 보관 상자',
          owner: 'System',
          createdAt: new Date().toISOString(),
          slots: starterChestSlots
        }
      };
      this.furnaces = {};
      this.signs = {
        [`0,${sy},-4`]: { x: 0, y: sy, z: -4, text: 'Boxworld 대륙!\n1024×1024 다중 바이옴\n🌀 포털→지하광산', author: 'System' }
      };
      this.portals = {
        [`-4,${sy},-4`]: { x: -4, y: sy, z: -4, channel: '지하광산' },
        '-21,8,-9':      { x: -21, y: 8, z: -9, channel: '지하광산' }
      };
      this.beacons = {};
      for (const [bk, bv] of Object.entries(DEFAULT_BEACONS)) {
        this.beacons[bk] = { ...bv };
        this.deltas.set(bk, bv.stealth ? 'stealth_beacon' : 'protect_beacon');
      }
      this.saveNow('world');
      this.saveNow('chests');
      this.saveNow('furnaces');
      this.saveNow('signs');
      this.saveNow('portals');
      this.saveNow('beacons');
    }

    const savedConfig = this._readJson(this.files.config);
    if (savedConfig && typeof savedConfig === 'object') {
      this.config = {
        supplyEnabled: !!savedConfig.supplyEnabled,
        unlimitedBlocks: !!savedConfig.unlimitedBlocks,
        saboSwordEnabled: !!savedConfig.saboSwordEnabled
      };
    } else {
      this.saveNow('config');
    }

    this.regions = Array.isArray(savedRegions) ? savedRegions : [];
    this._syncBeaconRegion(false);
    if (!savedRegions) this.saveNow('regions');

    this.blueprints = (Array.isArray(savedBlueprints) && savedBlueprints.length > 0)
      ? savedBlueprints : generateDefaultBlueprints();
    if (!savedBlueprints) this.saveNow('blueprints');

    this.skins = (Array.isArray(savedSkins) && savedSkins.length > 0)
      ? savedSkins : generateDefaultSkins();
    if (!savedSkins) this.saveNow('skins');

    console.log(
      `[WorldStore] Ready (1024x96x1024 streaming, ${this.deltas.size} modified blocks, ` +
      `${Object.keys(this.chests).length} chests, ${this.regions.length} regions, ` +
      `${this.blueprints.length} blueprints, ${this.skins.length} skins).`
    );
  }

  getDeltasObject() {
    return Object.fromEntries(this.deltas);
  }

  countModified() {
    return this.deltas.size;
  }

  inBounds(x, y, z) {
    return (
      Number.isInteger(x) && Number.isInteger(y) && Number.isInteger(z) &&
      x >= WORLD_BOUNDS.minX && x <= WORLD_BOUNDS.maxX &&
      y >= WORLD_BOUNDS.minY && y <= WORLD_BOUNDS.maxY &&
      z >= WORLD_BOUNDS.minZ && z <= WORLD_BOUNDS.maxZ
    );
  }

  getBlock(x, y, z) {
    if (!this.inBounds(x, y, z)) return null;
    const k = keyOf(x, y, z);
    if (this.deltas.has(k)) return this.deltas.get(k);
    return getBaseBlock(x, y, z);
  }

  findProtectingRegion(x, y, z) {
    for (const r of this.regions) {
      if (x >= r.minX && x <= r.maxX && y >= r.minY && y <= r.maxY && z >= r.minZ && z <= r.maxZ) {
        return r;
      }
    }
    return null;
  }

  setBlock(x, y, z, blockId, ownerName = '') {
    if (!this.inBounds(x, y, z)) return false;
    const k = keyOf(x, y, z);
    const val = blockId || null;
    if (val && !BLOCKS[val]) return false;

    const base = getBaseBlock(x, y, z);
    if (val === base) this.deltas.delete(k);
    else this.deltas.set(k, val);

    if (!val) {
      if (this.chests[k]) { delete this.chests[k]; this._scheduleSave('chests', 100); }
      if (this.furnaces[k]) { delete this.furnaces[k]; this._scheduleSave('furnaces', 100); }
      if (this.signs[k]) { delete this.signs[k]; this._scheduleSave('signs', 100); }
      if (this.portals[k]) { delete this.portals[k]; this._scheduleSave('portals', 100); }
      if (this.facings[k] !== undefined) { delete this.facings[k]; this._scheduleSave('facings', 200); }
      if (this.beacons[k]) {
        delete this.beacons[k];
        this._scheduleSave('beacons', 100);
        this._syncBeaconRegion(true);
      }
    } else {
      if (val === 'chest' && !this.chests[k]) {
        this.chests[k] = {
          x, y, z, label: `${ownerName || '플레이어'}의 상자`, owner: ownerName || 'Unknown',
          createdAt: new Date().toISOString(), slots: Array(CHEST_SIZE).fill(null)
        };
        this._scheduleSave('chests', 100);
      }
      if (val === 'furnace' && !this.furnaces[k]) {
        this.furnaces[k] = {
          x, y, z, owner: ownerName || 'Unknown',
          input: null, fuel: null, output: null, burnLeft: 0, progress: 0
        };
        this._scheduleSave('furnaces', 100);
      }
      if (val === 'sign' && !this.signs[k]) {
        this.signs[k] = { x, y, z, text: `${ownerName || '플레이어'}의 표지판`, author: ownerName || 'Unknown' };
        this._scheduleSave('signs', 100);
      }
      if (val === 'portal' && !this.portals[k]) {
        this.portals[k] = { x, y, z, channel: '기본' };
        this._scheduleSave('portals', 100);
      }
      if ((val === 'protect_beacon' || val === 'stealth_beacon') && !this.beacons[k]) {
        this.beacons[k] = { x, y, z, owner: ownerName || '관리자', stealth: val === 'stealth_beacon' };
        this._scheduleSave('beacons', 100);
        this._syncBeaconRegion(true);
      }
    }
    this._scheduleSave('world', 400);
    return true;
  }

  setFacing(x, y, z, facing) {
    const k = keyOf(x, y, z);
    this.facings[k] = Number(facing) & 3;
    this._scheduleSave('facings', 200);
  }

  _syncBeaconRegion(save = true) {
    const list = Object.values(this.beacons || {});
    this.regions = this.regions.filter(r => r.id !== 'beacon-auto-zone');
    if (list.length >= 2) {
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (const b of list) {
        if (b.x < minX) minX = b.x;
        if (b.x > maxX) maxX = b.x;
        if (b.z < minZ) minZ = b.z;
        if (b.z > maxZ) maxZ = b.z;
      }
      this.regions.push({
        id: 'beacon-auto-zone',
        name: `🛡️ 비콘 보호 구역 (${list.length}개)`,
        minX, maxX,
        minY: WORLD_BOUNDS.minY, maxY: WORLD_BOUNDS.maxY,
        minZ, maxZ,
        createdBy: '보호 비콘',
        createdAt: new Date().toISOString()
      });
    }
    if (save) this._scheduleSave('regions', 100);
  }

  tryFellTree(x, y, z, isAdmin) {
    if (this.getBlock(x, y, z) !== 'wood') return null;
    const below = this.getBlock(x, y - 1, z);
    if (below !== 'grass' && below !== 'dirt' && below !== 'wool_white') return null;
    if (this.getBlock(x, y + 1, z) !== 'wood') return null;

    const trunk = [];
    let ty = y;
    while (ty <= WORLD_BOUNDS.maxY && this.getBlock(x, ty, z) === 'wood' && trunk.length < 10) {
      if (!isAdmin && this.findProtectingRegion(x, ty, z)) return null;
      trunk.push({ x, y: ty, z });
      ty++;
    }
    if (trunk.length < 2) return null;

    const topY = trunk[trunk.length - 1].y;
    const leaves = [];
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        for (let dy = -2; dy <= 2; dy++) {
          const lx = x + dx, ly = topY + dy, lz = z + dz;
          if (this.getBlock(lx, ly, lz) === 'leaves') {
            if (!isAdmin && this.findProtectingRegion(lx, ly, lz)) continue;
            leaves.push({ x: lx, y: ly, z: lz });
          }
        }
      }
    }
    if (leaves.length < 4) return null;

    const changes = [];
    for (const p of [...trunk, ...leaves]) {
      this.setBlock(p.x, p.y, p.z, null);
      changes.push({ x: p.x, y: p.y, z: p.z, block: null });
    }
    return {
      changes,
      woodCount: trunk.length,
      saplingCount: 1 + Math.floor(Math.random() * 2),
      appleCount: 1 + Math.floor(Math.random() * 2)
    };
  }

  growSapling(x, y, z) {
    if (this.getBlock(x, y, z) !== 'sapling') return null;
    const changes = [];
    const set = (bx, by, bz, blockId) => {
      if (!this.inBounds(bx, by, bz)) return;
      const cur = this.getBlock(bx, by, bz);
      if (cur && cur !== 'sapling' && cur !== 'leaves') return;
      this.setBlock(bx, by, bz, blockId);
      changes.push({ x: bx, y: by, z: bz, block: blockId });
    };
    const trunkH = 4 + (Math.abs(x + z) % 2);
    for (let dy = 0; dy < trunkH; dy++) set(x, y + dy, z, 'wood');
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        for (let dy = trunkH - 2; dy <= trunkH; dy++) {
          if (Math.abs(dx) === 2 && Math.abs(dz) === 2 && dy === trunkH) continue;
          if (dx === 0 && dz === 0 && dy < trunkH) continue;
          set(x + dx, y + dy, z + dz, 'leaves');
        }
      }
    }
    set(x, y + trunkH + 1, z, 'leaves');
    return changes;
  }

  getChest(x, y, z) {
    const k = keyOf(x, y, z);
    if (this.getBlock(x, y, z) !== 'chest') return null;
    if (!this.chests[k]) {
      this.chests[k] = {
        x, y, z, label: '보관 상자', owner: 'Unknown',
        createdAt: new Date().toISOString(), slots: Array(CHEST_SIZE).fill(null)
      };
      this._scheduleSave('chests', 100);
    }
    return this.chests[k];
  }

  isChestEmpty(x, y, z) {
    const chest = this.chests[keyOf(x, y, z)];
    return !chest || chest.slots.every(s => !s || s.count <= 0);
  }

  saveChestsSoon() { this._scheduleSave('chests', 100); }

  getFurnace(x, y, z) {
    const k = keyOf(x, y, z);
    if (this.getBlock(x, y, z) !== 'furnace') return null;
    if (!this.furnaces[k]) {
      this.furnaces[k] = { x, y, z, owner: 'Unknown', input: null, fuel: null, output: null, burnLeft: 0, progress: 0 };
      this._scheduleSave('furnaces', 100);
    }
    return this.furnaces[k];
  }

  isFurnaceEmpty(x, y, z) {
    const f = this.furnaces[keyOf(x, y, z)];
    return !f || (!f.input && !f.fuel && !f.output);
  }

  saveFurnacesSoon() { this._scheduleSave('furnaces', 100); }

  tickFurnaces() {
    const updatedKeys = [];
    for (const [k, f] of Object.entries(this.furnaces)) {
      if (this.getBlock(f.x, f.y, f.z) !== 'furnace') continue;
      const recipe = f.input ? SMELT_MAP[f.input.block] : null;
      const canOutput = recipe && (!f.output || (f.output.block === recipe.out && f.output.count + recipe.count <= 64));
      if (!canOutput) {
        if (f.progress > 0) { f.progress = 0; updatedKeys.push(k); }
        continue;
      }
      if (f.burnLeft <= 0 && f.fuel && FUEL_POWER[f.fuel.block]) {
        f.burnLeft = FUEL_POWER[f.fuel.block] * 3;
        f.fuel.count -= 1;
        if (f.fuel.count <= 0) f.fuel = null;
        updatedKeys.push(k);
      }
      if (f.burnLeft > 0) {
        f.burnLeft -= 1;
        f.progress += 1;
        if (f.progress >= 3) {
          f.progress = 0;
          f.input.count -= 1;
          if (f.input.count <= 0) f.input = null;
          if (!f.output) f.output = { block: recipe.out, count: recipe.count };
          else f.output.count += recipe.count;
        }
        updatedKeys.push(k);
      }
    }
    if (updatedKeys.length > 0) this._scheduleSave('furnaces', 300);
    return updatedKeys;
  }

  isNearWater(x, y, z) {
    for (let dx = -4; dx <= 4; dx++) {
      for (let dz = -4; dz <= 4; dz++) {
        for (let dy = -1; dy <= 1; dy++) {
          if (this.getBlock(x + dx, y + dy, z + dz) === 'water') return true;
        }
      }
    }
    return false;
  }

  setSignText(x, y, z, text, author) {
    const k = keyOf(x, y, z);
    if (this.getBlock(x, y, z) !== 'sign') return null;
    this.signs[k] = { x, y, z, text: String(text || '').trim().slice(0, 60) || '표지판', author };
    this._scheduleSave('signs', 100);
    return this.signs[k];
  }

  setSignOverride(key, text) {
    this.signOverrides[key] = String(text || '').trim().slice(0, 60) || '표지판';
    this._scheduleSave('signOverrides', 100);
    return this.signOverrides[key];
  }

  setCenterFurn(x, y, z, blockId, facing = 0) {
    const k = keyOf(x, y, z);
    if (!blockId) delete this.centerFurn[k];
    else this.centerFurn[k] = { x, y, z, block: blockId, facing: Number(facing) & 3 };
    this._scheduleSave('centerFurn', 150);
  }

  getSignPosts(boardKey) {
    return Array.isArray(this.signPosts[boardKey]) ? this.signPosts[boardKey] : [];
  }

  addSignPost(boardKey, author, text) {
    const clean = String(text || '').trim().slice(0, 200);
    if (!clean) return null;
    if (!Array.isArray(this.signPosts[boardKey])) this.signPosts[boardKey] = [];
    const post = {
      id: `sp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      author: String(author || '플레이어').slice(0, 20),
      text: clean,
      createdAt: Date.now()
    };
    this.signPosts[boardKey].unshift(post);
    if (this.signPosts[boardKey].length > 100) this.signPosts[boardKey].length = 100;
    this._scheduleSave('signPosts', 100);
    return this.signPosts[boardKey];
  }

  deleteSignPost(boardKey, postId, requesterNick, isAdmin) {
    const list = this.signPosts[boardKey];
    if (!Array.isArray(list)) return null;
    const idx = list.findIndex(p => p.id === postId);
    if (idx === -1) return null;
    if (!isAdmin && list[idx].author !== requesterNick) return null;
    list.splice(idx, 1);
    this._scheduleSave('signPosts', 100);
    return list;
  }

  setPortalChannel(x, y, z, channel) {
    const k = keyOf(x, y, z);
    if (this.getBlock(x, y, z) !== 'portal') return null;
    this.portals[k] = { x, y, z, channel: String(channel || '기본').trim().slice(0, 16) || '기본' };
    this._scheduleSave('portals', 100);
    return this.portals[k];
  }

  findPairedPortal(x, y, z) {
    const k = keyOf(x, y, z);
    const src = this.portals[k];
    if (!src) return null;
    for (const [ok, p] of Object.entries(this.portals)) {
      if (ok !== k && p.channel === src.channel && this.getBlock(p.x, p.y, p.z) === 'portal') return p;
    }
    return null;
  }

  explodeAt(cx, cy, cz, radius, isAdmin) {
    const changes = [];
    const changedKeys = new Set();
    const recordNull = (x, y, z) => {
      const k = `${x},${y},${z}`;
      if (changedKeys.has(k)) return;
      changedKeys.add(k);
      this.setBlock(x, y, z, null);
      changes.push({ x, y, z, block: null });
    };

    const destroyedWoodCols = new Map(); // "x,z" -> maxY
    const chainTnts = [];

    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dz = -radius; dz <= radius; dz++) {
          if (dx * dx + dy * dy + dz * dz > radius * radius + 1) continue;
          const x = cx + dx, y = cy + dy, z = cz + dz;
          if (!this.inBounds(x, y, z) || y <= WORLD_BOUNDS.minY) continue;
          const b = this.getBlock(x, y, z);
          if (!b || b === 'bedrock' || b === 'water') continue;
          if (!isAdmin && this.findProtectingRegion(x, y, z)) continue;
          if (b === 'chest' && !this.isChestEmpty(x, y, z)) continue;
          if (b === 'furnace' && !this.isFurnaceEmpty(x, y, z)) continue;
          if ((b === 'protect_beacon' || b === 'stealth_beacon') && !isAdmin) continue;

          // Chain-ignite other nearby TNT blocks instead of silently erasing them!
          if (b === 'tnt' && !(x === cx && y === cy && z === cz)) {
            chainTnts.push({ x, y, z });
            continue;
          }

          if (b === 'wood') {
            const colKey = `${x},${z}`;
            const prev = destroyedWoodCols.get(colKey);
            if (prev === undefined || y > prev) destroyedWoodCols.set(colKey, y);
          } else if ((b === 'grass' || b === 'dirt' || b === 'wool_white') && this.getBlock(x, y + 1, z) === 'wood') {
            // Blast destroyed ground right under a tree trunk -> fell the tree above it!
            const colKey = `${x},${z}`;
            const prev = destroyedWoodCols.get(colKey);
            if (prev === undefined || y > prev) destroyedWoodCols.set(colKey, y);
          }

          recordNull(x, y, z);
        }
      }
    }

    // Collapse any trees whose trunks or bases were blown up by the blast!
    let fell = false;
    for (const [colKey, baseY] of destroyedWoodCols.entries()) {
      const [tx, tz] = colKey.split(',').map(Number);
      let topY = baseY;
      let ty = baseY + 1;
      let trunkRemoved = 0;
      while (ty <= WORLD_BOUNDS.maxY && this.getBlock(tx, ty, tz) === 'wood' && trunkRemoved < 12) {
        if (!isAdmin && this.findProtectingRegion(tx, ty, tz)) break;
        recordNull(tx, ty, tz);
        topY = ty;
        ty++;
        trunkRemoved++;
      }
      // Clear canopy leaves around the fallen trunk top
      let leavesRemoved = 0;
      for (let dx = -2; dx <= 2; dx++) {
        for (let dz = -2; dz <= 2; dz++) {
          for (let dy = -2; dy <= 3; dy++) {
            const lx = tx + dx, ly = topY + dy, lz = tz + dz;
            if (!this.inBounds(lx, ly, lz)) continue;
            if (this.getBlock(lx, ly, lz) === 'leaves') {
              if (!isAdmin && this.findProtectingRegion(lx, ly, lz)) continue;
              recordNull(lx, ly, lz);
              leavesRemoved++;
            }
          }
        }
      }
      if (trunkRemoved > 0 || leavesRemoved >= 3) fell = true;
    }

    return { changes, fell, chainTnts };
  }

  fillEmptyAt(cx, cy, cz, radius, isAdmin, fillBlockId, bombId) {
    const changes = [];
    const chainFills = [];
    if (this.inBounds(cx, cy, cz) && (isAdmin || !this.findProtectingRegion(cx, cy, cz))) {
      this.setBlock(cx, cy, cz, fillBlockId);
      changes.push({ x: cx, y: cy, z: cz, block: fillBlockId });
    }
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dz = -radius; dz <= radius; dz++) {
          if (dx * dx + dy * dy + dz * dz > radius * radius + 1) continue;
          const x = cx + dx, y = cy + dy, z = cz + dz;
          if (!this.inBounds(x, y, z) || y <= WORLD_BOUNDS.minY || y >= WORLD_BOUNDS.maxY) continue;
          if (!isAdmin && this.findProtectingRegion(x, y, z)) continue;
          const b = this.getBlock(x, y, z);
          if (b === bombId && !(x === cx && y === cy && z === cz)) {
            chainFills.push({ x, y, z });
            continue;
          }
          // Only fill completely empty (air) spaces — never overwrite existing blocks/buildings!
          if (b) continue;
          this.setBlock(x, y, z, fillBlockId);
          changes.push({ x, y, z, block: fillBlockId });
        }
      }
    }
    return { changes, chainFills };
  }

  detectFillMaterial(cx, cy, cz) {
    const EXCLUDE = new Set([
      'bedrock', 'water', 'tnt', 'fill_bomb', 'water_bomb', 'fuse',
      'chest', 'furnace', 'bed', 'door_closed', 'door_open', 'ladder',
      'sign', 'portal', 'jumppad', 'sapling', 'wheat_1', 'wheat_2', 'wheat_3',
      'leaves', 'job_counter', 'job_espresso', 'job_fridge', 'job_mixer', 'job_pickup'
    ]);
    const ORES = new Set(['diamond_ore', 'gold_ore', 'iron_ore', 'coal_ore']);
    const scores = new Map();
    const oreScores = new Map();

    for (let dx = -2; dx <= 2; dx++) {
      for (let dy = -2; dy <= 2; dy++) {
        for (let dz = -2; dz <= 2; dz++) {
          if (dx === 0 && dy === 0 && dz === 0) continue;
          const dist2 = dx * dx + dy * dy + dz * dz;
          if (dist2 > 5) continue;
          const x = cx + dx, y = cy + dy, z = cz + dz;
          if (!this.inBounds(x, y, z)) continue;
          let b = this.getBlock(x, y, z);
          if (!b || EXCLUDE.has(b)) continue;
          if (b === 'grass' || b === 'farmland') b = 'dirt';

          // Weight closer blocks much higher (directly touching = 4, underneath = 6)
          let w = dist2 === 1 ? 4 : (dist2 <= 2 ? 2 : 1);
          if (dx === 0 && dy === -1 && dz === 0) w += 2;

          if (ORES.has(b)) {
            oreScores.set(b, (oreScores.get(b) || 0) + w);
          }
          scores.set(b, (scores.get(b) || 0) + w);
        }
      }
    }

    // If placed near an ore vein (especially in deep mines), match that ore!
    if (oreScores.size > 0) {
      let bestOre = null, bestVal = -1;
      for (const [k, v] of oreScores.entries()) {
        if (v > bestVal) { bestVal = v; bestOre = k; }
      }
      if (bestOre) return bestOre;
    }

    // Otherwise pick the dominant surrounding terrain/building material (default: dirt)
    let best = 'dirt', bestVal = -1;
    for (const [k, v] of scores.entries()) {
      if (v > bestVal) { bestVal = v; best = k; }
    }
    return best;
  }

  fillDirtAt(cx, cy, cz, radius, isAdmin) {
    const fillBlock = this.detectFillMaterial(cx, cy, cz);
    const res = this.fillEmptyAt(cx, cy, cz, radius, isAdmin, fillBlock, 'fill_bomb');
    return { ...res, filledBlock: fillBlock };
  }

  setConfig(patch) {
    if (typeof patch.supplyEnabled === 'boolean') this.config.supplyEnabled = patch.supplyEnabled;
    if (typeof patch.unlimitedBlocks === 'boolean') this.config.unlimitedBlocks = patch.unlimitedBlocks;
    if (typeof patch.saboSwordEnabled === 'boolean') this.config.saboSwordEnabled = patch.saboSwordEnabled;
    this.saveNow('config');
    return { ...this.config };
  }

  flattenAt(cx, cy, cz, isAdmin) {
    const changes = [];
    const changedKeys = new Set();
    const recordNull = (x, y, z) => {
      const k = `${x},${y},${z}`;
      if (changedKeys.has(k)) return;
      changedKeys.add(k);
      this.setBlock(x, y, z, null);
      changes.push({ x, y, z, block: null });
    };
    const destroyedWoodCols = new Map();
    const chainBombs = [];

    // Exact 5x5x5 cube starting at bomb floor level (dy = 0..4, dx = -2..2, dz = -2..2)
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        for (let dy = 0; dy <= 4; dy++) {
          const x = cx + dx, y = cy + dy, z = cz + dz;
          if (!this.inBounds(x, y, z) || y <= WORLD_BOUNDS.minY) continue;
          const b = this.getBlock(x, y, z);
          if (!b || b === 'bedrock' || b === 'water') continue;
          if (!isAdmin && this.findProtectingRegion(x, y, z)) continue;
          if (b === 'chest' && !this.isChestEmpty(x, y, z)) continue;
          if (b === 'furnace' && !this.isFurnaceEmpty(x, y, z)) continue;
          if ((b === 'protect_beacon' || b === 'stealth_beacon') && !isAdmin) continue;
          if ((b === 'flatten_bomb' || b === 'tnt') && !(x === cx && y === cy && z === cz)) {
            chainBombs.push({ x, y, z, kind: b });
            continue;
          }
          if (b === 'wood') {
            const colKey = `${x},${z}`;
            const prev = destroyedWoodCols.get(colKey);
            if (prev === undefined || y > prev) destroyedWoodCols.set(colKey, y);
          }
          recordNull(x, y, z);
        }
      }
    }

    let fell = false;
    for (const [colKey, baseY] of destroyedWoodCols.entries()) {
      const [tx, tz] = colKey.split(',').map(Number);
      let topY = baseY;
      let ty = baseY + 1;
      let trunkRemoved = 0;
      while (ty <= WORLD_BOUNDS.maxY && this.getBlock(tx, ty, tz) === 'wood' && trunkRemoved < 12) {
        if (!isAdmin && this.findProtectingRegion(tx, ty, tz)) break;
        recordNull(tx, ty, tz);
        topY = ty;
        ty++;
        trunkRemoved++;
      }
      for (let dx = -2; dx <= 2; dx++) {
        for (let dz = -2; dz <= 2; dz++) {
          for (let dy = -2; dy <= 3; dy++) {
            const lx = tx + dx, ly = topY + dy, lz = tz + dz;
            if (!this.inBounds(lx, ly, lz)) continue;
            if (this.getBlock(lx, ly, lz) === 'leaves') {
              if (!isAdmin && this.findProtectingRegion(lx, ly, lz)) continue;
              recordNull(lx, ly, lz);
              fell = true;
            }
          }
        }
      }
      if (trunkRemoved > 0) fell = true;
    }

    return { changes, fell, chainBombs };
  }

  fillWaterAt(cx, cy, cz, radius, isAdmin) {
    return this.fillEmptyAt(cx, cy, cz, radius, isAdmin, 'water', 'water_bomb');
  }

  addRegion({ name, pos1, pos2, createdBy }) {
    const region = {
      id: `reg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: String(name || '보호 구역').trim().slice(0, 30),
      minX: Math.min(pos1.x, pos2.x), maxX: Math.max(pos1.x, pos2.x),
      minY: Math.min(pos1.y, pos2.y), maxY: Math.max(pos1.y, pos2.y),
      minZ: Math.min(pos1.z, pos2.z), maxZ: Math.max(pos1.z, pos2.z),
      createdBy, createdAt: new Date().toISOString()
    };
    this.regions.push(region);
    this.saveNow('regions');
    return region;
  }

  removeRegion(regionId) {
    const idx = this.regions.findIndex(r => r.id === regionId);
    if (idx === -1) return false;
    this.regions.splice(idx, 1);
    this.saveNow('regions');
    return true;
  }

  captureBlueprint({ name, pos1, pos2, author }) {
    const minX = Math.min(pos1.x, pos2.x), maxX = Math.max(pos1.x, pos2.x);
    const minY = Math.min(pos1.y, pos2.y), maxY = Math.max(pos1.y, pos2.y);
    const minZ = Math.min(pos1.z, pos2.z), maxZ = Math.max(pos1.z, pos2.z);
    const blocks = [];
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        for (let z = minZ; z <= maxZ; z++) {
          const b = this.getBlock(x, y, z);
          if (b && b !== 'water' && b !== 'bedrock') {
            blocks.push({ dx: x - minX, dy: y - minY, dz: z - minZ, block: b });
          }
        }
      }
    }
    if (blocks.length === 0) return { error: '선택한 영역에 블록이 없습니다.' };
    if (blocks.length > 1500) return { error: '설계도는 최대 1,500개 블록까지 저장할 수 있습니다.' };
    const bp = {
      id: `bp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: String(name || '새 설계도').trim().slice(0, 30),
      author: author || 'Unknown',
      blocks
    };
    this.blueprints.push(bp);
    this.saveNow('blueprints');
    return { blueprint: bp };
  }

  removeBlueprint(bpId) {
    const idx = this.blueprints.findIndex(b => b.id === bpId);
    if (idx === -1) return false;
    this.blueprints.splice(idx, 1);
    this.saveNow('blueprints');
    return true;
  }

  publishSkin({ name, author, skin }) {
    const entry = {
      id: `skin-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: String(name || '나만의 스킨').trim().slice(0, 20),
      author: String(author || '익명').trim().slice(0, 16),
      likes: 0,
      skin: {
        skinColor: String(skin?.skinColor || '#f5cfa0').slice(0, 16),
        hairColor: String(skin?.hairColor || '#3b2416').slice(0, 16),
        shirtColor: String(skin?.shirtColor || '#38bdf8').slice(0, 16),
        pantsColor: String(skin?.pantsColor || '#334155').slice(0, 16),
        hatColor: String(skin?.hatColor || '').slice(0, 16),
        eyeColor: String(skin?.eyeColor || '#0f172a').slice(0, 16),
        blush: !!skin?.blush,
        pixelDataUrl: (typeof skin?.pixelDataUrl === 'string' && skin.pixelDataUrl.startsWith('data:image/png;base64,') && skin.pixelDataUrl.length < 32000)
          ? skin.pixelDataUrl : null
      }
    };
    this.skins.unshift(entry);
    if (this.skins.length > 50) this.skins.length = 50;
    this.saveNow('skins');
    return entry;
  }

  likeSkin(skinId) {
    const s = this.skins.find(x => x.id === skinId);
    if (!s) return false;
    s.likes = (s.likes || 0) + 1;
    this.saveNow('skins');
    return true;
  }

  updateSkin(skinId, { name, skin }) {
    const entry = this.skins.find(x => x.id === skinId);
    if (!entry) return null;
    if (name) entry.name = String(name).trim().slice(0, 20) || entry.name;
    entry.skin = {
      skinColor: String(skin?.skinColor || '#f5cfa0').slice(0, 16),
      hairColor: String(skin?.hairColor || '#3b2416').slice(0, 16),
      shirtColor: String(skin?.shirtColor || '#38bdf8').slice(0, 16),
      pantsColor: String(skin?.pantsColor || '#334155').slice(0, 16),
      hatColor: String(skin?.hatColor || '').slice(0, 16),
      eyeColor: String(skin?.eyeColor || '#0f172a').slice(0, 16),
      blush: !!skin?.blush,
      pixelDataUrl: (typeof skin?.pixelDataUrl === 'string' && skin.pixelDataUrl.startsWith('data:image/png;base64,') && skin.pixelDataUrl.length < 32000)
        ? skin.pixelDataUrl : null
    };
    this.saveNow('skins');
    return entry;
  }
}
