// Boxworld Voxel Train & Rail Simulation Engine
// Supports: straight, curve, cross, switchable branch rails, red stop cards, yellow whistle cards,
// and multi-car connected trains that snake smoothly around curves and junctions!
import fs from 'node:fs';
import path from 'node:path';
import { RAIL_IDS, CHEST_SIZE } from './blocks.js';

const RAIL_SET = new Set(RAIL_IDS);
// 0=N(-Z), 1=E(+X), 2=S(+Z), 3=W(-X)
const DX = [0, 1, 0, -1];
const DZ = [-1, 0, 1, 0];
const YAW_FOR_DIR = [Math.PI, Math.PI / 2, 0, -Math.PI / 2];

export const SEOUL_SUBWAY_LINES = {
  classic:     { id: 'classic',     name: '기본 증기',   short: '기본', color: '#dc2626' },
  line1:       { id: 'line1',       name: '1호선',       short: '1',    color: '#0052A4' },
  line2:       { id: 'line2',       name: '2호선',       short: '2',    color: '#00A84D' },
  line3:       { id: 'line3',       name: '3호선',       short: '3',    color: '#EF7C1C' },
  line4:       { id: 'line4',       name: '4호선',       short: '4',    color: '#00A5DE' },
  line5:       { id: 'line5',       name: '5호선',       short: '5',    color: '#996CAC' },
  line6:       { id: 'line6',       name: '6호선',       short: '6',    color: '#CD7C2F' },
  line7:       { id: 'line7',       name: '7호선',       short: '7',    color: '#747F00' },
  line8:       { id: 'line8',       name: '8호선',       short: '8',    color: '#E6186C' },
  line9:       { id: 'line9',       name: '9호선',       short: '9',    color: '#BDB092' },
  gyeongui:    { id: 'gyeongui',    name: '경의·중앙선', short: '경의', color: '#77C4A3' },
  gyeongchun:  { id: 'gyeongchun',  name: '경춘선',      short: '경춘', color: '#0C8E72' },
  suin:        { id: 'suin',        name: '수인·분당선', short: '수인', color: '#F5A200' },
  shinbundang: { id: 'shinbundang', name: '신분당선',    short: '신분', color: '#D4003B' },
  arex:        { id: 'arex',        name: '공항철도',    short: '공항', color: '#0090D2' }
};

export function isRailBlock(id) {
  return !!id && RAIL_SET.has(id);
}

