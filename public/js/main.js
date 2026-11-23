import * as THREE from '../vendor/three/three.module.min.js';
import { TextureLibrary } from './textures.js';
import { WorldRenderer } from './worldRenderer.js';
import { RemotePlayers, createAvatarRig, applySkinToRig, setRigHeldItem } from './players.js';
import { FirstPersonHand } from './heldItem.js';
import { BlueprintProjector } from './blueprint.js';
import { RegionVisualizer } from './regions.js';
import { SkySystem } from './sky.js';
import { SoundEngine } from './sound.js';
import { AnimalRenderer } from './animals.js';
import { WorldExtras } from './worldExtras.js';
import { GameUI } from './ui.js';

// Global contextmenu suppression (fixes right-click browser menu when opening chests/furnaces!)
window.addEventListener('contextmenu', (e) => {
  const tag = e.target?.tagName;
  if (tag !== 'INPUT' && tag !== 'TEXTAREA') e.preventDefault();
});

// Three.js scene setup
const canvas = document.getElementById('game-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#87ceeb');
scene.fog = new THREE.Fog('#87ceeb', 48, 125);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.08, 190);
camera.rotation.order = 'YXZ';
scene.add(camera);

const hemiLight = new THREE.HemisphereLight(0xffffff, 0x5d7a5d, 0.85);
scene.add(hemiLight);
const dirLight = new THREE.DirectionalLight(0xfffbe6, 0.78);
dirLight.position.set(45, 80, 35);
scene.add(dirLight);

const sky = new SkySystem(scene, hemiLight, dirLight);
const sound = new SoundEngine();
const animalRenderer = new AnimalRenderer(scene);
const worldExtras = new WorldExtras(scene);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Game State
let ws = null;
let joined = false;
let selfPlayer = null;
let maxPlayers = 5;
let catalog = {};
let worldBounds = { minX: -64, maxX: 63, minY: 0, maxY: 47, minZ: -64, maxZ: 63 };
let textures = null;
let worldRenderer = null;
let remotePlayers = new RemotePlayers(scene);
let fpHand = null;
let selfRig = null;
let thirdPerson = false;
let brushMode = false;
let currentSigns = {};
let currentPortals = {};
let lastJumpPadTime = 0;
let projector = null;
let regionVis = new RegionVisualizer(scene);

// Physics & Input
const playerPos = new THREE.Vector3(0.5, 17.1, 0.5);
const playerVel = new THREE.Vector3(0, 0, 0);
let yaw = 0;
let pitch = 0;
let onGround = false;
let flyMode = false;
let lastSpaceTime = 0;
let pointerLocked = false;
let currentHit = null;
let selfWalkPhase = 0;
let stepSoundTimer = 0;

// Hold-to-mine state (crack animation + particle bursts, no gauge!)
let isLeftDown = false;
let miningTargetKey = null;
let miningElapsed = 0;
let miningDuration = 0.5;
let hitSoundTimer = 0;

const PLAYER_RADIUS = 0.28;
const PLAYER_HEIGHT = 1.72;
const EYE_HEIGHT = 1.54;
const keys = new Set();

function buildWsUrl() {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const baseDir = window.location.pathname.endsWith('/')
    ? window.location.pathname
    : window.location.pathname.replace(/\/[^/]*$/, '/');
  return `${proto}//${window.location.host}${baseDir}ws`;
}

function send(payload) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
}

function getPlayerBlockPos() {
  return { x: Math.floor(playerPos.x), y: Math.floor(playerPos.y), z: Math.floor(playerPos.z) };
}

function getFrontPos() {
  const dir = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(0, yaw, 0, 'YXZ'));
  return {
    x: Math.floor(playerPos.x + dir.x * 3),
    y: Math.floor(playerPos.y),
    z: Math.floor(playerPos.z + dir.z * 3)
  };
}

function syncHeldItem(itemId) {
  if (fpHand) fpHand.setHeldItem(itemId);
  if (selfRig) setRigHeldItem(selfRig, itemId, catalog, textures);
  if (joined) send({ type: 'held_item', item: itemId });
}

function toggleBrushMode() {
  brushMode = !brushMode;
  const btn = document.getElementById('btn-brush');
  if (btn) {
    btn.textContent = brushMode ? '🪄 붓 3×3 ON [R]' : '🪄 붓 OFF [R]';
    btn.style.borderColor = brushMode ? '#38bdf8' : '';
  }
  ui.toast(brushMode ? '🪄 건축 붓 3×3 모드 켜짐! (우클릭으로 3×3 평면 설치)' : '🪄 건축 붓 모드 꺼짐 (1블록 설치)', 'info');
}

