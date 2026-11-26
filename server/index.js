import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { WebSocketServer } from 'ws';
import {
  BLOCKS, ITEMS, CATALOG, RECIPES, CAFE_RECIPES, CAFE_FRIDGE_ITEMS,
  SMELT_MAP, FUEL_POWER, TIER_NAMES, WORLD_BOUNDS,
  BAG_SIZE, CHEST_SIZE, createStarterBag, createStarterTools,
  CENTER_FURNITURE_IDS, createCenterFurnitureBag
} from './blocks.js';
import { WorldStore } from './worldStore.js';
import { AnimalManager } from './animals.js';
import { createJobVillageWorld } from './jobWorld.js';
import { createCenterWorld } from './centerWorld.js';
import {
  stampCenterIntoSandbox, stampVillaIntoSandbox,
  SANDBOX_CENTER_ORIGIN, SANDBOX_VILLA_ORIGIN
} from './sandboxBuilds.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

function loadEnvFile() {
  const envPath = path.join(ROOT_DIR, '.env');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}
loadEnvFile();

const PORT = Number(process.env.PORT || 5220);
const HOST = process.env.HOST || '127.0.0.1';
const BASE_PATH = (process.env.BASE_PATH || '').replace(/\/+$/, '');
const MAX_PLAYERS = Number(process.env.MAX_PLAYERS || 20);
const DATA_DIR = path.resolve(ROOT_DIR, process.env.DATA_DIR || './data');


const store = new WorldStore(DATA_DIR);
const animals = new AnimalManager(store);
const jobWorld = createJobVillageWorld();
let centerWorld = createCenterWorld();

function applyPersistedCenterState() {
  for (const [k, txt] of Object.entries(store.signOverrides || {})) {
    if (k.startsWith('center:')) {
      const coord = k.slice(7);
      if (centerWorld.signs[coord]) centerWorld.signs[coord].text = txt;
    } else if (k.startsWith('job:')) {
      const coord = k.slice(4);
      if (jobWorld.signs[coord]) jobWorld.signs[coord].text = txt;
    }
  }
  for (const f of Object.values(store.centerFurn || {})) {
    if (!f || !centerWorld.inBounds(f.x, f.y, f.z)) continue;
    if (f.block === null) {
      centerWorld.setBlock(f.x, f.y, f.z, null);
      delete centerWorld.facings[`${f.x},${f.y},${f.z}`];
    } else if (BLOCKS[f.block]) {
      centerWorld.setBlock(f.x, f.y, f.z, f.block);
      centerWorld.facings[`${f.x},${f.y},${f.z}`] = Number(f.facing) & 3;
    }
  }
}
applyPersistedCenterState();

// Seated office staff NPCs (4F "야근하는 박부규" at chair (-10, 23, 7) facing PC desk (-10, 23, 6)!)
const CENTER_NPCS = [
  {
    id: 'park-bugyu',
    name: '💻 야근하는 박부규',
    x: -10, y: 23, z: 7,
    facing: 0, // North (-Z) toward PC desk
    roundGlasses: true,
    shirtColor: '#1f2937',
    pantsColor: '#111827',
    hairColor: '#18181b',
    skinColor: '#f1c69c'
  }
];
const SANDBOX_CENTER_NPCS = CENTER_NPCS.map((n) => ({
  ...n,
  x: n.x + SANDBOX_CENTER_ORIGIN.x,
  y: n.y + (SANDBOX_CENTER_ORIGIN.y - 4),
  z: n.z + SANDBOX_CENTER_ORIGIN.z
}));
const SANDBOX_CENTER_PYLON = {
  x: SANDBOX_CENTER_ORIGIN.x - 25.5,
  y: SANDBOX_CENTER_ORIGIN.y + 1.0,
  z: SANDBOX_CENTER_ORIGIN.z + 2.2,
  rotY: 0
};

// Auto-stamp Happiness Plus Center clone (-75, 34, 94) and 5F Semi-Basement Villa (-78, 36, -45) into Sandbox once
if (!store.deltas.has(`${SANDBOX_CENTER_ORIGIN.x},${SANDBOX_CENTER_ORIGIN.y + 42},${SANDBOX_CENTER_ORIGIN.z}`)) {
  const res = stampCenterIntoSandbox(store, SANDBOX_CENTER_ORIGIN);
  console.log(`[SandboxBuilds] Stamped Happiness Plus Center at (${SANDBOX_CENTER_ORIGIN.x},${SANDBOX_CENTER_ORIGIN.y},${SANDBOX_CENTER_ORIGIN.z}): ${res.placed} blocks, ${res.signsCount} signs.`);
}
if (!store.deltas.has(`${SANDBOX_VILLA_ORIGIN.x},${SANDBOX_VILLA_ORIGIN.y + 23},${SANDBOX_VILLA_ORIGIN.z}`)) {
  const res = stampVillaIntoSandbox(store, SANDBOX_VILLA_ORIGIN);
  console.log(`[SandboxBuilds] Stamped 5F Semi-Basement Villa at (${SANDBOX_VILLA_ORIGIN.x},${SANDBOX_VILLA_ORIGIN.y},${SANDBOX_VILLA_ORIGIN.z}): ${res.placed} blocks, ${res.signsCount} signs.`);
}

// Real-time moving elevator state machine for Happiness Plus Center (1F~5F)
const centerElevator = {
  floor: 1,
  targetFloor: 1,
  startY: centerWorld.elevator.floors[0].y,
  targetY: centerWorld.elevator.floors[0].y,
  startTime: 0,
  durationMs: 0,
  moving: false,
  doorsOpenFloor: 1,
  timer: null
};

function getCenterElevatorFloorByY(y) {
  let best = centerWorld.elevator.floors[0];
  let bestDist = Infinity;
  for (const f of centerWorld.elevator.floors) {
    const d = Math.abs(y - (f.y + 1));
    if (d < bestDist) { bestDist = d; best = f; }
  }
  return best.floor;
}

function getCenterElevatorPayload() {
  return {
    config: centerWorld.elevator,
    floor: centerElevator.floor,
    targetFloor: centerElevator.targetFloor,
    startY: centerElevator.startY,
    targetY: centerElevator.targetY,
    elapsedMs: centerElevator.moving ? Math.max(0, Date.now() - centerElevator.startTime) : 0,
    durationMs: centerElevator.durationMs,
    moving: centerElevator.moving,
    doorsOpenFloor: centerElevator.doorsOpenFloor
  };
}

function setCenterElevatorDoors(floorNum, open) {
  const fDef = centerWorld.elevator.floors.find(f => f.floor === floorNum);
  if (!fDef) return;
  const blockId = open ? 'door_iron_open' : 'door_iron_closed';
  const changes = [];
  for (const dx of centerWorld.elevator.doorXs) {
    for (const dy of [1, 2]) {
      const y = fDef.y + dy;
      const z = centerWorld.elevator.doorZ;
      centerWorld.setBlock(dx, y, z, blockId);
      changes.push({ x: dx, y, z, block: blockId, facing: 2 });
    }
  }
  broadcast({ type: 'blocks_batch', changes, by: 'Elevator' }, null, 'center');
}

function callCenterElevator(targetFloor, callerNick, callerWs) {
  const fDef = centerWorld.elevator.floors.find(f => f.floor === targetFloor);
  if (!fDef) return;
  if (centerElevator.moving) {
    if (callerWs) send(callerWs, { type: 'toast', level: 'info', text: `🛗 엘리베이터가 ${centerElevator.targetFloor}F로 이동 중입니다.` });
    return;
  }
  if (centerElevator.floor === targetFloor) {
    setCenterElevatorDoors(targetFloor, true);
    centerElevator.doorsOpenFloor = targetFloor;
    broadcast({ type: 'elevator_state', elevator: getCenterElevatorPayload(), chime: true }, null, 'center');
    return;
  }

  // Close current floor doors before departing
  if (centerElevator.doorsOpenFloor) {
    setCenterElevatorDoors(centerElevator.doorsOpenFloor, false);
    centerElevator.doorsOpenFloor = 0;
  }

  const fromDef = centerWorld.elevator.floors.find(f => f.floor === centerElevator.floor) || centerWorld.elevator.floors[0];
  const distFloors = Math.abs(targetFloor - centerElevator.floor);
  const durationMs = Math.max(1200, distFloors * 1400);

  centerElevator.targetFloor = targetFloor;
  centerElevator.startY = fromDef.y;
  centerElevator.targetY = fDef.y;
  centerElevator.startTime = Date.now();
  centerElevator.durationMs = durationMs;
  centerElevator.moving = true;

  broadcast({ type: 'elevator_state', elevator: getCenterElevatorPayload(), chime: false }, null, 'center');

  if (centerElevator.timer) clearTimeout(centerElevator.timer);
  centerElevator.timer = setTimeout(() => {
    centerElevator.timer = null;
    centerElevator.floor = targetFloor;
    centerElevator.startY = fDef.y;
    centerElevator.targetY = fDef.y;
    centerElevator.durationMs = 0;
    centerElevator.moving = false;
    centerElevator.doorsOpenFloor = targetFloor;
    setCenterElevatorDoors(targetFloor, true);
    broadcast({ type: 'elevator_state', elevator: getCenterElevatorPayload(), chime: true }, null, 'center');
  }, durationMs);
}

// Shared in-game clock & weather
const DAY_LENGTH_SEC = 360;
let worldTime = 0.22;
let worldWeather = 'clear'; // 'clear' | 'rain' | 'snow'

const app = express();
app.use(express.json());

const router = express.Router();
const threeBuildDir = path.join(ROOT_DIR, 'node_modules', 'three', 'build');
router.use('/vendor/three', express.static(threeBuildDir, { maxAge: '7d' }));
router.use('/shared', express.static(path.join(ROOT_DIR, 'shared'), { maxAge: '1d' }));
router.use(express.static(path.join(ROOT_DIR, 'public')));

router.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    app: 'Boxworld',
    version: '5.0',
    worldSize: '1024x96x1024',
    players: players.size,
    maxPlayers: MAX_PLAYERS,
    modifiedBlocks: store.countModified(),
    chests: Object.keys(store.chests).length,
    furnaces: Object.keys(store.furnaces).length,
    signs: Object.keys(store.signs).length,
    portals: Object.keys(store.portals).length,
    animals: animals.animals.size,
    weather: worldWeather,
    regions: store.regions.length,
    blueprints: store.blueprints.length,
    skins: store.skins.length
  });
});

if (BASE_PATH) {
  app.use(BASE_PATH, router);
  app.get('/', (_req, res) => res.redirect(`${BASE_PATH}/`));
} else {
  app.use('/', router);
}

const server = http.createServer(app);
const wsPath = BASE_PATH ? `${BASE_PATH}/ws` : '/ws';
const wss = new WebSocketServer({ server, path: wsPath, maxPayload: 2 * 1024 * 1024 }); // 기본 100MB → 인터넷 공개라 2MB

const players = new Map();
const AVATAR_COLORS = ['#38bdf8', '#4ade80', '#f472b6', '#fbbf24', '#a78bfa'];
let nextPlayerSeq = 1;

function send(ws, payload) {
  if (ws.readyState === 1) ws.send(JSON.stringify(payload));
}

function broadcast(payload, excludeId = null, worldFilter = null) {
  const data = JSON.stringify(payload);
  for (const p of players.values()) {
    if (p.id !== excludeId && (!worldFilter || p.world === worldFilter) && p.ws.readyState === 1) {
      p.ws.send(data);
    }
  }
}

function pickRandomCafeOrder(prevId = null) {
  const pool = CAFE_RECIPES.filter(r => r.id !== prevId);
  return pool[Math.floor(Math.random() * pool.length)] || CAFE_RECIPES[0];
}

function serializePlayer(p) {
  return {
    id: p.id, nickname: p.nickname, color: p.color, skin: p.skin,
    heldItem: p.heldItem, x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch, isAdmin: p.isAdmin
  };
}

function addItemToSlots(slots, itemId, count) {
  const def = CATALOG[itemId];
  if (!def || count <= 0) return count;
  const maxStack = def.stackable || 64;
  let remaining = count;
  for (let i = 0; i < slots.length && remaining > 0; i++) {
    const s = slots[i];
    if (s && s.block === itemId && s.count < maxStack) {
      const add = Math.min(remaining, maxStack - s.count);
      s.count += add;
      remaining -= add;
    }
  }
  for (let i = 0; i < slots.length && remaining > 0; i++) {
    if (!slots[i]) {
      const add = Math.min(remaining, maxStack);
      slots[i] = { block: itemId, count: add };
      remaining -= add;
    }
  }
  return remaining;
}

function countItemInSlots(slots, itemId) {
  let total = 0;
  for (const s of slots) if (s && s.block === itemId) total += s.count;
  return total;
}

function consumeItemFromSlots(slots, itemId, count) {
  let rem = count;
  for (let i = 0; i < slots.length && rem > 0; i++) {
    const s = slots[i];
    if (s && s.block === itemId) {
      const take = Math.min(s.count, rem);
      s.count -= take;
      rem -= take;
      if (s.count <= 0) slots[i] = null;
    }
  }
  return rem === 0;
}

function broadcastChestToViewers(chestKey, chest) {
  for (const p of players.values()) {
    if (p.openChestKey === chestKey) {
      send(p.ws, {
        type: 'chest_data',
        chest: { x: chest.x, y: chest.y, z: chest.z, label: chest.label, owner: chest.owner, slots: chest.slots }
      });
    }
  }
}

function broadcastFurnaceToViewers(fKey, f) {
  for (const p of players.values()) {
    if (p.openFurnaceKey === fKey) {
      send(p.ws, { type: 'furnace_data', furnace: f });
    }
  }
}

const ignitedTnts = new Set();
const burningFuses = new Set();

function igniteTNTAt(x, y, z, isAdmin, delayMs = 2800) {
  const key = `${x},${y},${z}`;
  if (ignitedTnts.has(key)) return false;
  if (!store.inBounds(x, y, z) || store.getBlock(x, y, z) !== 'tnt') return false;
  if (!isAdmin && store.findProtectingRegion(x, y, z)) return false;

  ignitedTnts.add(key);
  broadcast({ type: 'tnt_ignited', x, y, z, durationMs: delayMs });
  setTimeout(() => {
    ignitedTnts.delete(key);
    if (store.getBlock(x, y, z) !== 'tnt') return;
    const { changes, fell, chainTnts } = store.explodeAt(x, y, z, 3, isAdmin);
    broadcast({ type: 'tnt_explode', x, y, z });
    if (changes.length > 0) broadcast({ type: 'blocks_batch', changes, fell });
    // Remove exploded TNTs from any player's remote link list
    for (const p of players.values()) {
      if (p.linkedTnts?.delete(key)) {
        send(p.ws, { type: 'remote_links_update', links: [...p.linkedTnts] });
      }
    }
    // Chain-ignite nearby TNT blocks with a punchy staggered delay!
    for (let i = 0; i < chainTnts.length; i++) {
      const ct = chainTnts[i];
      setTimeout(() => igniteTNTAt(ct.x, ct.y, ct.z, isAdmin, 700), 160 + i * 110);
    }
  }, delayMs);
  return true;
}

function igniteFillBombAt(x, y, z, isAdmin, delayMs = 2200) {
  const key = `${x},${y},${z}`;
  if (ignitedTnts.has(key)) return false;
  if (!store.inBounds(x, y, z) || store.getBlock(x, y, z) !== 'fill_bomb') return false;
  if (!isAdmin && store.findProtectingRegion(x, y, z)) return false;

  ignitedTnts.add(key);
  broadcast({ type: 'fill_bomb_ignited', x, y, z, durationMs: delayMs });
  setTimeout(() => {
    ignitedTnts.delete(key);
    if (store.getBlock(x, y, z) !== 'fill_bomb') return;
    const { changes, chainFills, filledBlock } = store.fillDirtAt(x, y, z, 4, isAdmin);
    broadcast({ type: 'fill_bomb_explode', x, y, z, filledBlock });
    if (changes.length > 0) broadcast({ type: 'blocks_batch', changes });
    for (const p of players.values()) {
      if (p.linkedTnts?.delete(key)) {
        send(p.ws, { type: 'remote_links_update', links: [...p.linkedTnts] });
      }
    }
    for (let i = 0; i < chainFills.length; i++) {
      const cf = chainFills[i];
      setTimeout(() => igniteFillBombAt(cf.x, cf.y, cf.z, isAdmin, 650), 160 + i * 110);
    }
  }, delayMs);
  return true;
}

