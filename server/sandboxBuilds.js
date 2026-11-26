// Sandbox World Permanent Landmarks:
// 1. Happiness Plus Center Clone (from saved snapshot #13, rotated 180° so 1F Main Entrance faces spawn!) at (-75, 34, 94)
// 2. 5-Story Semi-Basement Family Villa (401호 & 402호 mirror-symmetric, side-by-side front doors & split UP/DOWN stairwell) at (-78, 36, -45)
import { createCenterWorld } from './centerWorld.js';
import { BLOCKS } from './blocks.js';

export const SANDBOX_CENTER_ORIGIN = { x: -75, y: 34, z: 94 };
export const SANDBOX_VILLA_ORIGIN = { x: -78, y: 36, z: -45 };
export const SANDBOX_VILLA_BOUNDS = { minX: -80, maxX: -42, minY: 30, maxY: 64, minZ: -66, maxZ: -24 };
export const SANDBOX_CENTER_SNAPSHOT_NUM = 13;

// Load snapshot #13 data if available (falling back to live centerFurn/signOverrides/centerPylon)
export function getCenterSnapshotSource(store, snapshotNum = SANDBOX_CENTER_SNAPSHOT_NUM) {
  const snap = store.loadSnapshot ? store.loadSnapshot(snapshotNum) : null;
  if (snap && snap.entry?.world === 'center' && snap.data) {
    return {
      sourceLabel: `#${snapshotNum} "${snap.entry.name}"`,
      centerFurn: snap.data.centerFurn || {},
      signOverrides: snap.data.signOverrides || {},
      centerPylon: snap.data.centerPylon || store.centerPylon
    };
  }
  return {
    sourceLabel: '현재 행복플러스센터',
    centerFurn: store.centerFurn || {},
    signOverrides: store.signOverrides || {},
    centerPylon: store.centerPylon
  };
}

// Compute rotated (180° around Y) Pylon coordinates for Sandbox clone so it stands right outside the 1F Main Entrance!
export function getSandboxCenterPylon(store) {
  const src = getCenterSnapshotSource(store);
  const p = src.centerPylon || { x: -25.5, y: 5.0, z: 2.2, rotY: 0 };
  return {
    x: SANDBOX_CENTER_ORIGIN.x - (p.x ?? -25.5),
    y: SANDBOX_CENTER_ORIGIN.y + ((p.y ?? 5.0) - 4),
    z: SANDBOX_CENTER_ORIGIN.z - (p.z ?? 2.2),
    rotY: (p.rotY || 0) + Math.PI
  };
}