function warpPlayer(x, y, z, label = '') {
  playerPos.set(x, y, z);
  playerVel.set(0, 0, 0);
  sound.playWarp();
  if (label) ui.toast(`🌀 ${label}(으)로 순간이동했습니다!`, 'success');
}

const ui = new GameUI({
  send,
  getPlayerBlockPos,
  getFrontPos,
  regionVis,
  get projector() { return projector; },
  onToggleSound: () => {
    sound.setMuted(!sound.muted);
    return sound.muted;
  },
  onToggleBrush: () => toggleBrushMode(),
  onWarp: (x, y, z, label) => warpPlayer(x, y, z, label),
  getMinimapData: () => ({
    worldRenderer,
    playerPos,
    remotes: remotePlayers.list(),
    portals: currentPortals
  }),
  onModalChange: (open) => {
    if (open) { isLeftDown = false; resetMining(); }
  },
  onActiveSlotChange: (itemId) => syncHeldItem(itemId),
  onApplySkin: (skin) => {
    if (selfPlayer) selfPlayer.skin = skin;
    if (fpHand) fpHand.setSkin(skin);
    if (selfRig) applySkinToRig(selfRig, skin);
    send({ type: 'skin_apply', skin });
  },
  onLogout: () => {
    send({ type: 'logout' });
    if (ws) ws.close();
    resetToLogin();
  }
});

function resetMining() {
  miningTargetKey = null;
  miningElapsed = 0;
  hitSoundTimer = 0;
}

function resetToLogin() {
  joined = false;
  selfPlayer = null;
  isLeftDown = false;
  resetMining();
  if (document.pointerLockElement) document.exitPointerLock();
  ui.closeModal();
  ui.closeChat();
  remotePlayers.clear();
  animalRenderer.clear();
  if (selfRig) { scene.remove(selfRig.group); selfRig = null; }
  if (fpHand) { camera.remove(fpHand.root); fpHand = null; }
  if (projector) projector.clear();
  document.getElementById('hud').classList.add('hidden');
  document.getElementById('login-overlay').classList.remove('hidden');
  document.getElementById('nickname-input').focus();
}

// Login (supports optional Admin Login right on entry!)
const loginForm = document.getElementById('login-form');
const nickInput = document.getElementById('nickname-input');
const adminLoginToggle = document.getElementById('admin-login-toggle');
const loginAdminPw = document.getElementById('login-admin-pw');
const loginError = document.getElementById('login-error');

adminLoginToggle.addEventListener('change', () => {
  loginAdminPw.classList.toggle('hidden', !adminLoginToggle.checked);
  if (adminLoginToggle.checked) loginAdminPw.focus();
  else loginAdminPw.value = '';
});

loginForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const nickname = nickInput.value.trim();
  if (!nickname) return;
  const adminPassword = adminLoginToggle.checked ? loginAdminPw.value : '';
  if (adminLoginToggle.checked && !adminPassword) {
    loginError.textContent = '관리자 비밀번호를 입력해주세요.';
    return;
  }
  loginError.textContent = '서버에 연결 중...';

  if (ws) { ws.close(); ws = null; }
  ws = new WebSocket(buildWsUrl());
  ws.addEventListener('open', () => send({ type: 'join', nickname, adminPassword }));
  ws.addEventListener('message', (ev) => handleServerMessage(JSON.parse(ev.data)));
  ws.addEventListener('close', () => {
    if (joined) {
      ui.toast('서버와 연결이 종료되었습니다. (개인 가방 초기화)', 'warn');
      resetToLogin();
    }
  });
  ws.addEventListener('error', () => { loginError.textContent = '서버에 연결할 수 없습니다.'; });
});

