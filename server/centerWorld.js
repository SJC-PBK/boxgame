// Dedicated 80x48x64 Happiness Plus Center World (5F + Rooftop Terrace)
// 1F: Detailed floor plan (Vestibule, ELEV, Stairwell, EPS/PS, Restrooms, MDF, Barista, Cafe Hall, Meeting #1/#2)
// 2F~5F: Same ELEV, Stairwell, EPS/PS & Restrooms; remaining space kept open & empty
// Exterior: Modern 5-story gray-frame & blue-glass curtain wall + rooftop pergola overhang
import { BLOCKS, NUM_TO_BLOCK } from './blocks.js';
import { encodeRLE } from './worldStore.js';

export const CENTER_BOUNDS = {
  minX: -40,
  maxX: 39,
  minY: 0,
  maxY: 47,
  minZ: -32,
  maxZ: 31
};

const SX = CENTER_BOUNDS.maxX - CENTER_BOUNDS.minX + 1; // 80
const SY = CENTER_BOUNDS.maxY - CENTER_BOUNDS.minY + 1; // 48
const SZ = CENTER_BOUNDS.maxZ - CENTER_BOUNDS.minZ + 1; // 64
const VOL = SX * SY * SZ;

function idxOf(x, y, z) {
  return (x - CENTER_BOUNDS.minX) + SX * ((z - CENTER_BOUNDS.minZ) + SZ * (y - CENTER_BOUNDS.minY));
}