function igniteWaterBombAt(x, y, z, isAdmin, delayMs = 2200) {
  const key = `${x},${y},${z}`;
  if (ignitedTnts.has(key)) return false;
  if (!store.inBounds(x, y, z) || store.getBlock(x, y, z) !== 'water_bomb') return false;
  if (!isAdmin && store.findProtectingRegion(x, y, z)) return false;

  ignitedTnts.add(key);
  broadcast({ type: 'water_bomb_ignited', x, y, z, durationMs: delayMs });
  setTimeout(() => {
    ignitedTnts.delete(key);
    if (store.getBlock(x, y, z) !== 'water_bomb') return;
    const { changes, chainFills } = store.fillWaterAt(x, y, z, 4, isAdmin);
    broadcast({ type: 'water_bomb_explode', x, y, z });
    if (changes.length > 0) broadcast({ type: 'blocks_batch', changes });
    for (const p of players.values()) {
      if (p.linkedTnts?.delete(key)) {
        send(p.ws, { type: 'remote_links_update', links: [...p.linkedTnts] });
      }
    }
    for (let i = 0; i < chainFills.length; i++) {
      const cf = chainFills[i];
      setTimeout(() => igniteWaterBombAt(cf.x, cf.y, cf.z, isAdmin, 650), 160 + i * 110);
    }
  }, delayMs);
  return true;
}

function igniteFlattenBombAt(x, y, z, isAdmin, delayMs = 2200) {
  const key = `${x},${y},${z}`;
  if (ignitedTnts.has(key)) return false;
  if (!store.inBounds(x, y, z) || store.getBlock(x, y, z) !== 'flatten_bomb') return false;
  if (!isAdmin && store.findProtectingRegion(x, y, z)) return false;

  ignitedTnts.add(key);
  broadcast({ type: 'flatten_bomb_ignited', x, y, z, durationMs: delayMs });
  setTimeout(() => {
    ignitedTnts.delete(key);
    if (store.getBlock(x, y, z) !== 'flatten_bomb') return;
    const { changes, fell, chainBombs } = store.flattenAt(x, y, z, isAdmin);
    broadcast({ type: 'flatten_bomb_explode', x, y, z });
    if (changes.length > 0) broadcast({ type: 'blocks_batch', changes, fell });
    for (const p of players.values()) {
      if (p.linkedTnts?.delete(key)) {
        send(p.ws, { type: 'remote_links_update', links: [...p.linkedTnts] });
      }
    }
    for (let i = 0; i < chainBombs.length; i++) {
      const cb = chainBombs[i];
      if (cb.kind === 'flatten_bomb') setTimeout(() => igniteFlattenBombAt(cb.x, cb.y, cb.z, isAdmin, 650), 160 + i * 110);
      else if (cb.kind === 'tnt') setTimeout(() => igniteTNTAt(cb.x, cb.y, cb.z, isAdmin, 650), 160 + i * 110);
    }
  }, delayMs);
  return true;
}

function syncSaboSwordForPlayer(p) {
  if (!p || p.world !== 'sandbox' || !p.tools) return;
  if (p.isAdmin && store.config.saboSwordEnabled) {
    p.tools.sword = 'sabo_sword';
  } else {
    delete p.tools.sword;
  }
  send(p.ws, { type: 'tools_update', tools: p.tools });
}

function syncSaboSwordForAllAdmins() {
  for (const p of players.values()) {
    if (p.world === 'sandbox' && p.tools) syncSaboSwordForPlayer(p);
  }
}

// Hunger & HP survival loop: every 4 in-game hours (60s real time) without eating -> hunger drops; when 0 -> HP drops!
const HUNGER_TICK_MS = 60_000;
setInterval(() => {
  const now = Date.now();
  for (const p of players.values()) {
    if (p.world !== 'sandbox') continue;
    if (now - (p.lastAteAt || now) < HUNGER_TICK_MS) continue;
    p.lastAteAt = now;
    if (p.hunger > 0) {
      p.hunger = Math.max(0, p.hunger - 2);
      if (p.hunger <= 6 && p.hunger > 0) {
        send(p.ws, { type: 'toast', level: 'warn', text: '🍎 배가 고파지고 있습니다! 사과나 빵, 고기를 먹어주세요.' });
      }
    }
    if (p.hunger <= 0) {
      p.hp = Math.max(2, p.hp - 2);
      send(p.ws, { type: 'toast', level: 'error', text: `💔 굶주림으로 체력이 감소했습니다! (HP ${p.hp}/20 · 이동속도 저하)` });
    }
    send(p.ws, { type: 'vitals_update', hp: p.hp, hunger: p.hunger });
  }
}, 15_000);

// Natural grass spreading: exposed dirt blocks next to grass gradually turn into grass!
setInterval(() => {
  if (players.size === 0) return;
  const candidates = [];
  for (const [k, val] of store.deltas.entries()) {
    if (val === 'dirt') candidates.push(k);
  }
  if (candidates.length === 0) return;

  let converted = 0;
  const checks = Math.min(24, candidates.length);
  for (let i = 0; i < checks && converted < 3; i++) {
    const k = candidates[Math.floor(Math.random() * candidates.length)];
    const [x, y, z] = k.split(',').map(Number);
    if (!store.inBounds(x, y + 1, z)) continue;
    if (store.getBlock(x, y, z) !== 'dirt') continue;
    if (store.getBlock(x, y + 1, z) !== null) continue;
    if (store.findProtectingRegion(x, y, z)) continue;

    let hasGrassNeighbor = false;
    for (let dx = -1; dx <= 1 && !hasGrassNeighbor; dx++) {
      for (let dz = -1; dz <= 1 && !hasGrassNeighbor; dz++) {
        for (let dy = -1; dy <= 1 && !hasGrassNeighbor; dy++) {
          if (dx === 0 && dy === 0 && dz === 0) continue;
          if (store.getBlock(x + dx, y + dy, z + dz) === 'grass') hasGrassNeighbor = true;
        }
      }
    }
    if (!hasGrassNeighbor) continue;

    store.setBlock(x, y, z, 'grass');
    broadcast({ type: 'block_update', x, y, z, block: 'grass' });
    converted++;
  }
}, 12_000);

const FUSE_STEP_DIRS = [
  [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0], [0, -1, 0],
  [1, 1, 0], [-1, 1, 0], [0, 1, 1], [0, 1, -1],
  [1, -1, 0], [-1, -1, 0], [0, -1, 1], [0, -1, -1]
];

function igniteFuseAt(x, y, z, isAdmin, depth = 0) {
  if (depth > 96) return false;
  const key = `${x},${y},${z}`;
  if (burningFuses.has(key)) return false;
  if (!store.inBounds(x, y, z) || store.getBlock(x, y, z) !== 'fuse') return false;
  if (!isAdmin && store.findProtectingRegion(x, y, z)) return false;

  burningFuses.add(key);
  broadcast({ type: 'fuse_burn', x, y, z });
  setTimeout(() => {
    burningFuses.delete(key);
    if (store.getBlock(x, y, z) === 'fuse') {
      store.setBlock(x, y, z, null);
      broadcast({ type: 'block_update', x, y, z, block: null });
    }
    for (const [dx, dy, dz] of FUSE_STEP_DIRS) {
      const nx = x + dx, ny = y + dy, nz = z + dz;
      if (!store.inBounds(nx, ny, nz)) continue;
      const nb = store.getBlock(nx, ny, nz);
      if (nb === 'fuse') {
        igniteFuseAt(nx, ny, nz, isAdmin, depth + 1);
      } else if (nb === 'tnt') {
        igniteTNTAt(nx, ny, nz, isAdmin, 2400);
      } else if (nb === 'fill_bomb') {
        igniteFillBombAt(nx, ny, nz, isAdmin, 2000);
      } else if (nb === 'water_bomb') {
        igniteWaterBombAt(nx, ny, nz, isAdmin, 2000);
      } else if (nb === 'flatten_bomb') {
        igniteFlattenBombAt(nx, ny, nz, isAdmin, 2000);
      }
    }
  }, 115);
  return true;
}

const plateTimers = new Map();
const DOOR_OPEN_MAP = {
  door_closed: 'door_open',
  door_stone_closed: 'door_stone_open',
  door_iron_closed: 'door_iron_open',
  door_glass_closed: 'door_glass_open'
};
const DOOR_CLOSE_MAP = {
  door_open: 'door_closed',
  door_stone_open: 'door_stone_closed',
  door_iron_open: 'door_iron_closed',
  door_glass_open: 'door_glass_closed'
};

function propagateRedstoneSignal(sx, sy, sz, powerOn, isAdmin) {
  const visited = new Set([`${sx},${sy},${sz}`]);
  const queue = [{ x: sx, y: sy, z: sz, dist: 0 }];
  const changes = [];
  const changedSet = new Set();

  const applyChange = (x, y, z, nextBlock) => {
    const k = `${x},${y},${z}`;
    if (changedSet.has(k)) return;
    changedSet.add(k);
    store.setBlock(x, y, z, nextBlock);
    changes.push({ x, y, z, block: nextBlock });
  };

  while (queue.length > 0) {
    const cur = queue.shift();
    if (cur.dist >= 16) continue;

    for (const [dx, dy, dz] of FUSE_STEP_DIRS) {
      const nx = cur.x + dx, ny = cur.y + dy, nz = cur.z + dz;
      if (!store.inBounds(nx, ny, nz)) continue;
      const nk = `${nx},${ny},${nz}`;
      const nb = store.getBlock(nx, ny, nz);
      if (!nb) continue;

      if (nb === 'redstone_wire' && !visited.has(nk)) {
        visited.add(nk);
        queue.push({ x: nx, y: ny, z: nz, dist: cur.dist + 1 });
        continue;
      }

      // Only orthogonal / immediate neighbors of wire/switch get powered
      if (Math.abs(dx) + Math.abs(dy) + Math.abs(dz) > 1) continue;

      if (powerOn) {
        if (DOOR_OPEN_MAP[nb]) {
          const next = DOOR_OPEN_MAP[nb];
          applyChange(nx, ny, nz, next);
          if (store.inBounds(nx, ny + 1, nz) && store.getBlock(nx, ny + 1, nz) === nb) applyChange(nx, ny + 1, nz, next);
          if (store.inBounds(nx, ny - 1, nz) && store.getBlock(nx, ny - 1, nz) === nb) applyChange(nx, ny - 1, nz, next);
        } else if (nb === 'redstone_lamp_off') {
          applyChange(nx, ny, nz, 'redstone_lamp_on');
        } else if (nb === 'tnt') {
          igniteTNTAt(nx, ny, nz, isAdmin, 2400);
        } else if (nb === 'fill_bomb') {
          igniteFillBombAt(nx, ny, nz, isAdmin, 2000);
        } else if (nb === 'water_bomb') {
          igniteWaterBombAt(nx, ny, nz, isAdmin, 2000);
        } else if (nb === 'flatten_bomb') {
          igniteFlattenBombAt(nx, ny, nz, isAdmin, 2000);
        } else if (nb === 'fuse') {
          igniteFuseAt(nx, ny, nz, isAdmin, 0);
        }
      } else {
        if (DOOR_CLOSE_MAP[nb]) {
          const next = DOOR_CLOSE_MAP[nb];
          applyChange(nx, ny, nz, next);
          if (store.inBounds(nx, ny + 1, nz) && store.getBlock(nx, ny + 1, nz) === nb) applyChange(nx, ny + 1, nz, next);
          if (store.inBounds(nx, ny - 1, nz) && store.getBlock(nx, ny - 1, nz) === nb) applyChange(nx, ny - 1, nz, next);
        } else if (nb === 'redstone_lamp_on') {
          applyChange(nx, ny, nz, 'redstone_lamp_off');
        }
      }
    }
  }

  if (changes.length > 0) {
    broadcast({ type: 'blocks_batch', changes });
  }
}

function scheduleSaplingGrowth(x, y, z) {
  setTimeout(() => {
    const changes = store.growSapling(x, y, z);
    if (changes && changes.length > 0) broadcast({ type: 'blocks_batch', changes });
  }, 18000);
}

function scheduleCropGrowth(x, y, z, stage) {
  const delay = store.isNearWater(x, y, z) ? 9000 : 18000;
  setTimeout(() => {
    const cur = store.getBlock(x, y, z);
    if (stage === 1 && cur === 'wheat_1') {
      store.setBlock(x, y, z, 'wheat_2');
      broadcast({ type: 'block_update', x, y, z, block: 'wheat_2' });
      scheduleCropGrowth(x, y, z, 2);
    } else if (stage === 2 && cur === 'wheat_2') {
      store.setBlock(x, y, z, 'wheat_3');
      broadcast({ type: 'block_update', x, y, z, block: 'wheat_3' });
    }
  }, delay);
}

// World simulation loops (animals only in sandbox, furnaces, day/night clock)
setInterval(() => {
  let hasSandbox = false;
  for (const p of players.values()) if (p.world === 'sandbox') { hasSandbox = true; break; }
  if (!hasSandbox) return;
  animals.tick(0.25);
  broadcast({ type: 'animals_update', animals: animals.serializeAll() }, null, 'sandbox');
}, 250);

let _timeSyncTick = 0;
setInterval(() => {
  worldTime = (worldTime + 1 / DAY_LENGTH_SEC) % 1;
  _timeSyncTick = (_timeSyncTick + 1) % 10;
  if (_timeSyncTick === 0 && players.size > 0) {
    broadcast({ type: 'world_time', time: worldTime });
  }
  const updatedFurnaces = store.tickFurnaces();
  for (const fk of updatedFurnaces) {
    if (store.furnaces[fk]) broadcastFurnaceToViewers(fk, store.furnaces[fk]);
  }
}, 1000);

