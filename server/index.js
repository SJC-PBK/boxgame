import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { WebSocketServer } from 'ws';
import {
  BLOCKS, ITEMS, CATALOG, RECIPES, SMELT_MAP, FUEL_POWER, TIER_NAMES, WORLD_BOUNDS,
  BAG_SIZE, CHEST_SIZE, createStarterBag
} from './blocks.js';
import { WorldStore } from './worldStore.js';
import { AnimalManager } from './animals.js';

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
const MAX_PLAYERS = Number(process.env.MAX_PLAYERS || 5);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'boxworld-admin';
const DATA_DIR = path.resolve(ROOT_DIR, process.env.DATA_DIR || './data');

const store = new WorldStore(DATA_DIR);
const animals = new AnimalManager(store);

// Shared in-game clock & weather
const DAY_LENGTH_SEC = 360;
let worldTime = 0.22;
let worldWeather = 'clear'; // 'clear' | 'rain' | 'snow'

const app = express();
app.use(express.json());

const router = express.Router();
const threeBuildDir = path.join(ROOT_DIR, 'node_modules', 'three', 'build');
router.use('/vendor/three', express.static(threeBuildDir, { maxAge: '7d' }));
router.use(express.static(path.join(ROOT_DIR, 'public')));

router.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    app: 'Boxworld',
    version: '4.0',
    players: players.size,
    maxPlayers: MAX_PLAYERS,
    blocks: store.countNonAir(),
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
const wss = new WebSocketServer({ server, path: wsPath });

const players = new Map();
const AVATAR_COLORS = ['#38bdf8', '#4ade80', '#f472b6', '#fbbf24', '#a78bfa'];
let nextPlayerSeq = 1;

function send(ws, payload) {
  if (ws.readyState === 1) ws.send(JSON.stringify(payload));
}

