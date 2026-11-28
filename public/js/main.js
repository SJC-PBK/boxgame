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
import { WorldExtras } from './worldExtras.js?v=20261128f';
import { TouchControls } from './touchControls.js?v=20261128b';
import { GameUI } from './ui.js';
import { getBiomeAt, getBiomeLabel } from '../shared/terrainGen.js';

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
const playerLight = new THREE.PointLight(0xffe6b3, 0, 10, 1.35);
scene.add(playerLight);
const HELD_LIGHT_PROPS = {
  lamp:    { intensity: 3.4, distance: 16, color: new THREE.Color(0xffe49c) },
  torch:   { intensity: 3.1, distance: 15, color: new THREE.Color(0xffb86c) },
  portal:  { intensity: 2.3, distance: 12, color: new THREE.Color(0xc084fc) },
  furnace: { intensity: 1.9, distance: 10, color: new THREE.Color(0xfb923c) },
  jumppad: { intensity: 1.6, distance: 9,  color: new THREE.Color(0x38bdf8) }
};
const DEFAULT_PLAYER_LIGHT_COLOR = new THREE.Color(0xffe6b3);
const elUnderwaterTint = document.getElementById('underwater-tint');
const elDebugHud = document.getElementById('debug-hud');
let _lastUwState = false;
let debugHudVisible = false;
let _fpsFrames = 0;
let _fpsLastTime = performance.now();
let _curFps = 60;
let _wsPingMs = 0;
let _lastPingSent = 0;
let _lastPlateSent = 0;
let cameraShake = 0;

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
let currentWorldMode = 'sandbox';
let selectedLoginWorld = 'sandbox';
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
const BRUSH_MODES = [
  { id: 'single', label: '🪄 1×1 일반 [PgUp/Dn]',    desc: '1블록 일반 설치' },
  { id: 'floor3', label: '🪄 3×3 바닥 [PgUp/Dn]',    desc: '3×3 평면 바닥 동시 설치' },
  { id: 'floor5', label: '🪄 5×5 바닥 [PgUp/Dn]',    desc: '5×5 넓은 바닥 동시 설치' },
  { id: 'row5',   label: '🪄 가로줄 5칸 [PgUp/Dn]',  desc: '바라보는 방향 기준 가로 5칸 동시 설치' },
  { id: 'col5',   label: '🪄 세로기둥 5칸 [PgUp/Dn]', desc: '위로 5칸 기둥 동시 설치' },
  { id: 'wall53', label: '🪄 벽면 5×3 [PgUp/Dn]',    desc: '가로 5 × 높이 3 벽면 동시 설치' }
];
let brushModeIdx = 0;
let mouseSensitivity = 1.0;
let invertY = false;
let remoteLook = false;
let isRightDragging = false;
let dragMovedDist = 0;
let lastDragX = 0;
let lastDragY = 0;
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
let baseFov = 75;
let doubleTapSprint = false;
let lastMoveKeyCode = '';
let lastMoveKeyTime = 0;
let sprintDrainTimer = 0;
let lastExhaustToastTime = 0;
let isSprintingNow = false;
let pointerLocked = false;
let currentHit = null;
let selfWalkPhase = 0;
let stepSoundTimer = 0;

// Hold-to-mine & hold-to-place state
let isLeftDown = false;
let isRightDown = false;
let rightPlaceTimer = 0;
let miningTargetKey = null;
let miningElapsed = 0;
let miningDuration = 0.5;
let hitSoundTimer = 0;

const PLAYER_RADIUS = 0.28;
const PLAYER_HEIGHT = 1.72;
const EYE_HEIGHT = 1.54;
const keys = new Set();

// Pre-allocated scratch math objects & cached HUD refs (zero per-frame GC!)
const _eyePos = new THREE.Vector3();
const _lookDir = new THREE.Vector3();
const _camPos = new THREE.Vector3();
const _euler = new THREE.Euler(0, 0, 0, 'YXZ');
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _move = new THREE.Vector3();
const _loginSkyOrigin = new THREE.Vector3(0, 20, 0);
const elHudCoords = document.getElementById('hud-coords');
const elHudTargetBlock = document.getElementById('hud-target-block');
const elHudTime = document.getElementById('hud-time');
let lastCoordsStr = '';
let lastTargetBlockStr = '';
let lastTimeStr = '';
let lastSentPose = '';

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

function setBrushMode(idx) {
  brushModeIdx = ((idx % BRUSH_MODES.length) + BRUSH_MODES.length) % BRUSH_MODES.length;
  const m = BRUSH_MODES[brushModeIdx];
  const btn = document.getElementById('btn-brush');
  if (btn) {
    btn.textContent = m.label;
    btn.style.borderColor = brushModeIdx > 0 ? '#38bdf8' : '';
  }
  ui.toast(`${m.label} — ${m.desc} (End: 1×1 · Ctrl+Z: 되돌리기)`, 'info');
}

function toggleBrushMode(delta = 1) {
  setBrushMode(brushModeIdx + delta);
}

function computeBrushPositions(px, py, pz) {
  if (currentWorldMode === 'center') return null;
  const mode = BRUSH_MODES[brushModeIdx].id;
  if (mode === 'single') return null;
  const out = [];
  // Determine horizontal axis perpendicular to player look direction (for rows & walls)
  const facingX = Math.abs(Math.sin(yaw)) > Math.abs(Math.cos(yaw));
  if (mode === 'floor3') {
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) out.push({ x: px + dx, y: py, z: pz + dz });
  } else if (mode === 'floor5') {
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) out.push({ x: px + dx, y: py, z: pz + dz });
  } else if (mode === 'row5') {
    for (let i = -2; i <= 2; i++) out.push(facingX ? { x: px, y: py, z: pz + i } : { x: px + i, y: py, z: pz });
  } else if (mode === 'col5') {
    for (let dy = 0; dy < 5; dy++) out.push({ x: px, y: py + dy, z: pz });
  } else if (mode === 'wall53') {
    for (let dy = 0; dy < 3; dy++) {
      for (let i = -2; i <= 2; i++) {
        out.push(facingX ? { x: px, y: py + dy, z: pz + i } : { x: px + i, y: py + dy, z: pz });
      }
    }
  }
  return out;
}

let touchJumpHeld = false;
let touchDescendHeld = false;
let isTouchMining = false;

function toggleFlyMode() {
  flyMode = !flyMode;
  playerVel.y = 0;
  document.getElementById('hud-mode').textContent = flyMode
    ? '🕊️ 비행 모드 (Space↑ / Shift↓)'
    : '🚶 걷기 (Space×2 비행)';
  touchControls.setFlyMode(flyMode);
}

function toggleCameraView() {
  thirdPerson = !thirdPerson;
  if (fpHand) fpHand.setVisible(!thirdPerson);
  if (selfRig) selfRig.group.visible = thirdPerson;
  ui.toast(thirdPerson ? '📷 3인칭 시점 (V키로 전환)' : '👁️ 1인칭 시점', 'info');
}

const touchControls = new TouchControls(canvas, {
  onLook: (dx, dy) => {
    if (!joined || ui.openModalId || ui.chatOpen) return;
    const sens = 0.0055 * mouseSensitivity;
    yaw -= dx * sens;
    pitch -= dy * sens * (invertY ? -1 : 1);
    pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, pitch));
  },
  onMineStart: () => {
    if (!joined || ui.openModalId || ui.chatOpen) return;
    const { eyePos, lookDir } = getEyeAndLook();
    const trainHitL = worldExtras.raycastTrains(eyePos, lookDir, 5.5);
    if (trainHitL) {
      fpHand?.triggerSwing();
      sound.playBreak('stone', trainHitL.point);
      if (ridingTrain?.trainId === trainHitL.trainId) dismountTrain(false);
      send({ type: 'train_remove', trainId: trainHitL.trainId });
      return;
    }
    const animalHit = animalRenderer.raycast(eyePos, lookDir, 4.8);
    if (animalHit) {
      fpHand?.triggerSwing();
      sound.playAnimal(animalHit.type, animalHit.point);
      send({ type: 'animal_interact', id: animalHit.id, action: 'hit' });
      return;
    }
    isTouchMining = true;
    fpHand?.triggerSwing();
  },
  onMineEnd: () => {
    isTouchMining = false;
    resetMining();
  },
  onUse: () => {
    if (!joined || ui.openModalId || ui.chatOpen) return;
    handleRightClickOrInteract(false);
  },
  onJumpStart: () => { touchJumpHeld = true; },
  onJumpEnd: () => { touchJumpHeld = false; },
  onDescendStart: () => { touchDescendHeld = true; },
  onDescendEnd: () => { touchDescendHeld = false; },
  onFlyToggle: () => { if (joined) toggleFlyMode(); },
  onToolSwitch: () => { if (joined) ui.pressToolSwitchQ(); },
  onChat: () => { if (joined) ui.openChat(); },
  onViewToggle: () => { if (joined) toggleCameraView(); },
  onUndo: () => { if (joined) send({ type: 'block_undo_edit' }); }
});

let eyedropperMode = false;
let cutMode = false;
function setEyedropperMode(on) {
  eyedropperMode = !!on;
  if (eyedropperMode && cutMode) setCutMode(false);
  const btn = document.getElementById('btn-eyedropper');
  if (btn) btn.classList.toggle('active-tool', eyedropperMode);
  if (eyedropperMode) ui.toast('💧 스포이드 활성화! 복사할 블록을 클릭하세요. (C로 취소)', 'info');
}
function setCutMode(on) {
  cutMode = !!on;
  if (cutMode && eyedropperMode) setEyedropperMode(false);
  const btn = document.getElementById('btn-cut-move');
  if (btn) btn.classList.toggle('active-tool', cutMode);
  if (cutMode) ui.toast('✂️ 잘라내기 활성화! 옮길 블록(표지판·가구 등)을 클릭하세요. (X로 취소)', 'info');
}
function handleCutActionC() {
  if (!joined || currentWorldMode === 'job') return;
  const res = ui.pressCutSlotC();
  if (res === 'empty') {
    setCutMode(!cutMode);
  } else {
    if (cutMode) setCutMode(false);
  }
}
document.getElementById('btn-undo-edit')?.addEventListener('click', () => {
  if (joined) send({ type: 'block_undo_edit' });
});
document.getElementById('btn-eyedropper')?.addEventListener('click', () => {
  if (joined) setEyedropperMode(!eyedropperMode);
});
document.getElementById('btn-cut-move')?.addEventListener('click', () => {
  handleCutActionC();
});