wss.on('connection', (ws) => {
  let player = null;

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }

    if (msg.type === 'join') {
      if (player) return;
      if (players.size >= MAX_PLAYERS) {
        send(ws, { type: 'join_error', message: `현재 접속 인원이 가득 찼습니다. (최대 ${MAX_PLAYERS}명)` });
        ws.close();
        return;
      }

      const rawNick = String(msg.nickname || '').trim().replace(/\s+/g, ' ');
      if (rawNick.length < 1 || rawNick.length > 16) {
        send(ws, { type: 'join_error', message: '닉네임은 1~16자로 입력해주세요.' });
        return;
      }
      for (const existing of players.values()) {
        if (existing.nickname.toLowerCase() === rawNick.toLowerCase()) {
          send(ws, { type: 'join_error', message: '이미 접속 중인 닉네임입니다. 다른 닉네임을 입력해주세요.' });
          return;
        }
      }

      const isAdminLogin = false; // 관리자는 채팅 /관리자모드 로만 전환 (2026-11-24 pbk)

      const id = `p${nextPlayerSeq++}`;
      const worldMode = msg.world === 'job' ? 'job' : (msg.world === 'center' ? 'center' : 'sandbox');
      const isStaticZone = worldMode === 'job' || worldMode === 'center';
      const color = AVATAR_COLORS[(nextPlayerSeq - 2) % AVATAR_COLORS.length];
      const defaultSkin = {
        skinColor: '#f5cfa0', hairColor: '#3b2416', shirtColor: color,
        pantsColor: '#334155', hatColor: '', eyeColor: '#0f172a', blush: true, pixelDataUrl: null
      };

      const bag = worldMode === 'job'
        ? Array(BAG_SIZE).fill(null)
        : (worldMode === 'center' ? createCenterFurnitureBag() : createStarterBag());
      if (isAdminLogin && worldMode === 'sandbox') {
        bag[0] = { block: 'protect_beacon', count: 16 };
        bag[1] = { block: 'stealth_beacon', count: 16 };
      }
      const tools = isStaticZone ? null : createStarterTools();
      if (tools && isAdminLogin && store.config.saboSwordEnabled) {
        tools.sword = 'sabo_sword';
      }
      let startPos;
      if (worldMode === 'job') {
        startPos = { x: jobWorld.spawn.x + (Math.random() - 0.5) * 2, y: jobWorld.spawn.y, z: jobWorld.spawn.z };
      } else if (worldMode === 'center') {
        startPos = { x: centerWorld.spawn.x, y: centerWorld.spawn.y, z: centerWorld.spawn.z + (Math.random() - 0.5) * 2 };
      } else {
        const sx = 0.5 + (Math.random() - 0.5) * 3;
        const sz = 0.5 + (Math.random() - 0.5) * 3;
        let sy = 37;
        const bx = Math.floor(sx), bz = Math.floor(sz);
        while (sy < WORLD_BOUNDS.maxY - 2 && (store.getBlock(bx, sy, bz) || store.getBlock(bx, sy + 1, bz))) {
          sy++;
        }
        startPos = { x: sx, y: sy + 0.1, z: sz };
      }

      const initialOrder = worldMode === 'job' ? pickRandomCafeOrder() : null;

      player = {
        id, ws, world: worldMode, nickname: rawNick, color, skin: defaultSkin,
        heldItem: bag[0]?.block || null,
        x: startPos.x, y: startPos.y, z: startPos.z,
        spawn: { ...startPos },
        yaw: worldMode === 'center' ? -Math.PI / 2 : 0, pitch: 0, isAdmin: isAdminLogin, bag, tools,
        hp: 20, hunger: 20, lastAteAt: Date.now(),
        jobOrder: initialOrder, jobScore: 0, jobCompleted: 0,
        openChestKey: null, openFurnaceKey: null,
        linkedTnts: new Set(),
        editUndoStack: [],
        cutSlot: null
      };
      players.set(id, player);

      const sameWorldPlayers = [...players.values()].filter(p => p.id !== id && p.world === worldMode);

      send(ws, {
        type: 'welcome',
        worldMode,
        self: serializePlayer(player),
        bag: player.bag,
        tools: player.tools,
        catalog: CATALOG,
        recipes: RECIPES,
        cafeRecipes: CAFE_RECIPES,
        cafeFridgeItems: CAFE_FRIDGE_ITEMS,
        jobOrder: player.jobOrder,
        jobScore: player.jobScore,
        jobCompleted: player.jobCompleted,
        worldBounds: worldMode === 'job' ? jobWorld.bounds : (worldMode === 'center' ? centerWorld.bounds : WORLD_BOUNDS),
        worldRLE: worldMode === 'job' ? jobWorld.rle : (worldMode === 'center' ? centerWorld.getRLE() : null),
        worldDeltas: isStaticZone ? null : store.getDeltasObject(),
        worldTime,
        worldWeather,
        animals: isStaticZone ? [] : animals.serializeAll(),
        signs: worldMode === 'job' ? jobWorld.signs : (worldMode === 'center' ? centerWorld.signs : store.signs),
        portals: isStaticZone ? {} : store.portals,
        beacons: isStaticZone ? {} : store.beacons,
        facings: worldMode === 'job' ? {} : (worldMode === 'center' ? centerWorld.facings : store.facings),
        elevator: worldMode === 'center' ? getCenterElevatorPayload() : null,
        centerPylon: worldMode === 'center' ? store.centerPylon : (worldMode === 'sandbox' ? SANDBOX_CENTER_PYLON : null),
        centerNpcs: worldMode === 'center' ? CENTER_NPCS : (worldMode === 'sandbox' ? SANDBOX_CENTER_NPCS : []),
        serverConfig: store.config,
        players: sameWorldPlayers.map(serializePlayer),
        regions: isStaticZone ? [] : store.regions,
        blueprints: isStaticZone ? [] : store.blueprints,
        skins: store.skins,
        maxPlayers: MAX_PLAYERS
      });

      broadcast({ type: 'player_join', player: serializePlayer(player) }, id, worldMode);
      const modeLabel = worldMode === 'job' ? '직업 체험 마을' : (worldMode === 'center' ? '행복플러스센터' : 'Boxworld');
      broadcast({
        type: 'chat', system: true,
        text: `${isAdminLogin ? '🛡️ 관리자 ' : ''}${player.nickname}님이 ${modeLabel}에 입장했습니다.`
      }, null, worldMode);
      return;
    }

    if (!player) return;

    switch (msg.type) {
      case 'move': {
        const x = Number(msg.x), y = Number(msg.y), z = Number(msg.z);
        const yaw = Number(msg.yaw), pitch = Number(msg.pitch);
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return;
        const b = player.world === 'job' ? jobWorld.bounds : (player.world === 'center' ? centerWorld.bounds : WORLD_BOUNDS);
        player.x = Math.max(b.minX - 2, Math.min(b.maxX + 2, x));
        player.y = Math.max(-5, Math.min(b.maxY + 20, y));
        player.z = Math.max(b.minZ - 2, Math.min(b.maxZ + 2, z));
        player.yaw = Number.isFinite(yaw) ? yaw : 0;
        player.pitch = Number.isFinite(pitch) ? pitch : 0;
        broadcast({
          type: 'player_move', id: player.id,
          x: player.x, y: player.y, z: player.z, yaw: player.yaw, pitch: player.pitch
        }, player.id, player.world);
        break;
      }

      case 'held_item': {
        const item = msg.item && CATALOG[msg.item] ? msg.item : null;
        if (player.heldItem !== item) {
          player.heldItem = item;
          broadcast({ type: 'player_held', id: player.id, heldItem: item }, player.id, player.world);
        }
        break;
      }

      // ===== Job Experience Village: Barista Cafe Handlers =====
      case 'job_new_order': {
        if (player.world !== 'job') return;
        player.jobOrder = pickRandomCafeOrder(player.jobOrder?.id);
        send(ws, {
          type: 'job_state',
          jobOrder: player.jobOrder,
          jobScore: player.jobScore,
          jobCompleted: player.jobCompleted
        });
        send(ws, { type: 'toast', level: 'info', text: `🧾 새 주문: "${player.jobOrder.name}" (${player.jobOrder.tip})` });
        break;
      }

      case 'job_espresso': {
        if (player.world !== 'job') return;
        const leftover = addItemToSlots(player.bag, 'espresso', 1);
        send(ws, { type: 'bag_update', bag: player.bag });
        send(ws, {
          type: 'toast',
          level: leftover ? 'warn' : 'success',
          text: leftover ? '쟁반(가방)이 가득 찼습니다.' : '☕ 커피머신에서 에스프레소 샷 1개를 추출했습니다!'
        });
        break;
      }

      case 'job_fridge_take': {
        if (player.world !== 'job') return;
        const itemId = String(msg.item || '');
        if (!CAFE_FRIDGE_ITEMS.includes(itemId)) return;
        const leftover = addItemToSlots(player.bag, itemId, 1);
        send(ws, { type: 'bag_update', bag: player.bag });
        const nm = CATALOG[itemId]?.name || itemId;
        send(ws, {
          type: 'toast',
          level: leftover ? 'warn' : 'success',
          text: leftover ? '쟁반(가방)이 가득 찼습니다.' : `🧊 냉장고에서 ${nm}을(를) 꺼냈습니다.`
        });
        break;
      }

      case 'job_mix': {
        if (player.world !== 'job') return;
        const recipe = CAFE_RECIPES.find(r => r.id === msg.recipeId);
        if (!recipe) return;
        for (const req of recipe.ingredients) {
          if (countItemInSlots(player.bag, req) < 1) {
            const nm = CATALOG[req]?.name || req;
            send(ws, { type: 'toast', level: 'warn', text: `재료가 부족합니다: ${nm}이(가) 필요합니다.` });
            return;
          }
        }
        for (const req of recipe.ingredients) consumeItemFromSlots(player.bag, req, 1);
        addItemToSlots(player.bag, recipe.id, 1);
        send(ws, { type: 'bag_update', bag: player.bag });
        send(ws, { type: 'toast', level: 'success', text: `🥤 "${recipe.name}" 완성! 이제 ⑤ 픽업 서빙대로 가져가세요!` });
        break;
      }

      case 'job_serve': {
        if (player.world !== 'job') return;
        if (!player.jobOrder) {
          player.jobOrder = pickRandomCafeOrder();
          send(ws, { type: 'job_state', jobOrder: player.jobOrder, jobScore: player.jobScore, jobCompleted: player.jobCompleted });
          return;
        }
        if (countItemInSlots(player.bag, player.jobOrder.id) < 1) {
          send(ws, { type: 'toast', level: 'warn', text: `🛎️ 주문하신 "${player.jobOrder.name}"이(가) 아직 완성되지 않았습니다!` });
          return;
        }
        consumeItemFromSlots(player.bag, player.jobOrder.id, 1);
        const servedName = player.jobOrder.name;
        player.jobScore += 100;
        player.jobCompleted += 1;
        player.jobOrder = pickRandomCafeOrder(player.jobOrder.id);

        send(ws, { type: 'bag_update', bag: player.bag });
        send(ws, {
          type: 'job_state',
          jobOrder: player.jobOrder,
          jobScore: player.jobScore,
          jobCompleted: player.jobCompleted,
          served: servedName
        });
        send(ws, {
          type: 'toast', level: 'success',
          text: `🎉 "${servedName}" 서빙 성공! (+100점 · 총 ${player.jobScore}점) 다음 주문: ${player.jobOrder.name}`
        });
        broadcast({
          type: 'chat', system: true,
          text: `☕ ${player.nickname}님이 "${servedName}" 서빙에 성공했습니다! (${player.jobCompleted}잔 완료 · ${player.jobScore}점)`
        }, null, 'job');
        break;
      }

      case 'job_clear_bag': {
        if (player.world !== 'job') return;
        player.bag = Array(BAG_SIZE).fill(null);
        send(ws, { type: 'bag_update', bag: player.bag });
        send(ws, { type: 'toast', level: 'info', text: '🧹 바리스타 쟁반을 비웠습니다.' });
        break;
      }

      case 'till_soil': {
        const { x, y, z, slotIndex, toolType } = msg;
        if (!store.inBounds(x, y, z)) return;
        const region = store.findProtectingRegion(x, y, z);
        if (region && !player.isAdmin) {
          send(ws, { type: 'toast', level: 'warn', text: `🔒 보호 구역("${region.name}")에서는 경작할 수 없습니다.` });
          return;
        }
        const toolId = (toolType && player.tools?.[toolType]) ? player.tools[toolType] : player.bag[Number(slotIndex)]?.block;
        const heldDef = toolId ? ITEMS[toolId] : null;
        if (!heldDef || heldDef.toolType !== 'hoe') return;
        const cur = store.getBlock(x, y, z);
        if (cur !== 'grass' && cur !== 'dirt') return;
        if (store.getBlock(x, y + 1, z) !== null) return;
        store.setBlock(x, y, z, 'farmland');
        broadcast({ type: 'block_update', x, y, z, block: 'farmland', by: player.nickname });
        break;
      }

      case 'plant_seed': {
        const { x, y, z, slotIndex } = msg;
        if (!store.inBounds(x, y, z)) return;
        const region = store.findProtectingRegion(x, y, z);
        if (region && !player.isAdmin) {
          send(ws, { type: 'toast', level: 'warn', text: `🔒 보호 구역("${region.name}")에서는 심을 수 없습니다.` });
          return;
        }
        const idx = Number(slotIndex);
        const slot = player.bag[idx];
        if (!slot || slot.block !== 'wheat_seeds' || slot.count <= 0) return;
        if (store.getBlock(x, y, z) !== null) return;
        if (store.getBlock(x, y - 1, z) !== 'farmland') {
          send(ws, { type: 'toast', level: 'warn', text: '🌾 밀 씨앗은 괭이로 간 경작지 위에만 심을 수 있습니다!' });
          return;
        }
        slot.count -= 1;
        if (slot.count <= 0) player.bag[idx] = null;
        store.setBlock(x, y, z, 'wheat_1');
        send(ws, { type: 'bag_update', bag: player.bag });
        broadcast({ type: 'block_update', x, y, z, block: 'wheat_1', by: player.nickname });
        scheduleCropGrowth(x, y, z, 1);
        break;
      }

      case 'block_place': {
        if (player.world === 'job') {
          send(ws, { type: 'toast', level: 'warn', text: '💼 직업 체험 마을에서는 블록을 설치할 수 없습니다.' });
          return;
        }
        if (player.world === 'center') {
          const { x, y, z, slotIndex } = msg;
          const idx = Number(slotIndex);
          const slot = (idx >= 0 && idx < BAG_SIZE) ? player.bag[idx] : null;
          if (!slot || !BLOCKS[slot.block]) return;
          if (!player.isAdmin && !CENTER_FURNITURE_IDS.includes(slot.block)) {
            send(ws, { type: 'toast', level: 'warn', text: '🏢 행복플러스센터에서는 전용 카페·사무실 가구만 배치할 수 있습니다. (관리자모드 시 모든 블록 가능)' });
            return;
          }
          if (!centerWorld.inBounds(x, y, z) || centerWorld.getBlock(x, y, z) !== null) return;
          const fDir = Number(msg.facing) & 3;
          const isDoor = slot.block.startsWith('door_');
          if (isDoor) {
            if (!centerWorld.inBounds(x, y + 1, z) || centerWorld.getBlock(x, y + 1, z) !== null) return;
            player.editUndoStack.push({
              world: 'center',
              label: CATALOG[slot.block]?.name || slot.block,
              changes: [
                { x, y, z, prevBlock: null, prevFacing: 0 },
                { x, y: y + 1, z, prevBlock: null, prevFacing: 0 }
              ]
            });
            if (player.editUndoStack.length > 30) player.editUndoStack.shift();
            centerWorld.setBlock(x, y, z, slot.block);
            centerWorld.setBlock(x, y + 1, z, slot.block);
            centerWorld.facings[`${x},${y},${z}`] = fDir;
            centerWorld.facings[`${x},${y + 1},${z}`] = fDir;
            store.setCenterFurn(x, y, z, slot.block, fDir);
            store.setCenterFurn(x, y + 1, z, slot.block, fDir);
            broadcast({
              type: 'blocks_batch',
              changes: [
                { x, y, z, block: slot.block, facing: fDir },
                { x, y: y + 1, z, block: slot.block, facing: fDir }
              ],
              by: player.nickname
            }, null, 'center');
            break;
          }
          player.editUndoStack.push({
            world: 'center',
            label: CATALOG[slot.block]?.name || slot.block,
            changes: [{ x, y, z, prevBlock: null, prevFacing: 0 }]
          });
          if (player.editUndoStack.length > 30) player.editUndoStack.shift();
          centerWorld.setBlock(x, y, z, slot.block);
          centerWorld.facings[`${x},${y},${z}`] = fDir;
          store.setCenterFurn(x, y, z, slot.block, fDir);
          if (slot.block === 'sign' || slot.block === 'sign_fixed') {
            centerWorld.signs[`${x},${y},${z}`] = {
              x, y, z,
              text: `${player.nickname}의 표지판`,
              author: player.nickname,
              fixed: slot.block === 'sign_fixed',
              facing: fDir
            };
            broadcast({ type: 'signs_update', signs: centerWorld.signs }, null, 'center');
          }
          broadcast({ type: 'block_update', x, y, z, block: slot.block, facing: fDir, by: player.nickname }, null, 'center');
          break;
        }
        const { x, y, z, slotIndex } = msg;
        if (!store.inBounds(x, y, z)) {
          send(ws, { type: 'toast', level: 'warn', text: '월드 경계 밖에는 설치할 수 없습니다.' });
          return;
        }
        const region = store.findProtectingRegion(x, y, z);
        if (region && !player.isAdmin) {
          send(ws, { type: 'toast', level: 'warn', text: `🔒 보호 구역("${region.name}")에서는 수정할 수 없습니다.` });
          return;
        }
        const existing = store.getBlock(x, y, z);
        if (existing && existing !== 'water') return;

        const idx = Number(slotIndex);
        if (!Number.isInteger(idx) || idx < 0 || idx >= BAG_SIZE) return;
        const slot = player.bag[idx];
        if (!slot || slot.count <= 0 || !BLOCKS[slot.block]) return;

        const blockId = slot.block;
        const isBeaconBlock = blockId === 'protect_beacon' || blockId === 'stealth_beacon';
        if (isBeaconBlock && !player.isAdmin) {
          send(ws, { type: 'toast', level: 'warn', text: '🔒 보호 비콘은 관리자만 설치할 수 있습니다.' });
          return;
        }
        if (blockId === 'sapling') {
          const below = store.getBlock(x, y - 1, z);
          if (below !== 'grass' && below !== 'dirt') {
            send(ws, { type: 'toast', level: 'warn', text: '🌱 묘목은 잔디 블록이나 흙 위에만 심을 수 있습니다.' });
            return;
          }
        }

        const isDoorBlock = blockId.startsWith('door_');
        if (isDoorBlock) {
          if (!store.inBounds(x, y + 1, z)) {
            send(ws, { type: 'toast', level: 'warn', text: '🚪 문은 1×2 크기로 위쪽 1칸이 필요합니다.' });
            return;
          }
          const topRegion = store.findProtectingRegion(x, y + 1, z);
          if (topRegion && !player.isAdmin) {
            send(ws, { type: 'toast', level: 'warn', text: `🔒 보호 구역("${topRegion.name}")에서는 설치할 수 없습니다.` });
            return;
          }
          const topExisting = store.getBlock(x, y + 1, z);
          if (topExisting && topExisting !== 'water') {
            send(ws, { type: 'toast', level: 'warn', text: '🚪 문(1×2)을 설치하려면 위쪽 1칸이 비어 있어야 합니다.' });
            return;
          }
        }

        if (!store.config.unlimitedBlocks) {
          slot.count -= 1;
          if (slot.count <= 0) player.bag[idx] = null;
        }
        const needsFacing = blockId.startsWith('stairs_') || isDoorBlock || blockId.startsWith('furn_') || blockId.startsWith('btn_') || blockId === 'sign_fixed';
        const facingVal = needsFacing ? (Number(msg.facing || 0) & 3) : undefined;
        const prevFacing0 = store.facings[`${x},${y},${z}`];
        store.setBlock(x, y, z, blockId, player.nickname);
        if (facingVal !== undefined) {
          store.setFacing(x, y, z, facingVal);
          if (blockId === 'sign_fixed' && store.signs[`${x},${y},${z}`]) {
            store.signs[`${x},${y},${z}`].facing = facingVal;
            store.signs[`${x},${y},${z}`].fixed = true;
            store._scheduleSave('signs', 100);
          }
        }
        if (isDoorBlock) {
          const prevTop = store.getBlock(x, y + 1, z);
          const prevFacingTop = store.facings[`${x},${y + 1},${z}`];
          player.editUndoStack.push({
            world: 'sandbox',
            label: CATALOG[blockId]?.name || blockId,
            changes: [
              { x, y, z, prevBlock: existing || null, prevFacing: prevFacing0 },
              { x, y: y + 1, z, prevBlock: prevTop || null, prevFacing: prevFacingTop }
            ]
          });
          if (player.editUndoStack.length > 30) player.editUndoStack.shift();
          store.setBlock(x, y + 1, z, blockId, player.nickname);
          store.setFacing(x, y + 1, z, facingVal);
          send(ws, { type: 'bag_update', bag: player.bag });
          broadcast({
            type: 'blocks_batch',
            changes: [
              { x, y, z, block: blockId, facing: facingVal },
              { x, y: y + 1, z, block: blockId, facing: facingVal }
            ],
            by: player.nickname
          });
          break;
        }
        player.editUndoStack.push({
          world: 'sandbox',
          label: CATALOG[blockId]?.name || blockId,
          changes: [{ x, y, z, prevBlock: existing || null, prevFacing: prevFacing0 }]
        });
        if (player.editUndoStack.length > 30) player.editUndoStack.shift();
        send(ws, { type: 'bag_update', bag: player.bag });
        broadcast({ type: 'block_update', x, y, z, block: blockId, facing: facingVal, by: player.nickname });

        if (blockId === 'sapling') {
          send(ws, { type: 'toast', level: 'success', text: '🌱 묘목을 심었습니다! 잠시 후 나무로 자랍니다.' });
          scheduleSaplingGrowth(x, y, z);
        }
        if (blockId === 'sign' || blockId === 'sign_fixed') broadcast({ type: 'signs_update', signs: store.signs });
        if (blockId === 'portal') broadcast({ type: 'portals_update', portals: store.portals });
        if (isBeaconBlock) {
          broadcast({ type: 'beacons_update', beacons: store.beacons });
          broadcast({ type: 'regions_update', regions: store.regions });
          const bCount = Object.keys(store.beacons).length;
          if (bCount < 2) {
            send(ws, { type: 'toast', level: 'info', text: '🛡️ 첫 번째 보호 비콘 설치! 반대편 모서리에 1개 더 꽂으면 안쪽 공간이 모두 보호됩니다.' });
          } else {
            const zReg = store.regions.find(r => r.id === 'beacon-auto-zone');
            const w = zReg ? (zReg.maxX - zReg.minX + 1) : 0;
            const d = zReg ? (zReg.maxZ - zReg.minZ + 1) : 0;
            send(ws, { type: 'toast', level: 'success', text: `🛡️ 비콘 보호 구역 활성화! (${bCount}개 비콘 · ${w}×${d} 영역 전체 보호)` });
          }
        }
        break;
      }

      // Multi-mode Builder Brush: place up to 5x5 / wall / row / column at once!
      case 'block_place_brush': {
        if (player.world === 'job' || player.world === 'center') return;
        const { positions, slotIndex } = msg;
        if (!Array.isArray(positions) || positions.length === 0 || positions.length > 25) return;
        const idx = Number(slotIndex);
        if (!Number.isInteger(idx) || idx < 0 || idx >= BAG_SIZE) return;
        const slot = player.bag[idx];
        if (!slot || slot.count <= 0 || !BLOCKS[slot.block]) return;
        const blockId = slot.block;
        if (blockId.startsWith('door_') || ['chest', 'furnace', 'bed', 'sign', 'portal', 'tnt', 'fill_bomb', 'water_bomb', 'flatten_bomb', 'fuse', 'protect_beacon', 'stealth_beacon', 'sapling'].includes(blockId)) return;

        const changes = [];
        for (const p of positions) {
          if (!store.config.unlimitedBlocks && slot.count <= 0) break;
          const x = Math.round(p.x), y = Math.round(p.y), z = Math.round(p.z);
          if (!store.inBounds(x, y, z)) continue;
          if (!player.isAdmin && store.findProtectingRegion(x, y, z)) continue;
          const ex = store.getBlock(x, y, z);
          if (ex && ex !== 'water') continue;
          if (!store.config.unlimitedBlocks) slot.count -= 1;
          store.setBlock(x, y, z, blockId, player.nickname);
          changes.push({ x, y, z, block: blockId });
        }
        if (!store.config.unlimitedBlocks && slot.count <= 0) player.bag[idx] = null;
        if (changes.length > 0) {
          player.lastBrushHistory = player.lastBrushHistory || [];
          player.lastBrushHistory.push({ blockId, coords: changes.map(c => ({ x: c.x, y: c.y, z: c.z })) });
          if (player.lastBrushHistory.length > 10) player.lastBrushHistory.shift();
          send(ws, { type: 'bag_update', bag: player.bag });
          broadcast({ type: 'blocks_batch', changes, by: player.nickname });
        }
        break;
      }

      case 'block_undo_edit': {
        // Pop latest matching-world edit from per-player undo stack
        let rec = null;
        while (player.editUndoStack.length > 0) {
          const top = player.editUndoStack.pop();
          if (top && top.world === player.world) { rec = top; break; }
        }
        if (!rec) {
          send(ws, { type: 'toast', level: 'info', text: '↩ 되돌릴 최근 수정 내역이 없습니다.' });
          return;
        }
        const applied = [];
        let signsDirty = false;
        for (const ch of rec.changes) {
          if (player.world === 'center') {
            if (!centerWorld.inBounds(ch.x, ch.y, ch.z)) continue;
            centerWorld.setBlock(ch.x, ch.y, ch.z, ch.prevBlock || null);
            if (ch.prevBlock) {
              centerWorld.facings[`${ch.x},${ch.y},${ch.z}`] = Number(ch.prevFacing || 0) & 3;
              store.setCenterFurn(ch.x, ch.y, ch.z, ch.prevBlock, ch.prevFacing || 0);
            } else {
              delete centerWorld.facings[`${ch.x},${ch.y},${ch.z}`];
              store.setCenterFurn(ch.x, ch.y, ch.z, null);
            }
            if (ch.prevSign) {
              centerWorld.signs[`${ch.x},${ch.y},${ch.z}`] = ch.prevSign;
              signsDirty = true;
            }
            applied.push({ x: ch.x, y: ch.y, z: ch.z, block: ch.prevBlock || null, facing: ch.prevFacing });
          } else if (player.world === 'sandbox') {
            if (!store.inBounds(ch.x, ch.y, ch.z)) continue;
            store.setBlock(ch.x, ch.y, ch.z, ch.prevBlock || null, player.nickname);
            if (ch.prevBlock && ch.prevFacing !== undefined) store.setFacing(ch.x, ch.y, ch.z, ch.prevFacing);
            if (ch.prevSign) {
              store.signs[`${ch.x},${ch.y},${ch.z}`] = ch.prevSign;
              store._scheduleSave('signs', 100);
              signsDirty = true;
            }
            applied.push({ x: ch.x, y: ch.y, z: ch.z, block: ch.prevBlock || null, facing: ch.prevFacing });
          }
        }
        if (applied.length > 0) {
          broadcast({ type: 'blocks_batch', changes: applied, by: player.nickname }, null, player.world);
          if (signsDirty) {
            const sMap = player.world === 'center' ? centerWorld.signs : store.signs;
            broadcast({ type: 'signs_update', signs: sMap }, null, player.world);
          }
          send(ws, { type: 'toast', level: 'success', text: `↩ 되돌리기 완료 (${rec.label}) · 남은 횟수: ${player.editUndoStack.length}` });
        }
        break;
      }

      case 'block_pick': {
        const { x, y, z, slotIndex } = msg;
        if (player.world === 'job') return;
        const targetStore = player.world === 'center' ? centerWorld : store;
        if (!targetStore.inBounds(x, y, z)) return;
        let rawId = targetStore.getBlock(x, y, z);
        if (!rawId || rawId === 'bedrock') return;
        // Normalize interactive/open variants to their placeable item ID
        const PICK_MAP = {
          door_open: 'door_closed',
          door_stone_open: 'door_stone_closed',
          door_iron_open: 'door_iron_closed',
          door_glass_open: 'door_glass_closed',
          redstone_lamp_on: 'redstone_lamp_off',
          lever_on: 'lever_off',
          furn_toilet_open: 'furn_toilet_closed'
        };
        const pickId = PICK_MAP[rawId] || rawId;
        const def = CATALOG[pickId];
        if (!def || def.kind !== 'block') return;

        // 1. Check if player already has it in hotbar (0..8)
        for (let i = 0; i < 9; i++) {
          if (player.bag[i]?.block === pickId) {
            send(ws, { type: 'pick_select_slot', slotIndex: i });
            send(ws, { type: 'toast', level: 'info', text: `💧 [${def.name}] 선택됨 (${i + 1}번 슬롯)` });
            return;
          }
        }
        const activeIdx = Math.max(0, Math.min(8, Number(slotIndex) || 0));
        // 2. Check if player has it in bag (9..35) -> swap into active hotbar slot
        for (let i = 9; i < BAG_SIZE; i++) {
          if (player.bag[i]?.block === pickId) {
            const tmp = player.bag[activeIdx];
            player.bag[activeIdx] = player.bag[i];
            player.bag[i] = tmp;
            send(ws, { type: 'bag_update', bag: player.bag });
            send(ws, { type: 'pick_select_slot', slotIndex: activeIdx });
            send(ws, { type: 'toast', level: 'info', text: `💧 [${def.name}] 가방에서 꺼내 들었습니다!` });
            return;
          }
        }
        // 3. Otherwise grant directly if admin, supply enabled, or center furniture in center world!
        const canGrant = player.isAdmin || store.config.supplyEnabled || (player.world === 'center' && CENTER_FURNITURE_IDS.includes(pickId));
        if (!canGrant) {
          send(ws, { type: 'toast', level: 'warn', text: `💧 가방에 [${def.name}] 블록이 없습니다.` });
          return;
        }
        // Move displaced hotbar item to an empty bag slot if possible so nothing is lost
        const prevSlot = player.bag[activeIdx];
        if (prevSlot) {
          const emptyBag = player.bag.findIndex((s, idx) => idx >= 9 && !s);
          if (emptyBag !== -1) player.bag[emptyBag] = prevSlot;
        }
        player.bag[activeIdx] = { block: pickId, count: def.stackable === 1 ? 1 : 64 };
        send(ws, { type: 'bag_update', bag: player.bag });
        send(ws, { type: 'pick_select_slot', slotIndex: activeIdx });
        send(ws, { type: 'toast', level: 'success', text: `💧 스포이드: [${def.name}] 블록을 손에 들었습니다!` });
        break;
      }

      case 'block_cut': {
        const { x, y, z } = msg;
        if (player.world === 'job') return;
        const isCenter = player.world === 'center';
        const targetStore = isCenter ? centerWorld : store;
        if (!targetStore.inBounds(x, y, z)) return;
        const cur = targetStore.getBlock(x, y, z);
        if (!cur || cur === 'bedrock') return;

        if (isCenter) {
          if (!player.isAdmin && !CENTER_FURNITURE_IDS.includes(cur)) {
            send(ws, { type: 'toast', level: 'warn', text: '🏢 건물 구조는 /관리자모드 에서만 잘라낼 수 있습니다.' });
            return;
          }
        } else {
          const region = store.findProtectingRegion(x, y, z);
          if (region && !player.isAdmin) {
            send(ws, { type: 'toast', level: 'warn', text: `🔒 보호 구역("${region.name}")에서는 잘라낼 수 없습니다.` });
            return;
          }
          if (cur === 'chest' && !store.isChestEmpty(x, y, z)) {
            send(ws, { type: 'toast', level: 'warn', text: '📦 내용물이 있는 상자는 먼저 비운 뒤 잘라내세요.' });
            return;
          }
        }

        const CUT_MAP = {
          door_open: 'door_closed',
          door_stone_open: 'door_stone_closed',
          door_iron_open: 'door_iron_closed',
          door_glass_open: 'door_glass_closed',
          redstone_lamp_on: 'redstone_lamp_off',
          lever_on: 'lever_off',
          furn_toilet_open: 'furn_toilet_closed'
        };
        const cutId = CUT_MAP[cur] || cur;
        const def = CATALOG[cutId];
        if (!def || def.kind !== 'block') return;

        const k = `${x},${y},${z}`;
        const prevFacing = isCenter ? (centerWorld.facings[k] || 0) : store.facings[k];
        const signsMap = isCenter ? centerWorld.signs : store.signs;
        const prevSign = (cur === 'sign' || cur === 'sign_fixed') && signsMap[k] ? { ...signsMap[k] } : null;
        const signText = prevSign ? prevSign.text : null;

        const changes = [{ x, y, z, block: null }];
        const undoChanges = [{ x, y, z, prevBlock: cur, prevFacing, prevSign }];

        if (isCenter) {
          const persistAir = !CENTER_FURNITURE_IDS.includes(cur);
          centerWorld.setBlock(x, y, z, null);
          delete centerWorld.facings[k];
          store.setCenterFurn(x, y, z, null, 0, persistAir);
          if (cur.startsWith('door_')) {
            for (const dy of [1, -1]) {
              if (centerWorld.inBounds(x, y + dy, z) && centerWorld.getBlock(x, y + dy, z) === cur) {
                const pk = `${x},${y + dy},${z}`;
                undoChanges.push({ x, y: y + dy, z, prevBlock: cur, prevFacing: centerWorld.facings[pk] || 0 });
                centerWorld.setBlock(x, y + dy, z, null);
                delete centerWorld.facings[pk];
                store.setCenterFurn(x, y + dy, z, null, 0, true);
                changes.push({ x, y: y + dy, z, block: null });
              }
            }
          }
          if (prevSign) {
            delete centerWorld.signs[k];
            broadcast({ type: 'signs_update', signs: centerWorld.signs }, null, 'center');
          }
        } else {
          store.setBlock(x, y, z, null);
          if (cur.startsWith('door_')) {
            for (const dy of [1, -1]) {
              if (store.inBounds(x, y + dy, z) && store.getBlock(x, y + dy, z) === cur) {
                const pk = `${x},${y + dy},${z}`;
                undoChanges.push({ x, y: y + dy, z, prevBlock: cur, prevFacing: store.facings[pk] });
                store.setBlock(x, y + dy, z, null);
                changes.push({ x, y: y + dy, z, block: null });
              }
            }
          }
          if (prevSign) {
            broadcast({ type: 'signs_update', signs: store.signs }, null, 'sandbox');
          }
        }

        player.editUndoStack.push({ world: player.world, label: `잘라내기(${def.name})`, changes: undoChanges });
        if (player.editUndoStack.length > 30) player.editUndoStack.shift();

        player.cutSlot = { block: cutId, facing: Number(prevFacing || 0) & 3, signText, world: player.world };
        broadcast({ type: 'blocks_batch', changes, by: player.nickname }, null, player.world);
        send(ws, { type: 'cut_slot_update', cutSlot: player.cutSlot, autoEquip: true });
        send(ws, { type: 'toast', level: 'success', text: `✂️ [${def.name}] 잘라내기 완료! [C] 슬롯에 담겼습니다. 원하는 위치에 우클릭으로 설치하세요.` });
        break;
      }

      case 'block_paste': {
        const { x, y, z } = msg;
        if (!player.cutSlot || player.world === 'job') return;
        const cut = player.cutSlot;
        const blockId = cut.block;
        const def = CATALOG[blockId];
        if (!def || def.kind !== 'block') return;
        const isCenter = player.world === 'center';
        const targetStore = isCenter ? centerWorld : store;
        if (!targetStore.inBounds(x, y, z) || targetStore.getBlock(x, y, z) !== null) return;

        if (isCenter) {
          if (!player.isAdmin && !CENTER_FURNITURE_IDS.includes(blockId)) {
            send(ws, { type: 'toast', level: 'warn', text: '🏢 이 블록은 /관리자모드 에서만 배치할 수 있습니다.' });
            return;
          }
        } else {
          const region = store.findProtectingRegion(x, y, z);
          if (region && !player.isAdmin) {
            send(ws, { type: 'toast', level: 'warn', text: `🔒 보호 구역("${region.name}")에서는 설치할 수 없습니다.` });
            return;
          }
        }

        const isDoor = blockId.startsWith('door_');
        if (isDoor && (!targetStore.inBounds(x, y + 1, z) || targetStore.getBlock(x, y + 1, z) !== null)) {
          send(ws, { type: 'toast', level: 'warn', text: '🚪 문(1×2)을 설치하려면 위쪽 1칸이 비어 있어야 합니다.' });
          return;
        }

        const fDir = Number(msg.facing !== undefined ? msg.facing : cut.facing) & 3;
        const changes = [{ x, y, z, block: blockId, facing: fDir }];
        const undoChanges = [{ x, y, z, prevBlock: null, prevFacing: 0 }];

        if (isCenter) {
          centerWorld.setBlock(x, y, z, blockId);
          centerWorld.facings[`${x},${y},${z}`] = fDir;
          store.setCenterFurn(x, y, z, blockId, fDir);
          if (isDoor) {
            centerWorld.setBlock(x, y + 1, z, blockId);
            centerWorld.facings[`${x},${y + 1},${z}`] = fDir;
            store.setCenterFurn(x, y + 1, z, blockId, fDir);
            changes.push({ x, y: y + 1, z, block: blockId, facing: fDir });
            undoChanges.push({ x, y: y + 1, z, prevBlock: null, prevFacing: 0 });
          }
          if (blockId === 'sign') {
            const sText = cut.signText || `${player.nickname}의 표지판`;
            centerWorld.signs[`${x},${y},${z}`] = { x, y, z, text: sText, author: player.nickname };
            store.setSignOverride(`center:${x},${y},${z}`, sText);
            broadcast({ type: 'signs_update', signs: centerWorld.signs }, null, 'center');
          }
        } else {
          store.setBlock(x, y, z, blockId, player.nickname);
          if (blockId.startsWith('stairs_') || isDoor) store.setFacing(x, y, z, fDir);
          if (isDoor) {
            store.setBlock(x, y + 1, z, blockId, player.nickname);
            store.setFacing(x, y + 1, z, fDir);
            changes.push({ x, y: y + 1, z, block: blockId, facing: fDir });
            undoChanges.push({ x, y: y + 1, z, prevBlock: null, prevFacing: 0 });
          }
          if (blockId === 'sign' && cut.signText) {
            store.setSignText(x, y, z, cut.signText, player.nickname);
            broadcast({ type: 'signs_update', signs: store.signs }, null, 'sandbox');
          }
        }

        player.editUndoStack.push({ world: player.world, label: `이동설치(${def.name})`, changes: undoChanges });
        if (player.editUndoStack.length > 30) player.editUndoStack.shift();

        player.cutSlot = null;
        broadcast({ type: 'blocks_batch', changes, by: player.nickname }, null, player.world);
        send(ws, { type: 'cut_slot_update', cutSlot: null, autoEquip: false });
        send(ws, { type: 'toast', level: 'success', text: `✂️ [${def.name}] 이동 설치 완료!` });
        break;
      }

      case 'block_undo_brush': {
        if (!player.lastBrushHistory || player.lastBrushHistory.length === 0) {
          send(ws, { type: 'toast', level: 'info', text: '되돌릴 건축 기록이 없습니다.' });
          return;
        }
        const last = player.lastBrushHistory.pop();
        const changes = [];
        let refunded = 0;
        for (const c of last.coords) {
          if (!store.inBounds(c.x, c.y, c.z)) continue;
          if (!player.isAdmin && store.findProtectingRegion(c.x, c.y, c.z)) continue;
          if (store.getBlock(c.x, c.y, c.z) === last.blockId) {
            store.setBlock(c.x, c.y, c.z, null);
            changes.push({ x: c.x, y: c.y, z: c.z, block: null });
            refunded++;
          }
        }
        if (refunded > 0) {
          addItemToSlots(player.bag, last.blockId, refunded);
          send(ws, { type: 'bag_update', bag: player.bag });
          broadcast({ type: 'blocks_batch', changes, by: player.nickname });
          send(ws, { type: 'toast', level: 'info', text: `↩ 직전 건축 ${refunded}블록을 되돌렸습니다.` });
        }
        break;
      }

      // Admin Auto-Build from Photo / Map image (up to 4,000 blocks)
      case 'admin_batch_build': {
        if (!player.isAdmin) {
          send(ws, { type: 'toast', level: 'error', text: '관리자만 자동 건축 기능을 사용할 수 있습니다.' });
          return;
        }
        const list = msg.blocks;
        if (!Array.isArray(list) || list.length === 0 || list.length > 4000) {
          send(ws, { type: 'toast', level: 'warn', text: '자동 건축 블록 수는 1~4,000개 사이여야 합니다.' });
          return;
        }
        const changes = [];
        const prevSnapshot = [];
        for (const item of list) {
          const x = Math.round(item.x), y = Math.round(item.y), z = Math.round(item.z);
          const blockId = String(item.block || '');
          if (!store.inBounds(x, y, z) || y <= WORLD_BOUNDS.minY) continue;
          if (!BLOCKS[blockId] || ['chest', 'furnace', 'bedrock'].includes(blockId)) continue;
          const prev = store.getBlock(x, y, z);
          if (prev === 'chest' || prev === 'furnace' || prev === 'bedrock') continue;
          prevSnapshot.push({ x, y, z, block: prev });
          store.setBlock(x, y, z, blockId, player.nickname);
          changes.push({ x, y, z, block: blockId });
        }
        if (changes.length > 0) {
          player.lastAdminBuild = prevSnapshot;
          broadcast({ type: 'blocks_batch', changes, by: player.nickname });
          broadcast({
            type: 'chat', system: true,
            text: `🏗️ 관리자 ${player.nickname}님이 사진/지도 자동 건축(${changes.length}블록)을 완료했습니다!`
          });
          send(ws, { type: 'toast', level: 'success', text: `🏗️ 자동 건축 완료! (${changes.length}블록 생성됨)` });
        }
        break;
      }

      case 'admin_batch_undo': {
        if (!player.isAdmin || !player.lastAdminBuild || player.lastAdminBuild.length === 0) {
          send(ws, { type: 'toast', level: 'info', text: '되돌릴 자동 건축 기록이 없습니다.' });
          return;
        }
        const snap = player.lastAdminBuild;
        player.lastAdminBuild = null;
        const changes = [];
        for (const item of snap) {
          if (!store.inBounds(item.x, item.y, item.z)) continue;
          store.setBlock(item.x, item.y, item.z, item.block);
          changes.push({ x: item.x, y: item.y, z: item.z, block: item.block });
        }
        broadcast({ type: 'blocks_batch', changes, by: player.nickname });
        send(ws, { type: 'toast', level: 'info', text: `↩ 자동 건축(${changes.length}블록)을 원래대로 되돌렸습니다.` });
        break;
      }

      case 'toggle_door': {
        const { x, y, z } = msg;
        if (player.world === 'center') {
          const ev = centerWorld.elevator;
          if (z === ev.doorZ && ev.doorXs.includes(x)) {
            callCenterElevator(getCenterElevatorFloorByY(y), player.nickname, ws);
            break;
          }
        }
        const targetStore = player.world === 'center' ? centerWorld : (player.world === 'sandbox' ? store : null);
        if (!targetStore || !targetStore.inBounds(x, y, z)) return;
        const cur = targetStore.getBlock(x, y, z);
        const DOOR_PAIRS = {
          door_closed: 'door_open',
          door_open: 'door_closed',
          door_stone_closed: 'door_stone_open',
          door_stone_open: 'door_stone_closed',
          door_iron_closed: 'door_iron_open',
          door_iron_open: 'door_iron_closed',
          door_glass_closed: 'door_glass_open',
          door_glass_open: 'door_glass_closed'
        };
        const next = DOOR_PAIRS[cur];
        if (!next) return;
        const changes = [{ x, y, z, block: next }];
        targetStore.setBlock(x, y, z, next);
        // Sync paired top or bottom half of 1x2 door
        if (targetStore.inBounds(x, y + 1, z) && targetStore.getBlock(x, y + 1, z) === cur) {
          targetStore.setBlock(x, y + 1, z, next);
          changes.push({ x, y: y + 1, z, block: next });
        } else if (targetStore.inBounds(x, y - 1, z) && targetStore.getBlock(x, y - 1, z) === cur) {
          targetStore.setBlock(x, y - 1, z, next);
          changes.push({ x, y: y - 1, z, block: next });
        }
        broadcast({ type: 'blocks_batch', changes, by: player.nickname }, null, player.world);
        break;
      }

      case 'toggle_toilet': {
        const { x, y, z } = msg;
        const isCenter = player.world === 'center';
        const targetStore = isCenter ? centerWorld : (player.world === 'sandbox' ? store : null);
        if (!targetStore || !targetStore.inBounds(x, y, z)) return;
        const cur = targetStore.getBlock(x, y, z);
        if (cur !== 'furn_toilet_closed' && cur !== 'furn_toilet_open') return;
        const next = cur === 'furn_toilet_closed' ? 'furn_toilet_open' : 'furn_toilet_closed';
        const k = `${x},${y},${z}`;
        const fDir = isCenter ? (centerWorld.facings[k] ?? 2) : (store.facings[k] ?? 2);
        targetStore.setBlock(x, y, z, next);
        if (isCenter) {
          centerWorld.facings[k] = fDir;
          store.setCenterFurn(x, y, z, next, fDir);
        } else {
          store.setFacing(x, y, z, fDir);
        }
        broadcast({ type: 'block_update', x, y, z, block: next, facing: fDir, by: player.nickname }, null, player.world);
        break;
      }

      case 'press_button': {
        const { x, y, z } = msg;
        if (player.world === 'center') {
          const ev = centerWorld.elevator;
          if (x === ev.buttonX && z === ev.buttonZ) {
            callCenterElevator(getCenterElevatorFloorByY(y), player.nickname, ws);
            break;
          }
          send(ws, { type: 'toast', level: 'info', text: '🔘 버튼을 눌렀습니다!' });
          break;
        }
        if (player.world !== 'sandbox' || !store.inBounds(x, y, z)) return;
        const cur = store.getBlock(x, y, z);
        if (!cur || !cur.startsWith('btn_')) return;
        const pk = `btn:${x},${y},${z}`;
        const alreadyActive = plateTimers.has(pk);
        if (alreadyActive) clearTimeout(plateTimers.get(pk));
        else propagateRedstoneSignal(x, y, z, true, player.isAdmin);
        plateTimers.set(pk, setTimeout(() => {
          plateTimers.delete(pk);
          propagateRedstoneSignal(x, y, z, false, false);
        }, 1600));
        break;
      }

      case 'toggle_lever': {
        const { x, y, z } = msg;
        if (player.world === 'center') {
          const ev = centerWorld.elevator;
          if (x === ev.buttonX && z === ev.buttonZ) {
            callCenterElevator(getCenterElevatorFloorByY(y), player.nickname, ws);
            break;
          }
          return;
        }
        if (!store.inBounds(x, y, z)) return;
        const cur = store.getBlock(x, y, z);
        if (cur !== 'lever_off' && cur !== 'lever_on') return;
        const next = cur === 'lever_off' ? 'lever_on' : 'lever_off';
        store.setBlock(x, y, z, next);
        broadcast({ type: 'block_update', x, y, z, block: next, by: player.nickname });
        propagateRedstoneSignal(x, y, z, next === 'lever_on', player.isAdmin);
        break;
      }

      case 'elevator_call': {
        if (player.world !== 'center') return;
        const floor = Number(msg.floor);
        if (!Number.isInteger(floor) || floor < 1 || floor > 7) return;
        callCenterElevator(floor, player.nickname, ws);
        break;
      }

      case 'trigger_plate': {
        const { x, y, z } = msg;
        if (!store.inBounds(x, y, z) || store.getBlock(x, y, z) !== 'pressure_plate') return;
        const pk = `${x},${y},${z}`;
        const alreadyActive = plateTimers.has(pk);
        if (alreadyActive) clearTimeout(plateTimers.get(pk));
        else propagateRedstoneSignal(x, y, z, true, player.isAdmin);

        plateTimers.set(pk, setTimeout(() => {
          plateTimers.delete(pk);
          propagateRedstoneSignal(x, y, z, false, false);
        }, 1600));
        break;
      }

      case 'sleep_bed': {
        const { x, y, z } = msg;
        if (store.getBlock(x, y, z) !== 'bed') return;
        player.spawn = { x: x + 0.5, y: y + 1.1, z: z + 0.5 };
        const isNight = worldTime >= 0.48 || worldTime < 0.06;
        if (isNight) {
          worldTime = 0.22;
          broadcast({ type: 'world_time', time: worldTime });
          broadcast({ type: 'chat', system: true, text: `🛏️ ${player.nickname}님이 침대에서 잠들어 아침이 되었습니다!` });
          send(ws, { type: 'toast', level: 'success', text: '🛏️ 푹 자고 아침이 되었습니다! (리스폰 위치 저장됨)' });
        } else {
          send(ws, { type: 'toast', level: 'info', text: '🛏️ 리스폰 위치가 이 침대로 저장되었습니다. (밤에 사용하면 아침으로 건너뜁니다)' });
        }
        break;
      }

      case 'sign_board_open': {
        const x = Number(msg.x), y = Number(msg.y), z = Number(msg.z);
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return;
        const k = `${x},${y},${z}`;
        const signsMap = player.world === 'job' ? jobWorld.signs : (player.world === 'center' ? centerWorld.signs : store.signs);
        const s = signsMap[k];
        const canEdit = player.world === 'sandbox'
          ? (player.isAdmin || !store.findProtectingRegion(x, y, z))
          : !!player.isAdmin;
        const boardKey = `${player.world}:${k}`;
        send(ws, {
          type: 'sign_board_data',
          x, y, z,
          text: s?.text || '표지판',
          canEdit,
          posts: store.getSignPosts(boardKey)
        });
        break;
      }

      case 'sign_post_add': {
        const x = Number(msg.x), y = Number(msg.y), z = Number(msg.z);
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return;
        const boardKey = `${player.world}:${x},${y},${z}`;
        const posts = store.addSignPost(boardKey, player.nickname, msg.text);
        if (!posts) return;
        broadcast({ type: 'sign_board_posts', x, y, z, posts }, null, player.world);
        send(ws, { type: 'toast', level: 'success', text: '📝 방명록 글이 등록되었습니다!' });
        break;
      }

      case 'sign_post_delete': {
        const x = Number(msg.x), y = Number(msg.y), z = Number(msg.z);
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return;
        const boardKey = `${player.world}:${x},${y},${z}`;
        const posts = store.deleteSignPost(boardKey, String(msg.postId || ''), player.nickname, player.isAdmin);
        if (!posts) return;
        broadcast({ type: 'sign_board_posts', x, y, z, posts }, null, player.world);
        send(ws, { type: 'toast', level: 'info', text: '🗑️ 게시글을 삭제했습니다.' });
        break;
      }

      case 'sign_update': {
        const { x, y, z, text } = msg;
        if (player.world === 'sandbox') {
          if (!player.isAdmin && store.findProtectingRegion(x, y, z)) {
            send(ws, { type: 'toast', level: 'warn', text: '🔒 보호 구역의 표지판은 수정할 수 없습니다.' });
            return;
          }
          const s = store.setSignText(x, y, z, text, player.nickname);
          if (s) {
            broadcast({ type: 'signs_update', signs: store.signs }, null, 'sandbox');
            send(ws, { type: 'toast', level: 'success', text: '🪧 표지판 문구가 저장되었습니다!' });
          }
        } else if (player.isAdmin) {
          const signsMap = player.world === 'job' ? jobWorld.signs : centerWorld.signs;
          const k = `${x},${y},${z}`;
          if (signsMap[k]) {
            const clean = store.setSignOverride(`${player.world}:${k}`, text);
            signsMap[k].text = clean;
            broadcast({ type: 'signs_update', signs: signsMap }, null, player.world);
            send(ws, { type: 'toast', level: 'success', text: '🪧 표지판 문구가 저장되었습니다!' });
          }
        } else {
          send(ws, { type: 'toast', level: 'warn', text: '🔒 이 구역의 표지판 제목은 관리자만 수정할 수 있습니다. (방명록 글쓰기는 누구나 가능!)' });
        }
        break;
      }

      case 'tnt_ignite': {
        const { x, y, z } = msg;
        if (!store.inBounds(x, y, z) || store.getBlock(x, y, z) !== 'tnt') return;
        if (!player.isAdmin && store.findProtectingRegion(x, y, z)) {
          send(ws, { type: 'toast', level: 'warn', text: '🔒 보호 구역에서는 TNT를 점화할 수 없습니다.' });
          return;
        }
        igniteTNTAt(x, y, z, player.isAdmin, 2800);
        break;
      }

      case 'fill_bomb_ignite': {
        const { x, y, z } = msg;
        if (player.world === 'center') {
          if (!player.isAdmin) {
            send(ws, { type: 'toast', level: 'warn', text: '🔒 행복플러스센터에서는 /관리자 모드에서만 채움 폭탄을 사용할 수 있습니다.' });
            return;
          }
          if (!centerWorld.inBounds(x, y, z) || centerWorld.getBlock(x, y, z) !== 'fill_bomb') return;
          const ck = `center:${x},${y},${z}`;
          if (ignitedTnts.has(ck)) return;
          ignitedTnts.add(ck);
          broadcast({ type: 'fill_bomb_ignited', x, y, z, durationMs: 2200 }, null, 'center');
          setTimeout(() => {
            ignitedTnts.delete(ck);
            if (centerWorld.getBlock(x, y, z) !== 'fill_bomb') return;
            const below = centerWorld.inBounds(x, y - 1, z) ? centerWorld.getBlock(x, y - 1, z) : null;
            const fillId = (below && below !== 'bedrock' && below !== 'fill_bomb' && !below.startsWith('door_') && !below.startsWith('furn_')) ? below : 'dirt';
            const changes = [];
            const r = 4;
            for (let dx = -r; dx <= r; dx++) {
              for (let dy = -r; dy <= r; dy++) {
                for (let dz = -r; dz <= r; dz++) {
                  if (dx * dx + dy * dy + dz * dz > r * r + 1) continue;
                  const nx = x + dx, ny = y + dy, nz = z + dz;
                  if (!centerWorld.inBounds(nx, ny, nz)) continue;
                  const cur = centerWorld.getBlock(nx, ny, nz);
                  if (cur === null || (nx === x && ny === y && nz === z)) {
                    centerWorld.setBlock(nx, ny, nz, fillId);
                    store.setCenterFurn(nx, ny, nz, fillId, 0);
                    changes.push({ x: nx, y: ny, z: nz, block: fillId });
                  }
                }
              }
            }
            broadcast({ type: 'fill_bomb_explode', x, y, z, filledBlock: fillId }, null, 'center');
            if (changes.length > 0) broadcast({ type: 'blocks_batch', changes, by: player.nickname }, null, 'center');
          }, 2200);
          break;
        }
        if (!store.inBounds(x, y, z) || store.getBlock(x, y, z) !== 'fill_bomb') return;
        if (!player.isAdmin && store.findProtectingRegion(x, y, z)) {
          send(ws, { type: 'toast', level: 'warn', text: '🔒 보호 구역에서는 흙 채움 폭탄을 작동할 수 없습니다.' });
          return;
        }
        igniteFillBombAt(x, y, z, player.isAdmin, 2200);
        break;
      }

      case 'water_bomb_ignite': {
        const { x, y, z } = msg;
        if (!store.inBounds(x, y, z) || store.getBlock(x, y, z) !== 'water_bomb') return;
        if (!player.isAdmin && store.findProtectingRegion(x, y, z)) {
          send(ws, { type: 'toast', level: 'warn', text: '🔒 보호 구역에서는 물 채움 폭탄을 작동할 수 없습니다.' });
          return;
        }
        igniteWaterBombAt(x, y, z, player.isAdmin, 2200);
        break;
      }

      case 'flatten_bomb_ignite': {
        const { x, y, z } = msg;
        if (!store.inBounds(x, y, z) || store.getBlock(x, y, z) !== 'flatten_bomb') return;
        if (!player.isAdmin && store.findProtectingRegion(x, y, z)) {
          send(ws, { type: 'toast', level: 'warn', text: '🔒 보호 구역에서는 평탄화 폭탄을 작동할 수 없습니다.' });
          return;
        }
        igniteFlattenBombAt(x, y, z, player.isAdmin, 2200);
        break;
      }

      case 'fuse_ignite': {
        const { x, y, z } = msg;
        if (!store.inBounds(x, y, z) || store.getBlock(x, y, z) !== 'fuse') return;
        if (!player.isAdmin && store.findProtectingRegion(x, y, z)) {
          send(ws, { type: 'toast', level: 'warn', text: '🔒 보호 구역에서는 도화선에 불을 붙일 수 없습니다.' });
          return;
        }
        if (igniteFuseAt(x, y, z, player.isAdmin, 0)) {
          send(ws, { type: 'toast', level: 'warn', text: '🔥 도화선에 불이 붙었습니다! 불꽃이 폭탄을 향해 타들어갑니다...' });
        }
        break;
      }

      case 'tnt_link_remote': {
        const { x, y, z, slotIndex } = msg;
        const held = player.bag[Number(slotIndex)];
        if (!held || held.block !== 'detonator') return;
        if (!store.inBounds(x, y, z)) return;
        const targetBlock = store.getBlock(x, y, z);
        if (targetBlock !== 'tnt' && targetBlock !== 'fill_bomb' && targetBlock !== 'water_bomb' && targetBlock !== 'flatten_bomb') return;
        if (!player.isAdmin && store.findProtectingRegion(x, y, z)) {
          send(ws, { type: 'toast', level: 'warn', text: '🔒 보호 구역의 폭탄에는 리모컨을 설치할 수 없습니다.' });
          return;
        }
        const key = `${x},${y},${z}`;
        if (player.linkedTnts.has(key)) {
          player.linkedTnts.delete(key);
          send(ws, { type: 'remote_links_update', links: [...player.linkedTnts] });
          send(ws, { type: 'toast', level: 'info', text: `📡 리모컨 수신기를 해제했습니다. (연결된 폭탄: ${player.linkedTnts.size}개)` });
        } else {
          if (player.linkedTnts.size >= 24) {
            send(ws, { type: 'toast', level: 'warn', text: '📡 리모컨은 최대 24개의 폭탄까지 동시 연결할 수 있습니다.' });
            return;
          }
          player.linkedTnts.add(key);
          send(ws, { type: 'remote_links_update', links: [...player.linkedTnts] });
          send(ws, { type: 'toast', level: 'success', text: `📡 리모컨 수신기 설치! (연결된 폭탄: ${player.linkedTnts.size}개 · 멀리서 우클릭으로 작동)` });
        }
        break;
      }

      case 'tnt_remote_detonate': {
        const held = player.bag[Number(msg.slotIndex)];
        if (!held || held.block !== 'detonator') return;
        const valid = [];
        for (const key of player.linkedTnts) {
          const [tx, ty, tz] = key.split(',').map(Number);
          if (!store.inBounds(tx, ty, tz)) continue;
          const b = store.getBlock(tx, ty, tz);
          if (b === 'tnt' || b === 'fill_bomb' || b === 'water_bomb' || b === 'flatten_bomb') valid.push({ x: tx, y: ty, z: tz, kind: b });
        }
        player.linkedTnts.clear();
        send(ws, { type: 'remote_links_update', links: [] });
        if (valid.length === 0) {
          send(ws, { type: 'toast', level: 'warn', text: '📡 연결된 폭탄이 없습니다. 먼저 TNT·평탄화·흙·물 폭탄을 리모컨으로 우클릭하세요!' });
          return;
        }
        let ignited = 0;
        for (const t of valid) {
          if (t.kind === 'tnt' && igniteTNTAt(t.x, t.y, t.z, player.isAdmin, 650)) ignited++;
          else if (t.kind === 'fill_bomb' && igniteFillBombAt(t.x, t.y, t.z, player.isAdmin, 650)) ignited++;
          else if (t.kind === 'water_bomb' && igniteWaterBombAt(t.x, t.y, t.z, player.isAdmin, 650)) ignited++;
          else if (t.kind === 'flatten_bomb' && igniteFlattenBombAt(t.x, t.y, t.z, player.isAdmin, 650)) ignited++;
        }
        if (ignited > 0) {
          send(ws, { type: 'toast', level: 'warn', text: `💥 원격 작동 신호 전송! (폭탄 ${ignited}개 점화)` });
        }
        break;
      }

      case 'portal_set_channel': {
        const { x, y, z, channel } = msg;
        const p = store.setPortalChannel(x, y, z, channel);
        if (p) {
          broadcast({ type: 'portals_update', portals: store.portals });
          send(ws, { type: 'toast', level: 'success', text: `🌀 포털 채널을 "${p.channel}"(으)로 설정했습니다.` });
        }
        break;
      }

      case 'portal_use': {
        const { x, y, z } = msg;
        const dest = store.findPairedPortal(x, y, z);
        if (!dest) {
          send(ws, { type: 'toast', level: 'warn', text: '🌀 같은 채널 이름의 연결된 포털이 아직 없습니다. 다른 곳에 포털을 하나 더 설치하세요!' });
          return;
        }
        send(ws, { type: 'warp_to', x: dest.x + 0.5, y: dest.y + 1.1, z: dest.z + 0.5, label: dest.channel });
        break;
      }

      case 'emote': {
        const emoji = String(msg.emoji || '👋').slice(0, 6);
        const label = String(msg.label || '').slice(0, 12);
        broadcast({ type: 'player_emote', id: player.id, nickname: player.nickname, emoji, label });
        break;
      }

      case 'admin_time': {
        if (!player.isAdmin) return;
        const t = Number(msg.time);
        if (Number.isFinite(t)) {
          worldTime = ((t % 1) + 1) % 1;
          broadcast({ type: 'world_time', time: worldTime });
        }
        break;
      }

      case 'admin_weather': {
        if (!player.isAdmin) return;
        if (['clear', 'rain', 'snow'].includes(msg.weather)) {
          worldWeather = msg.weather;
          broadcast({ type: 'world_weather', weather: worldWeather });
          const label = worldWeather === 'clear' ? '☀️ 맑음' : worldWeather === 'rain' ? '🌧️ 비' : '❄️ 눈';
          broadcast({ type: 'chat', system: true, text: `🛡️ 관리자 ${player.nickname}님이 날씨를 ${label}(으)로 변경했습니다.` });
        }
        break;
      }

      case 'admin_announce': {
        if (!player.isAdmin) return;
        const text = String(msg.text || '').trim().slice(0, 120);
        if (!text) return;
        broadcast({ type: 'toast', level: 'warn', text: `📢 [공지] ${text}` });
        broadcast({ type: 'chat', system: true, text: `📢 [관리자 공지] ${text}` });
        break;
      }

      case 'admin_kick': {
        if (!player.isAdmin) return;
        const target = players.get(String(msg.targetId || ''));
        if (!target || target.id === player.id) return;
        send(target.ws, { type: 'toast', level: 'error', text: '🛡️ 관리자에 의해 퇴장되었습니다.' });
        target.ws.close();
        break;
      }

      case 'block_break': {
        if (player.world === 'job') {
          send(ws, { type: 'toast', level: 'warn', text: '💼 직업 체험 마을에서는 블록을 부술 수 없습니다.' });
          return;
        }
        if (player.world === 'center') {
          const { x, y, z } = msg;
          if (!centerWorld.inBounds(x, y, z)) return;
          const cur = centerWorld.getBlock(x, y, z);
          if (!cur || cur === 'bedrock') return;
          if (!player.isAdmin && !CENTER_FURNITURE_IDS.includes(cur)) {
            send(ws, { type: 'toast', level: 'warn', text: '🏢 건물 구조는 보호되어 있습니다. (배치한 가구만 철거 가능 · /관리자모드 시 수정 가능)' });
            return;
          }
          const persistAir = !CENTER_FURNITURE_IDS.includes(cur);
          const prevFacing = centerWorld.facings[`${x},${y},${z}`] || 0;
          const prevSign = (cur === 'sign' || cur === 'sign_fixed') && centerWorld.signs[`${x},${y},${z}`] ? { ...centerWorld.signs[`${x},${y},${z}`] } : null;
          player.editUndoStack.push({
            world: 'center',
            label: CATALOG[cur]?.name || cur,
            changes: [{ x, y, z, prevBlock: cur, prevFacing, prevSign }]
          });
          if (player.editUndoStack.length > 30) player.editUndoStack.shift();
          centerWorld.setBlock(x, y, z, null);
          delete centerWorld.facings[`${x},${y},${z}`];
          store.setCenterFurn(x, y, z, null, 0, persistAir);
          if ((cur === 'sign' || cur === 'sign_fixed') && centerWorld.signs[`${x},${y},${z}`]) {
            delete centerWorld.signs[`${x},${y},${z}`];
            broadcast({ type: 'signs_update', signs: centerWorld.signs }, null, 'center');
          }
          broadcast({ type: 'block_update', x, y, z, block: null, by: player.nickname }, null, 'center');
          break;
        }
        const { x, y, z, slotIndex, toolType } = msg;
        if (!store.inBounds(x, y, z)) return;
        const existing = store.getBlock(x, y, z);
        if (!existing) return;
        if ((existing === 'protect_beacon' || existing === 'stealth_beacon') && !player.isAdmin) {
          send(ws, { type: 'toast', level: 'warn', text: '🔒 보호 비콘은 관리자만 철거할 수 있습니다.' });
          return;
        }
        const bDef = BLOCKS[existing];
        const idx = Number(slotIndex);
        const heldId = (toolType && player.tools?.[toolType])
          ? player.tools[toolType]
          : ((Number.isInteger(idx) && idx >= 0 && idx < BAG_SIZE) ? player.bag[idx]?.block : null);
        const heldDef = heldId ? ITEMS[heldId] : null;
        const isSaboSword = heldId === 'sabo_sword' && player.isAdmin && store.config.saboSwordEnabled;
        if (!bDef || (!Number.isFinite(bDef.hardness) && !(isSaboSword && existing !== 'bedrock'))) {
          send(ws, { type: 'toast', level: 'warn', text: '이 블록은 부술 수 없습니다.' });
          return;
        }
        const region = store.findProtectingRegion(x, y, z);
        if (region && !player.isAdmin) {
          send(ws, { type: 'toast', level: 'warn', text: `🔒 보호 구역("${region.name}")에서는 부술 수 없습니다.` });
          return;
        }
        if (existing === 'chest' && !store.isChestEmpty(x, y, z)) {
          send(ws, { type: 'toast', level: 'warn', text: '📦 상자 안에 아이템이 남아 있어 부술 수 없습니다. 먼저 비워주세요.' });
          return;
        }
        if (existing === 'furnace' && !store.isFurnaceEmpty(x, y, z)) {
          send(ws, { type: 'toast', level: 'warn', text: '🔥 화로 안에 아이템이 남아 있어 부술 수 없습니다.' });
          return;
        }

        const toolTier = isSaboSword
          ? 99
          : ((heldDef && heldDef.toolType === bDef.preferredTool) ? (heldDef.tier || 0) : 0);

        if (bDef.minTier > 0 && toolTier < bDef.minTier) {
          send(ws, {
            type: 'toast', level: 'warn',
            text: `⛏️ ${bDef.name}을(를) 캐려면 ${TIER_NAMES[bDef.minTier] || '상위 곡괭이'} 이상이 필요합니다!`
          });
          return;
        }

        // Tree felling at base
        if (existing === 'wood') {
          const felled = store.tryFellTree(x, y, z, player.isAdmin);
          if (felled) {
            addItemToSlots(player.bag, 'wood', felled.woodCount);
            addItemToSlots(player.bag, 'sapling', felled.saplingCount);
            addItemToSlots(player.bag, 'apple', felled.appleCount);
            send(ws, { type: 'bag_update', bag: player.bag });
            send(ws, {
              type: 'toast', level: 'success',
              text: `🌳 나무가 쓰러졌습니다! 원목 +${felled.woodCount}, 묘목 +${felled.saplingCount}, 사과 +${felled.appleCount}`
            });
            broadcast({ type: 'blocks_batch', changes: felled.changes, by: player.nickname, fell: true });
            return;
          }
        }

        const prevFacingMain = store.facings[`${x},${y},${z}`];
        const prevSignMain = existing === 'sign' && store.signs[`${x},${y},${z}`] ? { ...store.signs[`${x},${y},${z}`] } : null;
        store.setBlock(x, y, z, null);
        // Remove paired top or bottom half when breaking a 1x2 door
        let doorPairCoord = null;
        const undoChanges = [{ x, y, z, prevBlock: existing, prevFacing: prevFacingMain, prevSign: prevSignMain }];
        if (existing.startsWith('door_')) {
          if (store.inBounds(x, y + 1, z) && store.getBlock(x, y + 1, z) === existing) {
            undoChanges.push({ x, y: y + 1, z, prevBlock: existing, prevFacing: store.facings[`${x},${y + 1},${z}`] });
            store.setBlock(x, y + 1, z, null);
            doorPairCoord = { x, y: y + 1, z };
          } else if (store.inBounds(x, y - 1, z) && store.getBlock(x, y - 1, z) === existing) {
            undoChanges.push({ x, y: y - 1, z, prevBlock: existing, prevFacing: store.facings[`${x},${y - 1},${z}`] });
            store.setBlock(x, y - 1, z, null);
            doorPairCoord = { x, y: y - 1, z };
          }
        }
        player.editUndoStack.push({ world: 'sandbox', label: CATALOG[existing]?.name || existing, changes: undoChanges });
        if (player.editUndoStack.length > 30) player.editUndoStack.shift();

        // Ripe wheat harvest bonus
        if (existing === 'wheat_3') {
          addItemToSlots(player.bag, 'wheat', 2);
          addItemToSlots(player.bag, 'wheat_seeds', 2);
          send(ws, { type: 'toast', level: 'success', text: '🌾 밀 수확! 밀 +2, 씨앗 +2' });
        } else if (bDef.drop) {
          addItemToSlots(player.bag, bDef.drop, 1);
        }

        if (existing === 'grass' && Math.random() < 0.25) {
          addItemToSlots(player.bag, 'wheat_seeds', 1);
        }
        if (existing === 'leaves' && Math.random() < 0.2) {
          addItemToSlots(player.bag, Math.random() < 0.5 ? 'sapling' : 'apple', 1);
        }

        send(ws, { type: 'bag_update', bag: player.bag });
        broadcast({ type: 'block_update', x, y, z, block: null, by: player.nickname, brokenBlock: existing });
        if (doorPairCoord) {
          broadcast({ type: 'block_update', x: doorPairCoord.x, y: doorPairCoord.y, z: doorPairCoord.z, block: null, by: player.nickname, brokenBlock: existing });
        }
        if (existing === 'sign' || existing === 'sign_fixed') broadcast({ type: 'signs_update', signs: store.signs });
        if (existing === 'portal') broadcast({ type: 'portals_update', portals: store.portals });
        if (existing === 'protect_beacon' || existing === 'stealth_beacon') {
          broadcast({ type: 'beacons_update', beacons: store.beacons });
          broadcast({ type: 'regions_update', regions: store.regions });
          const bCount = Object.keys(store.beacons).length;
          send(ws, {
            type: 'toast', level: 'info',
            text: bCount >= 2
              ? `🛡️ 보호 비콘 철거 (남은 비콘 ${bCount}개로 보호 구역 재계산됨)`
              : '🛡️ 보호 비콘이 2개 미만이라 비콘 보호 구역이 해제되었습니다.'
          });
        }
        break;
      }

      case 'animal_interact': {
        const res = animals.interact(String(msg.id || ''), msg.action === 'shear' ? 'shear' : 'hit');
        if (!res) return;
        if (res.item) {
          addItemToSlots(player.bag, res.item, res.count || 1);
          send(ws, { type: 'bag_update', bag: player.bag });
        }
        if (res.message) {
          send(ws, { type: 'toast', level: res.item ? 'success' : 'info', text: res.message });
        }
        broadcast({ type: 'animals_update', animals: animals.serializeAll() });
        break;
      }

      case 'eat_food': {
        const idx = Number(msg.slotIndex);
        if (!Number.isInteger(idx) || idx < 0 || idx >= BAG_SIZE) return;
        const slot = player.bag[idx];
        if (!slot || slot.count <= 0) return;
        const def = ITEMS[slot.block];
        if (!def || def.kind !== 'food') return;
        slot.count -= 1;
        if (slot.count <= 0) player.bag[idx] = null;
        player.hp = Math.min(20, (player.hp ?? 20) + (def.heal || 4));
        player.hunger = Math.min(20, (player.hunger ?? 20) + (def.hunger || 6));
        player.lastAteAt = Date.now();
        send(ws, { type: 'bag_update', bag: player.bag });
        send(ws, { type: 'food_eaten', heal: def.heal || 4, hunger: def.hunger || 6, hp: player.hp, curHunger: player.hunger, name: def.name });
        break;
      }

      case 'sprint_drain': {
        if (player.world !== 'sandbox') return;
        const now = Date.now();
        if (now - (player.lastSprintDrainAt || 0) < 3200) return;
        player.lastSprintDrainAt = now;
        if ((player.hp ?? 20) > 2) {
          player.hp = Math.max(2, (player.hp ?? 20) - 1);
          send(ws, { type: 'vitals_update', hp: player.hp, hunger: player.hunger ?? 20 });
        }
        break;
      }

      case 'craft': {
        const recipe = RECIPES.find(r => r.id === msg.recipeId);
        if (!recipe) return;
        const outDef = CATALOG[recipe.out.item];
        const reqTimes = Math.max(1, Math.min(64, Math.floor(Number(msg.times || 1))));
        let maxTimes = 64;
        for (const req of recipe.in) {
          const possible = Math.floor(countItemInSlots(player.bag, req.item) / req.count);
          if (possible < maxTimes) maxTimes = possible;
        }
        if (maxTimes <= 0) {
          send(ws, { type: 'toast', level: 'warn', text: '재료가 부족합니다.' });
          return;
        }
        const times = outDef?.stackable === 1 ? 1 : Math.min(reqTimes, maxTimes);
        for (const req of recipe.in) consumeItemFromSlots(player.bag, req.item, req.count * times);
        const totalOut = recipe.out.count * times;

        // If crafting a tool -> equip directly into dedicated 0-slot toolbelt!
        if (outDef?.kind === 'tool' && player.tools) {
          player.tools[outDef.toolType] = outDef.id;
          send(ws, { type: 'bag_update', bag: player.bag });
          send(ws, { type: 'tools_update', tools: player.tools });
          send(ws, { type: 'toast', level: 'success', text: `⛏️ 전용 도구가 ${outDef.name}(으)로 업그레이드되었습니다! (Q키)` });
          break;
        }

        const leftover = addItemToSlots(player.bag, recipe.out.item, totalOut);
        send(ws, { type: 'bag_update', bag: player.bag });
        const outName = outDef?.name || recipe.out.item;
        send(ws, {
          type: 'toast',
          level: leftover > 0 ? 'warn' : 'success',
          text: leftover > 0 ? '가방 공간이 부족해 일부만 획득했습니다.' : `🔨 ${outName} ×${totalOut} 제작 완료!`
        });
        break;
      }

      case 'bag_move': {
        const from = Number(msg.fromIndex), to = Number(msg.toIndex);
        if (!Number.isInteger(from) || !Number.isInteger(to)) return;
        if (from < 0 || from >= BAG_SIZE || to < 0 || to >= BAG_SIZE || from === to) return;
        const a = player.bag[from], b = player.bag[to];
        if (!a) return;
        if (b && b.block === a.block) {
          const maxStack = CATALOG[a.block]?.stackable || 64;
          const move = Math.min(a.count, maxStack - b.count);
          b.count += move; a.count -= move;
          if (a.count <= 0) player.bag[from] = null;
        } else {
          player.bag[to] = a; player.bag[from] = b;
        }
        send(ws, { type: 'bag_update', bag: player.bag });
        break;
      }

      case 'bag_supply': {
        const itemId = String(msg.block || '');
        const def = CATALOG[itemId];
        if (!def) return;
        const isBeacon = itemId === 'protect_beacon' || itemId === 'stealth_beacon';
        if (isBeacon && !player.isAdmin) {
          send(ws, { type: 'toast', level: 'warn', text: '🔒 보호 비콘은 관리자만 받을 수 있습니다.' });
          return;
        }
        if (!isBeacon && !store.config.supplyEnabled) {
          send(ws, { type: 'toast', level: 'warn', text: '🔒 현재 아이템 보급함이 비활성화되어 있습니다. (관리자 설정)' });
          return;
        }
        const amount = def.stackable === 1 ? 1 : Math.max(1, Math.min(64, Number(msg.count || 32)));
        const leftover = addItemToSlots(player.bag, itemId, amount);
        send(ws, { type: 'bag_update', bag: player.bag });
        if (leftover === amount) send(ws, { type: 'toast', level: 'warn', text: '가방이 가득 찼습니다.' });
        break;
      }

      case 'bag_clear_slot': {
        const idx = Number(msg.index);
        if (!Number.isInteger(idx) || idx < 0 || idx >= BAG_SIZE) return;
        player.bag[idx] = null;
        send(ws, { type: 'bag_update', bag: player.bag });
        break;
      }

      case 'chest_open': {
        const { x, y, z } = msg;
        if (!store.inBounds(x, y, z)) return;
        const chest = store.getChest(x, y, z);
        if (!chest) return;
        player.openChestKey = `${x},${y},${z}`;
        send(ws, {
          type: 'chest_data',
          chest: { x: chest.x, y: chest.y, z: chest.z, label: chest.label, owner: chest.owner, slots: chest.slots }
        });
        break;
      }

      case 'chest_close': {
        player.openChestKey = null;
        break;
      }

      case 'chest_transfer': {
        const { x, y, z, direction, fromIndex, amount } = msg;
        const chest = store.getChest(x, y, z);
        if (!chest) return;
        const idx = Number(fromIndex);

        if (direction === 'to_chest') {
          if (!Number.isInteger(idx) || idx < 0 || idx >= BAG_SIZE) return;
          const src = player.bag[idx];
          if (!src || src.count <= 0) return;
          const qty = amount ? Math.max(1, Math.min(src.count, Number(amount))) : src.count;
          const leftover = addItemToSlots(chest.slots, src.block, qty);
          const moved = qty - leftover;
          if (moved > 0) {
            src.count -= moved;
            if (src.count <= 0) player.bag[idx] = null;
            store.saveChestsSoon();
            send(ws, { type: 'bag_update', bag: player.bag });
            broadcastChestToViewers(`${x},${y},${z}`, chest);
          } else send(ws, { type: 'toast', level: 'warn', text: '상자가 가득 찼습니다.' });
        } else if (direction === 'to_bag') {
          if (!Number.isInteger(idx) || idx < 0 || idx >= CHEST_SIZE) return;
          const src = chest.slots[idx];
          if (!src || src.count <= 0) return;
          const qty = amount ? Math.max(1, Math.min(src.count, Number(amount))) : src.count;
          const leftover = addItemToSlots(player.bag, src.block, qty);
          const moved = qty - leftover;
          if (moved > 0) {
            src.count -= moved;
            if (src.count <= 0) chest.slots[idx] = null;
            store.saveChestsSoon();
            send(ws, { type: 'bag_update', bag: player.bag });
            broadcastChestToViewers(`${x},${y},${z}`, chest);
          } else send(ws, { type: 'toast', level: 'warn', text: '개인 가방이 가득 찼습니다.' });
        }
        break;
      }

      case 'chest_rename': {
        const { x, y, z, label } = msg;
        const chest = store.getChest(x, y, z);
        if (!chest) return;
        const clean = String(label || '').trim().slice(0, 24);
        if (!clean) return;
        chest.label = clean;
        store.saveChestsSoon();
        broadcastChestToViewers(`${x},${y},${z}`, chest);
        break;
      }

      case 'furnace_open': {
        const { x, y, z } = msg;
        if (!store.inBounds(x, y, z)) return;
        const f = store.getFurnace(x, y, z);
        if (!f) return;
        player.openFurnaceKey = `${x},${y},${z}`;
        send(ws, { type: 'furnace_data', furnace: f });
        break;
      }

      case 'furnace_close': {
        player.openFurnaceKey = null;
        break;
      }

      case 'furnace_put': {
        const { x, y, z, target, bagIndex } = msg;
        const f = store.getFurnace(x, y, z);
        if (!f) return;
        const idx = Number(bagIndex);
        if (!Number.isInteger(idx) || idx < 0 || idx >= BAG_SIZE) return;
        const src = player.bag[idx];
        if (!src || src.count <= 0) return;

        if (target === 'input') {
          if (!SMELT_MAP[src.block]) {
            send(ws, { type: 'toast', level: 'warn', text: '🔥 제련 가능한 재료: 철 원석, 금 원석, 모래, 조약돌, 생고기' });
            return;
          }
          if (!f.input) { f.input = { ...src }; player.bag[idx] = null; }
          else if (f.input.block === src.block) {
            const add = Math.min(src.count, 64 - f.input.count);
            f.input.count += add; src.count -= add;
            if (src.count <= 0) player.bag[idx] = null;
          }
        } else if (target === 'fuel') {
          if (!FUEL_POWER[src.block]) {
            send(ws, { type: 'toast', level: 'warn', text: '🔥 연료로 사용 가능: 석탄, 원목, 목재 판자, 막대기' });
            return;
          }
          if (!f.fuel) { f.fuel = { ...src }; player.bag[idx] = null; }
          else if (f.fuel.block === src.block) {
            const add = Math.min(src.count, 64 - f.fuel.count);
            f.fuel.count += add; src.count -= add;
            if (src.count <= 0) player.bag[idx] = null;
          }
        }
        store.saveFurnacesSoon();
        send(ws, { type: 'bag_update', bag: player.bag });
        broadcastFurnaceToViewers(`${x},${y},${z}`, f);
        break;
      }

      case 'furnace_take': {
        const { x, y, z, slotName } = msg;
        const f = store.getFurnace(x, y, z);
        if (!f) return;
        if (!['input', 'fuel', 'output'].includes(slotName)) return;
        const item = f[slotName];
        if (!item || item.count <= 0) return;
        const leftover = addItemToSlots(player.bag, item.block, item.count);
        if (leftover === 0) f[slotName] = null;
        else item.count = leftover;
        store.saveFurnacesSoon();
        send(ws, { type: 'bag_update', bag: player.bag });
        broadcastFurnaceToViewers(`${x},${y},${z}`, f);
        break;
      }

      case 'skin_apply': {
        if (!msg.skin) return;
        const pUrl = (typeof msg.skin.pixelDataUrl === 'string' && msg.skin.pixelDataUrl.startsWith('data:image/png;base64,') && msg.skin.pixelDataUrl.length < 32000)
          ? msg.skin.pixelDataUrl : null;
        player.skin = {
          skinColor: String(msg.skin.skinColor || '#f5cfa0').slice(0, 16),
          hairColor: String(msg.skin.hairColor || '#3b2416').slice(0, 16),
          shirtColor: String(msg.skin.shirtColor || '#38bdf8').slice(0, 16),
          pantsColor: String(msg.skin.pantsColor || '#334155').slice(0, 16),
          hatColor: String(msg.skin.hatColor || '').slice(0, 16),
          eyeColor: String(msg.skin.eyeColor || '#0f172a').slice(0, 16),
          blush: !!msg.skin.blush,
          pixelDataUrl: pUrl
        };
        broadcast({ type: 'player_skin', id: player.id, skin: player.skin });
        send(ws, { type: 'toast', level: 'success', text: '🎨 스킨이 적용되었습니다!' });
        break;
      }

      case 'skin_publish': {
        const entry = store.publishSkin({ name: msg.name, author: player.nickname, skin: msg.skin || player.skin });
        broadcast({ type: 'skins_update', skins: store.skins });
        send(ws, { type: 'toast', level: 'success', text: `✨ "${entry.name}" 스킨을 새 이름으로 저장했습니다!` });
        break;
      }

      case 'skin_update': {
        const updated = store.updateSkin(String(msg.id || ''), { name: msg.name, skin: msg.skin || player.skin });
        if (!updated) {
          send(ws, { type: 'toast', level: 'warn', text: '수정할 기존 스킨을 찾지 못했습니다.' });
          return;
        }
        broadcast({ type: 'skins_update', skins: store.skins });
        send(ws, { type: 'toast', level: 'success', text: `💾 "${updated.name}" 스킨에 덮어씌워 저장했습니다!` });
        break;
      }

      case 'skin_like': {
        if (store.likeSkin(String(msg.id || ''))) broadcast({ type: 'skins_update', skins: store.skins });
        break;
      }

      case 'admin_set_config': {
        if (!player.isAdmin) return;
        const prevSabo = store.config.saboSwordEnabled;
        const updated = store.setConfig({
          supplyEnabled: typeof msg.supplyEnabled === 'boolean' ? msg.supplyEnabled : undefined,
          unlimitedBlocks: typeof msg.unlimitedBlocks === 'boolean' ? msg.unlimitedBlocks : undefined,
          saboSwordEnabled: typeof msg.saboSwordEnabled === 'boolean' ? msg.saboSwordEnabled : undefined
        });
        broadcast({ type: 'config_update', config: updated });
        if (updated.saboSwordEnabled !== prevSabo) {
          syncSaboSwordForAllAdmins();
        }
        send(ws, { type: 'toast', level: 'success', text: '⚙️ 서버 관리자 설정이 적용되었습니다.' });
        break;
      }

      case 'region_add': {
        if (!player.isAdmin) return;
        const { name, pos1, pos2 } = msg;
        if (!pos1 || !pos2) return;
        const region = store.addRegion({
          name,
          pos1: { x: Math.round(pos1.x), y: Math.round(pos1.y), z: Math.round(pos1.z) },
          pos2: { x: Math.round(pos2.x), y: Math.round(pos2.y), z: Math.round(pos2.z) },
          createdBy: player.nickname
        });
        broadcast({ type: 'regions_update', regions: store.regions });
        broadcast({ type: 'chat', system: true, text: `🛡️ 관리자 ${player.nickname}님이 보호 구역 "${region.name}"을(를) 지정했습니다.` });
        break;
      }

      case 'region_remove': {
        if (!player.isAdmin) return;
        if (store.removeRegion(String(msg.id || ''))) {
          broadcast({ type: 'regions_update', regions: store.regions });
          send(ws, { type: 'toast', level: 'info', text: '보호 구역이 해제되었습니다.' });
        }
        break;
      }

      case 'blueprint_capture': {
        const { name, pos1, pos2 } = msg;
        if (!pos1 || !pos2) return;
        const result = store.captureBlueprint({
          name,
          pos1: { x: Math.round(pos1.x), y: Math.round(pos1.y), z: Math.round(pos1.z) },
          pos2: { x: Math.round(pos2.x), y: Math.round(pos2.y), z: Math.round(pos2.z) },
          author: player.nickname
        });
        if (result.error) { send(ws, { type: 'toast', level: 'warn', text: result.error }); return; }
        broadcast({ type: 'blueprints_update', blueprints: store.blueprints });
        send(ws, { type: 'toast', level: 'success', text: `📐 설계도 "${result.blueprint.name}" (${result.blueprint.blocks.length}블록) 저장 완료!` });
        break;
      }

      case 'blueprint_remove': {
        const bpId = String(msg.id || '');
        const bp = store.blueprints.find(b => b.id === bpId);
        if (!bp) return;
        if (!player.isAdmin && bp.author !== player.nickname) return;
        if (store.removeBlueprint(bpId)) {
          broadcast({ type: 'blueprints_update', blueprints: store.blueprints });
          send(ws, { type: 'toast', level: 'info', text: '설계도가 삭제되었습니다.' });
        }
        break;
      }

      case 'chat': {
        const text = String(msg.text || '').trim().slice(0, 200);
        if (!text) return;
        if (text === '/관리자' || text === '/관리자모드') {
          // 비밀번호 없이 누구나 관리자 전환 (2026-11-24 pbk 결정 — 게임 데이터 가치 낮음)
          player.isAdmin = true;
          send(ws, { type: 'admin_status', isAdmin: true });
          if (player.world === 'sandbox') {
            if (!player.bag[0]) player.bag[0] = { block: 'protect_beacon', count: 16 };
            else addItemToSlots(player.bag, 'protect_beacon', 16);
            if (!player.bag[1]) player.bag[1] = { block: 'stealth_beacon', count: 16 };
            else addItemToSlots(player.bag, 'stealth_beacon', 16);
            send(ws, { type: 'bag_update', bag: player.bag });
            syncSaboSwordForPlayer(player);
          } else if (player.world === 'center') {
            player.tools = { pickaxe: null, axe: null, shovel: null, hoe: null, sword: 'sabo_sword' };
            send(ws, { type: 'tools_update', tools: player.tools });
          }
          send(ws, {
            type: 'toast', level: 'success',
            text: player.world === 'center'
              ? '🛡️ 관리자 모드 활성화! [Q] 키로 사보검을 바로 꺼내 쓸 수 있습니다.'
              : '🛡️ 관리자 모드 활성화! 1번(보호 비콘)·2번(투명 보호 비콘) 슬롯에 지급되었습니다.'
          });
          broadcast({ type: 'player_admin', id: player.id, isAdmin: true }, null, player.world);
          return;
        }
        if (text === '/item') {
          if (!player.isAdmin) {
            send(ws, { type: 'toast', level: 'warn', text: '🔒 /item 명령어는 관리자만 사용할 수 있습니다.' });
            return;
          }
          const updated = store.setConfig({ supplyEnabled: !store.config.supplyEnabled });
          broadcast({ type: 'config_update', config: updated });
          broadcast({
            type: 'chat', system: true,
            text: `🎁 관리자(${player.nickname})님이 가방 아이템 보급함을 ${updated.supplyEnabled ? '켰습니다 (ON)' : '껐습니다 (OFF)'}.`
          });
          return;
        }
        if (text === '/저장' || text.startsWith('/저장 ')) {
          if (!player.isAdmin) {
            send(ws, { type: 'toast', level: 'warn', text: '🔒 /저장 명령어는 관리자(/관리자모드)만 사용할 수 있습니다.' });
            return;
          }
          if (player.world === 'job') {
            send(ws, { type: 'toast', level: 'warn', text: '💼 직업 체험 마을은 저장할 수 없습니다.' });
            return;
          }
          const rawName = text.slice(3).trim();
          const { number, entry } = store.saveSnapshot(player.world, rawName, player.nickname);
          const worldTag = player.world === 'center' ? '행복플러스센터' : '자유월드';
          send(ws, { type: 'toast', level: 'success', text: `💾 [${number}번] "${entry.name}" 저장 완료!` });
          broadcast({
            type: 'chat', system: true,
            text: `💾 [${worldTag}] #${number} "${entry.name}" 구조가 저장되었습니다. (/구조 로 목록 확인)`
          }, null, player.world);
          return;
        }
        if (text === '/구조') {
          if (!player.isAdmin) {
            send(ws, { type: 'toast', level: 'warn', text: '🔒 /구조 명령어는 관리자(/관리자모드)만 사용할 수 있습니다.' });
            return;
          }
          const list = store.listSnapshots();
          if (list.length === 0) {
            send(ws, { type: 'chat', system: true, text: '📂 저장된 구조가 없습니다. "/저장 이름" 으로 먼저 저장해 보세요!' });
            return;
          }
          send(ws, { type: 'chat', system: true, text: '📂 저장된 구조 목록 ("/복구 번호" 로 복원):' });
          list.forEach((s, i) => {
            const tag = s.world === 'center' ? '센터' : '자유';
            send(ws, { type: 'chat', system: true, text: `  ${i + 1}. [${tag}] ${s.name} (저장: ${s.author})` });
          });
          return;
        }
        if (text.startsWith('/복구 ')) {
          if (!player.isAdmin) {
            send(ws, { type: 'toast', level: 'warn', text: '🔒 /복구 명령어는 관리자(/관리자모드)만 사용할 수 있습니다.' });
            return;
          }
          const num = Number(text.slice(4).trim());
          const snap = store.loadSnapshot(num);
          if (!snap) {
            send(ws, { type: 'toast', level: 'warn', text: '❌ 해당 번호의 저장 구조를 찾을 수 없습니다. (/구조 로 번호 확인)' });
            return;
          }
          if (snap.entry.world !== player.world) {
            const needLabel = snap.entry.world === 'center' ? '행복플러스센터' : '자유 건축 월드';
            send(ws, { type: 'toast', level: 'warn', text: `⚠️ ${num}번 구조는 "${needLabel}" 구역용입니다. 해당 구역에서 /복구 해주세요.` });
            return;
          }
          if (player.world === 'center') {
            store.restoreCenterSnapshot(snap.data);
            centerWorld = createCenterWorld();
            applyPersistedCenterState();
            broadcast({
              type: 'world_reload',
              worldRLE: centerWorld.getRLE(),
              signs: centerWorld.signs,
              facings: centerWorld.facings,
              centerPylon: store.centerPylon,
              centerNpcs: CENTER_NPCS
            }, null, 'center');
          } else {
            store.restoreSandboxSnapshot(snap.data);
            broadcast({
              type: 'world_reload',
              worldDeltas: store.getDeltasObject(),
              signs: store.signs,
              portals: store.portals,
              beacons: store.beacons,
              facings: store.facings,
              regions: store.regions,
              centerPylon: SANDBOX_CENTER_PYLON,
              centerNpcs: SANDBOX_CENTER_NPCS
            }, null, 'sandbox');
          }
          send(ws, { type: 'toast', level: 'success', text: `♻️ [${num}번] "${snap.entry.name}" 복원 완료!` });
          broadcast({
            type: 'chat', system: true,
            text: `♻️ 관리자(${player.nickname})님이 #${num} "${snap.entry.name}" 구조로 복원했습니다!`
          }, null, player.world);
          return;
        }
        if (text === '/행플복구') {
          if (!player.isAdmin) {
            send(ws, { type: 'toast', level: 'warn', text: '🔒 /행플복구 명령어는 /관리자 모드에서만 사용할 수 있습니다.' });
            return;
          }
          if (player.world === 'center') {
            store.centerFurn = {};
            store.saveNow('centerFurn');
            centerWorld = createCenterWorld();
            applyPersistedCenterState();
            broadcast({
              type: 'world_reload',
              worldRLE: centerWorld.getRLE(),
              signs: centerWorld.signs,
              facings: centerWorld.facings,
              centerPylon: store.centerPylon,
              centerNpcs: CENTER_NPCS
            }, null, 'center');
            send(ws, { type: 'toast', level: 'success', text: '🏢 행복플러스센터를 초기 상태로 복구했습니다!' });
          } else if (player.world === 'sandbox') {
            const res = stampCenterIntoSandbox(store, SANDBOX_CENTER_ORIGIN);
            broadcast({
              type: 'world_reload',
              worldDeltas: store.getDeltasObject(),
              signs: store.signs,
              portals: store.portals,
              beacons: store.beacons,
              facings: store.facings,
              regions: store.regions,
              centerPylon: SANDBOX_CENTER_PYLON,
              centerNpcs: SANDBOX_CENTER_NPCS
            }, null, 'sandbox');
            send(ws, { type: 'toast', level: 'success', text: `🏢 자유 월드 행복플러스센터 복구 완료! (${res.placed.toLocaleString()}블록)` });
            broadcast({
              type: 'chat', system: true,
              text: `🏢 관리자(${player.nickname})님이 자유 월드 행복플러스센터(-75, 34, 94)를 초기 상태로 복구했습니다!`
            }, null, 'sandbox');
          }
          return;
        }
        if (text === '/빌라복구') {
          if (!player.isAdmin || player.world !== 'sandbox') {
            send(ws, { type: 'toast', level: 'warn', text: '🔒 /빌라복구 명령어는 자유 건축 월드 /관리자 모드에서 사용할 수 있습니다.' });
            return;
          }
          const res = stampVillaIntoSandbox(store, SANDBOX_VILLA_ORIGIN);
          broadcast({
            type: 'world_reload',
            worldDeltas: store.getDeltasObject(),
            signs: store.signs,
            portals: store.portals,
            beacons: store.beacons,
            facings: store.facings,
            regions: store.regions,
            centerPylon: SANDBOX_CENTER_PYLON,
            centerNpcs: SANDBOX_CENTER_NPCS
          }, null, 'sandbox');
          send(ws, { type: 'toast', level: 'success', text: `🏠 5층 반지하 빌라(401·402호) 복구 완료! (${res.placed.toLocaleString()}블록)` });
          return;
        }
        if (text === '/간판이동' || text === '/간판회전') {
          if (player.world !== 'center') {
            send(ws, { type: 'toast', level: 'warn', text: '🏢 행복플러스센터 구역에서만 사용할 수 있습니다.' });
            return;
          }
          if (!player.isAdmin) {
            send(ws, { type: 'toast', level: 'warn', text: '🔒 먼저 /관리자모드 를 입력해 주세요.' });
            return;
          }
          let updated;
          if (text === '/간판이동') {
            // Snap rotY to nearest 90° facing the player's horizontal look direction
            const snapped = Math.round(player.yaw / (Math.PI / 2)) * (Math.PI / 2);
            updated = store.setCenterPylon(player.x, Math.floor(player.y), player.z, snapped);
            send(ws, { type: 'toast', level: 'success', text: `🪧 지주간판을 현재 위치 (${updated.x}, ${updated.y}, ${updated.z})로 이동했습니다! (방향 조정: /간판회전)` });
          } else {
            const cur = store.centerPylon || { x: -25.5, y: 5.0, z: 2.2, rotY: 0 };
            updated = store.setCenterPylon(cur.x, cur.y, cur.z, (cur.rotY || 0) + Math.PI / 2);
            send(ws, { type: 'toast', level: 'success', text: '↻ 지주간판을 90° 회전했습니다!' });
          }
          broadcast({ type: 'pylon_update', centerPylon: updated }, null, 'center');
          return;
        }
        if (text === '/사보검') {
          if (!player.isAdmin) {
            send(ws, { type: 'toast', level: 'warn', text: '🔒 /사보검 명령어는 관리자만 사용할 수 있습니다.' });
            return;
          }
          const updated = store.setConfig({ saboSwordEnabled: !store.config.saboSwordEnabled });
          broadcast({ type: 'config_update', config: updated });
          syncSaboSwordForAllAdmins();
          send(ws, {
            type: 'toast', level: updated.saboSwordEnabled ? 'success' : 'info',
            text: updated.saboSwordEnabled ? '⚔️ 사보검 활성화! Q키로 사보검을 꺼내 모든 블록을 1방에 부술 수 있습니다.' : '⚔️ 사보검이 비활성화되었습니다.'
          });
          return;
        }
        if (text === '/time day' || text === '/낮') {
          worldTime = 0.25;
          broadcast({ type: 'world_time', time: worldTime });
          broadcast({ type: 'chat', system: true, text: `☀️ ${player.nickname}님이 시간을 낮으로 변경했습니다.` });
          return;
        }
        if (text === '/time night' || text === '/밤') {
          worldTime = 0.75;
          broadcast({ type: 'world_time', time: worldTime });
          broadcast({ type: 'chat', system: true, text: `🌙 ${player.nickname}님이 시간을 밤으로 변경했습니다.` });
          return;
        }
        if (text === '/time sunset' || text === '/노을') {
          worldTime = 0.49;
          broadcast({ type: 'world_time', time: worldTime });
          broadcast({ type: 'chat', system: true, text: `🌅 ${player.nickname}님이 시간을 노을로 변경했습니다.` });
          return;
        }
        if (text === '/비' || text === '/weather rain') {
          worldWeather = 'rain';
          broadcast({ type: 'world_weather', weather: worldWeather });
          broadcast({ type: 'chat', system: true, text: `🌧️ 비가 내리기 시작합니다.` });
          return;
        }
        if (text === '/눈' || text === '/weather snow') {
          worldWeather = 'snow';
          broadcast({ type: 'world_weather', weather: worldWeather });
          broadcast({ type: 'chat', system: true, text: `❄️ 눈이 내리기 시작합니다.` });
          return;
        }
        if (text === '/맑음' || text === '/weather clear') {
          worldWeather = 'clear';
          broadcast({ type: 'world_weather', weather: worldWeather });
          broadcast({ type: 'chat', system: true, text: `☀️ 하늘이 맑게 개었습니다.` });
          return;
        }
        broadcast({ type: 'chat', from: player.nickname, color: player.color, isAdmin: player.isAdmin, text }, null, player.world);
        break;
      }

      case 'ping_check': {
        send(ws, { type: 'pong_check', ts: msg.ts });
        break;
      }

      case 'logout': {
        ws.close();
        break;
      }
    }
  });

  ws.on('close', () => {
    if (!player) return;
    const nick = player.nickname;
    const id = player.id;
    const w = player.world;
    player.bag = null;
    player.tools = null;
    players.delete(id);
    broadcast({ type: 'player_leave', id }, null, w);
    broadcast({ type: 'chat', system: true, text: `${nick}님이 퇴장했습니다.` }, null, w);
    player = null;
  });
});

process.on('SIGINT', () => { store.flushAll(); process.exit(0); });
process.on('SIGTERM', () => { store.flushAll(); process.exit(0); });

server.listen(PORT, HOST, () => {
  console.log(`[Boxworld v3] Listening on http://${HOST}:${PORT}${BASE_PATH || '/'} (WS: ${wsPath})`);
});