function broadcast(payload, excludeId = null) {
  const data = JSON.stringify(payload);
  for (const p of players.values()) {
    if (p.id !== excludeId && p.ws.readyState === 1) p.ws.send(data);
  }
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

// World simulation loops (animals, furnaces, day/night clock)
setInterval(() => {
  if (players.size === 0) return;
  animals.tick(0.25);
  broadcast({ type: 'animals_update', animals: animals.serializeAll() });
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

      // Optional direct Admin login from login screen
      let isAdminLogin = false;
      if (msg.adminPassword !== undefined && msg.adminPassword !== null && String(msg.adminPassword).length > 0) {
        if (String(msg.adminPassword) !== ADMIN_PASSWORD) {
          send(ws, { type: 'join_error', message: '관리자 비밀번호가 올바르지 않습니다.' });
          return;
        }
        isAdminLogin = true;
      }

      const id = `p${nextPlayerSeq++}`;
      const color = AVATAR_COLORS[(nextPlayerSeq - 2) % AVATAR_COLORS.length];
      const defaultSkin = {
        skinColor: '#f5cfa0', hairColor: '#3b2416', shirtColor: color,
        pantsColor: '#334155', hatColor: '', eyeColor: '#0f172a', blush: true, pixelDataUrl: null
      };

      const bag = createStarterBag();
      player = {
        id, ws, nickname: rawNick, color, skin: defaultSkin,
        heldItem: bag[0]?.block || null,
        x: 0.5 + (Math.random() - 0.5) * 3, y: 17.1, z: 0.5 + (Math.random() - 0.5) * 3,
        spawn: { x: 0.5, y: 17.1, z: 0.5 },
        yaw: 0, pitch: 0, isAdmin: isAdminLogin, bag,
        openChestKey: null, openFurnaceKey: null
      };
      players.set(id, player);

      send(ws, {
        type: 'welcome',
        self: serializePlayer(player),
        bag: player.bag,
        catalog: CATALOG,
        recipes: RECIPES,
        worldBounds: WORLD_BOUNDS,
        worldRLE: store.getWorldRLE(),
        worldTime,
        worldWeather,
        animals: animals.serializeAll(),
        signs: store.signs,
        portals: store.portals,
        players: [...players.values()].filter(p => p.id !== id).map(serializePlayer),
        regions: store.regions,
        blueprints: store.blueprints,
        skins: store.skins,
        maxPlayers: MAX_PLAYERS
      });

      broadcast({ type: 'player_join', player: serializePlayer(player) }, id);
      broadcast({
        type: 'chat', system: true,
        text: `${isAdminLogin ? '🛡️ 관리자 ' : ''}${player.nickname}님이 Boxworld에 입장했습니다. (${players.size}/${MAX_PLAYERS})`
      });
      return;
    }

    if (!player) return;

    switch (msg.type) {
      case 'move': {
        const x = Number(msg.x), y = Number(msg.y), z = Number(msg.z);
        const yaw = Number(msg.yaw), pitch = Number(msg.pitch);
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return;
        player.x = Math.max(WORLD_BOUNDS.minX - 2, Math.min(WORLD_BOUNDS.maxX + 2, x));
        player.y = Math.max(-5, Math.min(WORLD_BOUNDS.maxY + 20, y));
        player.z = Math.max(WORLD_BOUNDS.minZ - 2, Math.min(WORLD_BOUNDS.maxZ + 2, z));
        player.yaw = Number.isFinite(yaw) ? yaw : 0;
        player.pitch = Number.isFinite(pitch) ? pitch : 0;
        broadcast({
          type: 'player_move', id: player.id,
          x: player.x, y: player.y, z: player.z, yaw: player.yaw, pitch: player.pitch
        }, player.id);
        break;
      }

      case 'held_item': {
        const item = msg.item && CATALOG[msg.item] ? msg.item : null;
        if (player.heldItem !== item) {
          player.heldItem = item;
          broadcast({ type: 'player_held', id: player.id, heldItem: item }, player.id);
        }
        break;
      }

      case 'till_soil': {
        const { x, y, z, slotIndex } = msg;
        if (!store.inBounds(x, y, z)) return;
        const region = store.findProtectingRegion(x, y, z);
        if (region && !player.isAdmin) {
          send(ws, { type: 'toast', level: 'warn', text: `🔒 보호 구역("${region.name}")에서는 경작할 수 없습니다.` });
          return;
        }
        const slot = player.bag[Number(slotIndex)];
        const heldDef = slot ? ITEMS[slot.block] : null;
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
        if (blockId === 'sapling') {
          const below = store.getBlock(x, y - 1, z);
          if (below !== 'grass' && below !== 'dirt') {
            send(ws, { type: 'toast', level: 'warn', text: '🌱 묘목은 잔디 블록이나 흙 위에만 심을 수 있습니다.' });
            return;
          }
        }

        slot.count -= 1;
        if (slot.count <= 0) player.bag[idx] = null;
        store.setBlock(x, y, z, blockId, player.nickname);
        send(ws, { type: 'bag_update', bag: player.bag });
        broadcast({ type: 'block_update', x, y, z, block: blockId, by: player.nickname });

        if (blockId === 'sapling') {
          send(ws, { type: 'toast', level: 'success', text: '🌱 묘목을 심었습니다! 잠시 후 나무로 자랍니다.' });
          scheduleSaplingGrowth(x, y, z);
        }
        if (blockId === 'sign') broadcast({ type: 'signs_update', signs: store.signs });
        if (blockId === 'portal') broadcast({ type: 'portals_update', portals: store.portals });
        break;
      }

      // Builder Brush: place a 3x3 patch of blocks at once!
      case 'block_place_brush': {
        const { positions, slotIndex } = msg;
        if (!Array.isArray(positions) || positions.length === 0 || positions.length > 9) return;
        const idx = Number(slotIndex);
        if (!Number.isInteger(idx) || idx < 0 || idx >= BAG_SIZE) return;
        const slot = player.bag[idx];
        if (!slot || slot.count <= 0 || !BLOCKS[slot.block]) return;
        const blockId = slot.block;
        if (['chest', 'furnace', 'bed', 'sign', 'portal', 'tnt', 'sapling'].includes(blockId)) return;

        const changes = [];
        for (const p of positions) {
          if (slot.count <= 0) break;
          const x = Math.round(p.x), y = Math.round(p.y), z = Math.round(p.z);
          if (!store.inBounds(x, y, z)) continue;
          if (!player.isAdmin && store.findProtectingRegion(x, y, z)) continue;
          const ex = store.getBlock(x, y, z);
          if (ex && ex !== 'water') continue;
          slot.count -= 1;
          store.setBlock(x, y, z, blockId, player.nickname);
          changes.push({ x, y, z, block: blockId });
        }
        if (slot.count <= 0) player.bag[idx] = null;
        if (changes.length > 0) {
          send(ws, { type: 'bag_update', bag: player.bag });
          broadcast({ type: 'blocks_batch', changes, by: player.nickname });
        }
        break;
      }

      case 'toggle_door': {
        const { x, y, z } = msg;
        if (!store.inBounds(x, y, z)) return;
        const cur = store.getBlock(x, y, z);
        if (cur !== 'door_closed' && cur !== 'door_open') return;
        const next = cur === 'door_closed' ? 'door_open' : 'door_closed';
        store.setBlock(x, y, z, next);
        broadcast({ type: 'block_update', x, y, z, block: next, by: player.nickname });
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

      case 'sign_update': {
        const { x, y, z, text } = msg;
        if (!player.isAdmin && store.findProtectingRegion(x, y, z)) {
          send(ws, { type: 'toast', level: 'warn', text: '🔒 보호 구역의 표지판은 수정할 수 없습니다.' });
          return;
        }
        const s = store.setSignText(x, y, z, text, player.nickname);
        if (s) {
          broadcast({ type: 'signs_update', signs: store.signs });
          send(ws, { type: 'toast', level: 'success', text: '🪧 표지판 문구가 저장되었습니다!' });
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
        const igniterIsAdmin = player.isAdmin;
        broadcast({ type: 'tnt_ignited', x, y, z });
        setTimeout(() => {
          if (store.getBlock(x, y, z) !== 'tnt') return;
          const changes = store.explodeAt(x, y, z, 3, igniterIsAdmin);
          broadcast({ type: 'tnt_explode', x, y, z });
          if (changes.length > 0) broadcast({ type: 'blocks_batch', changes });
        }, 2800);
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
        const { x, y, z, slotIndex } = msg;
        if (!store.inBounds(x, y, z)) return;
        const existing = store.getBlock(x, y, z);
        if (!existing) return;
        const bDef = BLOCKS[existing];
        if (!bDef || !Number.isFinite(bDef.hardness)) {
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

        const idx = Number(slotIndex);
        const heldSlot = (Number.isInteger(idx) && idx >= 0 && idx < BAG_SIZE) ? player.bag[idx] : null;
        const heldDef = heldSlot ? ITEMS[heldSlot.block] : null;
        const toolTier = (heldDef && heldDef.toolType === bDef.preferredTool) ? (heldDef.tier || 0) : 0;

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

        store.setBlock(x, y, z, null);

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
        if (existing === 'sign') broadcast({ type: 'signs_update', signs: store.signs });
        if (existing === 'portal') broadcast({ type: 'portals_update', portals: store.portals });
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
        send(ws, { type: 'bag_update', bag: player.bag });
        send(ws, { type: 'food_eaten', heal: def.heal || 4, hunger: def.hunger || 6, name: def.name });
        break;
      }

      case 'craft': {
        const recipe = RECIPES.find(r => r.id === msg.recipeId);
        if (!recipe) return;
        for (const req of recipe.in) {
          if (countItemInSlots(player.bag, req.item) < req.count) {
            send(ws, { type: 'toast', level: 'warn', text: '재료가 부족합니다.' });
            return;
          }
        }
        for (const req of recipe.in) consumeItemFromSlots(player.bag, req.item, req.count);
        const leftover = addItemToSlots(player.bag, recipe.out.item, recipe.out.count);
        send(ws, { type: 'bag_update', bag: player.bag });
        const outName = CATALOG[recipe.out.item]?.name || recipe.out.item;
        send(ws, {
          type: 'toast',
          level: leftover > 0 ? 'warn' : 'success',
          text: leftover > 0 ? '가방 공간이 부족해 일부만 획득했습니다.' : `🔨 ${outName} ×${recipe.out.count} 제작 완료!`
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
        send(ws, { type: 'toast', level: 'success', text: `✨ "${entry.name}" 스킨을 게시판에 공유했습니다!` });
        break;
      }

      case 'skin_like': {
        if (store.likeSkin(String(msg.id || ''))) broadcast({ type: 'skins_update', skins: store.skins });
        break;
      }

      case 'admin_auth': {
        if (String(msg.password || '') === ADMIN_PASSWORD) {
          player.isAdmin = true;
          send(ws, { type: 'admin_status', isAdmin: true });
          send(ws, { type: 'toast', level: 'success', text: '🛡️ 관리자 모드가 활성화되었습니다.' });
          broadcast({ type: 'player_admin', id: player.id, isAdmin: true });
        } else {
          send(ws, { type: 'toast', level: 'error', text: '관리자 비밀번호가 올바르지 않습니다.' });
        }
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
        if (text.startsWith('/admin ')) {
          if (text.slice(7).trim() === ADMIN_PASSWORD) {
            player.isAdmin = true;
            send(ws, { type: 'admin_status', isAdmin: true });
            send(ws, { type: 'toast', level: 'success', text: '🛡️ 관리자 모드가 활성화되었습니다.' });
            broadcast({ type: 'player_admin', id: player.id, isAdmin: true });
          } else send(ws, { type: 'toast', level: 'error', text: '관리자 비밀번호가 올바르지 않습니다.' });
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
        broadcast({ type: 'chat', from: player.nickname, color: player.color, isAdmin: player.isAdmin, text });
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
    player.bag = null;
    players.delete(id);
    broadcast({ type: 'player_leave', id });
    broadcast({ type: 'chat', system: true, text: `${nick}님이 퇴장했습니다. (개인 가방 자동 삭제 · ${players.size}/${MAX_PLAYERS})` });
    player = null;
  });
});

process.on('SIGINT', () => { store.flushAll(); process.exit(0); });
process.on('SIGTERM', () => { store.flushAll(); process.exit(0); });

server.listen(PORT, HOST, () => {
  console.log(`[Boxworld v3] Listening on http://${HOST}:${PORT}${BASE_PATH || '/'} (WS: ${wsPath})`);
});