function handleServerMessage(msg) {
  switch (msg.type) {
    case 'join_error':
      loginError.textContent = msg.message || '입장에 실패했습니다.';
      break;

    case 'welcome': {
      loginError.textContent = '';
      joined = true;
      selfPlayer = msg.self;
      maxPlayers = msg.maxPlayers || 5;
      catalog = msg.catalog || {};
      worldBounds = msg.worldBounds || worldBounds;
      if (typeof msg.worldTime === 'number') sky.setTime(msg.worldTime);
      if (msg.worldWeather) sky.setWeather(msg.worldWeather);
      currentSigns = msg.signs || {};
      currentPortals = msg.portals || {};
      worldExtras.syncSigns(currentSigns);
      worldExtras.syncPortals(currentPortals);

      playerPos.set(selfPlayer.x, selfPlayer.y, selfPlayer.z);
      playerVel.set(0, 0, 0);
      yaw = selfPlayer.yaw || 0;
      pitch = selfPlayer.pitch || 0;

      if (!textures) textures = new TextureLibrary(catalog);
      remotePlayers.setAssets(catalog, textures);

      if (!worldRenderer) worldRenderer = new WorldRenderer(scene, textures, catalog, worldBounds);
      worldRenderer.loadFromRLE(msg.worldRLE);

      if (!fpHand) fpHand = new FirstPersonHand(camera, catalog, textures);
      fpHand.setSkin(selfPlayer.skin);
      fpHand.setVisible(!thirdPerson);

      if (!selfRig) {
        selfRig = createAvatarRig(selfPlayer.skin, false);
        selfRig.group.visible = thirdPerson;
        scene.add(selfRig.group);
      } else {
        applySkinToRig(selfRig, selfPlayer.skin);
      }

      if (!projector) {
        projector = new BlueprintProjector(scene, worldRenderer);
        projector.onProgressChange = (p) => ui.updateBlueprintHUD(p);
      }

      animalRenderer.syncAll(msg.animals);

      ui.init(catalog, msg.recipes, textures, selfPlayer);
      ui.updateBag(msg.bag);
      ui.setRegions(msg.regions);
      ui.setBlueprints(msg.blueprints);
      ui.setSkins(msg.skins);

      remotePlayers.clear();
      for (const p of msg.players || []) remotePlayers.addOrUpdate(p);
      ui.updatePlayersList(selfPlayer, remotePlayers.list(), maxPlayers);

      document.getElementById('login-overlay').classList.add('hidden');
      document.getElementById('hud').classList.remove('hidden');
      document.getElementById('chat-messages').innerHTML = '';
      ui.addChatMessage({
        system: true,
        text: `Boxworld v3에 오신 것을 환영합니다! 화로(4,17,3) · 광산(-9,16,-9) · 밭(8,16,-2) · 시간 변경: /낮 /노을 /밤`
      });
      break;
    }

    case 'world_time':
      if (typeof msg.time === 'number') sky.setTime(msg.time);
      break;

    case 'world_weather':
      sky.setWeather(msg.weather);
      break;

    case 'signs_update':
      currentSigns = msg.signs || {};
      worldExtras.syncSigns(currentSigns);
      break;

    case 'portals_update':
      currentPortals = msg.portals || {};
      worldExtras.syncPortals(currentPortals);
      break;

    case 'tnt_ignited':
      worldExtras.igniteTNT(msg.x, msg.y, msg.z);
      sound.playHit('dirt', { x: msg.x + 0.5, y: msg.y + 0.5, z: msg.z + 0.5 });
      ui.toast('🧨 치이익... 3초 후 TNT가 폭발합니다!', 'warn');
      break;

    case 'tnt_explode':
      sound.playExplosion({ x: msg.x + 0.5, y: msg.y + 0.5, z: msg.z + 0.5 });
      if (worldRenderer) {
        worldRenderer.spawnBreakParticles(msg.x, msg.y, msg.z, 'tnt', 28);
        worldRenderer.spawnBreakParticles(msg.x, msg.y + 1, msg.z, 'stone', 18);
      }
      break;

    case 'warp_to':
      warpPlayer(msg.x, msg.y, msg.z, msg.label);
      break;

    case 'player_emote': {
      sound.playEmote();
      let pos = playerPos;
      if (selfPlayer && msg.id !== selfPlayer.id) {
        const remote = remotePlayers.map.get(msg.id);
        if (remote) pos = remote.rig.group.position;
      }
      worldExtras.spawnEmote(msg.emoji, msg.label, pos);
      break;
    }

    case 'animals_update':
      animalRenderer.syncAll(msg.animals);
      break;

    case 'bag_update':
      ui.updateBag(msg.bag);
      break;

    case 'block_update': {
      const prev = worldRenderer?.getBlock(msg.x, msg.y, msg.z);
      if (worldRenderer) {
        if (!msg.block && (msg.brokenBlock || prev)) {
          const bId = msg.brokenBlock || prev;
          worldRenderer.spawnBreakParticles(msg.x, msg.y, msg.z, bId, 14);
          sound.playBreak(catalog[bId]?.sound || 'stone', { x: msg.x + 0.5, y: msg.y + 0.5, z: msg.z + 0.5 });
        } else if (msg.block) {
          sound.playPlace(catalog[msg.block]?.sound || 'wood', { x: msg.x + 0.5, y: msg.y + 0.5, z: msg.z + 0.5 });
        }
        worldRenderer.setBlock(msg.x, msg.y, msg.z, msg.block);
        if (projector?.activeBlueprint) projector.refresh();
      }
      break;
    }

    case 'blocks_batch':
      if (worldRenderer && Array.isArray(msg.changes)) {
        if (msg.fell && msg.changes.length > 0) {
          const first = msg.changes[0];
          sound.playTreeFell({ x: first.x + 0.5, y: first.y + 0.5, z: first.z + 0.5 });
          for (let i = 0; i < Math.min(msg.changes.length, 10); i++) {
            const c = msg.changes[i];
            worldRenderer.spawnBreakParticles(c.x, c.y, c.z, i < 4 ? 'wood' : 'leaves', 4);
          }
        }
        worldRenderer.applyBatch(msg.changes);
        if (projector?.activeBlueprint) projector.refresh();
      }
      break;

    case 'food_eaten':
      sound.playEat();
      ui.updateVitals(ui.hp + (msg.heal || 4), ui.hunger + (msg.hunger || 6));
      ui.toast(`🍎 ${msg.name}을(를) 먹어 체력을 회복했습니다!`, 'success');
      break;

    case 'player_join':
      remotePlayers.addOrUpdate(msg.player);
      ui.updatePlayersList(selfPlayer, remotePlayers.list(), maxPlayers);
      break;

    case 'player_leave':
      remotePlayers.remove(msg.id);
      ui.updatePlayersList(selfPlayer, remotePlayers.list(), maxPlayers);
      break;

    case 'player_move':
      remotePlayers.setTarget(msg.id, msg.x, msg.y, msg.z, msg.yaw, msg.pitch);
      break;

    case 'player_held':
      remotePlayers.setHeldItem(msg.id, msg.heldItem);
      break;

    case 'player_skin':
      remotePlayers.setSkin(msg.id, msg.skin);
      break;

    case 'player_admin':
      remotePlayers.setAdmin(msg.id, msg.isAdmin);
      ui.updatePlayersList(selfPlayer, remotePlayers.list(), maxPlayers);
      break;

    case 'admin_status':
      if (selfPlayer) selfPlayer.isAdmin = msg.isAdmin;
      ui.setAdminStatus(msg.isAdmin);
      ui.updatePlayersList(selfPlayer, remotePlayers.list(), maxPlayers);
      break;

    case 'chest_data':
      sound.playOpen();
      ui.openChestData(msg.chest);
      break;

    case 'furnace_data':
      ui.openFurnaceData(msg.furnace);
      break;

    case 'regions_update':
      ui.setRegions(msg.regions);
      break;

    case 'blueprints_update':
      ui.setBlueprints(msg.blueprints);
      break;

    case 'skins_update':
      ui.setSkins(msg.skins);
      break;

    case 'chat':
      ui.addChatMessage(msg);
      break;

    case 'toast':
      if (msg.text?.includes('제작 완료')) sound.playCraft();
      ui.toast(msg.text, msg.level || 'info');
      break;
  }
}