function applyGameSettings(s) {
  baseFov = s.fov || 75;
  camera.fov = baseFov;
  camera.far = Math.max(120, (s.viewDist || 125) + 65);
  camera.updateProjectionMatrix();
  scene.fog.near = Math.max(18, (s.viewDist || 125) * 0.38);
  scene.fog.far = s.viewDist || 125;
  mouseSensitivity = s.sensitivity || 1.0;
  invertY = !!s.invertY;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, s.quality || 2));
  const themeFilters = {
    default: 'none',
    pastel: 'saturate(0.82) brightness(1.08) contrast(0.94)',
    vivid: 'saturate(1.32) contrast(1.06)',
    retro: 'sepia(0.22) contrast(1.14) saturate(1.1)'
  };
  canvas.style.filter = themeFilters[s.theme] || 'none';
  sound.setVolume(typeof s.volume === 'number' ? s.volume : 1.0);
  if (worldRenderer) {
    worldRenderer.particlesEnabled = s.particles !== false;
    worldRenderer.setViewDistance(s.viewDist || 125);
  }
  elHudCoords.classList.toggle('hidden', s.showCoords === false);
  touchControls.setEnabled(!!s.touchUI);
  remoteLook = !!s.remoteLook;
  if (remoteLook && document.pointerLockElement) document.exitPointerLock();
  const hint = document.getElementById('play-hint');
  if (hint) {
    hint.textContent = remoteLook
      ? '🖥️ 원격 모드: 우클릭 드래그·방향키(←→↑↓)로 시점 회전 · 좌클릭 채굴 · 짧은 우클릭 설치/열기'
      : '화면을 클릭하여 1인칭 조작 시작 · ESC로 커서 해제 · V: 1/3인칭 전환';
    hint.classList.toggle('hidden', pointerLocked || !!s.touchUI);
  }
}

function warpPlayer(x, y, z, label = '') {
  playerPos.set(x, y, z);
  playerVel.set(0, 0, 0);
  sound.playWarp();
  if (label) ui.toast(`🌀 ${label}(으)로 순간이동했습니다!`, 'success');
}

function applyBombKnockback(ex, ey, ez, radius, maxPower, popOutOfFill = false) {
  if (!joined) return;
  const dx = playerPos.x - ex;
  const dy = (playerPos.y + 0.9) - ey;
  const dz = playerPos.z - ez;
  const dist = Math.hypot(dx, dy, dz);
  if (dist >= radius) return;

  const closeness = Math.max(0.22, 1 - dist / radius);
  let hDist = Math.hypot(dx, dz);
  let nx, nz;
  if (hDist < 0.15) {
    const ang = Math.random() * Math.PI * 2;
    nx = Math.cos(ang);
    nz = Math.sin(ang);
  } else {
    nx = dx / hDist;
    nz = dz / hDist;
  }

  // If fill_bomb fills blocks right around the player, immediately pop them outside the filled sphere so they never suffocate!
  if (popOutOfFill && dist < 5.0) {
    const escapeY = Math.max(playerPos.y, ey + 4.35);
    playerPos.set(
      ex + nx * Math.max(hDist, 2.2),
      escapeY,
      ez + nz * Math.max(hDist, 2.2)
    );
  }

  const hPower = maxPower * (0.4 + 0.85 * closeness);
  playerVel.x = nx * hPower;
  playerVel.z = nz * hPower;
  playerVel.y = Math.max(playerVel.y, 7.2 + maxPower * 0.42 * closeness);
  onGround = false;
}

const ui = new GameUI({
  send,
  getPlayerBlockPos,
  getFrontPos,
  regionVis,
  onCutKey: () => handleCutActionC(),
  get projector() { return projector; },
  onToggleSound: () => {
    sound.setMuted(!sound.muted);
    return sound.muted;
  },
  onToggleBgm: () => sound.toggleBgm(),
  onNextBgm: () => sound.nextBgmTrack().title,
  onToggleBrush: () => toggleBrushMode(),
  onApplySettings: (s) => applyGameSettings(s),
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
  worldExtras.syncRemoteLinks([]);
  if (selfRig) { scene.remove(selfRig.group); selfRig = null; }
  if (fpHand) { camera.remove(fpHand.root); fpHand = null; }
  if (projector) projector.clear();
  document.getElementById('hud').classList.add('hidden');
  document.getElementById('login-overlay').classList.remove('hidden');
  document.getElementById('nickname-input').focus();
}

// Login
const loginForm = document.getElementById('login-form');
const nickInput = document.getElementById('nickname-input');
const loginError = document.getElementById('login-error');

// World mode selector on Login Screen
document.getElementById('elevator-hud')?.addEventListener('pointerdown', (e) => e.stopPropagation());
document.getElementById('elevator-hud')?.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
document.querySelectorAll('#elev-floor-btns .elev-btn').forEach((btn) => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const floor = Number(btn.dataset.floor);
    if (floor >= 1 && floor <= 7) send({ type: 'elevator_call', floor });
  });
});

// Sandbox World: Train Boarding & Retrieval HUD (Elevator-style!)
let ridingTrain = null; // { trainId, unitIndex }
let activeNearbyTrain = null;
let _lastTrainHudSig = '';

function boardTrainUnit(trainId, unitIndex) {
  const pose = worldExtras.getTrainUnitPose(trainId, unitIndex);
  if (!pose) return;
  const clamped = Math.max(0, Math.min(pose.unitCount - 1, Number(unitIndex) || 0));
  ridingTrain = { trainId, unitIndex: clamped };
  if (flyMode) {
    flyMode = false;
    touchControls.setFlyMode(false);
  }
  playerPos.set(pose.x, pose.y + 0.56, pose.z);
  playerVel.set(0, 0, 0);
  onGround = true;
  sound.playDoor();
  ui.toast(clamped === 0 ? '🚂 기관차에 탑승했습니다! (Space/하차 버튼으로 하차)' : `🚃 기차 ${clamped}번째 객차에 탑승했습니다! (Space/하차 버튼으로 하차)`, 'success');
}

function dismountTrain(showToast = true) {
  if (!ridingTrain) return;
  const pose = worldExtras.getTrainUnitPose(ridingTrain.trainId, ridingTrain.unitIndex);
  ridingTrain = null;
  if (pose) {
    // Step cleanly off to the right side of the car, or slightly above if blocked
    const sideX = pose.x + Math.cos(pose.yaw || 0) * 1.15;
    const sideZ = pose.z - Math.sin(pose.yaw || 0) * 1.15;
    if (!collides(sideX, pose.y + 0.1, sideZ)) {
      playerPos.set(sideX, pose.y + 0.12, sideZ);
    } else {
      playerPos.set(pose.x, pose.y + 1.15, pose.z);
    }
    playerVel.set(0, 0, 0);
  }
  if (showToast) ui.toast('🚶 기차에서 하차했습니다.', 'info');
}

document.getElementById('train-hud')?.addEventListener('pointerdown', (e) => e.stopPropagation());
document.getElementById('train-hud')?.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
document.getElementById('btn-train-toggle')?.addEventListener('click', (e) => {
  e.stopPropagation();
  if (!ridingTrain) {
    ui.toast('🚂 먼저 기차를 우클릭해서 탑승한 뒤 출발해 주세요!', 'info');
    return;
  }
  sound.playDoor();
  send({ type: 'train_toggle', trainId: ridingTrain.trainId });
});
document.getElementById('btn-train-dismount')?.addEventListener('click', (e) => {
  e.stopPropagation();
  dismountTrain(true);
});
document.getElementById('btn-train-retrieve')?.addEventListener('click', (e) => {
  e.stopPropagation();
  const tid = ridingTrain?.trainId || activeNearbyTrain?.trainId;
  if (!tid) return;
  if (ridingTrain?.trainId === tid) dismountTrain(false);
  sound.playBreak('stone', playerPos);
  send({ type: 'train_remove', trainId: tid });
});

document.querySelectorAll('.mode-card').forEach((card) => {
  card.addEventListener('click', () => {
    document.querySelectorAll('.mode-card').forEach(c => c.classList.remove('active'));
    card.classList.add('active');
    selectedLoginWorld = card.dataset.world || 'sandbox';
  });
});

function connectAndJoin(nickname, adminPassword, errorEl) {
  errorEl.textContent = '서버에 연결 중...';
  if (ws) { ws.close(); ws = null; }
  ws = new WebSocket(buildWsUrl());
  ws.addEventListener('open', () => send({ type: 'join', nickname, adminPassword, world: selectedLoginWorld }));
  ws.addEventListener('message', (ev) => handleServerMessage(JSON.parse(ev.data)));
  ws.addEventListener('close', () => {
    if (joined) {
      ui.toast('서버와 연결이 종료되었습니다. (개인 가방 초기화)', 'warn');
      resetToLogin();
    }
  });
  ws.addEventListener('error', () => { errorEl.textContent = '서버에 연결할 수 없습니다.'; });
}

loginForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const nickname = nickInput.value.trim();
  if (!nickname) return;
  connectAndJoin(nickname, '', loginError);
});

