// Sandbox World Permanent Landmarks:
// 1. Happiness Plus Center Clone at (-75, 34, 94) + /행플복구 restoration helper
// 2. 5-Story Semi-Basement Family Villa (401호 & 402호 mirror-symmetric) at (-78, 36, -45)
import { createCenterWorld } from './centerWorld.js';
import { BLOCKS, NUM_TO_BLOCK } from './blocks.js';

export const SANDBOX_CENTER_ORIGIN = { x: -75, y: 34, z: 94 };
export const SANDBOX_VILLA_ORIGIN = { x: -78, y: 36, z: -45 };

// Copy the entire Happiness Plus Center (1F~7F + rooftop gazebo + 2F rear parking tower + signs + facings)
// into the Sandbox World at (-75, 34, 94). Also used by /행플복구 to cleanly restore TNT damage!
export function stampCenterIntoSandbox(store, origin = SANDBOX_CENTER_ORIGIN) {
  const cw = createCenterWorld();
  // Apply persisted sign text overrides (e.g. "야근하는 박부규", "센터장", etc.)
  for (const [k, txt] of Object.entries(store.signOverrides || {})) {
    if (k.startsWith('center:')) {
      const coord = k.slice(7);
      if (cw.signs[coord]) cw.signs[coord].text = txt;
    }
  }

  // Align centerWorld (x=0, y=4 [GROUND], z=0) -> sandbox (origin.x, origin.y, origin.z)
  const shiftX = origin.x;
  const shiftY = origin.y - 4;
  const shiftZ = origin.z;

  // Building + entrance canopy + rear 2F parking yard & mechanical parking tower bounds in centerWorld:
  // x: -27..38, y: 4..48, z: -14..16
  const minCX = -27, maxCX = 38;
  const minCY = 4, maxCY = 48;
  const minCZ = -14, maxCZ = 16;

  let placed = 0;
  let signsCount = 0;

  // 1. Solid foundation pad beneath the building (y = origin.y - 4 .. origin.y - 1) so it never floats
  for (let cx = minCX; cx <= maxCX; cx++) {
    for (let cz = minCZ; cz <= maxCZ; cz++) {
      const sx = cx + shiftX;
      const sz = cz + shiftZ;
      for (let fy = origin.y - 4; fy < origin.y; fy++) {
        if (store.inBounds(sx, fy, sz)) {
          store.setBlock(sx, fy, sz, 'stone', 'System');
        }
      }
    }
  }

  // 2. Clear & stamp every block + facing in the center bounding box
  for (let cy = minCY; cy <= maxCY; cy++) {
    const sy = cy + shiftY;
    for (let cx = minCX; cx <= maxCX; cx++) {
      const sx = cx + shiftX;
      for (let cz = minCZ; cz <= maxCZ; cz++) {
        const sz = cz + shiftZ;
        if (!store.inBounds(sx, sy, sz)) continue;
        const bId = cw.getBlock(cx, cy, cz);
        if (bId === 'bedrock') continue;
        store.setBlock(sx, sy, sz, bId || null, 'System');
        const ck = `${cx},${cy},${cz}`;
        if (bId && cw.facings[ck] !== undefined) {
          store.setFacing(sx, sy, sz, cw.facings[ck]);
        }
        if (bId) placed++;
      }
    }
  }

  // 3. Copy all signs inside the stamped region
  for (const s of Object.values(cw.signs)) {
    if (s.x < minCX || s.x > maxCX || s.y < minCY || s.y > maxCY || s.z < minCZ || s.z > maxCZ) continue;
    const sx = s.x + shiftX;
    const sy = s.y + shiftY;
    const sz = s.z + shiftZ;
    if (!store.inBounds(sx, sy, sz)) continue;
    store.signs[`${sx},${sy},${sz}`] = {
      x: sx, y: sy, z: sz,
      text: s.text,
      author: 'System',
      fixed: !!s.fixed,
      facing: s.facing
    };
    signsCount++;
  }

  store.saveNow('world');
  store.saveNow('facings');
  store.saveNow('signs');

  return {
    placed,
    signsCount,
    bounds: {
      minX: minCX + shiftX, maxX: maxCX + shiftX,
      minY: minCY + shiftY, maxY: maxCY + shiftY,
      minZ: minCZ + shiftZ, maxZ: maxCZ + shiftZ
    }
  };
}