function computeMiningTime(blockId) {
  const bDef = catalog[blockId];
  if (!bDef || !Number.isFinite(bDef.hardness)) return Infinity;
  const heldId = ui.getActiveItemId();
  const heldDef = heldId ? catalog[heldId] : null;
  const isPreferred = heldDef && heldDef.kind === 'tool' && heldDef.toolType === bDef.preferredTool;
  const speed = isPreferred ? (heldDef.speed || 2.0) : 1.0;
  return Math.max(0.12, bDef.hardness / speed);
}

function getEyeAndLook() {
  const eyePos = new THREE.Vector3(playerPos.x, playerPos.y + EYE_HEIGHT, playerPos.z);
  const lookDir = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
  return { eyePos, lookDir };
}

function handleRightClickOrInteract(interactOnly = false) {
  if (!joined) return;
  const { eyePos, lookDir } = getEyeAndLook();

  // 1. Check sheep shearing on right-click
  const animalHit = animalRenderer.raycast(eyePos, lookDir, 5.0);
  if (animalHit && animalHit.type === 'sheep') {
    fpHand?.triggerSwing();
    sound.playAnimal('sheep', animalHit.point);
    send({ type: 'animal_interact', id: animalHit.id, action: 'shear' });
    return;
  }

  // 2. Open Chest, Furnace, Bed, Door, Sign, TNT, Portal
  if (currentHit) {
    if (currentHit.block === 'chest') {
      fpHand?.triggerSwing();
      send({ type: 'chest_open', x: currentHit.x, y: currentHit.y, z: currentHit.z });
      return;
    }
    if (currentHit.block === 'furnace') {
      fpHand?.triggerSwing();
      sound.playOpen();
      send({ type: 'furnace_open', x: currentHit.x, y: currentHit.y, z: currentHit.z });
      return;
    }
    if (currentHit.block === 'bed') {
      fpHand?.triggerSwing();
      send({ type: 'sleep_bed', x: currentHit.x, y: currentHit.y, z: currentHit.z });
      return;
    }
    if (currentHit.block === 'door_closed' || currentHit.block === 'door_open') {
      fpHand?.triggerSwing();
      sound.playDoor();
      send({ type: 'toggle_door', x: currentHit.x, y: currentHit.y, z: currentHit.z });
      return;
    }
    if (currentHit.block === 'tnt') {
      fpHand?.triggerSwing();
      send({ type: 'tnt_ignite', x: currentHit.x, y: currentHit.y, z: currentHit.z });
      return;
    }
    if (currentHit.block === 'sign') {
      if (document.pointerLockElement) document.exitPointerLock();
      const k = `${currentHit.x},${currentHit.y},${currentHit.z}`;
      const curText = currentSigns[k]?.text || '';
      const nextText = prompt('🪧 표지판에 적을 문구를 입력하세요 (줄바꿈은 \\n):', curText.replace(/\n/g, '\\n'));
      if (nextText !== null) {
        send({ type: 'sign_update', x: currentHit.x, y: currentHit.y, z: currentHit.z, text: nextText.replace(/\\n/g, '\n') });
      }
      return;
    }
    if (currentHit.block === 'portal') {
      if (keys.has('ShiftLeft') || keys.has('ShiftRight')) {
        if (document.pointerLockElement) document.exitPointerLock();
        const k = `${currentHit.x},${currentHit.y},${currentHit.z}`;
        const curCh = currentPortals[k]?.channel || '기본';
        const nextCh = prompt('🌀 포털 채널 이름을 입력하세요 (같은 이름의 포털끼리 연결됩니다):', curCh);
        if (nextCh !== null && nextCh.trim()) {
          send({ type: 'portal_set_channel', x: currentHit.x, y: currentHit.y, z: currentHit.z, channel: nextCh.trim() });
        }
      } else {
        send({ type: 'portal_use', x: currentHit.x, y: currentHit.y, z: currentHit.z });
      }
      return;
    }
  }
  if (interactOnly) return;

  const heldId = ui.getActiveItemId();
  const heldDef = heldId ? catalog[heldId] : null;

  // 3. Hoe tilling grass/dirt -> farmland
  if (currentHit && heldDef?.toolType === 'hoe' && (currentHit.block === 'grass' || currentHit.block === 'dirt')) {
    fpHand?.triggerSwing();
    send({ type: 'till_soil', x: currentHit.x, y: currentHit.y, z: currentHit.z, slotIndex: ui.activeSlot });
    return;
  }

  // 4. Plant wheat seeds on farmland
  if (currentHit && heldDef?.kind === 'seed') {
    fpHand?.triggerSwing();
    send({ type: 'plant_seed', x: currentHit.placeX, y: currentHit.placeY, z: currentHit.placeZ, slotIndex: ui.activeSlot });
    return;
  }

  // 5. Eat food
  if (heldDef?.kind === 'food') {
    fpHand?.triggerSwing();
    send({ type: 'eat_food', slotIndex: ui.activeSlot });
    return;
  }

  // 6. Place block (1 block or 3x3 Builder Brush!)
  if (!currentHit || !heldDef || heldDef.kind !== 'block') return;
  const px = currentHit.placeX, py = currentHit.placeY, pz = currentHit.placeZ;

  if (brushMode && !['chest', 'furnace', 'bed', 'sign', 'portal', 'tnt', 'sapling'].includes(heldDef.id)) {
    const positions = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        positions.push({ x: px + dx, y: py, z: pz + dz });
      }
    }
    fpHand?.triggerSwing();
    send({ type: 'block_place_brush', positions, slotIndex: ui.activeSlot });
    return;
  }

  if (heldDef.solid) {
    const overlapsPlayer =
      px + 1 > playerPos.x - PLAYER_RADIUS && px < playerPos.x + PLAYER_RADIUS &&
      pz + 1 > playerPos.z - PLAYER_RADIUS && pz < playerPos.z + PLAYER_RADIUS &&
      py + 1 > playerPos.y && py < playerPos.y + PLAYER_HEIGHT;
    if (overlapsPlayer) return;
  }
  fpHand?.triggerSwing();
  send({ type: 'block_place', x: px, y: py, z: pz, slotIndex: ui.activeSlot });
}