export function createCenterWorld() {
  const grid = new Uint8Array(VOL);
  const signs = {};
  const facings = {};

  const inB = (x, y, z) => (
    x >= CENTER_BOUNDS.minX && x <= CENTER_BOUNDS.maxX &&
    y >= CENTER_BOUNDS.minY && y <= CENTER_BOUNDS.maxY &&
    z >= CENTER_BOUNDS.minZ && z <= CENTER_BOUNDS.maxZ
  );

  const set = (x, y, z, id, facing = undefined) => {
    if (!inB(x, y, z)) return;
    grid[idxOf(x, y, z)] = id ? (BLOCKS[id]?.numId || 0) : 0;
    const k = `${x},${y},${z}`;
    if (facing !== undefined) facings[k] = facing & 3;
    else if (!id) delete facings[k];
  };

  const fill = (x1, y1, z1, x2, y2, z2, id) => {
    const minx = Math.min(x1, x2), maxx = Math.max(x1, x2);
    const miny = Math.min(y1, y2), maxy = Math.max(y1, y2);
    const minz = Math.min(z1, z2), maxz = Math.max(z1, z2);
    for (let y = miny; y <= maxy; y++) {
      for (let x = minx; x <= maxx; x++) {
        for (let z = minz; z <= maxz; z++) {
          set(x, y, z, id);
        }
      }
    }
  };

  const addSign = (x, y, z, text) => {
    set(x, y, z, 'sign');
    signs[`${x},${y},${z}`] = { x, y, z, text, author: 'System' };
  };

  const setDoor = (x, y, z, id = 'door_closed', facing = 0) => {
    set(x, y, z, id, facing);
    set(x, y + 1, z, id, facing);
  };

  // Building origin: dx in 0..41 (X: -21..20), dz in 0..19 (Z: -10..9)
  const OX = -21;
  const OZ = -10;
  const BW = 42; // dx: 0..41
  const BD = 20; // dz: 0..19
  const GROUND = 4;
  const FLOOR_H = 6; // 1 slab + 5 blocks clear interior height
  const NUM_FLOORS = 5; // 1F..5F + Rooftop at y = 4 + 5*6 = 34

  const bx = (dx) => OX + dx;
  const bz = (dz) => OZ + dz;

  // 1. Base Terrain, Sidewalk, Tactile Paving, City Road & Street Trees
  for (let x = CENTER_BOUNDS.minX; x <= CENTER_BOUNDS.maxX; x++) {
    for (let z = CENTER_BOUNDS.minZ; z <= CENTER_BOUNDS.maxZ; z++) {
      set(x, 0, z, 'bedrock');
      set(x, 1, z, 'stone');
      set(x, 2, z, 'dirt');
      set(x, 3, z, 'dirt');
      set(x, GROUND, z, 'grass');
    }
  }

  // Wide sidewalk plaza around building (front & left entrance)
  fill(OX - 8, GROUND, OZ - 4, OX + BW + 4, GROUND, OZ + BD + 6, 'cobble');
  // Lighter paved walkway right in front of left entrance & south facade
  for (let x = OX - 7; x <= OX + BW + 2; x++) {
    for (let z = OZ - 2; z <= OZ + BD + 4; z++) {
      if ((x + z) % 2 === 0) set(x, GROUND, z, 'stone');
    }
  }
  // Yellow tactile paving strip leading into the main entrance (left side, dz=6..7)
  fill(OX - 8, GROUND, bz(6), OX - 1, GROUND, bz(6), 'wool_yellow');

  // Wide 4-lane city road along South (Z: 17..28) & West (X: -38..-30)
  fill(CENTER_BOUNDS.minX, GROUND, 17, CENTER_BOUNDS.maxX, GROUND, 28, 'stone');
  fill(-38, GROUND, CENTER_BOUNDS.minZ, -30, GROUND, CENTER_BOUNDS.maxZ, 'stone');
  // White road lane dashes & crosswalk stripes
  for (let x = CENTER_BOUNDS.minX + 1; x <= CENTER_BOUNDS.maxX - 1; x++) {
    if (Math.floor(x / 3) % 2 === 0) set(x, GROUND, 22, 'wool_white');
  }
  for (let z = CENTER_BOUNDS.minZ + 1; z <= CENTER_BOUNDS.maxZ - 1; z++) {
    if (Math.floor(z / 3) % 2 === 0) set(-34, GROUND, z, 'wool_white');
  }
  // Crosswalk in front of building entrance
  for (let z = 18; z <= 27; z += 2) {
    fill(OX - 4, GROUND, z, OX + 2, GROUND, z, 'wool_white');
  }

  // Street trees along the boulevard & left planter (like Photos 2 & 3)
  const plantTree = (tx, tz, h = 4) => {
    set(tx, GROUND, tz, 'dirt');
    for (let dy = 1; dy <= h; dy++) set(tx, GROUND + dy, tz, 'wood');
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        for (let dy = h - 1; dy <= h + 1; dy++) {
          if (Math.abs(dx) === 2 && Math.abs(dz) === 2 && dy === h + 1) continue;
          if (dx === 0 && dz === 0 && dy <= h) continue;
          set(tx + dx, GROUND + dy, tz + dz, 'leaves');
        }
      }
    }
    set(tx, GROUND + h + 2, tz, 'leaves');
  };
  for (const [tx, tz] of [[-26, 13], [-14, 14], [0, 14], [14, 14], [-26, -12], [24, 12]]) {
    plantTree(tx, tz, 4);
  }
  // Street lamps
  for (const [lx, lz] of [[-28, 3], [-28, 12], [-8, 15], [8, 15], [22, 15]]) {
    set(lx, GROUND + 1, lz, 'stone');
    set(lx, GROUND + 2, lz, 'stone');
    set(lx, GROUND + 3, lz, 'stone');
    set(lx, GROUND + 4, lz, 'lamp');
  }

  // Helper: check if (dx, dz) is inside the building footprint (note 1F bottom-left outdoor alcove dx=0..3, dz=13..19)
  const inFootprint = (dx, dz, floorIdx) => {
    if (dx < 0 || dx >= BW || dz < 0 || dz >= BD) return false;
    // Recessed entry alcove on 1F bottom-left (matches floor plan!)
    if (floorIdx === 0 && dx <= 3 && dz >= 13) return false;
    return true;
  };

  // 2. Build Floors 1F..5F (Outer Curtain-Wall Shell + Shared Core)
  for (let f = 0; f < NUM_FLOORS; f++) {
    const baseY = GROUND + f * FLOOR_H; // 4, 10, 16, 22, 28
    const ceilY = baseY + FLOOR_H;      // 10, 16, 22, 28, 34

    // 2a. Floor slab (for f=0 ground floor or upper floors)
    for (let dx = 0; dx < BW; dx++) {
      for (let dz = 0; dz < BD; dz++) {
        if (!inFootprint(dx, dz, f)) continue;
        // Upper floors use bright modern floor (planks in main area, sand in hallway)
        const floorMat = (f === 0) ? 'planks' : (dz <= 8 ? 'sand' : 'planks');
        set(bx(dx), baseY, bz(dz), floorMat);
      }
    }

    // Clear interior air (y = baseY+1 .. ceilY-1)
    for (let dx = 1; dx < BW - 1; dx++) {
      for (let dz = 1; dz < BD - 1; dz++) {
        if (!inFootprint(dx, dz, f)) continue;
        for (let y = baseY + 1; y < ceilY; y++) {
          set(bx(dx), y, bz(dz), null);
        }
      }
    }

    // 2b. Outer Walls — Modern Gray Composite Frame & Glass Curtain Wall (Photos 2 & 3)
    for (let y = baseY + 1; y <= ceilY; y++) {
      const isSpandrel = (y === ceilY); // horizontal gray slab band between floors
      for (let dx = 0; dx < BW; dx++) {
        for (let dz = 0; dz < BD; dz++) {
          if (!inFootprint(dx, dz, f)) continue;
          const onNorth = (dz === 0);
          const onSouth = (dz === BD - 1) || (f === 0 && dz === 12 && dx <= 3);
          const onWest = (dx === 0) || (f === 0 && dx === 4 && dz >= 12);
          const onEast = (dx === BW - 1);
          if (!onNorth && !onSouth && !onWest && !onEast) continue;

          // Strong gray structural frame corners & mullions (like Photo 2!)
          const isCornerPillar =
            (dx <= 1 && dz <= 1) ||
            (dx >= BW - 2 && dz <= 1) ||
            (dx >= BW - 2 && dz >= BD - 2) ||
            (dx <= 1 && dz >= BD - 2) ||
            (f === 0 && dx === 4 && (dz === 12 || dz === BD - 1));

          // Photo 2 signature vertical stone column dividing narrow stairwell glass & wide main glass
          const isVerticalFrame =
            (onSouth && (dx === 8 || dx === 9 || dx === 24 || dx === 35)) ||
            (onWest && (dz === 3 || dz === 11)) ||
            (onEast && (dz === 9 || dz === 10));

          if (isSpandrel || isCornerPillar || isVerticalFrame) {
            set(bx(dx), y, bz(dz), (y === ceilY) ? 'stone' : 'cobble');
            continue;
          }

          // South facade (front boulevard): full blue-glass curtain wall!
          if (onSouth) {
            set(bx(dx), y, bz(dz), 'glass');
            continue;
          }
          // West facade (main entrance face): full glass curtain wall on 2F~5F, entrance doors on 1F!
          if (onWest) {
            set(bx(dx), y, bz(dz), 'glass');
            continue;
          }
          // East facade: modern gray stone with sleek horizontal strip windows
          if (onEast) {
            const isWin = (y >= baseY + 2 && y <= baseY + 4 && dz >= 3 && dz <= 16 && dz !== 9 && dz !== 10);
            set(bx(dx), y, bz(dz), isWin ? 'glass' : 'stone');
            continue;
          }
          // North facade (back wall behind ELEV/Stairs/Restrooms): gray stone with restroom & stairwell windows
          if (onNorth) {
            const isWin = (y >= baseY + 2 && y <= baseY + 4) && (
              (dx >= 11 && dx <= 16) || // stairwell window
              (dx >= 24 && dx <= 26) || // women's restroom window
              (dx >= 31 && dx <= 33) || // men's restroom window
              (dx >= 37 && dx <= 39)    // east room window
            );
            set(bx(dx), y, bz(dz), isWin ? 'glass' : 'stone');
          }
        }
      }
    }

    // 2c. Shared Core on ALL 5 Floors: ELEV, 계단실, EPS/PS, 여자화장실, 남자화장실
    // -- ELEV. (dx = 5..8, dz = 1..4) — Real Moving Elevator Shaft (1F~5F) --
    fill(bx(5), baseY + 1, bz(1), bx(8), ceilY - 1, bz(4), null);
    // Open vertical shaft through upper floor slabs (f >= 1) so the moving cab glides smoothly!
    if (f >= 1) {
      fill(bx(6), baseY, bz(1), bx(7), baseY, bz(3), null);
    } else {
      fill(bx(6), baseY, bz(1), bx(7), baseY, bz(3), 'stone'); // 1F pit floor
    }
    // Shaft walls (leave dz=4 doorway for iron doors)
    for (let y = baseY + 1; y < ceilY; y++) {
      for (let dz = 1; dz <= 4; dz++) {
        set(bx(5), y, bz(dz), 'stone');
        set(bx(8), y, bz(dz), 'stone');
      }
      for (let dx = 5; dx <= 8; dx++) {
        set(bx(dx), y, bz(4), 'stone');
      }
    }
    // Shaft floor indicator light on left wall
    set(bx(5), baseY + 3, bz(2), 'lamp');
    // Iron elevator doors opening south (dz = 4, dx = 6..7) — 1F starts open!
    const initDoor = f === 0 ? 'door_iron_open' : 'door_iron_closed';
    setDoor(bx(6), baseY + 1, bz(4), initDoor, 2);
    setDoor(bx(7), baseY + 1, bz(4), initDoor, 2);
    // Call button (lever) & sign right outside elevator entrance on each floor
    set(bx(8), baseY + 2, bz(5), 'lever_off');
    addSign(bx(5), baseY + 2, bz(5), `🛗 엘리베이터 (${f + 1}F)\n문·버튼 우클릭: 호출\n탑승 후 [1~5]층 선택`);

    // -- 계단실 (dx = 9..18, dz = 1..5) --
    // Clear stairwell interior & cut ceiling void above stairs so player walks smoothly 1F->5F->Roof!
    fill(bx(9), baseY + 1, bz(1), bx(18), ceilY - 1, bz(4), null);
    // Cut stairwell void in the floor slab for f >= 1 (preserve landing dx=9..11 AND top step dx=12,dz=1..2!)
    if (f >= 1) {
      fill(bx(12), baseY, bz(3), bx(17), baseY, bz(4), null);
      fill(bx(13), baseY, bz(1), bx(17), baseY, bz(2), null);
    }
    // Enclosing walls of stairwell (dx = 18 east wall, dz = 5 south wall)
    for (let y = baseY + 1; y < ceilY; y++) {
      for (let dz = 1; dz <= 5; dz++) set(bx(18), y, bz(dz), 'stone');
      for (let dx = 9; dx <= 18; dx++) set(bx(dx), y, bz(5), 'stone');
    }
    // Stairwell door at dx = 10, dz = 5
    setDoor(bx(10), baseY + 1, bz(5), 'door_stone_closed', 2);
    // Landing floor at dx = 9..11, dz = 1..4
    fill(bx(9), baseY, bz(1), bx(11), baseY, bz(4), 'cobble');
    // UP Flight (dz = 3..4): climbs +X (facing 1) from dx=12 (y+1) -> dx=13 (y+2) -> dx=14 (y+3)
    for (let step = 0; step < 3; step++) {
      const sx = bx(12 + step);
      const sy = baseY + 1 + step;
      set(sx, sy, bz(3), 'stairs_stone', 1);
      set(sx, sy, bz(4), 'stairs_stone', 1);
      // Solid under-step support
      if (step > 0) {
        set(sx, sy - 1, bz(3), 'stone');
        set(sx, sy - 1, bz(4), 'stone');
      }
    }
    // Mid-landing (dx = 15..17, dz = 1..4) at y = baseY + 3
    fill(bx(15), baseY + 3, bz(1), bx(17), baseY + 3, bz(4), 'cobble');
    // Second Flight (dz = 1..2): climbs -X (facing 3) from dx=14 (y+4) -> dx=13 (y+5) -> dx=12 (y+6)
    for (let step = 0; step < 3; step++) {
      const sx = bx(14 - step);
      const sy = baseY + 4 + step;
      set(sx, sy, bz(1), 'stairs_stone', 3);
      set(sx, sy, bz(2), 'stairs_stone', 3);
    }
    // Stairwell lighting & floor sign
    set(bx(16), ceilY - 1, bz(2), 'lamp');
    addSign(bx(11), baseY + 2, bz(6), `🚶 ${f + 1}F 계단실\n▲ 위층으로 이동`);

    // -- EPS / PS Utility Shafts (dx = 19..21, dz = 1..5) --
    for (let y = baseY + 1; y < ceilY; y++) {
      for (let dz = 1; dz <= 5; dz++) set(bx(21), y, bz(dz), 'stone');
      for (let dx = 19; dx <= 21; dx++) {
        set(bx(dx), y, bz(3), 'stone'); // EPS / PS divider
        set(bx(dx), y, bz(5), 'stone');
      }
    }
    setDoor(bx(20), baseY + 1, bz(5), 'door_iron_closed', 2);
    addSign(bx(19), baseY + 2, bz(6), '⚡ EPS / PS');

    // -- 여자화장실 (dx = 22..28, dz = 1..5) — Identical on 1F~5F! --
    fill(bx(22), baseY, bz(1), bx(28), baseY, bz(5), 'wool_white');
    for (let y = baseY + 1; y < ceilY; y++) {
      for (let dz = 1; dz <= 5; dz++) set(bx(28), y, bz(dz), 'stone');
      for (let dx = 22; dx <= 28; dx++) set(bx(dx), y, bz(5), 'stone');
    }
    setDoor(bx(25), baseY + 1, bz(5), 'door_closed', 2);
    // 2 Toilet stalls (left dx=22..23, right dx=27) with partitions & doors
    for (let y = baseY + 1; y <= baseY + 2; y++) {
      set(bx(23), y, bz(1), 'planks');
      set(bx(23), y, bz(2), 'planks');
      set(bx(26), y, bz(1), 'planks');
      set(bx(26), y, bz(2), 'planks');
    }
    setDoor(bx(22), baseY + 1, bz(3), 'door_closed', 2);
    setDoor(bx(27), baseY + 1, bz(3), 'door_closed', 2);
    // Toilets + flush levers
    set(bx(22), baseY + 1, bz(1), 'wool_white');
    set(bx(22), baseY + 2, bz(1), 'lever_off');
    set(bx(27), baseY + 1, bz(1), 'wool_white');
    set(bx(27), baseY + 2, bz(1), 'lever_off');
    // Center sink & mirror + corner sink
    set(bx(25), baseY + 1, bz(1), 'cobble');
    set(bx(24), baseY + 1, bz(1), 'water');
    set(bx(22), baseY + 1, bz(4), 'cobble');
    set(bx(25), ceilY - 1, bz(3), 'lamp');
    addSign(bx(24), baseY + 2, bz(6), `🚺 여자화장실 (${f + 1}F)`);

    // -- 남자화장실 (dx = 29..35, dz = 1..5) — Identical on 1F~5F! --
    fill(bx(29), baseY, bz(1), bx(35), baseY, bz(5), 'wool_white');
    for (let y = baseY + 1; y < ceilY; y++) {
      for (let dz = 1; dz <= 5; dz++) set(bx(35), y, bz(dz), 'stone');
      for (let dx = 29; dx <= 35; dx++) set(bx(dx), y, bz(5), 'stone');
    }
    setDoor(bx(32), baseY + 1, bz(5), 'door_closed', 2);
    // 2 Toilet stalls (left dx=29..30, right dx=34)
    for (let y = baseY + 1; y <= baseY + 2; y++) {
      set(bx(30), y, bz(1), 'planks');
      set(bx(30), y, bz(2), 'planks');
      set(bx(33), y, bz(1), 'planks');
      set(bx(33), y, bz(2), 'planks');
    }
    setDoor(bx(29), baseY + 1, bz(3), 'door_closed', 2);
    setDoor(bx(34), baseY + 1, bz(3), 'door_closed', 2);
    set(bx(29), baseY + 1, bz(1), 'wool_white');
    set(bx(29), baseY + 2, bz(1), 'lever_off');
    set(bx(34), baseY + 1, bz(1), 'wool_white');
    set(bx(34), baseY + 2, bz(1), 'lever_off');
    // Center sink & corner sink
    set(bx(32), baseY + 1, bz(1), 'cobble');
    set(bx(31), baseY + 1, bz(1), 'water');
    set(bx(29), baseY + 1, bz(4), 'cobble');
    set(bx(32), ceilY - 1, bz(3), 'lamp');
    addSign(bx(31), baseY + 2, bz(6), `🚹 남자화장실 (${f + 1}F)`);

    // 2d. Ceiling Lights across main open hall (all floors)
    for (const lx of [7, 14, 21, 28, 35, 38]) {
      for (const lz of [8, 14]) {
        if (inFootprint(lx, lz, f)) {
          set(bx(lx), ceilY - 1, bz(lz), 'lamp');
        }
      }
    }

    // 2e. Upper Floor (2F) Open-Space Sign (rest of 2F intentionally kept empty!)
    if (f === 1) {
      addSign(bx(15), baseY + 2, bz(6), `🏢 ${f + 1}층 오픈 공간\n(화장실·계단·ELV 외 빈 공간)`);
    }
  }

  // 3. 1F Detailed Interior (Matches Image 1 Floor Plan!)
  const Y1 = GROUND; // floor slab y = 4, interior y = 5..9

  // 3a. Vestibule / Lobby (현관 풍실, dx = 1..9, dz = 1..11) — light cream sandstone tile
  fill(bx(1), Y1, bz(1), bx(4), Y1, bz(11), 'sand');
  fill(bx(5), Y1, bz(5), bx(9), Y1, bz(11), 'sand');

  // Outer Main Double Glass Doors (dx = 0, dz = 5..8)
  for (let y = Y1 + 1; y <= Y1 + 3; y++) {
    for (let dz = 5; dz <= 8; dz++) set(bx(0), y, bz(dz), null);
  }
  setDoor(bx(0), Y1 + 1, bz(6), 'door_glass_closed', 3);
  setDoor(bx(0), Y1 + 1, bz(7), 'door_glass_closed', 3);

  // Inner Vestibule Glass Partition (dx = 4, dz = 1..11) with wide doorway at dz = 5..8
  for (let y = Y1 + 1; y <= Y1 + 5; y++) {
    for (let dz = 1; dz <= 11; dz++) {
      if (dz >= 5 && dz <= 8 && y <= Y1 + 3) continue;
      set(bx(4), y, bz(dz), 'glass');
    }
  }

  // 1F Exterior Entrance Canopy ("행복플러스 / 서울시립장애인행복플러스센터") like Photo 2!
  fill(bx(-3), Y1 + 4, bz(3), bx(0), Y1 + 4, bz(10), 'stone');
  fill(bx(-3), Y1 + 5, bz(3), bx(-3), Y1 + 5, bz(10), 'wool_white');
  for (let y = Y1 + 1; y <= Y1 + 4; y++) {
    set(bx(-3), y, bz(3), 'cobble');
    set(bx(-3), y, bz(10), 'cobble');
  }
  set(bx(-2), Y1 + 4, bz(5), 'lamp');
  set(bx(-2), Y1 + 4, bz(8), 'lamp');
  addSign(bx(-4), Y1 + 5, bz(6), '🏢 행복플러스\n서울시립장애인행복플러스센터');
  // 2F exterior cafe sign accent ("행복플러스 카페")
  addSign(bx(-1), Y1 + 8, bz(8), '☕ 행복플러스 카페\n(1F 바리스타 교육장)');
  // Small yellow awning over secondary right-side entry (Photo 2 detail!)
  fill(bx(-2), Y1 + 4, bz(12), bx(0), Y1 + 4, bz(14), 'wool_yellow');
  // Lush green entrance shrubbery right beside the freestanding navy pylon sign (Photo 6!)
  set(bx(-4), Y1 + 1, bz(11), 'leaves');
  set(bx(-4), Y1 + 2, bz(11), 'leaves');
  set(bx(-4), Y1 + 1, bz(12), 'leaves');
  set(bx(-3), Y1 + 1, bz(11), 'leaves');

  // 3b. Curved Cream-Tile Walkway in front of Restrooms toward MDF (dx = 24..35, dz = 6..8)
  fill(bx(24), Y1, bz(6), bx(35), Y1, bz(8), 'sand');
  set(bx(24), Y1, bz(8), 'planks'); // curved corner accent

  // 3c. Barista Training Area (바리스타 교육장, bottom-left dx = 5..15, dz = 12..18)
  // Curved sandstone tile floor
  fill(bx(5), Y1, bz(12), bx(15), Y1, bz(18), 'sand');
  set(bx(15), Y1, bz(12), 'planks'); // rounded curve corner
  set(bx(14), Y1, bz(12), 'planks');
  set(bx(15), Y1, bz(13), 'planks');

  // Curved L-shaped Barista Counter (ORDER -> WORK STATION -> PICK UP)
  for (let dx = 5; dx <= 12; dx++) set(bx(dx), Y1 + 1, bz(13), 'planks');
  set(bx(13), Y1 + 1, bz(14), 'planks');
  set(bx(14), Y1 + 1, bz(15), 'planks');
  set(bx(14), Y1 + 1, bz(16), 'planks');
  // Interactive Barista Stations along the counter
  set(bx(7), Y1 + 1, bz(13), 'job_counter');  // ORDER
  set(bx(10), Y1 + 1, bz(13), 'job_espresso'); // WORK STATION
  set(bx(13), Y1 + 1, bz(14), 'job_pickup');   // PICK UP
  // Back wall cabinets & sink along dz = 18
  for (let dx = 5; dx <= 13; dx++) set(bx(dx), Y1 + 1, bz(18), 'furn_cabinet');
  set(bx(9), Y1 + 1, bz(18), 'job_fridge');
  set(bx(11), Y1 + 1, bz(18), 'water');
  set(bx(12), Y1 + 1, bz(18), 'job_mixer');
  addSign(bx(8), Y1 + 2, bz(13), '☕ 바리스타 교육장\nORDER · WORK · PICK UP');

  // 3d. Main Cafe Hall Furniture (Center, wood plank floor) — 3D Cafe & Lounge Furniture!
  const placeRoundTable = (cx, cz) => {
    set(bx(cx), Y1 + 1, bz(cz), 'furn_cafe_table');
    set(bx(cx - 1), Y1 + 1, bz(cz), 'furn_office_chair', 1);
    set(bx(cx + 1), Y1 + 1, bz(cz), 'furn_office_chair', 3);
    set(bx(cx), Y1 + 1, bz(cz - 1), 'furn_office_chair', 2);
    set(bx(cx), Y1 + 1, bz(cz + 1), 'furn_office_chair', 0);
  };
  const placeLongTable = (cx, cz) => {
    set(bx(cx), Y1 + 1, bz(cz), 'furn_cafe_table');
    set(bx(cx + 1), Y1 + 1, bz(cz), 'furn_cafe_table');
    set(bx(cx), Y1 + 1, bz(cz - 1), 'furn_office_chair', 2);
    set(bx(cx + 1), Y1 + 1, bz(cz - 1), 'furn_office_chair', 2);
    set(bx(cx), Y1 + 1, bz(cz + 1), 'furn_office_chair', 0);
    set(bx(cx + 1), Y1 + 1, bz(cz + 1), 'furn_office_chair', 0);
  };

  // Top row: 3 round cafe tables (dx = 13, 17, 21 at dz = 8)
  placeRoundTable(13, 8);
  placeRoundTable(17, 8);
  placeRoundTable(21, 8);

  // Center 2x2 grid: 4 oval/long dining tables
  placeLongTable(19, 12);
  placeLongTable(25, 12);
  placeLongTable(19, 16);
  placeLongTable(25, 16);

  // Right Lounge Area (dx = 30..34, dz = 11..17): cafe tables & cozy sofas
  set(bx(32), Y1 + 1, bz(13), 'furn_cafe_table');
  set(bx(30), Y1 + 1, bz(13), 'furn_sofa', 1);
  set(bx(34), Y1 + 1, bz(13), 'furn_sofa', 3);
  set(bx(32), Y1 + 1, bz(11), 'furn_sofa', 2);
  set(bx(31), Y1 + 1, bz(16), 'furn_cafe_table');
  set(bx(32), Y1 + 1, bz(16), 'furn_cafe_table');
  set(bx(33), Y1 + 1, bz(15), 'furn_sofa', 3);

  // Potted indoor plants (matching Image 1 green accents!)
  for (const [px, pz] of [[16, 18], [34, 9], [34, 18], [40, 18]]) {
    set(bx(px), Y1 + 1, bz(pz), 'furn_potted_plant');
  }

  // 3e. MDF실 (1F top-right, dx = 36..40, dz = 1..9)
  fill(bx(36), Y1, bz(1), bx(40), Y1, bz(9), 'sand');
  for (let y = Y1 + 1; y <= Y1 + 5; y++) {
    for (let dz = 1; dz <= 9; dz++) set(bx(36), y, bz(dz), 'stone');
    for (let dx = 36; dx <= 40; dx++) set(bx(dx), y, bz(9), 'stone');
  }
  setDoor(bx(36), Y1 + 1, bz(7), 'door_iron_closed', 3);
  // Server racks & cabinets inside MDF실
  for (let dz = 1; dz <= 5; dz++) {
    set(bx(37), Y1 + 1, bz(dz), 'iron_ore');
    set(bx(37), Y1 + 2, bz(dz), 'furnace');
  }
  set(bx(40), Y1 + 1, bz(2), 'furn_cabinet');
  set(bx(40), Y1 + 1, bz(3), 'furn_office_desk', 3);
  set(bx(38), Y1 + 1, bz(8), 'furn_cabinet');
  set(bx(39), Y1 + 1, bz(8), 'furn_cabinet');
  addSign(bx(35), Y1 + 2, bz(7), '🖥️ MDF실\n(통신·장비실)');

  // 3f. 미팅실 #1 & #2 (1F bottom-right, dx = 36..40, dz = 10..18)
  fill(bx(36), Y1, bz(10), bx(40), Y1, bz(18), 'sand');
  for (let y = Y1 + 1; y <= Y1 + 5; y++) {
    for (let dz = 10; dz <= 18; dz++) {
      if ((dz === 12 || dz === 16) && y <= Y1 + 2) continue;
      set(bx(36), y, bz(dz), 'glass');
    }
  }
  setDoor(bx(36), Y1 + 1, bz(12), 'door_glass_closed', 3);
  setDoor(bx(36), Y1 + 1, bz(16), 'door_glass_closed', 3);
  for (let dx = 37; dx <= 40; dx++) {
    if (dx === 38) continue;
    set(bx(dx), Y1 + 1, bz(14), 'glass');
    set(bx(dx), Y1 + 2, bz(14), 'glass');
  }
  // Meeting Room #1 white table & office chairs
  set(bx(38), Y1 + 1, bz(12), 'furn_white_table');
  set(bx(39), Y1 + 1, bz(12), 'furn_white_table');
  set(bx(38), Y1 + 1, bz(11), 'furn_office_chair', 2);
  set(bx(39), Y1 + 1, bz(11), 'furn_office_chair', 2);
  set(bx(38), Y1 + 1, bz(13), 'furn_office_chair', 0);
  set(bx(39), Y1 + 1, bz(13), 'furn_office_chair', 0);
  addSign(bx(35), Y1 + 2, bz(11), '📋 미팅실 #1');
  // Meeting Room #2 white table & office chairs
  set(bx(38), Y1 + 1, bz(16), 'furn_white_table');
  set(bx(39), Y1 + 1, bz(16), 'furn_white_table');
  set(bx(38), Y1 + 1, bz(15), 'furn_office_chair', 2);
  set(bx(39), Y1 + 1, bz(15), 'furn_office_chair', 2);
  set(bx(38), Y1 + 1, bz(17), 'furn_office_chair', 0);
  set(bx(39), Y1 + 1, bz(17), 'furn_office_chair', 0);
  addSign(bx(35), Y1 + 2, bz(15), '📋 미팅실 #2');
  // 1F Ceiling 4-way cassette AC units
  for (const [ax, az] of [[10, 15], [20, 14], [30, 14], [38, 14]]) {
    set(bx(ax), Y1 + 5, bz(az), 'furn_ceiling_ac');
  }

  // 3.3. 3F Detailed Interior (Matches 3F 배치도 2안: 상담실 1·2, 국장석, 공용캐비닛, 4개 팀 데스크 클러스터, 탕비실!)
  const Y3 = GROUND + 2 * FLOOR_H; // floor slab y = 16, interior y = 17..21

  // Light modern office floor across 3F
  fill(bx(1), Y3, bz(6), bx(40), Y3, bz(18), 'sand');

  // 3.3a. Corridor Partition Wall (dz = 9, dx = 1..34) — sleek office wall (lower stone + upper glass!)
  for (let dx = 1; dx <= 34; dx++) {
    // Open left passage to consulting rooms (dx = 2..4) & main office doorway (dx = 29..30)
    if ((dx >= 2 && dx <= 4) || dx === 29 || dx === 30) {
      set(bx(dx), Y3 + 3, bz(9), 'glass');
      set(bx(dx), Y3 + 4, bz(9), 'glass');
      set(bx(dx), Y3 + 5, bz(9), 'stone');
      continue;
    }
    set(bx(dx), Y3 + 1, bz(9), 'stone');
    set(bx(dx), Y3 + 2, bz(9), 'stone');
    set(bx(dx), Y3 + 3, bz(9), 'glass');
    set(bx(dx), Y3 + 4, bz(9), 'glass');
    set(bx(dx), Y3 + 5, bz(9), 'stone');
  }
  setDoor(bx(29), Y3 + 1, bz(9), 'door_glass_closed', 2);
  setDoor(bx(30), Y3 + 1, bz(9), 'door_glass_closed', 2);
  // Right vertical corridor wall at dx = 34, dz = 6..8
  for (let dz = 6; dz <= 8; dz++) {
    set(bx(34), Y3 + 1, bz(dz), 'stone');
    set(bx(34), Y3 + 2, bz(dz), 'stone');
    set(bx(34), Y3 + 3, bz(dz), 'glass');
    set(bx(34), Y3 + 4, bz(dz), 'glass');
    set(bx(34), Y3 + 5, bz(dz), 'stone');
  }
  addSign(bx(28), Y3 + 2, bz(8), '💼 3F 장애인일자리센터\n사무실 · 상담실 · 탕비실');

  // 3.3b. 탕비실 (3F top-right, dx = 35..40, dz = 1..6)
  fill(bx(35), Y3, bz(1), bx(40), Y3, bz(6), 'wool_white');
  for (let y = Y3 + 1; y <= Y3 + 5; y++) {
    for (let dx = 35; dx <= 40; dx++) set(bx(dx), y, bz(6), 'stone');
  }
  setDoor(bx(37), Y3 + 1, bz(6), 'door_closed', 2);
  // 싱크대, 냉장고, 정수기, 선반
  set(bx(36), Y3 + 1, bz(1), 'cobble');
  set(bx(36), Y3 + 1, bz(2), 'water');
  set(bx(36), Y3 + 1, bz(3), 'job_fridge');
  set(bx(38), Y3 + 1, bz(1), 'wool_white');
  set(bx(38), Y3 + 2, bz(1), 'glass'); // 정수기
  set(bx(39), Y3 + 1, bz(5), 'furn_cabinet');
  addSign(bx(38), Y3 + 2, bz(7), '☕ 3F 탕비실\n싱크대·냉장고·정수기');

  // 3.3c. 상담실 1 & 상담실 2 (3F bottom-left, dx = 1..10, dz = 12..18)
  for (let dx = 1; dx <= 10; dx++) {
    set(bx(dx), Y3 + 1, bz(12), 'stone');
    set(bx(dx), Y3 + 2, bz(12), 'stone');
    set(bx(dx), Y3 + 3, bz(12), 'glass');
    set(bx(dx), Y3 + 4, bz(12), 'glass');
    set(bx(dx), Y3 + 5, bz(12), 'stone');
  }
  for (let dz = 10; dz <= 18; dz++) {
    // Divider between 상담실 2 and office (dx = 10)
    set(bx(10), Y3 + 1, bz(dz), 'stone');
    set(bx(10), Y3 + 2, bz(dz), 'stone');
    set(bx(10), Y3 + 3, bz(dz), 'glass');
    set(bx(10), Y3 + 4, bz(dz), 'glass');
    set(bx(10), Y3 + 5, bz(dz), 'stone');
    // Divider between 상담실 1 and 2 (dx = 5, dz >= 12)
    if (dz >= 12) {
      set(bx(5), Y3 + 1, bz(dz), 'stone');
      set(bx(5), Y3 + 2, bz(dz), 'stone');
      set(bx(5), Y3 + 3, bz(dz), 'glass');
      set(bx(5), Y3 + 4, bz(dz), 'glass');
      set(bx(5), Y3 + 5, bz(dz), 'stone');
    }
  }
  // 상담실 1 door & furniture
  setDoor(bx(3), Y3 + 1, bz(12), 'door_glass_closed', 2);
  set(bx(2), Y3 + 1, bz(15), 'furn_white_table');
  set(bx(3), Y3 + 1, bz(15), 'furn_white_table');
  set(bx(2), Y3 + 1, bz(14), 'furn_office_chair', 2);
  set(bx(3), Y3 + 1, bz(16), 'furn_office_chair', 0);
  addSign(bx(2), Y3 + 2, bz(11), '💬 상담실 1');
  // 상담실 2 door & furniture
  setDoor(bx(8), Y3 + 1, bz(12), 'door_glass_closed', 2);
  set(bx(7), Y3 + 1, bz(15), 'furn_white_table');
  set(bx(8), Y3 + 1, bz(15), 'furn_white_table');
  set(bx(7), Y3 + 1, bz(14), 'furn_office_chair', 2);
  set(bx(8), Y3 + 1, bz(16), 'furn_office_chair', 0);
  addSign(bx(7), Y3 + 2, bz(11), '💬 상담실 2');

  // 3.3d. 국장석 + 원형 미팅 테이블 + 공용 캐비닛 열 (dx = 11..14, dz = 10..17)
  set(bx(12), Y3 + 1, bz(11), 'furn_cafe_table');
  set(bx(11), Y3 + 1, bz(11), 'furn_office_chair', 1);
  set(bx(13), Y3 + 1, bz(11), 'furn_office_chair', 3);
  // 국장님 데스크 (1600x800) + 의자 + 보조 서랍
  set(bx(12), Y3 + 1, bz(14), 'furn_office_desk', 1);
  set(bx(12), Y3 + 1, bz(15), 'furn_office_desk', 1);
  set(bx(11), Y3 + 1, bz(15), 'furn_office_chair', 1);
  set(bx(12), Y3 + 1, bz(17), 'furn_cabinet');
  addSign(bx(11), Y3 + 2, bz(13), '👔 국장석');
  // 공용 캐비닛 열 (dx = 14, dz = 12..17)
  for (let dz = 12; dz <= 17; dz++) {
    set(bx(14), Y3 + 1, bz(dz), 'furn_cabinet');
  }
  set(bx(14), Y3 + 2, bz(12), 'furn_potted_plant');
  addSign(bx(14), Y3 + 2, bz(11), '🗄️ 공용 캐비닛');

  // 3.3e. 4개 팀 데스크 클러스터 (T-자형: 마주보는 4인 워크스테이션 + 하단 팀장석!)
  const placeTeamIsland = (cx, includeLeftCol = true) => {
    // 2 rows of facing desks at dz = 12 & dz = 14
    for (const dz of [12, 14]) {
      if (includeLeftCol) {
        set(bx(cx), Y3 + 1, bz(dz), 'furn_office_desk', 1);
        set(bx(cx - 1), Y3 + 1, bz(dz), 'furn_office_chair', 1);
      }
      set(bx(cx + 1), Y3 + 1, bz(dz), 'furn_office_desk', 3);
      set(bx(cx + 2), Y3 + 1, bz(dz), 'furn_office_chair', 3);
    }
    // Partition dividers between front/back pairs at dz = 13
    set(bx(cx), Y3 + 1, bz(13), 'furn_partition', 0);
    set(bx(cx + 1), Y3 + 1, bz(13), 'furn_partition', 0);
    // Bottom team-lead horizontal desk at dz = 16 + chair at dz = 17
    set(bx(cx), Y3 + 1, bz(16), 'furn_office_desk', 0);
    set(bx(cx + 1), Y3 + 1, bz(16), 'furn_office_desk', 0);
    set(bx(cx), Y3 + 1, bz(17), 'furn_office_chair', 0);
  };

  placeTeamIsland(18, true);  // 1팀 (김대선·김로연·이규민·윤종민·최대성)
  placeTeamIsland(24, true);  // 2팀 (김현지·김근호·심준표·유화정·김희경)
  placeTeamIsland(30, true);  // 3팀 (이유신·손미정·이유진·최진희·김지은)
  placeTeamIsland(36, true);  // 4팀 (지찬민·이정아·박정애·심은진)

  // 3.3f. 우측 벽 사물함·캐비닛 전체 열 (dx = 40, dz = 8..17) & 탕비실 앞 캐비닛 (dx = 35, dz = 7..8)
  for (let dz = 8; dz <= 17; dz++) {
    set(bx(40), Y3 + 1, bz(dz), 'furn_cabinet');
  }
  set(bx(35), Y3 + 1, bz(7), 'furn_cabinet');
  set(bx(35), Y3 + 1, bz(8), 'furn_cabinet');
  set(bx(35), Y3 + 2, bz(8), 'furn_potted_plant');
  set(bx(40), Y3 + 2, bz(8), 'furn_potted_plant');

  // 3.3g. 천장 4방향 시스템 에어컨 배치 (y = Y3 + 5)
  for (const [ax, az] of [[7, 15], [18, 13], [24, 13], [30, 13], [36, 13]]) {
    set(bx(ax), Y3 + 5, bz(az), 'furn_ceiling_ac');
  }

  // 3.4. 4F Detailed Interior (Matches 4F Floor Plan: 센터장실, 경영지원팀/행사홍보팀, 교육장 2·1 + 전자칠판, 여직원휴게실!)
  const Y4 = GROUND + 3 * FLOOR_H; // floor slab y = 22, interior y = 23..27

  // Clean bright office/classroom floor across 4F
  fill(bx(1), Y4, bz(6), bx(40), Y4, bz(18), 'sand');

  // 3.4a. Corridor Partition Wall (dz = 9, dx = 1..40) — lower stone + upper glass office wall
  for (let dx = 1; dx <= 40; dx++) {
    if (dx === 7 || dx === 12 || dx === 23 || dx === 33) {
      set(bx(dx), Y4 + 3, bz(9), 'glass');
      set(bx(dx), Y4 + 4, bz(9), 'glass');
      set(bx(dx), Y4 + 5, bz(9), 'stone');
      continue;
    }
    set(bx(dx), Y4 + 1, bz(9), 'stone');
    set(bx(dx), Y4 + 2, bz(9), 'stone');
    set(bx(dx), Y4 + 3, bz(9), 'glass');
    set(bx(dx), Y4 + 4, bz(9), 'glass');
    set(bx(dx), Y4 + 5, bz(9), 'stone');
  }
  setDoor(bx(7), Y4 + 1, bz(9), 'door_glass_closed', 2);   // 센터장실 출입문
  setDoor(bx(12), Y4 + 1, bz(9), 'door_glass_closed', 2);  // 경영지원팀 출입문
  setDoor(bx(23), Y4 + 1, bz(9), 'door_glass_closed', 2);  // 교육장 2 출입문
  setDoor(bx(33), Y4 + 1, bz(9), 'door_glass_closed', 2);  // 교육장 1 출입문

  // 3.4b. 여직원휴게실 (4F top-right, dx = 36..40, dz = 1..8)
  fill(bx(36), Y4, bz(1), bx(40), Y4, bz(8), 'planks');
  for (let y = Y4 + 1; y <= Y4 + 5; y++) {
    for (let dz = 6; dz <= 8; dz++) set(bx(35), y, bz(dz), 'stone');
  }
  setDoor(bx(35), Y4 + 1, bz(7), 'door_closed', 3);
  // 싱크대, 수납장, 침대, 소파
  set(bx(36), Y4 + 1, bz(1), 'cobble');
  set(bx(36), Y4 + 1, bz(2), 'water');
  set(bx(36), Y4 + 1, bz(3), 'furn_cabinet');
  set(bx(39), Y4 + 1, bz(1), 'bed');
  set(bx(39), Y4 + 1, bz(2), 'bed');
  set(bx(40), Y4 + 1, bz(6), 'furn_sofa', 3);
  set(bx(40), Y4 + 1, bz(7), 'furn_sofa', 3);
  set(bx(37), Y4 + 1, bz(8), 'furn_cabinet');
  set(bx(38), Y4 + 1, bz(8), 'furn_cabinet');
  addSign(bx(34), Y4 + 2, bz(7), '🛋️ 여직원휴게실 (4F)\n싱크대·침대·소파');

  // 3.4c. 센터장실 (4F bottom-left, dx = 1..8, dz = 10..18)
  for (let dz = 10; dz <= 18; dz++) {
    set(bx(8), Y4 + 1, bz(dz), 'stone');
    set(bx(8), Y4 + 2, bz(dz), 'stone');
    set(bx(8), Y4 + 3, bz(dz), 'glass');
    set(bx(8), Y4 + 4, bz(dz), 'glass');
    set(bx(8), Y4 + 5, bz(dz), 'stone');
  }
  setDoor(bx(8), Y4 + 1, bz(11), 'door_closed', 1); // 경영지원팀 연결문
  // 6인 회의 테이블 (상단)
  for (let dx = 2; dx <= 4; dx++) {
    set(bx(dx), Y4 + 1, bz(12), 'furn_white_table');
    set(bx(dx), Y4 + 1, bz(11), 'furn_office_chair', 2);
    set(bx(dx), Y4 + 1, bz(13), 'furn_office_chair', 0);
  }
  // 센터장 책상 & 보조 테이블 (하단)
  set(bx(4), Y4 + 1, bz(16), 'furn_office_desk', 0);
  set(bx(5), Y4 + 1, bz(16), 'furn_office_desk', 0);
  set(bx(5), Y4 + 1, bz(17), 'furn_office_chair', 0);
  set(bx(3), Y4 + 1, bz(16), 'furn_white_table');
  set(bx(1), Y4 + 1, bz(16), 'job_fridge');  // 냉장고
  set(bx(1), Y4 + 1, bz(18), 'iron_ore');    // 인터넷 분배기
  set(bx(6), Y4 + 1, bz(18), 'furn_potted_plant');
  addSign(bx(6), Y4 + 2, bz(8), '👔 센터장실 (4F)');

  // 3.4d. 경영지원팀 / 행사홍보팀 (4F center-left, dx = 9..20, dz = 10..18)
  for (let dz = 10; dz <= 18; dz++) {
    set(bx(20), Y4 + 1, bz(dz), 'stone');
    set(bx(20), Y4 + 2, bz(dz), 'stone');
    set(bx(20), Y4 + 3, bz(dz), 'glass');
    set(bx(20), Y4 + 4, bz(dz), 'glass');
    set(bx(20), Y4 + 5, bz(dz), 'stone');
  }
  // 좌측 경영지원팀 데스크 클러스터
  set(bx(11), Y4 + 1, bz(12), 'furn_office_desk', 2);
  set(bx(11), Y4 + 1, bz(11), 'furn_office_chair', 2);
  set(bx(11), Y4 + 1, bz(14), 'furn_office_desk', 1);
  set(bx(10), Y4 + 1, bz(14), 'furn_office_chair', 1);
  set(bx(12), Y4 + 1, bz(14), 'furn_cabinet'); // 복합기/서랍
  set(bx(11), Y4 + 1, bz(16), 'furn_office_desk', 0);
  set(bx(12), Y4 + 1, bz(16), 'furn_office_desk', 0);
  set(bx(11), Y4 + 1, bz(17), 'furn_office_chair', 0);
  set(bx(10), Y4 + 1, bz(16), 'furn_white_table');
  // 우측 행사홍보팀 4인 마주보는 워크스테이션 + 하단 팀장석
  for (const dz of [12, 14]) {
    set(bx(16), Y4 + 1, bz(dz), 'furn_office_desk', 1);
    set(bx(15), Y4 + 1, bz(dz), 'furn_office_chair', 1);
    set(bx(17), Y4 + 1, bz(dz), 'furn_office_desk', 3);
    set(bx(18), Y4 + 1, bz(dz), 'furn_office_chair', 3);
  }
  set(bx(16), Y4 + 1, bz(13), 'furn_partition', 0);
  set(bx(17), Y4 + 1, bz(13), 'furn_partition', 0);
  set(bx(16), Y4 + 1, bz(16), 'furn_office_desk', 0);
  set(bx(17), Y4 + 1, bz(16), 'furn_office_desk', 0);
  set(bx(16), Y4 + 1, bz(17), 'furn_office_chair', 0);
  // 우측 벽 전체 문서 캐비닛 열 (dx = 19, dz = 10..18)
  for (let dz = 10; dz <= 18; dz++) {
    set(bx(19), Y4 + 1, bz(dz), 'furn_cabinet');
  }
  addSign(bx(13), Y4 + 2, bz(8), '💼 경영지원팀 · 행사홍보팀');

  // 3.4e. 교육장 2 & 교육장 1 (4F center-right, dx = 21..40, dz = 10..18) — 6열 화이트 교육테이블 + 우측 전자칠판!
  const trainCols = [23, 26, 29, 32, 35, 38];
  for (const cx of trainCols) {
    // Upper bank (dz = 12..13) facing East (+X, facing 1) toward electronic whiteboard
    set(bx(cx), Y4 + 1, bz(12), 'furn_white_table');
    set(bx(cx), Y4 + 1, bz(13), 'furn_white_table');
    set(bx(cx - 1), Y4 + 1, bz(12), 'furn_office_chair', 1);
    set(bx(cx - 1), Y4 + 1, bz(13), 'furn_office_chair', 1);
    // Lower bank (dz = 16..17) facing East (+X, facing 1)
    set(bx(cx), Y4 + 1, bz(16), 'furn_white_table');
    set(bx(cx), Y4 + 1, bz(17), 'furn_white_table');
    set(bx(cx - 1), Y4 + 1, bz(16), 'furn_office_chair', 1);
    set(bx(cx - 1), Y4 + 1, bz(17), 'furn_office_chair', 1);
  }
  // 우측 벽 대형 전자칠판 (dx = 40, dz = 13..16)
  for (let dz = 13; dz <= 16; dz++) {
    set(bx(40), Y4 + 2, bz(dz), 'furn_tv_screen', 3);
  }
  addSign(bx(40), Y4 + 1, bz(14), '📺 전자칠판');
  addSign(bx(24), Y4 + 2, bz(8), '🎓 교육장 2 (4F)');
  addSign(bx(34), Y4 + 2, bz(8), '🎓 교육장 1 (4F)');

  // 3.4f. 천장 4방향 시스템 에어컨 배치 (y = Y4 + 5)
  for (const [ax, az] of [[4, 14], [14, 14], [26, 14], [34, 14]]) {
    set(bx(ax), Y4 + 5, bz(az), 'furn_ceiling_ac');
  }

  // 3.5. 5F Detailed Interior (Matches 5F Floor Plan: 카운터·휴게라운지(16)·탕비장·교육장(36)·문서고·대기공간!)
  const Y5 = GROUND + 4 * FLOOR_H; // floor slab y = 28, interior y = 29..33

  // 3.5a. Top-left small utility alcove next to ELEV (dx = 1..4, dz = 1..4)
  for (let y = Y5 + 1; y <= Y5 + 5; y++) {
    for (let dx = 1; dx <= 4; dx++) set(bx(dx), y, bz(4), 'stone');
  }
  setDoor(bx(2), Y5 + 1, bz(4), 'door_closed', 2);

  // 3.5b. 카운터 & 휴게라운지 (16) + 탕비장 (left zone: dx = 1..10, dz = 5..18)
  fill(bx(1), Y5, bz(5), bx(10), Y5, bz(18), 'sand');

  // 카운터 (Reception Counter, dx = 2..4, dz = 7..10)
  for (let dz = 7; dz <= 10; dz++) set(bx(4), Y5 + 1, bz(dz), dz === 8 || dz === 9 ? 'furn_office_desk' : 'furn_cabinet', 1);
  set(bx(3), Y5 + 1, bz(7), 'furn_cabinet');
  set(bx(3), Y5 + 1, bz(10), 'furn_cabinet');
  set(bx(2), Y5 + 1, bz(8), 'furn_office_chair', 1);
  set(bx(2), Y5 + 1, bz(9), 'furn_office_chair', 1);
  addSign(bx(4), Y5 + 2, bz(7), '🖥️ 카운터\n(5F 안내 데스크)');

  // 휴게라운지 (16) seating (dx = 1..8, dz = 11..18)
  set(bx(3), Y5 + 1, bz(12), 'furn_cafe_table');
  set(bx(2), Y5 + 1, bz(12), 'furn_sofa', 1);
  set(bx(4), Y5 + 1, bz(11), 'furn_sofa', 2);
  set(bx(1), Y5 + 1, bz(14), 'furn_potted_plant');
  // Bottom-left sofa + coffee table + lounge chairs
  set(bx(1), Y5 + 1, bz(16), 'furn_sofa', 1);
  set(bx(1), Y5 + 1, bz(17), 'furn_sofa', 1);
  set(bx(3), Y5 + 1, bz(16), 'furn_cafe_table');
  set(bx(4), Y5 + 1, bz(15), 'furn_sofa', 3);
  set(bx(4), Y5 + 1, bz(17), 'furn_sofa', 3);
  // Right-side lounge 2-person cafe tables along divider
  set(bx(7), Y5 + 1, bz(12), 'furn_cafe_table');
  set(bx(7), Y5 + 1, bz(13), 'furn_office_chair', 0);
  set(bx(7), Y5 + 1, bz(16), 'furn_cafe_table');
  set(bx(7), Y5 + 1, bz(17), 'furn_office_chair', 0);
  addSign(bx(5), Y5 + 2, bz(14), '🛋️ 휴게라운지 (16)');

  // 탕비장 (Pantry niche along dx = 10, dz = 10..18, leaving stairwell exit dz=6..9 open!)
  set(bx(10), Y5 + 1, bz(10), 'cobble');
  set(bx(10), Y5 + 1, bz(11), 'water');
  for (let dz = 12; dz <= 18; dz++) {
    set(bx(10), Y5 + 1, bz(dz), 'furn_cabinet');
  }
  addSign(bx(10), Y5 + 2, bz(10), '☕ 탕비장');

  // 3.5c. Partition walls framing 중앙 교육장 (36) (dx = 11..34, dz = 6..18)
  fill(bx(11), Y5, bz(6), bx(34), Y5, bz(18), 'planks');
  for (let y = Y5 + 1; y <= Y5 + 5; y++) {
    for (let dz = 6; dz <= 18; dz++) {
      set(bx(11), y, bz(dz), 'stone');
      set(bx(34), y, bz(dz), 'stone');
    }
  }
  setDoor(bx(11), Y5 + 1, bz(7), 'door_closed', 3);
  setDoor(bx(11), Y5 + 1, bz(8), 'door_closed', 3);
  setDoor(bx(34), Y5 + 1, bz(7), 'door_closed', 1);
  setDoor(bx(34), Y5 + 1, bz(17), 'door_closed', 1);

  // 교육장 (36): 3 rows × 3 columns of white training tables & office chairs facing South screen!
  const deskCols = [[13, 16], [20, 23], [27, 30]];
  const deskRows = [9, 12, 15];
  for (let rIdx = 0; rIdx < deskRows.length; rIdx++) {
    const rz = deskRows[rIdx];
    for (const [cStart, cEnd] of deskCols) {
      for (let dx = cStart; dx <= cEnd; dx++) {
        set(bx(dx), Y5 + 1, bz(rz), 'furn_white_table');
        set(bx(dx), Y5 + 1, bz(rz - 1), 'furn_office_chair', 2);
      }
    }
  }
  // 대형 빔프로젝터 스크린 / 전자칠판 along South wall (dx = 18..28, dz = 18)
  for (let dx = 18; dx <= 28; dx++) {
    set(bx(dx), Y5 + 2, bz(18), 'furn_tv_screen', 0);
    set(bx(dx), Y5 + 3, bz(18), 'wool_white');
  }
  addSign(bx(23), Y5 + 1, bz(18), '📽️ 빔프로젝터 스크린');
  addSign(bx(22), Y5 + 2, bz(6), '🎓 교육장 (36)');
  set(bx(12), Y5 + 1, bz(18), 'furn_potted_plant');

  // 3.5d. 문서고 (5F top-right, dx = 35..40, dz = 1..9)
  fill(bx(35), Y5, bz(1), bx(40), Y5, bz(9), 'sand');
  for (let y = Y5 + 1; y <= Y5 + 5; y++) {
    for (let dx = 35; dx <= 40; dx++) set(bx(dx), y, bz(9), 'stone');
  }
  set(bx(36), Y5 + 1, bz(1), 'cobble');
  set(bx(36), Y5 + 1, bz(2), 'water');
  // Tall 2-tier document cabinets lining East, South & West walls
  for (let dz = 1; dz <= 8; dz++) {
    set(bx(40), Y5 + 1, bz(dz), 'furn_cabinet');
    set(bx(40), Y5 + 2, bz(dz), 'furn_cabinet');
  }
  for (let dx = 35; dx <= 39; dx++) {
    set(bx(dx), Y5 + 1, bz(8), 'furn_cabinet');
    set(bx(dx), Y5 + 2, bz(8), 'furn_cabinet');
  }
  set(bx(36), Y5 + 1, bz(4), 'furn_cabinet');
  set(bx(36), Y5 + 1, bz(5), 'furn_cabinet');
  addSign(bx(38), Y5 + 2, bz(5), '📁 문서고\n(5F 자료 보관실)');

  // 3.5e. 대기공간 (5F bottom-right, dx = 35..40, dz = 10..18)
  fill(bx(35), Y5, bz(10), bx(40), Y5, bz(18), 'sand');
  set(bx(37), Y5 + 1, bz(10), 'furn_sofa', 2);
  set(bx(38), Y5 + 1, bz(10), 'furn_sofa', 2);
  set(bx(40), Y5 + 1, bz(12), 'furn_sofa', 3);
  set(bx(40), Y5 + 1, bz(15), 'furn_sofa', 3);
  set(bx(40), Y5 + 1, bz(16), 'furn_sofa', 3);
  set(bx(37), Y5 + 1, bz(18), 'furn_sofa', 0);
  set(bx(38), Y5 + 1, bz(18), 'furn_sofa', 0);
  set(bx(38), Y5 + 1, bz(12), 'furn_cafe_table');
  set(bx(38), Y5 + 1, bz(16), 'furn_cafe_table');
  set(bx(35), Y5 + 1, bz(13), 'furn_cabinet');
  set(bx(35), Y5 + 1, bz(14), 'furn_cabinet');
  for (const [px, pz] of [[35, 10], [40, 10], [40, 18]]) {
    set(bx(px), Y5 + 1, bz(pz), 'furn_potted_plant');
  }
  addSign(bx(37), Y5 + 2, bz(14), '🪑 대기공간\n(5F 라운지)');
  // 5F Ceiling 4-way cassette AC units
  for (const [ax, az] of [[5, 14], [15, 13], [23, 13], [31, 13], [38, 14]]) {
    set(bx(ax), Y5 + 5, bz(az), 'furn_ceiling_ac');
  }

  // 4. Rooftop Terrace & Iconic Gray Portal Frame Roof (Photos 2 & 3!)
  const ROOF_Y = GROUND + NUM_FLOORS * FLOOR_H; // y = 34
  fill(bx(0), ROOF_Y, bz(0), bx(BW - 1), ROOF_Y, bz(BD - 1), 'cobble');
  // Cut stairwell opening at top of 5F stairs (preserve top step dx=12,dz=1..2!)
  fill(bx(12), ROOF_Y, bz(3), bx(17), ROOF_Y, bz(4), null);
  fill(bx(13), ROOF_Y, bz(1), bx(17), ROOF_Y, bz(2), null);
  // Stairwell rooftop penthouse enclosure (dx = 9..18, dz = 0..5) with exit door to rooftop terrace
  for (let y = ROOF_Y + 1; y <= ROOF_Y + 4; y++) {
    for (let dx = 9; dx <= 18; dx++) {
      set(bx(dx), y, bz(0), 'stone');
      set(bx(dx), y, bz(5), 'stone');
    }
    for (let dz = 0; dz <= 5; dz++) {
      set(bx(9), y, bz(dz), 'stone');
      set(bx(18), y, bz(dz), 'stone');
    }
  }
  fill(bx(9), ROOF_Y + 5, bz(0), bx(18), ROOF_Y + 5, bz(5), 'stone');
  setDoor(bx(10), ROOF_Y + 1, bz(5), 'door_iron_closed', 2);
  set(bx(14), ROOF_Y + 4, bz(2), 'lamp');
  addSign(bx(12), ROOF_Y + 2, bz(6), '🌿 옥상 테라스\n(서울시립장애인행복플러스센터)');

  // Rooftop safety glass parapet railing around perimeter
  for (let dx = 0; dx < BW; dx++) {
    set(bx(dx), ROOF_Y + 1, bz(BD - 1), 'glass');
    if (dx < 9 || dx > 18) set(bx(dx), ROOF_Y + 1, bz(0), 'glass');
  }
  for (let dz = 0; dz < BD; dz++) {
    set(bx(0), ROOF_Y + 1, bz(dz), 'glass');
    set(bx(BW - 1), ROOF_Y + 1, bz(dz), 'glass');
  }

  // Iconic Photo 2 & 3 Gray Outer Portal Frame Overhang & Pergola Slats (y = 35..41)!
  const TOP_Y = ROOF_Y + 6; // y = 40
  // Left & Right thick gray portal walls rising up to TOP_Y
  for (let y = ROOF_Y + 1; y <= TOP_Y; y++) {
    for (let dz = 0; dz < BD; dz++) {
      set(bx(0), y, bz(dz), 'stone');
      set(bx(1), y, bz(dz), 'stone');
      set(bx(BW - 1), y, bz(dz), 'stone');
      set(bx(BW - 2), y, bz(dz), 'stone');
    }
  }
  // Top horizontal portal frame beam along South (front) & North edges
  fill(bx(0), TOP_Y, bz(BD - 2), bx(BW - 1), TOP_Y + 1, bz(BD - 1), 'stone');
  fill(bx(0), TOP_Y, bz(0), bx(BW - 1), TOP_Y + 1, bz(1), 'stone');
  // Left half covered roof slab + Right half open pergola louver slats (exact Photo 2 detail!)
  fill(bx(2), TOP_Y, bz(2), bx(20), TOP_Y, bz(BD - 3), 'stone');
  for (let dx = 22; dx <= BW - 3; dx += 2) {
    fill(bx(dx), TOP_Y, bz(2), bx(dx), TOP_Y, bz(BD - 3), 'cobble');
  }
  // Rooftop warm lights
  for (const [lx, lz] of [[5, 10], [22, 10], [34, 10], [22, 16], [34, 16]]) {
    set(bx(lx), ROOF_Y + 1, bz(lz), 'lamp');
  }

  const getBlock = (x, y, z) => {
    if (!inB(x, y, z)) return null;
    const num = grid[idxOf(x, y, z)];
    return num ? (NUM_TO_BLOCK[num] || null) : null;
  };

  let cachedRle = encodeRLE(grid);
  let rleDirty = false;
  const setBlock = (x, y, z, id) => {
    if (!inB(x, y, z)) return;
    grid[idxOf(x, y, z)] = id ? (BLOCKS[id]?.numId || 0) : 0;
    rleDirty = true;
  };
  const getRLE = () => {
    if (rleDirty) {
      cachedRle = encodeRLE(grid);
      rleDirty = false;
    }
    return cachedRle;
  };

  return {
    bounds: CENTER_BOUNDS,
    grid,
    inBounds: inB,
    getBlock,
    setBlock,
    getRLE,
    signs,
    facings,
    elevator: {
      minX: bx(6),      // -15
      maxX: bx(7) + 1,  // -13 (width 2)
      minZ: bz(1),      // -9
      maxZ: bz(3) + 1,  // -6  (depth 3)
      doorZ: bz(4),     // -6
      doorXs: [bx(6), bx(7)], // [-15, -14]
      buttonX: bx(8),   // -13
      buttonZ: bz(5),   // -5
      floors: [
        { floor: 1, label: '1F', y: GROUND + 0 * FLOOR_H },
        { floor: 2, label: '2F', y: GROUND + 1 * FLOOR_H },
        { floor: 3, label: '3F', y: GROUND + 2 * FLOOR_H },
        { floor: 4, label: '4F', y: GROUND + 3 * FLOOR_H },
        { floor: 5, label: '5F', y: GROUND + 4 * FLOOR_H }
      ]
    },
    // Spawn on the sidewalk in front of the left main entrance, facing the building!
    spawn: { x: OX - 7.5, y: GROUND + 1.1, z: bz(6) + 0.5 }
  };
}