function getRailConnections(blockId, facing) {
  const f = Number(facing || 0) & 3;
  if (blockId === 'rail_straight' || blockId === 'rail_card_red' || blockId === 'rail_card_yellow' || blockId === 'rail_card_green' || blockId === 'rail_up' || blockId === 'rail_down') {
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
  if (blockId === 'rail_straight' || blockId === 'rail_card_red' || blockId === 'rail_card_yellow' || blockId === 'rail_card_green' || blockId === 'rail_up' || blockId === 'rail_down') {
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
    // T-branch (real trailing-point railway switch!):
    // A = rear (f+2)&3, B = left (f+3)&3 (L), C = right (f+1)&3 (R)
    // - Entering from A: L -> B, R -> C
    // - Entering from B: ALWAYS exits to A (and auto-flips switch R -> L!)
    // - Entering from C: ALWAYS exits to A (and auto-flips switch L -> R!)
    const rear = (f + 2) & 3;
    const left = (f + 3) & 3;
    const right = (f + 1) & 3;
    const isR = blockId === 'rail_branch_turn';
    if (enterFrom === rear) return isR ? right : left;
    if (enterFrom === left || enterFrom === right) return rear;
    return opp;
  }
  if (blockId === 'rail_xbranch' || blockId === 'rail_xbranch_turn') {
    // X-branch (Double-Slip 4-way switch relative to facing f):
    // A = rear (f+2)&3, D = front (f), B = left (f+3)&3, C = right (f+1)&3
    // - From A or D: L -> B, R -> C
    // - From B or C: L -> A, R -> D
    const A = (f + 2) & 3;
    const D = f;
    const B = (f + 3) & 3;
    const C = (f + 1) & 3;
    const isR = blockId === 'rail_xbranch_turn';
    if (enterFrom === A || enterFrom === D) return isR ? C : B;
    if (enterFrom === B || enterFrom === C) return isR ? D : A;
    return opp;
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

  spawnTrain(x, y, z, dir = 1, cars = 1, owner = 'System', autoMove = false, lineId = 'classic') {
    if (!isRailBlock(this.store.getBlock(x, y, z))) return null;
    const id = `train-${this.nextId++}`;
    const d = Number(dir) & 3;
    const cCount = Math.max(1, Math.min(6, Number(cars) || 1));
    const railBlk = this.store.getBlock(x, y, z);
    const railF = this.store.facings[`${x},${y},${z}`] || 0;
    const conns = getRailConnections(railBlk, railF);
    const useDir = conns.includes(d) ? d : (conns[0] ?? d);
    const validLine = SEOUL_SUBWAY_LINES[lineId] ? lineId : 'classic';
    const train = {
      id,
      owner,
      lineId: validLine,
      cars: cCount,
      moving: !!autoMove,
      reversed: false,
      speed: 3.1, // blocks per second
      prog: 0,    // 0..1 interpolation between path[0] and nextTile
      skipRedOnce: false,
      skipGreenOnce: false,
      carStorages: {},
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
    const nz = head.z + DZ[dir];
    const curBlk = this.store.getBlock(head.x, head.y, head.z);
    const curF = this.store.facings[`${head.x},${head.y},${head.z}`] || 0;
    // Check elevation change for ascending/descending slope rails (rail_up / rail_down)
    let yOrder = [head.y, head.y + 1, head.y - 1];
    if (curBlk === 'rail_up') {
      yOrder = (dir === curF) ? [head.y + 1, head.y, head.y - 1] : [head.y, head.y - 1, head.y + 1];
    } else if (curBlk === 'rail_down') {
      yOrder = (dir === curF) ? [head.y - 1, head.y, head.y + 1] : [head.y + 1, head.y, head.y - 1];
    }
    for (const ny of yOrder) {
      const nextBlk = this.store.getBlock(nx, ny, nz);
      if (!isRailBlock(nextBlk)) continue;
      const nextFacing = this.store.facings[`${nx},${ny},${nz}`] || 0;
      const enterFrom = (dir + 2) & 3;
      const exitDir = chooseExitDir(nextBlk, nextFacing, enterFrom);
      return { x: nx, y: ny, z: nz, dir: exitDir, enterFrom, block: nextBlk };
    }
    return null;
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
    // If the stopped train was reversing (후진), always reset to forward gear (전진) when restarting!
    if (t.reversed) {
      const active = t.path.slice(0, Math.min(t.cars, t.path.length)).reverse().map((node) => ({
        x: node.x, y: node.y, z: node.z, dir: (node.dir + 2) & 3
      }));
      t.path = active;
      t.reversed = false;
      t.prog = 0;
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
    t.skipGreenOnce = true;
    this.save();
    return { train: t, started: true };
  }

  getCarStorage(trainId, unitIndex) {
    const t = this.trains.get(trainId);
    const idx = Number(unitIndex);
    if (!t || !Number.isInteger(idx) || idx < 1 || idx >= t.cars) return null;
    if (!t.carStorages || typeof t.carStorages !== 'object') t.carStorages = {};
    const k = String(idx);
    if (!t.carStorages[k]) {
      t.carStorages[k] = {
        label: `🚃 ${idx}번 객차 화물칸`,
        owner: t.owner || 'System',
        slots: Array(CHEST_SIZE).fill(null)
      };
      this.save();
    }
    return t.carStorages[k];
  }

  hasStoredItems(trainId) {
    const t = this.trains.get(trainId);
    if (!t || !t.carStorages) return false;
    for (const st of Object.values(t.carStorages)) {
      if (st?.slots?.some(s => s && s.count > 0)) return true;
    }
    return false;
  }

  removeTrain(trainId) {
    const t = this.trains.get(trainId);
    if (!t) return null;
    this.trains.delete(trainId);
    this.save();
    return { engine: 1, cars: Math.max(0, t.cars - 1) };
  }

  uncoupleLastCar(trainId) {
    const t = this.trains.get(trainId);
    if (!t) return { error: '기차를 찾을 수 없습니다.' };
    if (t.cars <= 1) return { error: '🚃 회수할 객차가 없습니다. (기관차만 남아 있음 · 전체 회수는 🗑️ 기차 회수 버튼 사용)' };
    const lastIdx = t.cars - 1;
    const st = t.carStorages?.[lastIdx];
    if (st?.slots?.some(s => s && s.count > 0)) {
      return { error: `🚃 ${lastIdx}번 객차 안에 아이템이 남아 있어 회수할 수 없습니다. 먼저 비워주세요!` };
    }
    if (t.carStorages) delete t.carStorages[lastIdx];
    t.cars -= 1;
    this.save();
    return { train: t, removedIndex: lastIdx };
  }

  reverseTrain(trainId) {
    const t = this.trains.get(trainId);
    if (!t) return null;
    const active = t.path.slice(0, Math.min(t.cars, t.path.length)).reverse().map((node) => ({
      x: node.x, y: node.y, z: node.z, dir: (node.dir + 2) & 3
    }));
    t.path = active;
    t.reversed = !t.reversed;
    t.prog = 0;
    t.nextTile = this._computeNextTile(t);
    t.moving = !!t.nextTile;
    t.skipRedOnce = true;
    t.skipGreenOnce = true;
    this.save();
    return { train: t, reversed: t.reversed, blocked: !t.nextTile };
  }

  uturnTrain(trainId) {
    const t = this.trains.get(trainId);
    if (!t) return null;
    if (!t.reversed) {
      const active = t.path.slice(0, Math.min(t.cars, t.path.length)).reverse().map((node) => ({
        x: node.x, y: node.y, z: node.z, dir: (node.dir + 2) & 3
      }));
      t.path = active;
    }
    t.reversed = false;
    t.prog = 0;
    t.nextTile = this._computeNextTile(t);
    if (!t.nextTile) t.moving = false;
    t.skipRedOnce = true;
    t.skipGreenOnce = true;
    this.save();
    return { train: t, blocked: !t.nextTile };
  }

  // Advance all moving trains by dt seconds; returns list of triggered card/stop/switch events
  tick(dt) {
    const events = [];
    const switchChanges = [];
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

        // Trailing-point auto-switch on T-branch:
        // Entering from B (left) while R -> force switch to L! Entering from C (right) while L -> force switch to R!
        const blk = this.store.getBlock(arrived.x, arrived.y, arrived.z);
        if ((blk === 'rail_branch' || blk === 'rail_branch_turn') && arrived.enterFrom !== undefined) {
          const bf = this.store.facings[`${arrived.x},${arrived.y},${arrived.z}`] || 0;
          const left = (bf + 3) & 3;
          const right = (bf + 1) & 3;
          if (arrived.enterFrom === left && blk === 'rail_branch_turn') {
            this.store.setBlock(arrived.x, arrived.y, arrived.z, 'rail_branch', 'Train');
            this.store.setFacing(arrived.x, arrived.y, arrived.z, bf);
            switchChanges.push({ x: arrived.x, y: arrived.y, z: arrived.z, block: 'rail_branch', facing: bf });
          } else if (arrived.enterFrom === right && blk === 'rail_branch') {
            this.store.setBlock(arrived.x, arrived.y, arrived.z, 'rail_branch_turn', 'Train');
            this.store.setFacing(arrived.x, arrived.y, arrived.z, bf);
            switchChanges.push({ x: arrived.x, y: arrived.y, z: arrived.z, block: 'rail_branch_turn', facing: bf });
          }
        }
        // Check Action Card on arrived rail tile!
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
          // Green Reverse Action Card: true REVERSE gear (후진, NOT U-turn!)
          // Locomotive stays in its exact physical spot & facing direction while the train backs up!
          const active = t.path.slice(0, Math.min(t.cars, t.path.length)).reverse().map((node) => ({
            x: node.x, y: node.y, z: node.z, dir: (node.dir + 2) & 3
          }));
          t.path = active;
          t.reversed = !t.reversed;
          t.prog = 0;
          t.skipGreenOnce = true;
          t.nextTile = this._computeNextTile(t);
          events.push({ event: 'reverse', trainId: t.id, x: arrived.x, y: arrived.y, z: arrived.z, reversed: t.reversed });
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
    return { anyMoved, events, switchChanges };
  }

  setTrainLine(trainId, lineId) {
    const t = this.trains.get(trainId);
    const line = SEOUL_SUBWAY_LINES[lineId];
    if (!t || !line) return null;
    t.lineId = line.id;
    this.save();
    return { train: t, line };
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
        const moveDy = target.y - cur.y;
        const moveDz = target.z - cur.z;
        const baseYaw = (moveDx !== 0 || moveDz !== 0)
          ? Math.atan2(moveDx, moveDz)
          : (YAW_FOR_DIR[cur.dir & 3] || 0);
        // When reversing (후진), keep the locomotive & cars facing their original forward direction (no 180° U-turn)!
        const yaw = t.reversed ? (baseYaw + Math.PI) : baseYaw;
        const curBlk = this.store.getBlock(cur.x, cur.y, cur.z);
        const rawPitch = moveDy > 0 ? -0.42 : (moveDy < 0 ? 0.42 : (curBlk === 'rail_up' ? -0.35 : (curBlk === 'rail_down' ? 0.35 : 0)));
        const pitch = t.reversed ? -rawPitch : rawPitch;
        const isEngine = t.reversed ? (i === t.cars - 1) : (i === 0);
        units.push({ x, y, z, yaw, pitch, isEngine });
      }
      // Keep engine always at index 0 in serialized units so client mesh indices never swap!
      if (t.reversed) units.reverse();
      const line = SEOUL_SUBWAY_LINES[t.lineId] || SEOUL_SUBWAY_LINES.classic;
      out.push({
        id: t.id,
        moving: t.moving,
        reversed: !!t.reversed,
        cars: t.cars,
        lineId: line.id,
        lineColor: line.color,
        lineName: line.name,
        units
      });
    }
    return out;
  }
}