canvas.addEventListener('click', () => {
  if (!joined || ui.openModalId || ui.chatOpen) return;
  if (!pointerLocked) canvas.requestPointerLock?.();
});

document.addEventListener('pointerlockchange', () => {
  pointerLocked = document.pointerLockElement === canvas;
  document.getElementById('play-hint').classList.toggle('hidden', pointerLocked);
  if (!pointerLocked) { isLeftDown = false; resetMining(); }
});

document.addEventListener('mousemove', (e) => {
  if (!pointerLocked) return;
  yaw -= e.movementX * 0.0022;
  pitch -= e.movementY * 0.0022;
  pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, pitch));
});

canvas.addEventListener('mousedown', (e) => {
  if (!joined || !pointerLocked) return;
  if (e.button === 0) {
    // Check if clicking an animal first
    const { eyePos, lookDir } = getEyeAndLook();
    const animalHit = animalRenderer.raycast(eyePos, lookDir, 4.8);
    if (animalHit) {
      fpHand?.triggerSwing();
      sound.playAnimal(animalHit.type, animalHit.point);
      send({ type: 'animal_interact', id: animalHit.id, action: 'hit' });
      return;
    }
    isLeftDown = true;
    fpHand?.triggerSwing();
  } else if (e.button === 2) {
    e.preventDefault();
    handleRightClickOrInteract(false);
  }
});