// Build the 5-Story Semi-Basement Family Villa (1F 반지하 + 2F~5F, 401호 & 402호 mirror-symmetric)
// Origin (-78, 36, -45): y=36 is the parking lot ground level; 1F floor is at y=34 (semi-basement!)
// so 1F living room windows sit flush with the parking lot ground at y=36!
export function stampVillaIntoSandbox(store, origin = SANDBOX_VILLA_ORIGIN) {
  const OX = origin.x;      // -78 (west wall of villa)
  const GROUND = origin.y;  // 36  (parking lot / street ground level)
  const OZ = origin.z - 19; // -64 .. -26 (centered around z = -45, depth 39: dz 0..38)

  const BW = 25; // dx: 0..24 (building footprint)
  const BD = 39; // dz: 0..38 (North unit 0..16, Stairwell 17..21, South mirror unit 22..38)
  const PARK_W = 10; // dx: 25..34 (right-side parking lot & villa entrance)
  const FLOOR_H = 5; // 1 slab + 4 clear interior blocks per floor
  const F1_BASE = GROUND - 2; // y = 34 (1F semi-basement! Living room window y=36..37 flush with ground!)

  const vx = (dx) => OX + dx;
  const vz = (dz) => OZ + dz;

  let placed = 0;
  let signsCount = 0;

  const set = (x, y, z, id, facing = undefined) => {
    if (!store.inBounds(x, y, z)) return;
    store.setBlock(x, y, z, id || null, 'System');
    if (id && facing !== undefined) store.setFacing(x, y, z, facing & 3);
    if (id) placed++;
  };

  const fill = (x1, y1, z1, x2, y2, z2, id) => {
    const aX = Math.min(x1, x2), bX = Math.max(x1, x2);
    const aY = Math.min(y1, y2), bY = Math.max(y1, y2);
    const aZ = Math.min(z1, z2), bZ = Math.max(z1, z2);
    for (let y = aY; y <= bY; y++) {
      for (let x = aX; x <= bX; x++) {
        for (let z = aZ; z <= bZ; z++) set(x, y, z, id);
      }
    }
  };

  const setDoor = (x, y, z, id = 'door_closed', facing = 0) => {
    set(x, y, z, id, facing);
    set(x, y + 1, z, id, facing);
  };

  const addFixedSign = (x, y, z, text, facing = 2) => {
    set(x, y, z, 'sign_fixed', facing);
    store.signs[`${x},${y},${z}`] = { x, y, z, text, author: 'System', fixed: true, facing: facing & 3 };
    signsCount++;
  };

  // Clear full villa + parking airspace first (from semi-basement pit y=33 to roof y=63)
  fill(vx(-2), F1_BASE - 1, vz(-2), vx(BW + PARK_W + 1), F1_BASE + 5 * FLOOR_H + 5, vz(BD + 1), null);

  // Solid foundation under semi-basement & parking lot
  fill(vx(-2), F1_BASE - 4, vz(-2), vx(BW + PARK_W + 1), F1_BASE - 1, vz(BD + 1), 'stone');

  // Right-side Parking Lot & Villa Entrance at y = GROUND (36)
  fill(vx(BW), F1_BASE, vz(-2), vx(BW + PARK_W + 1), GROUND - 1, vz(BD + 1), 'stone');
  fill(vx(BW), GROUND, vz(-2), vx(BW + PARK_W + 1), GROUND, vz(BD + 1), 'cobble');
  for (let dx = BW + 1; dx <= BW + PARK_W; dx++) {
    for (let dz = 0; dz <= BD - 1; dz++) {
      set(vx(dx), GROUND, vz(dz), 'stone');
    }
  }
  // White parking stall lines on parking lot (dx = 28..33)
  for (const pz of [3, 9, 15, 23, 29, 35]) {
    fill(vx(28), GROUND, vz(pz), vx(33), GROUND, vz(pz), 'wool_white');
  }
  // Entrance walkway ramp/steps from parking lot (y=36) into stairwell (dx=24..25, dz=17..21)
  fill(vx(BW), GROUND, vz(17), vx(BW + 2), GROUND, vz(21), 'sand');
  // Parking lot lamps & entrance signs
  for (const [lx, lz] of [[34, 0], [34, 19], [34, 38]]) {
    set(vx(lx), GROUND + 1, vz(lz), 'stone');
    set(vx(lx), GROUND + 2, vz(lz), 'stone');
    set(vx(lx), GROUND + 3, vz(lz), 'lamp');
  }
  addFixedSign(vx(BW + 1), GROUND + 2, vz(36), '🏠 빌라 입구\n주차장 · 101~502호', 1);
  addFixedSign(vx(BW + 1), GROUND + 2, vz(16), '🅿️ 주차장\n(1F 반지하 거실창)', 1);

  // Textured white stone-brick exterior wall helper (matches Photo 2 white rough stone villa!)
  const extMat = (x, y, z) => ((x + y * 2 + z) % 7 === 0 ? 'cobble' : 'wool_white');

  // Helper to build one residential unit (North = x02호 when mirror=false; South = x01호 when mirror=true!)
  const buildUnit = (fIdx, baseY, mirror) => {
    const floorNum = fIdx + 1; // 1..5
    const unitLabel = `${floorNum}0${mirror ? '1' : '2'}호`;
    const mapZ = (lz) => vz(mirror ? (BD - 1 - lz) : lz);
    const mapFace = (f) => {
      if (!mirror) return f & 3;
      if (f === 0) return 2;
      if (f === 2) return 0;
      return f & 3;
    };
    const uSet = (dx, dy, lz, id, f = undefined) => set(vx(dx), baseY + dy, mapZ(lz), id, f !== undefined ? mapFace(f) : undefined);
    const uDoor = (dx, dy, lz, id, f) => setDoor(vx(dx), baseY + dy, mapZ(lz), id, mapFace(f));
    const uSign = (dx, dy, lz, text, f) => addFixedSign(vx(dx), baseY + dy, mapZ(lz), text, mapFace(f));

    // Floor: warm wooden planks in rooms/living, white tile in bathrooms & balconies
    for (let dx = 1; dx <= BW - 2; dx++) {
      for (let lz = 1; lz <= 15; lz++) {
        let mat = 'planks';
        if ((dx >= 9 && dx <= 12 && lz >= 1 && lz <= 6) || (dx >= 21 && dx <= 23 && lz >= 1 && lz <= 6) || (dx >= 1 && dx <= 2 && lz >= 11 && lz <= 15)) {
          mat = 'wool_white';
        } else if (dx >= 9 && dx <= 11 && lz >= 13 && lz <= 15) {
          mat = 'sand'; // 현관 타일
        }
        uSet(dx, 0, lz, mat);
      }
    }

    // Interior walls (height 1..4)
    const wall = (dx1, lz1, dx2, lz2, hMax = 4) => {
      const aX = Math.min(dx1, dx2), bX = Math.max(dx1, dx2);
      const aZ = Math.min(lz1, lz2), bZ = Math.max(lz1, lz2);
      for (let dy = 1; dy <= hMax; dy++) {
        for (let dx = aX; dx <= bX; dx++) {
          for (let lz = aZ; lz <= bZ; lz++) uSet(dx, dy, lz, 'wool_white');
        }
      }
    };

    // Room dividers matching Floor Plan Photo 1:
    // 1. 작은방/서재 (dx 1..7, lz 1..5)
    wall(1, 5, 8, 5);
    wall(8, 1, 8, 5);
    uDoor(7, 1, 5, 'door_closed', 2);
    // 2. 화장실 1 (안방용, dx 9..12, lz 1..3) & 화장실 2 (거실용, dx 9..12, lz 4..6)
    wall(9, 3, 12, 3);
    wall(9, 6, 12, 6);
    wall(12, 1, 12, 6);
    uDoor(12, 1, 2, 'door_closed', 1); // 안방 화장실문
    uDoor(10, 1, 6, 'door_closed', 2); // 공용 화장실문
    // 3. 안방 (dx 13..20, lz 1..6) & 베란다 (dx 21..23, lz 1..6)
    wall(13, 6, 23, 6);
    wall(20, 1, 20, 6);
    uDoor(14, 1, 6, 'door_closed', 2); // 안방 문
    uDoor(20, 1, 5, 'door_glass_closed', 1); // 베란다 유리문
    // 4. 종현이방 (dx 3..8, lz 11..15) & 세탁실 베란다 (dx 1..2, lz 11..15)
    wall(1, 10, 8, 10);
    wall(3, 11, 3, 15);
    wall(8, 11, 8, 15);
    uDoor(7, 1, 10, 'door_closed', 0); // 종현이방 문
    uDoor(3, 1, 11, 'door_glass_closed', 3); // 세탁실 문
    // 5. 현관 중문 분리벽 (dx 9..11, lz 12..15)
    wall(11, 13, 11, 15);
    uDoor(10, 1, 16, 'door_iron_closed', 2); // 현관문 (계단실 연결!)

    // ---- Furniture (faithful to Photo 1!) ----
    // 작은방/서재: 수납장, 벙커침대, PC책상+의자
    uSet(2, 1, 1, 'furn_cabinet');
    uSet(3, 1, 1, 'furn_cabinet');
    uSet(1, 1, 3, 'planks'); uSet(2, 1, 3, 'planks'); // 벙커침대 하단 프레임
    uSet(1, 2, 3, 'bed'); uSet(2, 2, 3, 'bed');       // 2층 벙커침대
    uSet(3, 1, 3, 'ladder');
    uSet(4, 1, 4, 'furn_office_desk', 2);
    uSet(4, 1, 3, 'furn_office_chair', 2);
    uSet(6, 1, 1, 'furn_cabinet');

    // 부엌 (dx 1..8, lz 6..9): 싱크대, 가스레인지, 냉장고, 식탁
    uSet(1, 1, 6, 'cobble');
    uSet(1, 1, 7, 'water');    // 싱크대
    uSet(1, 1, 8, 'furnace');  // 가스레인지
    uSet(1, 1, 9, 'cobble');
    uSet(4, 1, 9, 'job_fridge'); // 냉장고 (90x90)
    uSet(5, 1, 9, 'job_fridge');
    uSet(7, 1, 7, 'furn_white_table'); // 식탁
    uSet(7, 1, 8, 'furn_white_table');
    uSet(6, 1, 7, 'furn_office_chair', 1);
    uSet(8, 1, 8, 'furn_office_chair', 3);

    // 종현이방 (dx 4..7, lz 11..15): 키즈텐트, 침대, TV, 서랍, 선반 + 세탁실
    uSet(4, 1, 11, 'wool_yellow'); uSet(5, 1, 11, 'wool_blue'); // 키즈텐트
    uSet(4, 2, 11, 'wool_blue'); uSet(5, 2, 11, 'wool_yellow');
    uSet(4, 1, 13, 'bed'); uSet(5, 1, 13, 'bed');               // 종현이 침대
    uSet(5, 1, 15, 'furn_tv_screen', 0);                        // TV
    uSet(4, 1, 15, 'furn_cabinet');                             // 서랍
    uSet(7, 1, 14, 'furn_cabinet');                             // 선반
    // 세탁실 베란다: 세탁기
    uSet(1, 1, 14, 'wool_white'); uSet(1, 2, 14, 'glass');

    // 화장실 1 & 2: 변기(뚜껑 개폐!) + 세면대
    uSet(9, 1, 1, 'furn_toilet_closed', 1);
    uSet(10, 1, 2, 'water');
    uSet(9, 1, 4, 'furn_toilet_closed', 1);
    uSet(11, 1, 4, 'water');

    // 안방 (dx 13..19, lz 1..5): 침대, 수납장, 서랍장 + 베란다 선반
    uSet(14, 1, 1, 'furn_cabinet'); uSet(15, 1, 1, 'furn_cabinet'); uSet(16, 1, 1, 'furn_cabinet');
    uSet(17, 1, 3, 'bed'); uSet(18, 1, 3, 'bed');
    uSet(17, 1, 4, 'bed'); uSet(18, 1, 4, 'bed');
    uSet(16, 1, 5, 'furn_cabinet');
    uSet(21, 1, 2, 'furn_cabinet'); // 베란다 선반

    // 거실 (dx 12..23, lz 7..15): 접이식 소파, 탁상, 에어컨, 서랍장, 러그
    uSet(16, 1, 7, 'furn_cafe_table'); // 탁상
    uSet(17, 1, 7, 'furn_cafe_table');
    uSet(16, 1, 14, 'furn_sofa', 0);   // 접이식 소파
    uSet(17, 1, 14, 'furn_sofa', 0);
    uSet(18, 1, 14, 'furn_sofa', 0);
    uSet(14, 1, 14, 'furn_cabinet');   // 서랍장
    uSet(22, 1, 14, 'wool_white');     // 스탠드 에어컨
    uSet(22, 2, 14, 'wool_white');
    uSet(22, 3, 14, 'slab_white');
    // 거실 바닥 카펫 매트 (Photo 1 3-panel living room mat!)
    for (let dx = 14; dx <= 21; dx++) {
      for (let lz = 9; lz <= 12; lz++) uSet(dx, 0, lz, 'slab_white');
    }

    // 현관 신발장
    uSet(9, 1, 14, 'furn_cabinet');
    uSet(9, 1, 15, 'furn_cabinet');

    // Ceiling lamps across rooms
    for (const [lx, lz] of [[4, 3], [5, 8], [6, 13], [10, 5], [16, 3], [17, 10], [21, 10]]) {
      uSet(lx, 4, lz, 'lamp');
    }

    // Front door unit number sign in stairwell (fixed front-facing!)
    uSign(11, 2, 17, `🏠 ${unitLabel}`, 2);

    // Extra detailed room signs inside 402호 (and 401호)!
    if (floorNum === 4) {
      uSign(17, 2, 13, `🛋️ ${unitLabel} 거실`, 0);
      uSign(15, 2, 5, `🛏️ ${unitLabel} 안방`, 0);
      uSign(6, 2, 11, `🧸 종현이방`, 2);
      uSign(4, 2, 2, `💻 서재/작은방`, 2);
      uSign(4, 2, 7, `🍳 부엌`, 1);
    }
  };

  // Build all 5 floors: fIdx = 0 (1F 반지하) .. 4 (5F)
  for (let fIdx = 0; fIdx < 5; fIdx++) {
    const baseY = F1_BASE + fIdx * FLOOR_H; // 34, 39, 44, 49, 54
    const ceilY = baseY + FLOOR_H;

    // Outer textured white stone-brick shell (dx = 0..24, dz = 0..38)
    for (let y = baseY; y <= ceilY; y++) {
      for (let dx = 0; dx < BW; dx++) {
        for (let dz = 0; dz < BD; dz++) {
          const onOuter = (dx === 0 || dx === BW - 1 || dz === 0 || dz === BD - 1);
          if (!onOuter) continue;
          // Dark-framed horizontal windows on East (parking lot side, dx=BW-1) & West (dx=0)
          const isWinY = (y === baseY + 2 || y === baseY + 3);
          const isEastWin = (dx === BW - 1 && isWinY && (
            (dz >= 8 && dz <= 14) || (dz >= 24 && dz <= 30) || // Living room wide windows (flush w/ ground on 1F!)
            (dz >= 2 && dz <= 5) || (dz >= 33 && dz <= 36)     // Master balcony windows
          ));
          const isWestWin = (dx === 0 && isWinY && (
            (dz >= 2 && dz <= 4) || (dz >= 12 && dz <= 14) ||
            (dz >= 24 && dz <= 26) || (dz >= 34 && dz <= 36)
          ));
          const isStairWin = (dx === BW - 1 && fIdx >= 1 && isWinY && dz >= 18 && dz <= 20);
          if (isEastWin || isWestWin || isStairWin) {
            set(vx(dx), y, vz(dz), 'glass');
          } else {
            set(vx(dx), y, vz(dz), extMat(vx(dx), y, vz(dz)));
          }
        }
      }
    }

    // Stairwell walls separating North unit (dz=16) and South unit (dz=22)
    for (let y = baseY + 1; y < ceilY; y++) {
      for (let dx = 1; dx < BW - 1; dx++) {
        set(vx(dx), y, vz(16), 'wool_white');
        set(vx(dx), y, vz(22), 'wool_white');
      }
    }

    // Build North unit (x02호) & South mirror-symmetric unit (x01호)
    buildUnit(fIdx, baseY, false);
    buildUnit(fIdx, baseY, true);

    // Central Stairwell (dx = 1..23, dz = 17..21): landings + stairs up to next floor!
    fill(vx(1), baseY, vz(17), vx(13), baseY, vz(21), 'cobble');
    set(vx(10), baseY + 4, vz(19), 'lamp');
    set(vx(20), baseY + 4, vz(19), 'lamp');
    if (fIdx < 4) {
      // Climbing flight from dx=14..18 along dz=20..21 (상행)
      for (let s = 0; s < 5; s++) {
        const sx = vx(14 + s);
        const sy = baseY + 1 + s;
        set(sx, sy, vz(20), 'stairs_stone', 1);
        set(sx, sy, vz(21), 'stairs_stone', 1);
        if (s > 0) {
          set(sx, sy - 1, vz(20), 'stone');
          set(sx, sy - 1, vz(21), 'stone');
        }
      }
      // Return landing at dx=19..23 at baseY+5 (next floor!)
      fill(vx(19), ceilY, vz(17), vx(23), ceilY, vz(21), 'cobble');
    } else {
      fill(vx(14), baseY, vz(17), vx(23), baseY, vz(21), 'cobble');
    }
  }

  // Villa Main Entrance on East stairwell wall at ground level (y=36, dz=18..20)
  // Connects seamlessly down 2 steps to 1F 반지하 (y=34) and up to 2F (y=39)!
  for (let y = GROUND + 1; y <= GROUND + 3; y++) {
    for (let dz = 18; dz <= 20; dz++) set(vx(BW - 1), y, vz(dz), null);
  }
  setDoor(vx(BW - 1), GROUND + 1, vz(19), 'door_glass_closed', 1);
  // 2 steps down from entrance (y=36) into 1F semi-basement stairwell (y=34)
  set(vx(23), GROUND, vz(18), 'cobble');
  set(vx(23), GROUND, vz(19), 'cobble');
  set(vx(23), GROUND, vz(20), 'cobble');
  set(vx(22), GROUND - 1, vz(18), 'stairs_stone', 1);
  set(vx(22), GROUND - 1, vz(19), 'stairs_stone', 1);
  set(vx(22), GROUND - 1, vz(20), 'stairs_stone', 1);
  set(vx(21), F1_BASE, vz(18), 'cobble');
  set(vx(21), F1_BASE, vz(19), 'cobble');
  set(vx(21), F1_BASE, vz(20), 'cobble');

  // Roof Slab + Iconic Dark Sloped Mansard Roof Cap (matches Photo 2!)
  const ROOF_Y = F1_BASE + 5 * FLOOR_H; // y = 59
  fill(vx(0), ROOF_Y, vz(0), vx(BW - 1), ROOF_Y, vz(BD - 1), 'stone');
  // Sloped dark mansard rim (y = 60 & 61)
  for (let dx = 0; dx < BW; dx++) {
    for (let dz = 0; dz < BD; dz++) {
      if (dx === 0 || dx === BW - 1 || dz === 0 || dz === BD - 1) {
        set(vx(dx), ROOF_Y + 1, vz(dz), 'coal_ore');
      } else if (dx === 1 || dx === BW - 2 || dz === 1 || dz === BD - 2) {
        set(vx(dx), ROOF_Y + 2, vz(dz), 'coal_ore');
      }
    }
  }
  fill(vx(2), ROOF_Y + 2, vz(2), vx(BW - 3), ROOF_Y + 2, vz(BD - 3), 'cobble');

  store.saveNow('world');
  store.saveNow('facings');
  store.saveNow('signs');

  return {
    placed,
    signsCount,
    bounds: {
      minX: vx(0), maxX: vx(BW + PARK_W),
      minY: F1_BASE, maxY: ROOF_Y + 2,
      minZ: vz(0), maxZ: vz(BD - 1)
    }
  };
}