// Copy Happiness Plus Center (snapshot #13, rotated 180° so 1F Main Entrance faces Sandbox spawn!)
// into the Sandbox World at (-75, 34, 94). Also used by /행플복구!
export function stampCenterIntoSandbox(store, origin = SANDBOX_CENTER_ORIGIN) {
  const cw = createCenterWorld();
  const src = getCenterSnapshotSource(store);

  // Apply snapshot #13 sign overrides
  for (const [k, txt] of Object.entries(src.signOverrides || {})) {
    if (k.startsWith('center:')) {
      const coord = k.slice(7);
      if (cw.signs[coord]) cw.signs[coord].text = txt;
      else {
        const [x, y, z] = coord.split(',').map(Number);
        if (Number.isFinite(x)) cw.signs[coord] = { x, y, z, text: txt, author: 'System' };
      }
    }
  }
  // Apply snapshot #13 custom furniture / block edits!
  for (const f of Object.values(src.centerFurn || {})) {
    if (!f || !cw.inBounds(f.x, f.y, f.z)) continue;
    if (f.block === null) {
      cw.setBlock(f.x, f.y, f.z, null);
      delete cw.facings[`${f.x},${f.y},${f.z}`];
    } else if (BLOCKS[f.block]) {
      cw.setBlock(f.x, f.y, f.z, f.block);
      cw.facings[`${f.x},${f.y},${f.z}`] = Number(f.facing) & 3;
    }
  }

  // Building + entrance canopy + rear 2F parking yard & mechanical parking tower bounds in centerWorld:
  const minCX = -27, maxCX = 38;
  const minCY = 4, maxCY = 48;
  const minCZ = -14, maxCZ = 16;

  // 1. Clear union of both old (unrotated) and new (180°-rotated) footprints so zero stray blocks remain!
  const clearMinX = origin.x - Math.max(Math.abs(minCX), Math.abs(maxCX));
  const clearMaxX = origin.x + Math.max(Math.abs(minCX), Math.abs(maxCX));
  const clearMinZ = origin.z - Math.max(Math.abs(minCZ), Math.abs(maxCZ));
  const clearMaxZ = origin.z + Math.max(Math.abs(minCZ), Math.abs(maxCZ));
  for (let sy = origin.y; sy <= origin.y + (maxCY - 4) + 2; sy++) {
    for (let sx = clearMinX; sx <= clearMaxX; sx++) {
      for (let sz = clearMinZ; sz <= clearMaxZ; sz++) {
        if (store.inBounds(sx, sy, sz) && store.deltas.has(`${sx},${sy},${sz}`)) {
          store.setBlock(sx, sy, sz, null, 'System');
        }
      }
    }
  }

  let placed = 0;
  let signsCount = 0;

  // 2. Solid foundation pad beneath the 180°-rotated building (y = origin.y - 4 .. origin.y - 1)
  for (let cx = minCX; cx <= maxCX; cx++) {
    const sx = origin.x - cx; // 180° rotation!
    for (let cz = minCZ; cz <= maxCZ; cz++) {
      const sz = origin.z - cz; // 180° rotation!
      for (let fy = origin.y - 4; fy < origin.y; fy++) {
        if (store.inBounds(sx, fy, sz)) {
          store.setBlock(sx, fy, sz, 'stone', 'System');
        }
      }
    }
  }

  // 3. Stamp every block + rotated facing (facing + 2) & 3
  for (let cy = minCY; cy <= maxCY; cy++) {
    const sy = origin.y + (cy - 4);
    for (let cx = minCX; cx <= maxCX; cx++) {
      const sx = origin.x - cx; // 180° rotation around Y!
      for (let cz = minCZ; cz <= maxCZ; cz++) {
        const sz = origin.z - cz; // 180° rotation around Y!
        if (!store.inBounds(sx, sy, sz)) continue;
        const bId = cw.getBlock(cx, cy, cz);
        if (bId === 'bedrock') continue;
        store.setBlock(sx, sy, sz, bId || null, 'System');
        const ck = `${cx},${cy},${cz}`;
        if (bId && cw.facings[ck] !== undefined) {
          store.setFacing(sx, sy, sz, (cw.facings[ck] + 2) & 3);
        }
        if (bId) placed++;
      }
    }
  }

  // 4. Copy all signs inside the stamped region (180° rotated)
  for (const s of Object.values(cw.signs)) {
    if (s.x < minCX || s.x > maxCX || s.y < minCY || s.y > maxCY || s.z < minCZ || s.z > maxCZ) continue;
    const sx = origin.x - s.x;
    const sy = origin.y + (s.y - 4);
    const sz = origin.z - s.z;
    if (!store.inBounds(sx, sy, sz)) continue;
    // Only keep sign if a sign block exists there
    const blk = store.getBlock(sx, sy, sz);
    if (blk !== 'sign' && blk !== 'sign_fixed') continue;
    store.signs[`${sx},${sy},${sz}`] = {
      x: sx, y: sy, z: sz,
      text: s.text,
      author: 'System',
      fixed: blk === 'sign_fixed' || !!s.fixed,
      facing: s.facing !== undefined ? ((s.facing + 2) & 3) : 2
    };
    signsCount++;
  }

  store.saveNow('world');
  store.saveNow('facings');
  store.saveNow('signs');

  return {
    placed,
    signsCount,
    sourceLabel: src.sourceLabel,
    bounds: {
      minX: origin.x - maxCX, maxX: origin.x - minCX,
      minY: origin.y, maxY: origin.y + (maxCY - 4),
      minZ: origin.z - maxCZ, maxZ: origin.z - minCZ
    }
  };
}