window.addEventListener('mouseup', (e) => {
  if (e.button === 0) { isLeftDown = false; resetMining(); }
});

window.addEventListener('wheel', (e) => {
  if (!joined || ui.openModalId || ui.chatOpen) return;
  if (e.deltaY > 0) ui.setActiveSlot(ui.activeSlot + 1);
  else if (e.deltaY < 0) ui.setActiveSlot(ui.activeSlot - 1);
});

window.addEventListener('keydown', (e) => {
  if (!joined) return;
  if (e.key === 'Escape') {
    if (ui.chatOpen) { ui.closeChat(); return; }
    if (ui.openModalId) { ui.closeModal(); return; }
  }
  const tag = document.activeElement?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;

  if (e.code === 'KeyT' || e.code === 'Enter') { e.preventDefault(); ui.openChat(); return; }
  if (e.code === 'KeyE') { e.preventDefault(); ui.toggleModal('modal-bag'); return; }
  if (e.code === 'KeyC') { e.preventDefault(); ui.toggleModal('modal-craft'); return; }
  if (e.code === 'KeyK') { e.preventDefault(); ui.toggleModal('modal-skin'); return; }
  if (e.code === 'KeyB') { e.preventDefault(); ui.toggleModal('modal-blueprint'); return; }
  if (e.code === 'KeyP') { e.preventDefault(); ui.toggleModal('modal-admin'); return; }
  if (e.code === 'KeyM') { e.preventDefault(); ui.toggleModal('modal-map'); return; }
  if (e.code === 'KeyG') { e.preventDefault(); ui.toggleModal('modal-emote'); return; }
  if (e.code === 'KeyR') { e.preventDefault(); toggleBrushMode(); return; }
  if (e.code === 'KeyF') { e.preventDefault(); handleRightClickOrInteract(true); return; }

  if (e.code === 'KeyV' || e.code === 'F5') {
    e.preventDefault();
    thirdPerson = !thirdPerson;
    if (fpHand) fpHand.setVisible(!thirdPerson);
    if (selfRig) selfRig.group.visible = thirdPerson;
    ui.toast(thirdPerson ? '📷 3인칭 시점 (V키로 전환)' : '👁️ 1인칭 시점', 'info');
    return;
  }

  if (e.code.startsWith('Digit')) {
    const n = Number(e.code.slice(5));
    if (n >= 1 && n <= 9) ui.setActiveSlot(n - 1);
  }

  if (e.code === 'Space' && !e.repeat) {
    const now = performance.now();
    if (now - lastSpaceTime < 280) {
      flyMode = !flyMode;
      playerVel.y = 0;
      document.getElementById('hud-mode').textContent = flyMode
        ? '🕊️ 비행 모드 (Space↑ / Shift↓)'
        : '🚶 걷기 (Space×2 비행)';
      lastSpaceTime = 0;
    } else {
      lastSpaceTime = now;
    }
  }
  keys.add(e.code);
});