function handleServerMessage(msg) {
  switch (msg.type) {
    case 'join_error':
      loginError.textContent = msg.message || '입장에 실패했습니다.';
      break;

    case 'welcome': {
      loginError.textContent = '';
      joined = true;
      currentWorldMode = msg.worldMode || 'sandbox';
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
      worldExtras.syncBeacons(msg.beacons || {});
      worldExtras.syncElevator(msg.elevator || null);
      worldExtras.syncCenterPylon(msg.centerPylon || null);
      worldExtras.syncCenterNpcs(msg.centerNpcs || []);
      worldExtras.syncTrains(msg.trains || []);

      playerPos.set(selfPlayer.x, selfPlayer.y, selfPlayer.z);
      playerVel.set(0, 0, 0);
      yaw = selfPlayer.yaw || 0;
      pitch = selfPlayer.pitch || 0;

      if (!textures) textures = new TextureLibrary(catalog);
      remotePlayers.setAssets(catalog, textures);

      // Rebuild WorldRenderer if bounds changed (e.g. switching between 128x48x128 Sandbox & 64x24x64 Job Village)
      if (worldRenderer) {
        for (const g of worldRenderer.chunkGroups.values()) {
          worldRenderer._disposeGroup(g);
          worldRenderer.worldGroup.remove(g);
        }
        scene.remove(worldRenderer.worldGroup, worldRenderer.highlightBox, worldRenderer.crackBox, worldRenderer.brushGroup);
        worldRenderer = null;
        projector = null;
      }
      worldRenderer = new WorldRenderer(scene, textures, catalog, worldBounds);
      worldRenderer.showAdminBlocks = !!selfPlayer.isAdmin;
      worldRenderer.setFacings(msg.facings || {});
      worldExtras.setBeaconsVisible(!!selfPlayer.isAdmin);
      regionVis.setVisible(!!selfPlayer.isAdmin);
      const regToggle = document.getElementById('toggle-region-boxes');
      if (regToggle) regToggle.checked = !!selfPlayer.isAdmin;
      if (msg.worldRLE) {
        worldRenderer.loadFromRLE(msg.worldRLE);
      } else {
        worldRenderer.loadStreaming(msg.worldDeltas, playerPos);
      }

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
      ui.setServerConfig(msg.serverConfig);
      ui.setWorldMode(currentWorldMode, msg.cafeRecipes, msg.cafeFridgeItems, msg.jobOrder, msg.jobScore, msg.jobCompleted);
      ui.updateTools(msg.tools);
      ui.updateBag(msg.bag);
      ui.setRegions(msg.regions);
      ui.setBlueprints(msg.blueprints);
      ui.setSkins(msg.skins);

      remotePlayers.clear();
      for (const p of msg.players || []) remotePlayers.addOrUpdate(p);
      ui.updatePlayersList(selfPlayer, remotePlayers.list(), maxPlayers);

      document.getElementById('login-overlay').classList.add('hidden');
      document.getElementById('hud').classList.remove('hidden');
      sound.startBgm();
      document.getElementById('chat-messages').innerHTML = '';
      ui.addChatMessage({
        system: true,
        text: currentWorldMode === 'job'
          ? '☕ 직업 체험 마을에 오신 것을 환영합니다! 앞쪽 카페로 들어가 바리스타 체험을 시작해 보세요!'
          : currentWorldMode === 'center'
            ? '🏢 서울시립장애인행복플러스센터 구역에 입장했습니다! 1층 도면 공간과 2~5층·옥상 테라스를 둘러보세요! (문 우클릭 개폐 · Space×2 비행)'
            : 'Boxworld에 오신 것을 환영합니다! 화로(4,17,3) · 광산(-9,16,-9) · 밭(8,16,-2) · 시간 변경: /낮 /노을 /밤'
      });
      break;
    }

    case 'job_state':
      if (msg.served) sound.playCraft();
      ui.updateJobState(msg.jobOrder, msg.jobScore, msg.jobCompleted);
      break;

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

    case 'sign_board_data':
      ui.openSignBoard(msg);
      break;

    case 'sign_board_posts':
      ui.updateSignBoardPosts(msg.x, msg.y, msg.z, msg.posts);
      break;

    case 'portals_update':
      currentPortals = msg.portals || {};
      worldExtras.syncPortals(currentPortals);
      break;

    case 'beacons_update':
      worldExtras.syncBeacons(msg.beacons || {});
      break;

    case 'tnt_ignited':
      worldExtras.igniteTNT(msg.x, msg.y, msg.z, msg.durationMs);
      sound.playHit('dirt', { x: msg.x + 0.5, y: msg.y + 0.5, z: msg.z + 0.5 });
      if (!msg.durationMs || msg.durationMs >= 2000) {
        ui.toast('🧨 치이익... TNT가 곧 폭발합니다!', 'warn');
      }
      break;

    case 'fuse_burn':
      worldExtras.burnFuse(msg.x, msg.y, msg.z);
      sound.playHit('dirt', { x: msg.x + 0.5, y: msg.y + 0.3, z: msg.z + 0.5 });
      break;

    case 'remote_links_update':
      worldExtras.syncRemoteLinks(msg.links || []);
      break;

    case 'tnt_explode': {
      const ex = msg.x + 0.5, ey = msg.y + 0.5, ez = msg.z + 0.5;
      sound.playExplosion({ x: ex, y: ey, z: ez });
      worldExtras.explodeTNT(msg.x, msg.y, msg.z);
      if (worldRenderer) {
        worldRenderer.spawnBreakParticles(msg.x, msg.y, msg.z, 'tnt', 34);
        worldRenderer.spawnBreakParticles(msg.x, msg.y + 1, msg.z, 'stone', 22);
      }
      applyBombKnockback(ex, ey, ez, 8.5, 19, false);
      const dist = Math.hypot(playerPos.x - ex, playerPos.y - ey, playerPos.z - ez);
      if (dist < 26) {
        cameraShake = Math.max(cameraShake, (1 - dist / 26) * 0.65);
      }
      break;
    }

    case 'fill_bomb_ignited':
      worldExtras.igniteTNT(msg.x, msg.y, msg.z, msg.durationMs, 0x22c55e, 0x4ade80);
      sound.playHit('dirt', { x: msg.x + 0.5, y: msg.y + 0.5, z: msg.z + 0.5 });
      if (!msg.durationMs || msg.durationMs >= 1800) {
        ui.toast('🌱 채움 폭탄 작동! 곧 주변 재질로 빈 공간이 채워집니다...', 'success');
      }
      break;

    case 'fill_bomb_explode': {
      const ex = msg.x + 0.5, ey = msg.y + 0.5, ez = msg.z + 0.5;
      const fb = msg.filledBlock || 'dirt';
      sound.playCraft();
      worldExtras.explodeFillBomb(msg.x, msg.y, msg.z);
      if (worldRenderer) {
        worldRenderer.spawnBreakParticles(msg.x, msg.y + 1, msg.z, fb, 26);
      }
      applyBombKnockback(ex, ey, ez, 7.5, 17, true);
      const dist = Math.hypot(playerPos.x - ex, playerPos.y - ey, playerPos.z - ez);
      if (dist < 18) {
        cameraShake = Math.max(cameraShake, (1 - dist / 18) * 0.28);
        const name = catalog[fb]?.name || fb;
        ui.toast(`🌱 주변 재질(${name})로 빈 공간을 채웠습니다!`, 'success');
      }
      break;
    }

    case 'water_bomb_ignited':
      worldExtras.igniteTNT(msg.x, msg.y, msg.z, msg.durationMs, 0x0284c7, 0x38bdf8);
      sound.playHit('glass', { x: msg.x + 0.5, y: msg.y + 0.5, z: msg.z + 0.5 });
      if (!msg.durationMs || msg.durationMs >= 1800) {
        ui.toast('💧 물 채움 폭탄 작동! 곧 주변 빈 공간에 물이 채워집니다...', 'info');
      }
      break;

    case 'water_bomb_explode': {
      const ex = msg.x + 0.5, ey = msg.y + 0.5, ez = msg.z + 0.5;
      sound.playWarp();
      worldExtras.explodeWaterBomb(msg.x, msg.y, msg.z);
      if (worldRenderer) {
        worldRenderer.spawnBreakParticles(msg.x, msg.y + 1, msg.z, 'water', 24);
      }
      applyBombKnockback(ex, ey, ez, 6.8, 13.5, false);
      const dist = Math.hypot(playerPos.x - ex, playerPos.y - ey, playerPos.z - ez);
      if (dist < 18) {
        cameraShake = Math.max(cameraShake, (1 - dist / 18) * 0.24);
        ui.toast('💧 주변 빈 공간에 물 블록을 채웠습니다!', 'success');
      }
      break;
    }

    case 'flatten_bomb_ignited':
      worldExtras.igniteTNT(msg.x, msg.y, msg.z, msg.durationMs, 0xf59e0b, 0xfacc15);
      sound.playHit('stone', { x: msg.x + 0.5, y: msg.y + 0.5, z: msg.z + 0.5 });
      if (!msg.durationMs || msg.durationMs >= 1800) {
        ui.toast('🏗️ 평탄화 폭탄 작동! 곧 5×5×5 영역이 깔끔하게 정리됩니다...', 'warn');
      }
      break;

    case 'flatten_bomb_explode': {
      const ex = msg.x + 0.5, ey = msg.y + 0.5, ez = msg.z + 0.5;
      sound.playExplosion({ x: ex, y: ey, z: ez });
      worldExtras.explodeFlattenBomb(msg.x, msg.y, msg.z);
      if (worldRenderer) {
        worldRenderer.spawnBreakParticles(msg.x, msg.y + 1, msg.z, 'stone', 26);
      }
      applyBombKnockback(ex, ey, ez, 8.0, 16, false);
      const dist = Math.hypot(playerPos.x - ex, playerPos.y - ey, playerPos.z - ez);
      if (dist < 22) {
        cameraShake = Math.max(cameraShake, (1 - dist / 22) * 0.45);
        ui.toast('🏗️ 5×5×5 평탄화가 완료되었습니다!', 'success');
      }
      break;
    }

    case 'config_update':
      ui.setServerConfig(msg.config);
      break;

    case 'vitals_update':
      ui.updateVitals(msg.hp, msg.hunger);
      break;

    case 'pong_check':
      if (typeof msg.ts === 'number') _wsPingMs = Math.max(0, Math.round(performance.now() - msg.ts));
      break;

    case 'elevator_state':
      worldExtras.syncElevator(msg.elevator);
      if (msg.chime) sound.playElevatorChime();
      break;

    case 'pylon_update':
      worldExtras.syncCenterPylon(msg.centerPylon);
      break;

    case 'npcs_update':
      worldExtras.syncCenterNpcs(msg.centerNpcs || []);
      break;

    case 'npc_edit_open':
      if (document.pointerLockElement) document.exitPointerLock();
      ui.openNpcEditor(msg.npc);
      break;

    case 'pick_select_slot':
      if (typeof msg.slotIndex === 'number') ui.setActiveSlot(msg.slotIndex);
      break;

    case 'cut_slot_update':
      ui.updateCutSlot(msg.cutSlot || null, !!msg.autoEquip);
      break;

    case 'world_reload':
      if (worldRenderer) {
        worldRenderer.setFacings(msg.facings || {});
        if (msg.worldRLE) worldRenderer.loadFromRLE(msg.worldRLE);
        else if (msg.worldDeltas) worldRenderer.loadStreaming(msg.worldDeltas, playerPos);
      }
      if (msg.signs) { currentSigns = msg.signs; worldExtras.syncSigns(currentSigns); }
      if (msg.portals) { currentPortals = msg.portals; worldExtras.syncPortals(currentPortals); }
      if (msg.beacons) worldExtras.syncBeacons(msg.beacons);
      if (msg.centerPylon !== undefined) worldExtras.syncCenterPylon(msg.centerPylon);
      if (msg.centerNpcs !== undefined) worldExtras.syncCenterNpcs(msg.centerNpcs);
      if (msg.regions) regionVis.setRegions(msg.regions);
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

    case 'trains_update':
      worldExtras.syncTrains(msg.trains || []);
      break;

    case 'train_event': {
      const pos = { x: (msg.x || 0) + 0.5, y: (msg.y || 0) + 1.0, z: (msg.z || 0) + 0.5 };
      if (msg.event === 'whistle') {
        sound.playTrainWhistle(pos);
        worldExtras.spawnTrainSteam(pos.x, pos.y - 0.5, pos.z, 10);
      } else if (msg.event === 'stop_red') {
        sound.playTrainBrake(pos);
        ui.toast('🟥 빨강 정지 카드 도착! 기차가 정지했습니다. (선두 우클릭: 다시 출발)', 'info');
      } else if (msg.event === 'reverse') {
        sound.playElevatorChime();
        worldExtras.spawnTrainSteam(pos.x, pos.y - 0.5, pos.z, 8);
        ui.toast('🟩 초록 역주행 카드! 기차가 방향을 바꿔 뒤로 주행합니다!', 'info');
      } else if (msg.event === 'stop_end') {
        sound.playTrainBrake(pos);
      }
      break;
    }

    case 'bag_update':
      ui.updateBag(msg.bag);
      break;

    case 'tools_update':
      ui.updateTools(msg.tools);
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
        worldRenderer.setBlock(msg.x, msg.y, msg.z, msg.block, msg.facing);
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
      ui.updateVitals(
        typeof msg.hp === 'number' ? msg.hp : (ui.hp + (msg.heal || 4)),
        typeof msg.curHunger === 'number' ? msg.curHunger : (ui.hunger + (msg.hunger || 6))
      );
      ui.toast(`🍎 ${msg.name}을(를) 먹어 배고픔과 체력을 회복했습니다!`, 'success');
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
      worldRenderer?.setShowAdminBlocks(!!msg.isAdmin);
      worldExtras.setBeaconsVisible(!!msg.isAdmin);
      regionVis.setVisible(!!msg.isAdmin);
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
  const heldId = ui.getActiveItemId();
  if (heldId === 'sabo_sword' && blockId && blockId !== 'bedrock') return 0.04;
  if (!bDef || !Number.isFinite(bDef.hardness)) return Infinity;
  // In Happiness Plus Center, hand-breaking takes 2x longer to prevent accidental break-through!
  if (selfPlayer?.isAdmin && currentWorldMode === 'center' && blockId !== 'bedrock') return 0.30;
  const heldDef = heldId ? catalog[heldId] : null;
  const isPreferred = heldDef && heldDef.kind === 'tool' && heldDef.toolType === bDef.preferredTool;
  const speed = isPreferred ? (heldDef.speed || 2.0) : 1.0;
  const base = Math.max(0.12, bDef.hardness / speed);
  return currentWorldMode === 'center' ? base * 2.0 : base;
}

function getEyeAndLook() {
  _eyePos.set(playerPos.x, playerPos.y + EYE_HEIGHT, playerPos.z);
  _euler.set(pitch, yaw, 0, 'YXZ');
  _lookDir.set(0, 0, -1).applyEuler(_euler);
  return { eyePos: _eyePos, lookDir: _lookDir };
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

  // 1.2 Check Staff NPC interaction on right-click (admin opens NPC editor modal; regular player sees greeting!)
  const npcHit = worldExtras.raycastNpcs(eyePos, lookDir, 5.5);
  if (npcHit) {
    fpHand?.triggerSwing();
    if (selfPlayer?.isAdmin) {
      if (document.pointerLockElement) document.exitPointerLock();
      sound.playOpen();
      ui.openNpcEditor(npcHit.npc);
    } else {
      ui.toast(`🧑‍💼 ${npcHit.npc?.name || '직원 NPC'}`, 'info');
    }
    return;
  }

  // 1.5 Check Train interaction on right-click:
  // - Outside train: holding train_car couples a car; otherwise right-clicking ANY part boards that car/engine!
  // - Inside train: right-clicking the locomotive starts/stops the train; right-clicking a passenger car opens cargo storage!
  const trainHit = worldExtras.raycastTrains(eyePos, lookDir, 6.0, ridingTrain);
  if (trainHit) {
    fpHand?.triggerSwing();
    const heldIdNow = ui.getActiveItemId();
    if (!ridingTrain) {
      if (heldIdNow === 'train_car') {
        send({ type: 'train_couple', trainId: trainHit.trainId, slotIndex: ui.getActiveBagIndex() });
      } else {
        boardTrainUnit(trainHit.trainId, trainHit.unitIndex);
      }
    } else if (trainHit.isEngine) {
      sound.playDoor();
      send({ type: 'train_toggle', trainId: trainHit.trainId });
    } else if (trainHit.unitIndex >= 1) {
      if (document.pointerLockElement) document.exitPointerLock();
      sound.playOpen();
      send({ type: 'train_car_open', trainId: trainHit.trainId, unitIndex: trainHit.unitIndex });
    }
    return;
  }

  // 2. Open Chest, Furnace, Bed, Door, Sign, TNT, Portal, & Job Village Cafe Stations
  if (currentHit) {
    if (currentHit.block === 'job_counter') {
      fpHand?.triggerSwing();
      sound.playOpen();
      send({ type: 'job_new_order' });
      return;
    }
    if (currentHit.block === 'job_espresso') {
      fpHand?.triggerSwing();
      sound.playCraft();
      send({ type: 'job_espresso' });
      return;
    }
    if (currentHit.block === 'job_fridge') {
      fpHand?.triggerSwing();
      sound.playOpen();
      ui.openModal('modal-job-fridge');
      return;
    }
    if (currentHit.block === 'job_mixer') {
      fpHand?.triggerSwing();
      sound.playOpen();
      ui.openModal('modal-job-mixer');
      return;
    }
    if (currentHit.block === 'job_pickup') {
      fpHand?.triggerSwing();
      send({ type: 'job_serve' });
      return;
    }
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
    if (currentHit.block.startsWith('door_')) {
      fpHand?.triggerSwing();
      sound.playDoor();
      send({ type: 'toggle_door', x: currentHit.x, y: currentHit.y, z: currentHit.z });
      return;
    }
    if (currentHit.block === 'lever_off' || currentHit.block === 'lever_on') {
      fpHand?.triggerSwing();
      sound.playDoor();
      send({ type: 'toggle_lever', x: currentHit.x, y: currentHit.y, z: currentHit.z });
      return;
    }
    if (currentHit.block.startsWith('btn_')) {
      fpHand?.triggerSwing();
      sound.playDoor();
      send({ type: 'press_button', x: currentHit.x, y: currentHit.y, z: currentHit.z });
      return;
    }
    if (currentHit.block === 'furn_toilet_closed' || currentHit.block === 'furn_toilet_open') {
      fpHand?.triggerSwing();
      sound.playDoor();
      send({ type: 'toggle_toilet', x: currentHit.x, y: currentHit.y, z: currentHit.z });
      return;
    }
    if (currentHit.block.startsWith('rail_') && currentHit.block !== 'rail_signal' && !currentHit.block.startsWith('rail_gate_')) {
      const heldNow = ui.getActiveItemId();
      if (heldNow === 'train_engine' && !ridingTrain) {
        fpHand?.triggerSwing();
        const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
        const dir = Math.abs(fx) > Math.abs(fz) ? (fx > 0 ? 1 : 3) : (fz < 0 ? 0 : 2);
        send({ type: 'train_spawn', x: currentHit.x, y: currentHit.y, z: currentHit.z, dir, slotIndex: ui.getActiveBagIndex() });
        return;
      }
      if (heldNow === 'train_car' && !ridingTrain) {
        fpHand?.triggerSwing();
        send({ type: 'train_couple_at', x: currentHit.x, y: currentHit.y, z: currentHit.z, slotIndex: ui.getActiveBagIndex() });
        return;
      }
      if ((heldNow === 'train_engine' || heldNow === 'train_car') && ridingTrain) {
        fpHand?.triggerSwing();
        sound.playDoor();
        send({ type: 'train_toggle', trainId: ridingTrain.trainId });
        return;
      }
      if (heldNow === 'rail_card_red' || heldNow === 'rail_card_yellow' || heldNow === 'rail_card_green') {
        fpHand?.triggerSwing();
        send({ type: 'rail_apply_card', x: currentHit.x, y: currentHit.y, z: currentHit.z, card: heldNow, slotIndex: ui.getActiveBagIndex() });
        return;
      }
      if (currentHit.block === 'rail_branch' || currentHit.block === 'rail_branch_turn' ||
          currentHit.block === 'rail_xbranch' || currentHit.block === 'rail_xbranch_turn') {
        fpHand?.triggerSwing();
        sound.playDoor();
        send({ type: 'toggle_rail_branch', x: currentHit.x, y: currentHit.y, z: currentHit.z });
        return;
      }
      // Prevent stacking a rail on top of another rail!
      if (heldNow && heldNow.startsWith('rail_') && heldNow !== 'rail_signal' && !heldNow.startsWith('rail_gate_')) {
        return;
      }
    }
    if (currentHit.block === 'tnt' || currentHit.block === 'fill_bomb' || currentHit.block === 'water_bomb' || currentHit.block === 'flatten_bomb') {
      fpHand?.triggerSwing();
      const heldIdNow = ui.getActiveItemId();
      if (heldIdNow === 'detonator') {
        send({ type: 'tnt_link_remote', x: currentHit.x, y: currentHit.y, z: currentHit.z, slotIndex: ui.getActiveBagIndex() });
      } else if (currentHit.block === 'fill_bomb') {
        send({ type: 'fill_bomb_ignite', x: currentHit.x, y: currentHit.y, z: currentHit.z });
      } else if (currentHit.block === 'water_bomb') {
        send({ type: 'water_bomb_ignite', x: currentHit.x, y: currentHit.y, z: currentHit.z });
      } else if (currentHit.block === 'flatten_bomb') {
        send({ type: 'flatten_bomb_ignite', x: currentHit.x, y: currentHit.y, z: currentHit.z });
      } else {
        send({ type: 'tnt_ignite', x: currentHit.x, y: currentHit.y, z: currentHit.z });
      }
      return;
    }
    if (currentHit.block === 'fuse') {
      fpHand?.triggerSwing();
      send({ type: 'fuse_ignite', x: currentHit.x, y: currentHit.y, z: currentHit.z });
      return;
    }
    if (currentHit.block === 'npc_beacon') {
      if (selfPlayer?.isAdmin) {
        if (document.pointerLockElement) document.exitPointerLock();
        fpHand?.triggerSwing();
        sound.playOpen();
        send({ type: 'npc_beacon_open', x: currentHit.x, y: currentHit.y, z: currentHit.z });
      }
      return;
    }
    if (currentHit.block === 'sign' || currentHit.block === 'sign_fixed') {
      if (document.pointerLockElement) document.exitPointerLock();
      fpHand?.triggerSwing();
      sound.playOpen();
      send({ type: 'sign_board_open', x: currentHit.x, y: currentHit.y, z: currentHit.z });
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

  const activeIdx = ui.getActiveBagIndex();

  // 2.5 Remote Detonator trigger (right-click anywhere away from TNT to detonate linked TNTs!)
  if (heldId === 'detonator') {
    fpHand?.triggerSwing();
    send({ type: 'tnt_remote_detonate', slotIndex: activeIdx });
    return;
  }

  // 3. Hoe tilling grass/dirt -> farmland
  if (currentHit && heldDef?.toolType === 'hoe' && (currentHit.block === 'grass' || currentHit.block === 'dirt')) {
    fpHand?.triggerSwing();
    send({
      type: 'till_soil',
      x: currentHit.x, y: currentHit.y, z: currentHit.z,
      slotIndex: activeIdx,
      toolType: ui.getActiveToolType()
    });
    return;
  }

  // 4. Plant wheat seeds on farmland
  if (currentHit && heldDef?.kind === 'seed') {
    fpHand?.triggerSwing();
    send({ type: 'plant_seed', x: currentHit.placeX, y: currentHit.placeY, z: currentHit.placeZ, slotIndex: activeIdx });
    return;
  }

  // 5. Eat food
  if (heldDef?.kind === 'food') {
    fpHand?.triggerSwing();
    send({ type: 'eat_food', slotIndex: activeIdx });
    return;
  }

  // 6. Place block (1x1 or Multi-Mode Builder Brush: floor3/floor5/row5/col5/wall53!)
  if (!currentHit || !heldDef || heldDef.kind !== 'block') return;
  const px = currentHit.placeX, py = currentHit.placeY, pz = currentHit.placeZ;

  const brushPositions = computeBrushPositions(px, py, pz);
  if (brushPositions && !['chest', 'furnace', 'bed', 'sign', 'sign_fixed', 'portal', 'tnt', 'sapling', 'npc_beacon'].includes(heldDef.id)) {
    fpHand?.triggerSwing();
    send({ type: 'block_place_brush', positions: brushPositions, slotIndex: activeIdx });
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
  // Compute 4-way cardinal facing: for wall-mounted ladder & buttons, stick flush to the clicked vertical wall face!
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  let facing = Math.abs(fx) > Math.abs(fz) ? (fx > 0 ? 1 : 3) : (fz < 0 ? 0 : 2);
  if ((heldDef.id === 'ladder' || heldDef.id.startsWith('btn_')) && currentHit) {
    const nX = px - currentHit.x;
    const nZ = pz - currentHit.z;
    if (nX === 1) facing = 1;       // clicked +X face -> stick to West wall, facing East
    else if (nX === -1) facing = 3; // clicked -X face -> stick to East wall, facing West
    else if (nZ === 1) facing = 2;  // clicked +Z face -> stick to North wall, facing South
    else if (nZ === -1) facing = 0; // clicked -Z face -> stick to South wall, facing North
    else facing = (facing + 2) & 3; // placed on top/bottom -> face player
  }
  if (ui.isUsingCutSlot()) {
    send({ type: 'block_paste', x: px, y: py, z: pz, facing });
  } else {
    send({ type: 'block_place', x: px, y: py, z: pz, slotIndex: activeIdx, facing });
  }
}

canvas.addEventListener('click', () => {
  if (!joined || ui.openModalId || ui.chatOpen || touchControls.enabled || remoteLook) return;
  if (!pointerLocked) canvas.requestPointerLock?.();
});

document.addEventListener('pointerlockchange', () => {
  pointerLocked = document.pointerLockElement === canvas;
  document.getElementById('play-hint').classList.toggle('hidden', pointerLocked || touchControls.enabled);
  if (!pointerLocked && !remoteLook) { isLeftDown = false; isRightDown = false; resetMining(); }
});

document.addEventListener('mousemove', (e) => {
  const sens = 0.0022 * mouseSensitivity;
  if (remoteLook && isRightDragging) {
    const dx = e.clientX - lastDragX;
    const dy = e.clientY - lastDragY;
    lastDragX = e.clientX;
    lastDragY = e.clientY;
    dragMovedDist += Math.hypot(dx, dy);
    yaw -= dx * sens * 1.45;
    pitch -= dy * sens * 1.45 * (invertY ? -1 : 1);
    pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, pitch));
    return;
  }
  if (!pointerLocked) return;
  // Filter out RDP/VNC absolute-cursor warp spikes (>180px in a single event)
  if (Math.abs(e.movementX) > 180 || Math.abs(e.movementY) > 180) return;
  yaw -= e.movementX * sens;
  pitch -= e.movementY * sens * (invertY ? -1 : 1);
  pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, pitch));
});