// Build the 5-Story Semi-Basement Family Villa (1F 반지하 + 2F~5F, 401호 & 402호 mirror-symmetric)
// - Side-by-side unit front doors (현관문) on West side of stairwell landing (dx=11, dz=17 for x02호 & dz=21 for x01호)
// - Split central stairwell (dz=17..21): looking from East entrance, RIGHT (dz=17..18) = UP stairs, LEFT (dz=20..21) = DOWN stairs!
// - 1F semi-basement floor at y=34 so 1F living room windows (y=36..37) sit flush with the y=36 parking lot ground!
export function stampVillaIntoSandbox(store, origin = SANDBOX_VILLA_ORIGIN) {
  const OX = origin.x;      // -78 (west wall of villa)
  const GROUND = origin.y;  // 36  (parking lot / street ground level)
  const OZ = origin.z - 19; // -64 .. -26 (centered around z = -45, depth 39: dz 0..38)

  const BW = 25;     // dx: 0..24 (building footprint)
  const BD = 39;     // dz: 0..38 (North unit 0..16, Stairwell 17..21, South mirror unit 22..38)
  const PARK_W = 10; // dx: 25..34 (right-side parking lot & villa entrance)
  const FLOOR_H = 5; // 1 slab + 4 clear interior blocks per floor
  const F1_BASE = GROUND - 2; // y = 34 (1F 반지하!)

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

  // Clear full villa + parking airspace first
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
  for (const pz of [3, 9, 15, 23, 29, 35]) {
    fill(vx(28), GROUND, vz(pz), vx(33), GROUND, vz(pz), 'wool_white');
  }
  fill(vx(BW), GROUND, vz(17), vx(BW + 2), GROUND, vz(21), 'sand');
  for (const [lx, lz] of [[34, 0], [34, 19], [34, 38]]) {
    set(vx(lx), GROUND + 1, vz(lz), 'stone');
    set(vx(lx), GROUND + 2, vz(lz), 'stone');
    set(vx(lx), GROUND + 3, vz(lz), 'lamp');
  }
  addFixedSign(vx(BW + 1), GROUND + 2, vz(36), '🏠 빌라 입구\n주차장 · 101~502호', 1);
  addFixedSign(vx(BW + 1), GROUND + 2, vz(16), '🅿️ 주차장\n(1F 반지하 거실창)', 1);

  const extMat = (x, y, z) => ((x + y * 2 + z) % 7 === 0 ? 'cobble' : 'wool_white');

  // Build one residential unit (North = x02호 when mirror=false; South = x01호 when mirror=true!)
  // Side-by-side front door (현관문) is at dx=11, lz=17 (opening East onto the stairwell landing!)
  // Entryway (현관) is at dx=9..10, lz=16..18 with 신발장 at dx=9, lz=17..18!
  const buildUnit = (fIdx, baseY, mirror) => {
    const floorNum = fIdx + 1;
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

    // Floor: wooden planks in rooms/living, white tile in bathrooms/balconies, sandstone in 현관 (dx 9..11, lz 16..18)
    for (let dx = 1; dx <= BW - 2; dx++) {
      for (let lz = 1; lz <= 15; lz++) {
        let mat = 'planks';
        if ((dx >= 9 && dx <= 12 && lz >= 1 && lz <= 6) || (dx >= 21 && dx <= 23 && lz >= 1 && lz <= 6) || (dx >= 1 && dx <= 2 && lz >= 11 && lz <= 15)) {
          mat = 'wool_white';
        }
        uSet(dx, 0, lz, mat);
      }
    }
    // Entryway vestibule floor (현관: dx 9..11, lz 16..18)
    for (let dx = 9; dx <= 11; dx++) {
      for (let lz = 16; lz <= 18; lz++) uSet(dx, 0, lz, 'sand');
    }

    const wall = (dx1, lz1, dx2, lz2, hMax = 4) => {
      const aX = Math.min(dx1, dx2), bX = Math.max(dx1, dx2);
      const aZ = Math.min(lz1, lz2), bZ = Math.max(lz1, lz2);
      for (let dy = 1; dy <= hMax; dy++) {
        for (let dx = aX; dx <= bX; dx++) {
          for (let lz = aZ; lz <= bZ; lz++) uSet(dx, dy, lz, 'wool_white');
        }
      }
    };

    // 1. 작은방/서재 (dx 1..7, lz 1..5)
    wall(1, 5, 8, 5);
    wall(8, 1, 8, 5);
    uDoor(7, 1, 5, 'door_closed', 2);
    // 2. 화장실 1 & 화장실 2 (dx 9..12, lz 1..6)
    wall(9, 3, 12, 3);
    wall(9, 6, 12, 6);
    wall(12, 1, 12, 6);
    uDoor(12, 1, 2, 'door_closed', 1);
    uDoor(10, 1, 6, 'door_closed', 2);
    // 3. 안방 (dx 13..20, lz 1..6) & 베란다 (dx 21..23, lz 1..6)
    wall(13, 6, 23, 6);
    wall(20, 1, 20, 6);
    uDoor(14, 1, 6, 'door_closed', 2);
    uDoor(20, 1, 5, 'door_glass_closed', 1);
    // 4. 종현이방 (dx 3..8, lz 11..15) & 세탁실 (dx 1..2, lz 11..15)
    wall(1, 10, 8, 10);
    wall(3, 11, 3, 15);
    wall(8, 11, 8, 18); // separates 종현이방 & 현관 신발장
    uDoor(7, 1, 10, 'door_closed', 0);
    uDoor(3, 1, 11, 'door_glass_closed', 3);

    // 5. 현관 (dx 9..11, lz 16..18) — Front door (현관문) opens EAST onto stairwell landing, side-by-side with neighbor!
    // Wall along dx = 11 separating 현관 from stairwell landing (dx = 12..14)
    wall(11, 16, 11, 18);
    // Clear opening between 현관 (lz=16) and unit hallway/living room (lz=15) at dx=9..10!
    for (let dy = 1; dy <= 3; dy++) {
      uSet(9, dy, 16, null);
      uSet(10, dy, 16, null);
    }
    // Side-by-side Front Door (현관문) at dx = 11, lz = 17 opening EAST (facing 1)!
    uDoor(11, 1, 17, 'door_iron_closed', 1);
    // 신발장 on West wall of 현관 (dx = 9, lz = 17..18)
    uSet(9, 1, 17, 'furn_cabinet');
    uSet(9, 1, 18, 'furn_cabinet');

    // ---- Furniture ----
    // 작은방/서재
    uSet(2, 1, 1, 'furn_cabinet');
    uSet(3, 1, 1, 'furn_cabinet');
    uSet(1, 1, 3, 'planks'); uSet(2, 1, 3, 'planks');
    uSet(1, 2, 3, 'bed'); uSet(2, 2, 3, 'bed');
    uSet(3, 1, 3, 'ladder');
    uSet(4, 1, 4, 'furn_office_desk', 2);
    uSet(4, 1, 3, 'furn_office_chair', 2);
    uSet(6, 1, 1, 'furn_cabinet');

    // 부엌
    uSet(1, 1, 6, 'cobble');
    uSet(1, 1, 7, 'water');
    uSet(1, 1, 8, 'furnace');
    uSet(1, 1, 9, 'cobble');
    uSet(4, 1, 9, 'job_fridge');
    uSet(5, 1, 9, 'job_fridge');
    uSet(7, 1, 7, 'furn_white_table');
    uSet(7, 1, 8, 'furn_white_table');
    uSet(6, 1, 7, 'furn_office_chair', 1);
    uSet(8, 1, 8, 'furn_office_chair', 3);

    // 종현이방 & 세탁실
    uSet(4, 1, 11, 'wool_yellow'); uSet(5, 1, 11, 'wool_blue');
    uSet(4, 2, 11, 'wool_blue'); uSet(5, 2, 11, 'wool_yellow');
    uSet(4, 1, 13, 'bed'); uSet(5, 1, 13, 'bed');
    uSet(5, 1, 15, 'furn_tv_screen', 0);
    uSet(4, 1, 15, 'furn_cabinet');
    uSet(7, 1, 14, 'furn_cabinet');
    uSet(1, 1, 14, 'wool_white'); uSet(1, 2, 14, 'glass');

    // 화장실 1 & 2 (뚜껑 개폐 변기!)
    uSet(9, 1, 1, 'furn_toilet_closed', 1);
    uSet(10, 1, 2, 'water');
    uSet(9, 1, 4, 'furn_toilet_closed', 1);
    uSet(11, 1, 4, 'water');

    // 안방 & 베란다
    uSet(14, 1, 1, 'furn_cabinet'); uSet(15, 1, 1, 'furn_cabinet'); uSet(16, 1, 1, 'furn_cabinet');
    uSet(17, 1, 3, 'bed'); uSet(18, 1, 3, 'bed');
    uSet(17, 1, 4, 'bed'); uSet(18, 1, 4, 'bed');
    uSet(16, 1, 5, 'furn_cabinet');
    uSet(21, 1, 2, 'furn_cabinet');

    // 거실
    uSet(16, 1, 7, 'furn_cafe_table');
    uSet(17, 1, 7, 'furn_cafe_table');
    uSet(16, 1, 14, 'furn_sofa', 0);
    uSet(17, 1, 14, 'furn_sofa', 0);
    uSet(18, 1, 14, 'furn_sofa', 0);
    uSet(14, 1, 14, 'furn_cabinet');
    uSet(22, 1, 14, 'wool_white');
    uSet(22, 2, 14, 'wool_white');
    uSet(22, 3, 14, 'slab_white');
    for (let dx = 14; dx <= 21; dx++) {
      for (let lz = 9; lz <= 12; lz++) uSet(dx, 0, lz, 'planks');
    }

    // Ceiling lamps
    for (const [lx, lz] of [[4, 3], [5, 8], [6, 13], [10, 5], [16, 3], [17, 10], [21, 10], [10, 17]]) {
      uSet(lx, 4, lz, 'lamp');
    }

    // Unit number plaque right beside the side-by-side front door on the landing!
    uSign(12, 2, 18, `🏠 ${unitLabel}`, 1);

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

    // Outer textured white stone-brick shell
    for (let y = baseY; y <= ceilY; y++) {
      for (let dx = 0; dx < BW; dx++) {
        for (let dz = 0; dz < BD; dz++) {
          const onOuter = (dx === 0 || dx === BW - 1 || dz === 0 || dz === BD - 1);
          if (!onOuter) continue;
          const isWinY = (y === baseY + 2 || y === baseY + 3);
          const isEastWin = (dx === BW - 1 && isWinY && (
            (dz >= 8 && dz <= 14) || (dz >= 24 && dz <= 30) ||
            (dz >= 2 && dz <= 5) || (dz >= 33 && dz <= 36)
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

    // Stairwell outer walls along dz=16 (North) & dz=22 (South), leaving dx=9..10 open for 현관 entry!
    for (let y = baseY + 1; y < ceilY; y++) {
      for (let dx = 1; dx < BW - 1; dx++) {
        set(vx(dx), y, vz(16), 'wool_white');
        set(vx(dx), y, vz(22), 'wool_white');
      }
      // Solid center dividing wall between the two units & entryways (dz=19, dx=1..11)
      for (let dx = 1; dx <= 11; dx++) {
        set(vx(dx), y, vz(19), 'wool_white');
      }
    }

    // Build North unit (x02호) & South mirror unit (x01호)
    buildUnit(fIdx, baseY, false);
    buildUnit(fIdx, baseY, true);

    // West Front-Door Landing (dx = 12..14, dz = 17..21) right in front of the side-by-side x02호 & x01호 doors!
    fill(vx(12), baseY, vz(17), vx(14), baseY, vz(21), 'cobble');
    set(vx(13), baseY + 4, vz(19), 'lamp');
    set(vx(22), baseY + 4, vz(19), 'lamp');
  }

  // ---- Split Central Stairwell (dx = 15..23, dz = 17..21) ----
  // Looking West (-X) from the East Villa Entrance (dx=24):
  //   RIGHT lane (dz = 17..18): 올라가는 계단 (climbs West -X to the next floor's front-door landing!)
  //   CENTER divider (dz = 19, dx = 15..20): separates UP & DOWN flights
  //   LEFT  lane (dz = 20..21): 내려가는 계단 (goes DOWN West -X to 1F 반지하, or climbs East +X from a floor landing to the East mid-landing!)

  // 1. Villa Main Entrance at East wall (y = GROUND = 36, dx = 24, dz = 17..21)
  for (let y = GROUND + 1; y <= GROUND + 3; y++) {
    for (let dz = 18; dz <= 20; dz++) set(vx(BW - 1), y, vz(dz), null);
  }
  setDoor(vx(BW - 1), GROUND + 1, vz(19), 'door_glass_closed', 1);
  // Entrance landing (dx = 21..23, dz = 17..21 at y = GROUND = 36)
  fill(vx(21), GROUND, vz(17), vx(23), GROUND, vz(21), 'cobble');

  // From Entrance (y=36) LEFT lane (dz=20..21) -> DOWN 2 steps West to 1F 반지하 landing (y=34)
  for (const dz of [20, 21]) {
    set(vx(20), GROUND - 1, vz(dz), 'stairs_stone', 1); // y=35
    set(vx(19), GROUND - 2, vz(dz), 'cobble');          // y=34
    fill(vx(15), F1_BASE, vz(dz), vx(18), F1_BASE, vz(dz), 'cobble');
  }
  // From Entrance (y=36) RIGHT lane (dz=17..18) -> UP 3 steps West to 2F landing (y=39)
  for (const dz of [17, 18]) {
    set(vx(20), GROUND + 1, vz(dz), 'stairs_stone', 3); // y=37
    set(vx(19), GROUND + 2, vz(dz), 'stairs_stone', 3); // y=38
    set(vx(18), GROUND + 3, vz(dz), 'stairs_stone', 3); // y=39
    fill(vx(15), GROUND + 3, vz(dz), vx(17), GROUND + 3, vz(dz), 'cobble');
  }

  // 2. Upper split flights: 2F->3F (fIdx=1), 3F->4F (fIdx=2), 4F->5F (fIdx=3)
  for (let fIdx = 1; fIdx <= 3; fIdx++) {
    const baseY = F1_BASE + fIdx * FLOOR_H; // 39, 44, 49
    const midY = baseY + 2;                 // 41, 46, 51
    const nextY = baseY + FLOOR_H;          // 44, 49, 54

    // East mid-landing connecting Left & Right lanes (dx = 21..23, dz = 17..21 at midY)
    fill(vx(21), midY, vz(17), vx(23), midY, vz(21), 'cobble');

    // LEFT lane (dz = 20..21): connects West landing (baseY) <-> East mid-landing (midY)
    // (Climbs East +X following the bottom green arrow; goes DOWN West when viewed from East!)
    for (const dz of [20, 21]) {
      set(vx(15), baseY, vz(dz), 'cobble');
      set(vx(16), baseY + 1, vz(dz), 'stairs_stone', 1);
      set(vx(17), baseY + 2, vz(dz), 'stairs_stone', 1);
      fill(vx(18), midY, vz(dz), vx(20), midY, vz(dz), 'cobble');
    }

    // RIGHT lane (dz = 17..18): connects East mid-landing (midY) -> Next Floor West landing (nextY)
    // (Climbs West -X following the top green arrow — RIGHT side is UP when viewed from East!)
    for (const dz of [17, 18]) {
      set(vx(20), midY + 1, vz(dz), 'stairs_stone', 3);
      set(vx(19), midY + 2, vz(dz), 'stairs_stone', 3);
      set(vx(18), midY + 3, vz(dz), 'stairs_stone', 3);
      fill(vx(15), nextY, vz(dz), vx(17), nextY, vz(dz), 'cobble');
    }

    // Center dividing wall/railing along dz=19, dx=15..20 between the two flights
    for (let dx = 15; dx <= 20; dx++) {
      set(vx(dx), midY, vz(19), 'stone');
      set(vx(dx), midY + 1, vz(19), 'glass');
    }
  }
  // Center divider at ground entrance level
  for (let dx = 15; dx <= 20; dx++) {
    set(vx(dx), GROUND, vz(19), 'stone');
    set(vx(dx), GROUND + 1, vz(19), 'glass');
  }

  // Roof Slab + Dark Sloped Mansard Roof Cap
  const ROOF_Y = F1_BASE + 5 * FLOOR_H; // y = 59
  fill(vx(0), ROOF_Y, vz(0), vx(BW - 1), ROOF_Y, vz(BD - 1), 'stone');
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

// Propagate the live customized 402호 layout (blocks, facings, signs) across ALL 5 floors:
// - 102호, 202호, 302호, 402호, 502호: exact copy of 402호
// - 101호, 201호, 301호, 401호, 501호: exact Z-mirror of 402호 (with N/S facing flip 0 <-> 2)
// Also guarantees every dy=0 floor block is solid (never slab_white / air) so players never fall through!
export function propagateVillaFrom402(store, origin = SANDBOX_VILLA_ORIGIN) {
  const OX = origin.x;      // -78
  const GROUND = origin.y;  // 36
  const OZ = origin.z - 19; // -64
  const BD = 39;            // dz: 0..38
  const FLOOR_H = 5;
  const F1_BASE = GROUND - 2; // 34
  const BASE_402 = F1_BASE + 3 * FLOOR_H; // 49 (4F)

  const vx = (dx) => OX + dx;
  const vz = (dz) => OZ + dz;

  // 1. Capture live 402호 template:
  //    Main rooms: dx = 1..23, lz = 1..15 (dy = 0..4)
  //    Entryway & corridor wall: dx = 1..11, lz = 16..18 (dy = 0..4)
  //    Stairwell-side wall: dx = 12..23, lz = 16 (dy = 0..4)
  const inUnitTemplate = (dx, lz) => (
    (dx >= 1 && dx <= 23 && lz >= 1 && lz <= 16) ||
    (dx >= 1 && dx <= 11 && lz >= 17 && lz <= 18)
  );

  const template = [];
  for (let dy = 0; dy <= 4; dy++) {
    for (let dx = 1; dx <= 23; dx++) {
      for (let lz = 1; lz <= 18; lz++) {
        if (!inUnitTemplate(dx, lz)) continue;
        const sx = vx(dx), sy = BASE_402 + dy, sz = vz(lz);
        const k = `${sx},${sy},${sz}`;
        let blk = store.getBlock(sx, sy, sz);
        // Never allow non-solid slab_white or air holes on the floor slab (dy=0)!
        if (dy === 0 && (!blk || blk === 'slab_white')) blk = 'planks';
        const facing = store.facings[k];
        const sign = store.signs[k] ? { ...store.signs[k] } : null;
        template.push({ dx, dy, lz, blk, facing, sign });
      }
    }
  }

  let updated = 0;
  for (let fIdx = 0; fIdx < 5; fIdx++) {
    const baseY = F1_BASE + fIdx * FLOOR_H;
    const floorNum = fIdx + 1;

    for (const mirror of [false, true]) {
      const unitLabel = `${floorNum}0${mirror ? '1' : '2'}호`;
      const mapZ = (lz) => vz(mirror ? (BD - 1 - lz) : lz);
      const mapFace = (f) => {
        if (f === undefined) return undefined;
        if (!mirror) return f & 3;
        if (f === 0) return 2;
        if (f === 2) return 0;
        return f & 3;
      };

      for (const cell of template) {
        const tx = vx(cell.dx);
        const ty = baseY + cell.dy;
        const tz = mapZ(cell.lz);
        if (!store.inBounds(tx, ty, tz)) continue;
        const tk = `${tx},${ty},${tz}`;
        store.setBlock(tx, ty, tz, cell.blk || null, 'System');
        if (cell.blk && cell.facing !== undefined) {
          store.setFacing(tx, ty, tz, mapFace(cell.facing));
        }
        if (cell.sign && (cell.blk === 'sign' || cell.blk === 'sign_fixed')) {
          const text = String(cell.sign.text || '').replace(/402호/g, unitLabel);
          store.signs[tk] = {
            x: tx, y: ty, z: tz,
            text,
            author: cell.sign.author || 'System',
            fixed: cell.blk === 'sign_fixed' || !!cell.sign.fixed,
            facing: mapFace(cell.sign.facing ?? cell.facing ?? 2)
          };
        }
        updated++;
      }

      // Refresh each unit's own front door plaque on the stairwell landing (dx=12, lz=18)
      const px = vx(12), py = baseY + 2, pz = mapZ(18);
      if (store.inBounds(px, py, pz)) {
        store.setBlock(px, py, pz, 'sign_fixed', 'System');
        store.setFacing(px, py, pz, 1);
        store.signs[`${px},${py},${pz}`] = { x: px, y: py, z: pz, text: `🏠 ${unitLabel}`, author: 'System', fixed: true, facing: 1 };
      }
    }
  }

  store.saveNow('world');
  store.saveNow('facings');
  store.saveNow('signs');
  return { updated };
}

// Build a sample circular train loop right near central spawn (x: -12..8, z: 10..20, y = 37)
// Showcases: straight, curve, cross, switchable branch, yellow whistle card, red stop card & a 3-car train!
export function stampSampleTrainLoop(store, trains) {
  const Y = 37; // rail surface level (solid bed at Y-1 = 36)
  const setRail = (x, z, id, facing = 0) => {
    // Ensure flat solid rail bed underneath & clear 3 blocks of air above
    for (let fy = Y - 3; fy <= Y - 2; fy++) store.setBlock(x, fy, z, 'dirt', 'System');
    store.setBlock(x, Y - 1, z, 'cobble', 'System');
    for (let cy = Y + 1; cy <= Y + 3; cy++) store.setBlock(x, cy, z, null, 'System');
    store.setBlock(x, Y, z, id, 'System');
    store.setFacing(x, Y, z, facing & 3);
  };

  // Clear inside platform edge around station sign
  for (let x = -13; x <= 9; x++) {
    for (let z = 9; z <= 21; z++) {
      if (store.getBlock(x, Y - 1, z) === null || store.getBlock(x, Y - 1, z) === 'water') {
        store.setBlock(x, Y - 1, z, 'grass', 'System');
      }
    }
  }

  // 4 Curve Corners: 0=N<->E, 1=E<->S, 2=S<->W, 3=W<->N
  setRail(-12, 10, 'rail_curve', 1); // NW corner: E <-> S
  setRail(8, 10, 'rail_curve', 2);   // NE corner: S <-> W
  setRail(8, 20, 'rail_curve', 3);   // SE corner: W <-> N
  setRail(-12, 20, 'rail_curve', 0); // SW corner: N <-> E

  // North & South Straightaways (East-West, facing 1)
  for (let x = -11; x <= 7; x++) {
    setRail(x, 10, 'rail_straight', 1);
    setRail(x, 20, 'rail_straight', 1);
  }
  // West & East Straightaways (North-South, facing 0)
  for (let z = 11; z <= 19; z++) {
    setRail(-12, z, 'rail_straight', 0);
    setRail(8, z, 'rail_straight', 0);
  }

  // Yellow Whistle Card on North straightaway right in front of spawn!
  setRail(2, 10, 'rail_card_yellow', 1);

  // Switchable Branch Junction at (-2, 10) -> inner siding x = -2, z = 11..19 -> rejoins at (-2, 20)
  setRail(-2, 10, 'rail_branch', 1); // rear=W, straight=E, branch=S!
  for (let z = 11; z <= 19; z++) {
    setRail(-2, z, 'rail_straight', 0);
  }
  setRail(-2, 20, 'rail_branch', 3); // rear=E, straight=W, branch=N!
  // Red Stop Card on the inner siding (switch branch to green to divert and stop here!)
  setRail(-2, 13, 'rail_card_red', 0);
  // Crossing rail at (-2, 15) with short decorative cross-track
  setRail(-2, 15, 'rail_cross', 0);
  setRail(-4, 15, 'rail_straight', 1);
  setRail(-3, 15, 'rail_straight', 1);
  setRail(-1, 15, 'rail_straight', 1);
  setRail(0, 15, 'rail_straight', 1);

  // Station platform & fixed instruction sign right beside the North track!
  store.setBlock(-4, Y - 1, 9, 'planks', 'System');
  store.setBlock(-4, Y, 9, 'sign_fixed', 'System');
  store.setFacing(-4, Y, 9, 0);
  store.signs[`-4,${Y},9`] = {
    x: -4, y: Y, z: 9,
    text: '🚂 중앙 순환 기차역\n선두 우클릭: 출발/정지\n분기레일 우클릭: 전환',
    author: 'System', fixed: true, facing: 0
  };
  // Cozy station lamp
  store.setBlock(4, Y - 1, 9, 'stone', 'System');
  store.setBlock(4, Y, 9, 'stone', 'System');
  store.setBlock(4, Y + 1, 9, 'lamp', 'System');

  store.saveNow('world');
  store.saveNow('facings');
  store.saveNow('signs');

  // Spawn a ready-to-ride 3-car sample train on the North straightaway if none exists nearby
  if (trains && !trains.findTrainNear(-6, Y, 10, 8)) {
    trains.spawnTrain(-6, Y, 10, 1, 3, 'System', false);
  }
}