window.addEventListener('keyup', (e) => keys.delete(e.code));

function collides(x, y, z) {
  if (!worldRenderer) return false;
  const minX = Math.floor(x - PLAYER_RADIUS), maxX = Math.floor(x + PLAYER_RADIUS);
  const minY = Math.floor(y), maxY = Math.floor(y + PLAYER_HEIGHT - 0.01);
  const minZ = Math.floor(z - PLAYER_RADIUS), maxZ = Math.floor(z + PLAYER_RADIUS);
  for (let bx = minX; bx <= maxX; bx++) {
    for (let by = minY; by <= maxY; by++) {
      for (let bz = minZ; bz <= maxZ; bz++) {
        if (worldRenderer.isSolid(bx, by, bz)) return true;
      }
    }
  }
  return false;
}

function updatePhysics(dt) {
  if (!joined || ui.openModalId || ui.chatOpen) return false;
  const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
  const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  const move = new THREE.Vector3();

  if (keys.has('KeyW')) move.add(forward);
  if (keys.has('KeyS')) move.sub(forward);
  if (keys.has('KeyD')) move.add(right);
  if (keys.has('KeyA')) move.sub(right);
  const isMoving = move.lengthSq() > 0;
  if (isMoving) move.normalize();

  const speed = flyMode ? 10.5 : 5.8;
  const nextX = playerPos.x + move.x * speed * dt;
  if (!collides(nextX, playerPos.y, playerPos.z)) playerPos.x = nextX;
  const nextZ = playerPos.z + move.z * speed * dt;
  if (!collides(playerPos.x, playerPos.y, nextZ)) playerPos.z = nextZ;

  if (flyMode) {
    let vy = 0;
    if (keys.has('Space')) vy += 8.0;
    if (keys.has('ShiftLeft') || keys.has('ShiftRight')) vy -= 8.0;
    const nextY = playerPos.y + vy * dt;
    if (!collides(playerPos.x, nextY, playerPos.z)) playerPos.y = nextY;
    onGround = false;
  } else {
    // Ladder climbing check
    const bx = Math.floor(playerPos.x), by = Math.floor(playerPos.y), bz = Math.floor(playerPos.z);
    const onLadder = worldRenderer && (
      worldRenderer.getBlock(bx, by, bz) === 'ladder' ||
      worldRenderer.getBlock(bx, by + 1, bz) === 'ladder'
    );

    if (onLadder) {
      playerVel.y = keys.has('Space') || keys.has('KeyW') ? 4.8 : (keys.has('ShiftLeft') ? -3.5 : 0);
      const nextY = playerPos.y + playerVel.y * dt;
      if (!collides(playerPos.x, nextY, playerPos.z)) playerPos.y = nextY;
      onGround = true;
    } else {
      // Jump Pad super launch!
      const underBlock = worldRenderer?.getBlock(bx, Math.floor(playerPos.y - 0.15), bz);
      if (underBlock === 'jumppad' && performance.now() - lastJumpPadTime > 350) {
        lastJumpPadTime = performance.now();
        playerVel.y = 18.5;
        onGround = false;
        sound.playJumpPad();
      } else if (keys.has('Space') && onGround) {
        playerVel.y = 8.4;
        onGround = false;
      }
      playerVel.y = Math.max(-28, playerVel.y - 24 * dt);
      const nextY = playerPos.y + playerVel.y * dt;
      if (collides(playerPos.x, nextY, playerPos.z)) {
        if (playerVel.y < 0) { onGround = true; playerPos.y = Math.floor(nextY) + 1.001; }
        playerVel.y = 0;
      } else {
        playerPos.y = nextY;
        onGround = false;
      }
    }
  }

  if (isMoving && onGround && !flyMode) {
    stepSoundTimer -= dt;
    if (stepSoundTimer <= 0) {
      sound.playStep();
      stepSoundTimer = 0.36;
    }
  }

  playerPos.x = Math.max(worldBounds.minX + 0.5, Math.min(worldBounds.maxX + 0.5, playerPos.x));
  playerPos.z = Math.max(worldBounds.minZ + 0.5, Math.min(worldBounds.maxZ + 0.5, playerPos.z));
  if (playerPos.y < -5) { playerPos.set(0.5, 18, 0.5); playerVel.set(0, 0, 0); }
  return isMoving;
}