canvas.addEventListener('mousedown', (e) => {
  if (!joined || ui.openModalId || ui.chatOpen) return;
  if (!pointerLocked && !remoteLook) return;
  if (e.button === 0) {
    if (cutMode && currentHit) {
      send({ type: 'block_cut', x: currentHit.x, y: currentHit.y, z: currentHit.z });
      setCutMode(false);
      return;
    }
    if (eyedropperMode && currentHit) {
      send({ type: 'block_pick', x: currentHit.x, y: currentHit.y, z: currentHit.z, slotIndex: ui.getActiveBagIndex() });
      setEyedropperMode(false);
      return;
    }
    // Check if clicking an animal or train first
    const { eyePos, lookDir } = getEyeAndLook();
    const trainHitL = worldExtras.raycastTrains(eyePos, lookDir, 5.5);
    if (trainHitL) {
      fpHand?.triggerSwing();
      sound.playBreak('stone', trainHitL.point);
      if (ridingTrain?.trainId === trainHitL.trainId) dismountTrain(false);
      send({ type: 'train_remove', trainId: trainHitL.trainId });
      return;
    }
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
    if (cutMode && currentHit) {
      send({ type: 'block_cut', x: currentHit.x, y: currentHit.y, z: currentHit.z });
      setCutMode(false);
      return;
    }
    if (eyedropperMode && currentHit) {
      send({ type: 'block_pick', x: currentHit.x, y: currentHit.y, z: currentHit.z, slotIndex: ui.getActiveBagIndex() });
      setEyedropperMode(false);
      return;
    }
    if (remoteLook) {
      isRightDragging = true;
      dragMovedDist = 0;
      lastDragX = e.clientX;
      lastDragY = e.clientY;
    } else {
      isRightDown = true;
      rightPlaceTimer = 0.24;
      handleRightClickOrInteract(false);
    }
  } else if (e.button === 1 && !remoteLook) {
    e.preventDefault();
    if (currentHit) {
      send({ type: 'block_pick', x: currentHit.x, y: currentHit.y, z: currentHit.z, slotIndex: ui.getActiveBagIndex() });
    }
  } else if (e.button === 1 && remoteLook) {
    e.preventDefault();
    isRightDragging = true;
    dragMovedDist = 999; // Middle-drag only rotates camera
    lastDragX = e.clientX;
    lastDragY = e.clientY;
  }
});

