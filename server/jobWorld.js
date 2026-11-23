// Dedicated lightweight 64x24x64 Job Experience Village (Read-Only for regular users)
import { BLOCKS } from './blocks.js';
import { encodeRLE } from './worldStore.js';

export const JOB_BOUNDS = {
  minX: -32,
  maxX: 31,
  minY: 0,
  maxY: 23,
  minZ: -32,
  maxZ: 31
};

const SX = JOB_BOUNDS.maxX - JOB_BOUNDS.minX + 1; // 64
const SY = JOB_BOUNDS.maxY - JOB_BOUNDS.minY + 1; // 24
const SZ = JOB_BOUNDS.maxZ - JOB_BOUNDS.minZ + 1; // 64
const VOL = SX * SY * SZ;

function idxOf(x, y, z) {
  return (x - JOB_BOUNDS.minX) + SX * ((z - JOB_BOUNDS.minZ) + SZ * (y - JOB_BOUNDS.minY));
}

export function createJobVillageWorld() {
  const grid = new Uint8Array(VOL);
  const signs = {};

  const inB = (x, y, z) => (
    x >= JOB_BOUNDS.minX && x <= JOB_BOUNDS.maxX &&
    y >= JOB_BOUNDS.minY && y <= JOB_BOUNDS.maxY &&
    z >= JOB_BOUNDS.minZ && z <= JOB_BOUNDS.maxZ
  );

  const set = (x, y, z, id) => {
    if (!inB(x, y, z)) return;
    grid[idxOf(x, y, z)] = id ? (BLOCKS[id]?.numId || 0) : 0;
  };

  const addSign = (x, y, z, text) => {
    set(x, y, z, 'sign');
    signs[`${x},${y},${z}`] = { x, y, z, text, author: 'System' };
  };

  const GROUND = 4;

  // 1. Base meadow & central stone walkway
  for (let x = JOB_BOUNDS.minX; x <= JOB_BOUNDS.maxX; x++) {
    for (let z = JOB_BOUNDS.minZ; z <= JOB_BOUNDS.maxZ; z++) {
      set(x, 0, z, 'bedrock');
      set(x, 1, z, 'stone');
      set(x, 2, z, 'dirt');
      set(x, 3, z, 'dirt');
      set(x, GROUND, z, 'grass');
    }
  }

  // Central Village Plaza & Roads
  for (let x = -14; x <= 14; x++) {
    for (let z = 3; z <= 10; z++) {
      set(x, GROUND, z, (Math.abs(x) === 14 || z === 10) ? 'cobble' : 'sand');
    }
  }
  for (let x = -3; x <= 3; x++) {
    for (let z = 2; z <= 14; z++) {
      set(x, GROUND, z, 'cobble');
    }
  }

  // 2. ☕ Boxworld Cafe Building (X: -8..8, Z: -10..2, Y: 4..10)
  for (let x = -8; x <= 8; x++) {
    for (let z = -10; z <= 2; z++) {
      set(x, GROUND, z, (x + z) % 2 === 0 ? 'planks' : 'sand');
    }
  }

  // Walls (Y = 5..9) with wide front entrance (X: -2..2, Z: 2) & glass windows
  for (let y = 5; y <= 9; y++) {
    for (let x = -8; x <= 8; x++) {
      for (let z = -10; z <= 2; z++) {
        const edge = x === -8 || x === 8 || z === -10 || z === 2;
        if (!edge) continue;
        // Wide open entrance at Z=2, X=-2..2, Y=5..7
        if (z === 2 && Math.abs(x) <= 2 && y <= 7) continue;
        const corner = (x === -8 || x === 8) && (z === -10 || z === 2);
        const isWindow = y >= 6 && y <= 8 && !corner && (Math.abs(x) <= 6 || (z >= -8 && z <= 0));
        set(x, y, z, corner ? 'wood' : isWindow ? 'glass' : 'brick');
      }
    }
  }

  // Roof (Y = 10) with cozy ceiling lamps
  for (let x = -9; x <= 9; x++) {
    for (let z = -11; z <= 3; z++) {
      set(x, 10, z, (x === -9 || x === 9 || z === -11 || z === 3) ? 'wood' : 'wool_white');
    }
  }
  // Cafe Roof Sign accent
  for (let x = -4; x <= 4; x++) {
    set(x, 11, 3, 'wool_yellow');
  }
  // Interior lights
  for (const [lx, lz] of [[-5, -7], [0, -7], [5, -7], [-5, -2], [0, -2], [5, -2]]) {
    set(lx, 9, lz, 'lamp');
  }

  // 3. Cafe Bar Counter & 5 Interactive Barista Stations!
  // Service counter dividing customer side (Z > -3) and barista workspace (Z <= -4)
  for (let x = -6; x <= 6; x++) {
    if (x === -6 || x === 6) continue; // Walk-around openings on both sides!
    set(x, 5, -3, 'planks');
  }

  // Station 1: 🧾 Order Counter at (-2, 5, -3)
  set(-2, 5, -3, 'job_counter');
  signs['-2,5,-3'] = { x: -2, y: 5, z: -3, text: '① 🧾 주문 카운터\n(우클릭: 손님 주문)', author: 'System' };

  // Station 5: 🛎️ Pickup / Serving Counter at (2, 5, -3)
  set(2, 5, -3, 'job_pickup');
  signs['2,5,-3'] = { x: 2, y: 5, z: -3, text: '⑤ 🛎️ 픽업 서빙대\n(우클릭: 음료 서빙)', author: 'System' };

  // Back Bar Workstation along Z = -8
  for (let x = -6; x <= 6; x++) {
    set(x, 5, -8, 'cobble');
  }
  // Station 2: ☕ Espresso Machine at (-4, 6, -8)
  set(-4, 6, -8, 'job_espresso');
  signs['-4,6,-8'] = { x: -4, y: 6, z: -8, text: '② ☕ 커피머신\n(우클릭: 에스프레소 추출)', author: 'System' };

  // Station 3: 🧊 Ingredient Fridge at (0, 6, -8)
  set(0, 6, -8, 'job_fridge');
  set(0, 5, -8, 'wool_white');
  signs['0,6,-8'] = { x: 0, y: 6, z: -8, text: '③ 🧊 재료 냉장고\n(우클릭: 컵·우유·얼음·시럽)', author: 'System' };

  // Station 4: 🥤 Drink Mixer Station at (4, 6, -8)
  set(4, 6, -8, 'job_mixer');
  signs['4,6,-8'] = { x: 4, y: 6, z: -8, text: '④ 🥤 음료 조합대\n(우클릭: 재료 섞어 완성)', author: 'System' };

  // Welcome & Future Job Village Signs
  addSign(0, 5, 4, '☕ Boxworld 직업 체험 마을\n안쪽 카페에서 바리스타 체험!\n①주문→②추출→③재료→④조합→⑤서빙');
  addSign(-12, 5, 6, '♻️ 환경미화 체험관\n(다음 업데이트 예정)');
  addSign(12, 5, 6, '📦 물류·진열 체험관\n(다음 업데이트 예정)');

  // Decorative Trees & Street Lamps around the plaza
  for (const [lx, lz] of [[-6, 5], [6, 5], [-6, 10], [6, 10]]) {
    set(lx, 5, lz, 'wood');
    set(lx, 6, lz, 'wood');
    set(lx, 7, lz, 'lamp');
  }
  for (const [tx, tz] of [[-14, -4], [14, -4], [-15, 14], [15, 14], [-12, -14], [12, -14]]) {
    for (let dy = 1; dy <= 4; dy++) set(tx, GROUND + dy, tz, 'wood');
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        for (let dy = 3; dy <= 5; dy++) {
          if (Math.abs(dx) === 2 && Math.abs(dz) === 2 && dy === 5) continue;
          if (dx === 0 && dz === 0 && dy <= 4) continue;
          set(tx + dx, GROUND + dy, tz + dz, 'leaves');
        }
      }
    }
    set(tx, GROUND + 6, tz, 'leaves');
  }

  return {
    bounds: JOB_BOUNDS,
    grid,
    rle: encodeRLE(grid),
    signs,
    spawn: { x: 0.5, y: 5.1, z: 6.5 }
  };
}