function updateMining(dt) {
  if (!isLeftDown || !pointerLocked || !currentHit) {
    if (miningTargetKey) resetMining();
    return;
  }

  const key = `${currentHit.x},${currentHit.y},${currentHit.z}`;
  if (key !== miningTargetKey) {
    miningTargetKey = key;
    miningElapsed = 0;
    hitSoundTimer = 0;
    miningDuration = computeMiningTime(currentHit.block);
  }
  if (!Number.isFinite(miningDuration)) return;

  miningElapsed += dt;
  hitSoundTimer -= dt;
  if (hitSoundTimer <= 0) {
    const bDef = catalog[currentHit.block];
    sound.playHit(bDef?.sound || 'stone', { x: currentHit.x + 0.5, y: currentHit.y + 0.5, z: currentHit.z + 0.5 });
    worldRenderer.spawnBreakParticles(currentHit.x, currentHit.y, currentHit.z, currentHit.block, 3);
    hitSoundTimer = 0.22;
  }

  if (miningElapsed >= miningDuration) {
    send({
      type: 'block_break',
      x: currentHit.x, y: currentHit.y, z: currentHit.z,
      slotIndex: ui.activeSlot
    });
    miningElapsed = 0;
    miningTargetKey = null;
  }
}

let lastTime = performance.now();
let lastNetSend = 0;

function animate(now) {
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;

  if (joined) {
    const isMoving = updatePhysics(dt);
    remotePlayers.update(dt);
    animalRenderer.update(dt);
    worldExtras.update(dt);
    sky.update(dt, playerPos);
    sound.updateListener(playerPos, yaw);

    const { eyePos, lookDir } = getEyeAndLook();
    if (thirdPerson) {
      const camPos = eyePos.clone().addScaledVector(lookDir, -3.8);
      camPos.y += 0.6;
      camera.position.copy(camPos);
      camera.lookAt(eyePos);
    } else {
      camera.position.copy(eyePos);
      camera.rotation.y = yaw;
      camera.rotation.x = pitch;
    }

    if (selfRig) {
      selfRig.group.position.copy(playerPos);
      selfRig.group.rotation.y = yaw;
      selfRig.head.rotation.x = Math.max(-0.8, Math.min(0.8, pitch));
      if (isMoving) {
        selfWalkPhase += dt * 10;
        const sw = Math.sin(selfWalkPhase) * 0.5;
        selfRig.leftLeg.rotation.x = sw;
        selfRig.rightLeg.rotation.x = -sw;
        selfRig.leftArm.rotation.x = -sw * 0.7;
        selfRig.rightArmPivot.rotation.x = sw * 0.5;
      } else {
        selfRig.leftLeg.rotation.x *= 0.8;
        selfRig.rightLeg.rotation.x *= 0.8;
      }
    }

    if (worldRenderer) {
      currentHit = worldRenderer.raycast(eyePos, lookDir, 7);
      updateMining(dt);
      const ratio = miningTargetKey && Number.isFinite(miningDuration) ? Math.min(1, miningElapsed / miningDuration) : 0;
      worldRenderer.updateHighlight(currentHit, ratio);
      worldRenderer.updateParticles(dt);
    }

    if (fpHand) fpHand.update(dt, isMoving, isLeftDown && pointerLocked);

    document.getElementById('hud-coords').textContent =
      `XYZ: ${Math.floor(playerPos.x)}, ${Math.floor(playerPos.y)}, ${Math.floor(playerPos.z)}`;
    document.getElementById('hud-time').textContent = sky.getTimeLabel();

    if (now - lastNetSend > 50) {
      lastNetSend = now;
      send({
        type: 'move',
        x: Number(playerPos.x.toFixed(3)),
        y: Number(playerPos.y.toFixed(3)),
        z: Number(playerPos.z.toFixed(3)),
        yaw: Number(yaw.toFixed(3)),
        pitch: Number(pitch.toFixed(3))
      });
    }
  } else {
    sky.update(dt, new THREE.Vector3(0, 20, 0));
    const t = now * 0.0002;
    camera.position.set(Math.cos(t) * 24, 24, Math.sin(t) * 24);
    camera.lookAt(0, 16, 0);
  }

  renderer.render(scene, camera);
}
requestAnimationFrame(animate);