window.addEventListener('mouseup', (e) => {
  if (e.button === 0) { isLeftDown = false; resetMining(); }
  if (e.button === 2) { isRightDown = false; }
  if ((e.button === 2 || e.button === 1) && isRightDragging) {
    isRightDragging = false;
    if (e.button === 2 && dragMovedDist < 7 && joined && !ui.openModalId && !ui.chatOpen) {
      handleRightClickOrInteract(false);
    }
  }
});

window.addEventListener('wheel', (e) => {
  if (!joined || ui.openModalId || ui.chatOpen) return;
  if (e.deltaY > 0) ui.setActiveSlot(ui.activeSlot + 1);
  else if (e.deltaY < 0) ui.setActiveSlot(ui.activeSlot - 1);
});

let isKeyLeftDown = false;
let isKeyRightDown = false;

window.addEventListener('blur', () => {
  isKeyLeftDown = false;
  isKeyRightDown = false;
  isLeftDown = false;
  isRightDown = false;
  resetMining();
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
  if (e.code === 'KeyR') { e.preventDefault(); ui.toggleModal('modal-craft'); return; }
  if (e.code === 'KeyK') { e.preventDefault(); ui.toggleModal('modal-skin'); return; }
  if (e.code === 'KeyB') { e.preventDefault(); ui.toggleModal('modal-blueprint'); return; }
  if (e.code === 'KeyO') { e.preventDefault(); ui.toggleModal('modal-settings'); return; }
  if (e.code === 'KeyP') { e.preventDefault(); ui.toggleModal('modal-admin'); return; }
  if (e.code === 'KeyM') { e.preventDefault(); ui.toggleModal('modal-map'); return; }
  if (e.code === 'KeyG') { e.preventDefault(); ui.toggleModal('modal-emote'); return; }
  if (e.code === 'KeyQ') { e.preventDefault(); ui.pressToolSwitchQ(); return; }
  if (e.code === 'PageUp') { e.preventDefault(); toggleBrushMode(1); return; }
  if (e.code === 'PageDown') { e.preventDefault(); toggleBrushMode(-1); return; }
  if (e.code === 'End') { e.preventDefault(); setBrushMode(0); return; }
  if (e.code === 'KeyZ') {
    e.preventDefault();
    send({ type: 'block_undo_edit' });
    return;
  }
  if (e.code === 'KeyC') {
    e.preventDefault();
    setEyedropperMode(!eyedropperMode);
    return;
  }
  if (e.code === 'KeyX') {
    e.preventDefault();
    handleCutActionC();
    return;
  }
  if (e.code === 'KeyF') { e.preventDefault(); handleRightClickOrInteract(false); return; }
  if (e.code === 'BracketLeft' || e.code === 'BracketRight') {
    e.preventDefault();
    if (!ui.openModalId && !ui.chatOpen) {
      if (ui.usingTool || ui.usingCut) {
        // Return immediately to the last selected hotbar slot (e.g. slot 5 after using Q tool!)
        ui.setActiveSlot(ui.activeSlot);
      } else {
        const delta = e.code === 'BracketLeft' ? -1 : 1;
        ui.setActiveSlot(ui.activeSlot + delta);
      }
    }
    return;
  }
  if (e.code === 'KeyL') {
    e.preventDefault();
    if (!e.repeat && !ui.openModalId && !ui.chatOpen && currentWorldMode === 'sandbox') {
      const { eyePos, lookDir } = getEyeAndLook();
      const hit = worldExtras.raycastTrains(eyePos, lookDir, 7.5, ridingTrain);
      if (hit) {
        boardTrainUnit(hit.trainId, hit.unitIndex);
      } else if (ridingTrain) {
        dismountTrain(true);
      } else {
        ui.toast('🚂 탑승할 기차나 객차를 화면 가운데 커서로 바라보고 L 키를 눌러주세요!', 'info');
      }
    }
    return;
  }
  if (e.code === 'Semicolon' || e.code === 'KeyH') {
    e.preventDefault();
    if (!e.repeat && !ui.openModalId && !ui.chatOpen) {
      if (cutMode && currentHit) {
        send({ type: 'block_cut', x: currentHit.x, y: currentHit.y, z: currentHit.z });
        setCutMode(false);
        return;
      }
      if (eyedropperMode && currentHit) {
        send({ type: 'block_pick', x: currentHit.x, y: currentHit.y, z: currentHit.z, slotIndex: ui.getActiveBagIndex() });
        setEyedropperMode(false);
        return;
      }
      const { eyePos, lookDir } = getEyeAndLook();
      const trainHitL = worldExtras.raycastTrains(eyePos, lookDir, 5.5);
      if (trainHitL) {
        fpHand?.triggerSwing();
        sound.playBreak('stone', trainHitL.point);
        if (ridingTrain?.trainId === trainHitL.trainId) dismountTrain(false);
        send({ type: 'train_remove', trainId: trainHitL.trainId });
        return;
      }
      const animalHit = animalRenderer.raycast(eyePos, lookDir, 4.8);
      if (animalHit) {
        fpHand?.triggerSwing();
        sound.playAnimal(animalHit.type, animalHit.point);
        send({ type: 'animal_interact', id: animalHit.id, action: 'hit' });
        return;
      }
      isKeyLeftDown = true;
      fpHand?.triggerSwing();
    }
    return;
  }
  if (e.code === 'Quote' || e.code === 'KeyJ') {
    e.preventDefault();
    if (!e.repeat && !ui.openModalId && !ui.chatOpen) {
      if (cutMode && currentHit) {
        send({ type: 'block_cut', x: currentHit.x, y: currentHit.y, z: currentHit.z });
        setCutMode(false);
        return;
      }
      if (eyedropperMode && currentHit) {
        send({ type: 'block_pick', x: currentHit.x, y: currentHit.y, z: currentHit.z, slotIndex: ui.getActiveBagIndex() });
        setEyedropperMode(false);
        return;
      }
      isKeyRightDown = true;
      rightPlaceTimer = 0.24;
      handleRightClickOrInteract(false);
    }
    return;
  }

  if (e.code === 'F3') {
    e.preventDefault();
    debugHudVisible = !debugHudVisible;
    elDebugHud?.classList.toggle('hidden', !debugHudVisible);
    return;
  }
  if (e.code === 'KeyV' || e.code === 'F5') {
    e.preventDefault();
    toggleCameraView();
    return;
  }

  if (e.code.startsWith('Digit') || e.code.startsWith('Numpad')) {
    const n = Number(e.code.replace(/^(Digit|Numpad)/, ''));
    if (currentWorldMode === 'center' && (worldExtras.isInsideElevator(playerPos) || worldExtras.isNearElevator(playerPos)) && n >= 1 && n <= 7) {
      send({ type: 'elevator_call', floor: n });
      return;
    }
    // Only intercept 0..9 AFTER boarding a train: 0 uncouples & retrieves the last passenger car, 1..9 switches cars!
    if (currentWorldMode === 'sandbox' && ridingTrain) {
      const unitCount = worldExtras.getTrainUnitPose(ridingTrain.trainId, 0)?.unitCount || 1;
      if (n === 0) {
        if (unitCount > 1 && ridingTrain.unitIndex >= unitCount - 1) {
          ridingTrain.unitIndex = Math.max(0, unitCount - 2);
        }
        send({ type: 'train_uncouple', trainId: ridingTrain.trainId });
        return;
      }
      if (n >= 1 && n < unitCount) {
        boardTrainUnit(ridingTrain.trainId, n);
        return;
      }
    }
    if (e.code.startsWith('Digit') && n >= 1 && n <= 9) ui.setActiveSlot(n - 1);
  }

  if ((e.code === 'Space' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') && ridingTrain) {
    e.preventDefault();
    dismountTrain(true);
    return;
  }

  if (e.code === 'Space' && !e.repeat) {
    const now = performance.now();
    if (now - lastSpaceTime < 280) {
      toggleFlyMode();
      lastSpaceTime = 0;
    } else {
      lastSpaceTime = now;
    }
  }
  if ((e.code === 'KeyW' || e.code === 'KeyA' || e.code === 'KeyS' || e.code === 'KeyD') && !e.repeat) {
    const now = performance.now();
    if (e.code === lastMoveKeyCode && now - lastMoveKeyTime < 280) {
      doubleTapSprint = true;
      lastMoveKeyTime = 0;
    } else {
      lastMoveKeyCode = e.code;
      lastMoveKeyTime = now;
    }
  }
  keys.add(e.code);
});

window.addEventListener('keyup', (e) => {
  keys.delete(e.code);
  if (e.code === 'Semicolon' || e.code === 'KeyH') { isKeyLeftDown = false; resetMining(); }
  if (e.code === 'Quote' || e.code === 'KeyJ') { isKeyRightDown = false; }
  if (!keys.has('KeyW') && !keys.has('KeyA') && !keys.has('KeyS') && !keys.has('KeyD')) {
    doubleTapSprint = false;
  }
});

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
  if (ridingTrain) {
    if (currentWorldMode !== 'sandbox') {
      ridingTrain = null;
    } else {
      const pose = worldExtras.getTrainUnitPose(ridingTrain.trainId, ridingTrain.unitIndex);
      if (!pose) {
        ridingTrain = null;
      } else {
        if (touchJumpHeld) {
          dismountTrain(true);
          return false;
        }
        // Allow arrow-key camera look while seated inside the train car
        const turnSpeed = 2.1 * mouseSensitivity;
        if (keys.has('ArrowLeft')) yaw += turnSpeed * dt;
        if (keys.has('ArrowRight')) yaw -= turnSpeed * dt;
        if (keys.has('ArrowUp')) pitch = Math.min(Math.PI / 2 - 0.01, pitch + turnSpeed * 0.75 * dt);
        if (keys.has('ArrowDown')) pitch = Math.max(-Math.PI / 2 + 0.01, pitch - turnSpeed * 0.75 * dt);
        playerPos.set(pose.x, pose.y + 0.56, pose.z);
        playerVel.set(0, 0, 0);
        onGround = true;
        return false;
      }
    }
  }
  _forward.set(-Math.sin(yaw), 0, -Math.cos(yaw));
  _right.set(Math.cos(yaw), 0, -Math.sin(yaw));
  _move.set(0, 0, 0);

  if (keys.has('KeyW')) _move.add(_forward);
  if (keys.has('KeyS')) _move.sub(_forward);
  if (keys.has('KeyD')) _move.add(_right);
  if (keys.has('KeyA')) _move.sub(_right);

  // Arrow-key camera rotation (super handy over Remote Desktop / laptop trackpads!)
  const turnSpeed = 2.1 * mouseSensitivity;
  if (keys.has('ArrowLeft')) yaw += turnSpeed * dt;
  if (keys.has('ArrowRight')) yaw -= turnSpeed * dt;
  if (keys.has('ArrowUp')) pitch = Math.min(Math.PI / 2 - 0.01, pitch + turnSpeed * 0.75 * dt);
  if (keys.has('ArrowDown')) pitch = Math.max(-Math.PI / 2 + 0.01, pitch - turnSpeed * 0.75 * dt);
  if (touchControls.enabled && (touchControls.moveX !== 0 || touchControls.moveZ !== 0)) {
    _move.addScaledVector(_forward, touchControls.moveZ);
    _move.addScaledVector(_right, touchControls.moveX);
  }
  const isMoving = _move.lengthSq() > 0;
  if (isMoving && _move.lengthSq() > 1) _move.normalize();

  // Sprint check: Shift hold OR double-tap WASD (locked when HP <= 2 until eating food!)
  const shiftHeld = keys.has('ShiftLeft') || keys.has('ShiftRight');
  const wantsSprint = !flyMode && isMoving && (shiftHeld || doubleTapSprint);
  const canSprint = ui.hp > 2;
  const sprinting = wantsSprint && canSprint;
  if (wantsSprint && !canSprint) {
    doubleTapSprint = false;
    const nowMs = performance.now();
    if (nowMs - lastExhaustToastTime > 4500) {
      lastExhaustToastTime = nowMs;
      ui.toast('😫 체력이 다 떨어져 달릴 수 없습니다! 음식을 먹어 HP를 채워주세요.', 'warn');
    }
  }
  if (sprinting) {
    sprintDrainTimer += dt;
    if (sprintDrainTimer >= 4.0) {
      sprintDrainTimer = 0;
      send({ type: 'sprint_drain' });
    }
  } else {
    sprintDrainTimer = Math.max(0, sprintDrainTimer - dt * 0.5);
  }
  if (sprinting !== isSprintingNow) {
    isSprintingNow = sprinting;
    if (!flyMode) {
      document.getElementById('hud-mode').textContent = sprinting
        ? '🏃 달리기 중 (HP 소모)'
        : '🚶 걷기 (Shift/W×2 달리기)';
    }
  }
  // Subtle dynamic FOV boost when sprinting
  const targetFov = baseFov + (sprinting ? 7 : 0);
  if (Math.abs(camera.fov - targetFov) > 0.05) {
    camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 10);
    camera.updateProjectionMatrix();
  }

  // Low HP (from hunger/sprint) smoothly slows walking speed; sprinting adds 1.55x boost
  const hpFactor = 0.45 + 0.55 * (Math.max(0, ui.hp) / 20);
  const speed = flyMode ? 10.5 : (5.8 * hpFactor * (sprinting ? 1.55 : 1.0));
  const tryStepUp = (nx, nz) => {
    if (flyMode || !worldRenderer || (!onGround && playerVel.y > 0.2)) return false;
    const footY = Math.floor(playerPos.y + 0.05);
    const minBX = Math.floor(nx - PLAYER_RADIUS);
    const maxBX = Math.floor(nx + PLAYER_RADIUS);
    const minBZ = Math.floor(nz - PLAYER_RADIUS);
    const maxBZ = Math.floor(nz + PLAYER_RADIUS);
    let hitStair = false;
    for (let bx = minBX; bx <= maxBX; bx++) {
      for (let bz = minBZ; bz <= maxBZ; bz++) {
        const blk = worldRenderer.getBlock(bx, footY, bz);
        if (blk && blk.startsWith('stairs_')) {
          hitStair = true;
          break;
        }
      }
      if (hitStair) break;
    }
    if (!hitStair) return false;
    const stepY = footY + 1.005;
    if (!collides(nx, stepY, nz)) {
      playerPos.y = stepY;
      if (playerVel.y < 0) playerVel.y = 0;
      onGround = true;
      return true;
    }
    return false;
  };
  const nextX = playerPos.x + (_move.x * speed + playerVel.x) * dt;
  if (!collides(nextX, playerPos.y, playerPos.z) || tryStepUp(nextX, playerPos.z)) playerPos.x = nextX;
  else playerVel.x = 0;
  const nextZ = playerPos.z + (_move.z * speed + playerVel.z) * dt;
  if (!collides(playerPos.x, playerPos.y, nextZ) || tryStepUp(playerPos.x, nextZ)) playerPos.z = nextZ;
  else playerVel.z = 0;

  // Smooth ballistic friction for bomb knockback horizontal velocity
  const hDrag = Math.pow(onGround ? 0.0025 : 0.16, dt);
  playerVel.x *= hDrag;
  playerVel.z *= hDrag;
  if (Math.abs(playerVel.x) < 0.04) playerVel.x = 0;
  if (Math.abs(playerVel.z) < 0.04) playerVel.z = 0;

  const jumpActive = keys.has('Space') || touchJumpHeld;
  const descendActive = keys.has('ShiftLeft') || keys.has('ShiftRight') || touchDescendHeld;

  if (flyMode) {
    let vy = 0;
    if (jumpActive) vy += 8.0;
    if (descendActive) vy -= 8.0;
    const nextY = playerPos.y + vy * dt;
    if (!collides(playerPos.x, nextY, playerPos.z)) playerPos.y = nextY;
    onGround = false;
  } else {
    // Ladder climbing & water swimming check
    const bx = Math.floor(playerPos.x), by = Math.floor(playerPos.y), bz = Math.floor(playerPos.z);
    const bFeet = worldRenderer?.getBlock(bx, by, bz);
    if (bFeet === 'pressure_plate' && performance.now() - _lastPlateSent > 600) {
      _lastPlateSent = performance.now();
      send({ type: 'trigger_plate', x: bx, y: by, z: bz });
    }
    const bHead = worldRenderer?.getBlock(bx, by + 1, bz);
    const onLadder = bFeet === 'ladder' || bHead === 'ladder';
    const inWater = bFeet === 'water' || bHead === 'water';

    if (onLadder) {
      playerVel.y = (jumpActive || keys.has('KeyW') || touchControls.moveZ > 0.3) ? 4.8 : (descendActive ? -3.5 : 0);
      const nextY = playerPos.y + playerVel.y * dt;
      if (!collides(playerPos.x, nextY, playerPos.z)) playerPos.y = nextY;
      onGround = true;
    } else if (inWater) {
      // Gentle buoyancy & swimming (Space to swim up, Shift to dive down)
      if (jumpActive) playerVel.y = Math.min(4.6, playerVel.y + 18 * dt);
      else if (descendActive) playerVel.y = Math.max(-4.2, playerVel.y - 14 * dt);
      else playerVel.y = Math.max(-1.6, playerVel.y - 5.5 * dt);
      const nextY = playerPos.y + playerVel.y * dt;
      if (collides(playerPos.x, nextY, playerPos.z)) {
        if (playerVel.y < 0) { onGround = true; playerPos.y = Math.floor(nextY) + 1.001; }
        playerVel.y = 0;
      } else {
        playerPos.y = nextY;
        onGround = false;
      }
    } else {
      // Jump Pad super launch!
      const underBlock = worldRenderer?.getBlock(bx, Math.floor(playerPos.y - 0.15), bz);
      if (underBlock === 'jumppad' && performance.now() - lastJumpPadTime > 350) {
        lastJumpPadTime = performance.now();
        playerVel.y = 18.5;
        onGround = false;
        sound.playJumpPad();
      } else if (jumpActive && onGround) {
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

  // Solid Train Riding & Side-Collision Physics (Sandbox World)
  if (currentWorldMode === 'sandbox' && worldExtras.applyTrainPhysics(playerPos, playerVel, flyMode)) {
    onGround = true;
  }

  // Real moving elevator cab riding physics (Happiness Plus Center)
  if (currentWorldMode === 'center' && worldExtras.isInsideElevator(playerPos)) {
    const cabTopY = worldExtras.getElevatorTopY();
    const evState = worldExtras.getElevatorState();
    if (!flyMode && cabTopY !== null && playerPos.y <= cabTopY + 1.1 && playerPos.y >= cabTopY - 1.6) {
      playerPos.y = cabTopY;
      playerVel.y = 0;
      onGround = true;
    }
    if (evState && evState.moving && evState.config) {
      playerPos.z = Math.min(playerPos.z, evState.config.maxZ - 0.35);
      playerPos.x = Math.max(evState.config.minX + 0.32, Math.min(evState.config.maxX - 0.32, playerPos.x));
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
  if (playerPos.y < -5) {
    playerPos.set(currentWorldMode === 'center' ? -28.5 : 0.5, (currentWorldMode === 'job' || currentWorldMode === 'center') ? 5.5 : 38, currentWorldMode === 'center' ? -3.5 : 0.5);
    playerVel.set(0, 0, 0);
  }
  return isMoving;
}

function updateMining(dt) {
  const activelyMining = (isLeftDown && (pointerLocked || remoteLook)) || (isKeyLeftDown && !ui.openModalId && !ui.chatOpen) || (isTouchMining && touchControls.enabled);
  if (!activelyMining || !currentHit) {
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
      slotIndex: ui.getActiveBagIndex(),
      toolType: ui.getActiveToolType()
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
    worldExtras.update(dt, playerPos, worldRenderer);
    const isMoving = updatePhysics(dt);
    remotePlayers.update(dt);
    animalRenderer.update(dt);
    // Update Happiness Plus Center Elevator HUD when inside or right outside elevator
    const elElevHud = document.getElementById('elevator-hud');
    if (elElevHud) {
      const showElev = currentWorldMode === 'center' && (worldExtras.isInsideElevator(playerPos) || worldExtras.isNearElevator(playerPos));
      elElevHud.classList.toggle('hidden', !showElev);
      if (showElev) {
        const es = worldExtras.getElevatorState();
        if (es) {
          const led = document.getElementById('elev-hud-floor');
          if (led) {
            const arrow = es.moving ? (es.targetFloor > es.floor ? '▲ ' : '▼ ') : '';
            const curDisp = es.moving ? es.targetFloor : es.floor;
            led.textContent = `${arrow}${curDisp}F`;
          }
          elElevHud.querySelectorAll('.elev-btn').forEach((b) => {
            const fn = Number(b.dataset.floor);
            b.classList.toggle('active', fn === (es.moving ? es.targetFloor : es.floor));
          });
        }
      }
    }
    // Update Nearby Train Boarding & Retrieval HUD (Sandbox World, Elevator-style!)
    const elTrainHud = document.getElementById('train-hud');
    if (elTrainHud) {
      activeNearbyTrain = currentWorldMode === 'sandbox' ? worldExtras.getNearestTrain(playerPos, 6.2) : null;
      const ridePose = ridingTrain ? worldExtras.getTrainUnitPose(ridingTrain.trainId, ridingTrain.unitIndex) : null;
      if (ridingTrain && !ridePose) ridingTrain = null;
      const hudTrain = ridingTrain && ridePose
        ? { trainId: ridingTrain.trainId, unitCount: ridePose.unitCount, moving: ridePose.moving }
        : activeNearbyTrain;
      elTrainHud.classList.toggle('hidden', !hudTrain);
      if (hudTrain) {
        const statusEl = document.getElementById('train-hud-status');
        if (statusEl) {
          const rideLabel = ridingTrain
            ? (ridingTrain.unitIndex === 0 ? '탑승: 기관차' : `탑승: ${ridingTrain.unitIndex}칸`)
            : (hudTrain.moving ? '운행 중' : '정지');
          statusEl.textContent = rideLabel;
        }
        const disBtn = document.getElementById('btn-train-dismount');
        if (disBtn) disBtn.classList.toggle('hidden', !ridingTrain);
        const toggleBtn = document.getElementById('btn-train-toggle');
        if (toggleBtn) {
          toggleBtn.classList.toggle('hidden', !ridingTrain);
          toggleBtn.textContent = hudTrain.moving ? '⏸️ 정지' : '▶️ 출발';
        }
        const sig = `${hudTrain.trainId}:${hudTrain.unitCount}:${ridingTrain ? ridingTrain.unitIndex : -1}`;
        if (sig !== _lastTrainHudSig) {
          _lastTrainHudSig = sig;
          const row = document.getElementById('train-car-btns');
          if (row) {
            row.innerHTML = '';
            const maxUnits = Math.min(10, hudTrain.unitCount);
            for (let u = 0; u < maxUnits; u++) {
              const b = document.createElement('button');
              b.type = 'button';
              b.className = 'elev-btn' + (ridingTrain && ridingTrain.unitIndex === u ? ' active' : '');
              b.textContent = u === 0 ? '🚂 기관차' : `${u}칸`;
              b.addEventListener('click', (e) => {
                e.stopPropagation();
                boardTrainUnit(hudTrain.trainId, u);
              });
              row.appendChild(b);
            }
          }
        }
      }
    }
    sky.update(dt, playerPos, (currentWorldMode === 'job' || currentWorldMode === 'center') ? 4 : 36);
    sound.updateListener(playerPos, yaw);

    const { eyePos, lookDir } = getEyeAndLook();

    // Handheld light-emitting block (lamp/portal/furnace/jumppad) OR local voxel block-light
    if (worldRenderer) {
      const heldLight = HELD_LIGHT_PROPS[ui.getActiveItemId()];
      const bl = worldRenderer.getBlockLightAt(
        Math.floor(playerPos.x),
        Math.floor(playerPos.y + 1.1),
        Math.floor(playerPos.z)
      );
      const nightFactor = 1 - (sky.dayLight ?? 1) * 0.7;
      let targetInt = (bl / 14) * 1.15 * nightFactor;
      let targetDist = 10;
      let targetColor = DEFAULT_PLAYER_LIGHT_COLOR;

      if (heldLight) {
        const flicker = 1 + Math.sin(now * 0.009) * 0.045;
        targetInt = Math.max(targetInt, heldLight.intensity * flicker);
        targetDist = heldLight.distance;
        targetColor = heldLight.color;
        playerLight.position.set(
          eyePos.x + lookDir.x * 0.45,
          eyePos.y + lookDir.y * 0.35 - 0.12,
          eyePos.z + lookDir.z * 0.45
        );
      } else {
        playerLight.position.set(playerPos.x, playerPos.y + 1.4, playerPos.z);
      }
      const lerpAmt = Math.min(1, dt * 12);
      playerLight.intensity += (targetInt - playerLight.intensity) * lerpAmt;
      playerLight.distance += (targetDist - playerLight.distance) * lerpAmt;
      playerLight.color.lerp(targetColor, lerpAmt);
    }

    if (thirdPerson) {
      _camPos.copy(eyePos).addScaledVector(lookDir, -3.8);
      _camPos.y += 0.6;
      camera.position.copy(_camPos);
      camera.lookAt(eyePos);
    } else {
      camera.position.copy(eyePos);
      camera.rotation.y = yaw;
      camera.rotation.x = pitch;
    }

    if (cameraShake > 0.002) {
      camera.position.x += (Math.random() - 0.5) * cameraShake;
      camera.position.y += (Math.random() - 0.5) * cameraShake;
      camera.position.z += (Math.random() - 0.5) * cameraShake;
      cameraShake = Math.max(0, cameraShake - dt * 1.35);
    }

    // Subtle underwater blue tint & screen overlay when camera is submerged inside a water block
    if (worldRenderer) {
      const camBlock = worldRenderer.getBlock(
        Math.floor(camera.position.x),
        Math.floor(camera.position.y),
        Math.floor(camera.position.z)
      );
      const isUw = camBlock === 'water';
      if (isUw !== _lastUwState) {
        _lastUwState = isUw;
        elUnderwaterTint?.classList.toggle('hidden', !isUw);
      }
      if (isUw) {
        scene.fog.color.setHex(0x0369a1);
        scene.background.setHex(0x0369a1);
      }
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
      worldRenderer.updateStreaming(playerPos);
      currentHit = worldRenderer.raycast(eyePos, lookDir, 7, ui.getActiveItemId() === 'sabo_sword');
      updateMining(dt);
      // Continuous right-click block placement while holding RMB or Quote (') key!
      if (((isRightDown && pointerLocked) || isKeyRightDown) && !ui.openModalId && !ui.chatOpen && currentHit) {
        rightPlaceTimer -= dt;
        if (rightPlaceTimer <= 0) {
          rightPlaceTimer = 0.17;
          const b = currentHit.block;
          const isInteractive = b === 'chest' || b === 'furnace' || b === 'bed' || b === 'sign' || b === 'sign_fixed' ||
            b === 'portal' || b === 'lever_off' || b === 'lever_on' || b === 'tnt' || b === 'fill_bomb' ||
            b === 'water_bomb' || b === 'flatten_bomb' || b === 'fuse' || b === 'npc_beacon' ||
            b.startsWith('door_') || b.startsWith('btn_') || b.startsWith('job_') ||
            b === 'furn_toilet_closed' || b === 'furn_toilet_open';
          const heldNow = catalog[ui.getActiveItemId()];
          if (!isInteractive && heldNow && heldNow.kind === 'block') {
            handleRightClickOrInteract(false);
          }
        }
      }
      const ratio = miningTargetKey && Number.isFinite(miningDuration) ? Math.min(1, miningElapsed / miningDuration) : 0;
      worldRenderer.updateHighlight(currentHit, ratio);
      const heldDef = catalog[ui.getActiveItemId()];
      if (currentHit && brushModeIdx > 0 && heldDef?.kind === 'block') {
        worldRenderer.updateBrushPreview(computeBrushPositions(currentHit.placeX, currentHit.placeY, currentHit.placeZ));
      } else {
        worldRenderer.updateBrushPreview(null);
      }
      worldRenderer.updateParticles(dt);
    }

    if (fpHand) fpHand.update(dt, isMoving, (isLeftDown && pointerLocked) || isKeyLeftDown || (isTouchMining && touchControls.enabled));

    const bx = Math.floor(playerPos.x), by = Math.floor(playerPos.y), bz = Math.floor(playerPos.z);
    const biomePrefix = currentWorldMode === 'sandbox' ? `${getBiomeLabel(getBiomeAt(bx, bz))} ` : '';
    const coordsStr = `${biomePrefix}XYZ: ${bx}, ${by}, ${bz}`;
    if (coordsStr !== lastCoordsStr) { lastCoordsStr = coordsStr; elHudCoords.textContent = coordsStr; }
    if (elHudTargetBlock) {
      const showTarget = !!selfPlayer?.isAdmin;
      elHudTargetBlock.classList.toggle('hidden', !showTarget);
      if (showTarget) {
        const targetStr = currentHit
          ? `🎯 ${catalog[currentHit.block]?.name || currentHit.block} (${currentHit.block})`
          : '🎯 대상 없음';
        if (targetStr !== lastTargetBlockStr) {
          lastTargetBlockStr = targetStr;
          elHudTargetBlock.textContent = targetStr;
        }
      }
    }
    const timeStr = sky.getTimeLabel();
    if (timeStr !== lastTimeStr) { lastTimeStr = timeStr; elHudTime.textContent = timeStr; }

    if (now - lastNetSend > 50) {
      lastNetSend = now;
      const sx = Number(playerPos.x.toFixed(3));
      const sy = Number(playerPos.y.toFixed(3));
      const sz = Number(playerPos.z.toFixed(3));
      const syaw = Number(yaw.toFixed(3));
      const spitch = Number(pitch.toFixed(3));
      const poseKey = `${sx},${sy},${sz},${syaw},${spitch}`;
      if (poseKey !== lastSentPose) {
        lastSentPose = poseKey;
        send({ type: 'move', x: sx, y: sy, z: sz, yaw: syaw, pitch: spitch });
      }
    }
  } else {
    sky.update(dt, _loginSkyOrigin);
    const t = now * 0.0002;
    camera.position.set(Math.cos(t) * 24, 24, Math.sin(t) * 24);
    camera.lookAt(0, 16, 0);
  }

  renderer.render(scene, camera);

  // F3 Performance & Debug HUD
  _fpsFrames++;
  if (now - _fpsLastTime >= 500) {
    _curFps = Math.round((_fpsFrames * 1000) / (now - _fpsLastTime));
    _fpsFrames = 0;
    _fpsLastTime = now;
    if (joined && debugHudVisible && elDebugHud) {
      if (now - _lastPingSent >= 2000) {
        _lastPingSent = now;
        send({ type: 'ping_check', ts: now });
      }
      const bx = Math.floor(playerPos.x), by = Math.floor(playerPos.y), bz = Math.floor(playerPos.z);
      const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
      const fDir = Math.abs(fx) > Math.abs(fz) ? (fx > 0 ? '동(+X)' : '서(-X)') : (fz < 0 ? '북(-Z)' : '남(+Z)');
      const bLight = worldRenderer ? worldRenderer.getBlockLightAt(bx, by + 1, bz) : 0;
      const chunks = worldRenderer ? worldRenderer.chunkGroups.size : 0;
      const ri = renderer.info.render;
      elDebugHud.textContent =
        `Boxworld F3 디버그\n` +
        `FPS: ${_curFps}  |  Ping: ${_wsPingMs}ms\n` +
        `DrawCalls: ${ri.calls}  |  Tris: ${ri.triangles.toLocaleString()}\n` +
        `Chunks: ${chunks}  |  BlockLight: ${bLight}/10\n` +
        `XYZ: ${bx}, ${by}, ${bz}  |  방향: ${fDir}`;
    }
  }
}
requestAnimationFrame(animate);
