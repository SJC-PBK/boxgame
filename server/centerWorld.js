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
    // -- ELEV. (dx = 5..8, dz = 1..4) --
    fill(bx(5), baseY + 1, bz(1), bx(8), ceilY - 1, bz(4), null);
    // Shaft walls
    for (let y = baseY + 1; y < ceilY; y++) {
      for (let dz = 1; dz <= 4; dz++) {
        set(bx(5), y, bz(dz), 'stone');
        set(bx(8), y, bz(dz), 'stone');
      }
      for (let dx = 5; dx <= 8; dx++) {
        set(bx(dx), y, bz(4), 'stone');
      }
    }
    // Iron elevator doors opening south (dz = 4, dx = 6..7)
    setDoor(bx(6), baseY + 1, bz(4), 'door_iron_closed', 2);
    setDoor(bx(7), baseY + 1, bz(4), 'door_iron_closed', 2);
    set(bx(6), baseY, bz(2), 'iron_ore');
    set(bx(7), baseY, bz(2), 'iron_ore');
    set(bx(6), ceilY - 1, bz(2), 'lamp');
    addSign(bx(6), baseY + 2, bz(1), `🛗 ELEV. (${f + 1}F)\n1F: 행복플러스카페\n2~5F: 오픈 플로어`);

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

    // 2e. Upper Floor (2F~5F) Open-Space Sign (rest of floor intentionally kept empty!)
    if (f >= 1) {
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
  for (let dx = 5; dx <= 13; dx++) set(bx(dx), Y1 + 1, bz(18), 'wood');
  set(bx(6), Y1 + 1, bz(18), 'chest');
  set(bx(9), Y1 + 1, bz(18), 'job_fridge');
  set(bx(11), Y1 + 1, bz(18), 'water');
  set(bx(12), Y1 + 1, bz(18), 'job_mixer');
  addSign(bx(8), Y1 + 2, bz(13), '☕ 바리스타 교육장\nORDER · WORK · PICK UP');

  // 3d. Main Cafe Hall Furniture (Center, wood plank floor)
  // Helper: place a table + chairs around it
  const placeRoundTable = (cx, cz) => {
    set(bx(cx), Y1 + 1, bz(cz), 'wood');
    set(bx(cx - 1), Y1 + 1, bz(cz), 'stairs_wood', 1);
    set(bx(cx + 1), Y1 + 1, bz(cz), 'stairs_wood', 3);
    set(bx(cx), Y1 + 1, bz(cz - 1), 'stairs_wood', 2);
    set(bx(cx), Y1 + 1, bz(cz + 1), 'stairs_wood', 0);
  };
  const placeLongTable = (cx, cz) => {
    set(bx(cx), Y1 + 1, bz(cz), 'planks');
    set(bx(cx + 1), Y1 + 1, bz(cz), 'planks');
    set(bx(cx), Y1 + 1, bz(cz - 1), 'stairs_wood', 2);
    set(bx(cx + 1), Y1 + 1, bz(cz - 1), 'stairs_wood', 2);
    set(bx(cx), Y1 + 1, bz(cz + 1), 'stairs_wood', 0);
    set(bx(cx + 1), Y1 + 1, bz(cz + 1), 'stairs_wood', 0);
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

  // Right Lounge Area (dx = 30..34, dz = 11..17): coffee table & cozy stools
  set(bx(32), Y1 + 1, bz(13), 'planks');
  set(bx(30), Y1 + 1, bz(13), 'wool_yellow');
  set(bx(34), Y1 + 1, bz(13), 'wool_yellow');
  set(bx(32), Y1 + 1, bz(11), 'sand');
  set(bx(31), Y1 + 1, bz(16), 'planks');
  set(bx(32), Y1 + 1, bz(16), 'planks');
  set(bx(33), Y1 + 1, bz(15), 'wool_yellow');

  // Potted indoor plants (matching Image 1 green accents!)
  for (const [px, pz] of [[16, 18], [34, 9], [34, 18], [40, 18]]) {
    set(bx(px), Y1 + 1, bz(pz), 'wood');
    set(bx(px), Y1 + 2, bz(pz), 'leaves');
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
  set(bx(40), Y1 + 1, bz(2), 'chest');
  set(bx(40), Y1 + 1, bz(3), 'planks');
  set(bx(38), Y1 + 1, bz(8), 'chest');
  set(bx(39), Y1 + 1, bz(8), 'chest');
  addSign(bx(35), Y1 + 2, bz(7), '🖥️ MDF실\n(통신·장비실)');

  // 3f. 미팅실 #1 & #2 (1F bottom-right, dx = 36..40, dz = 10..18)
  fill(bx(36), Y1, bz(10), bx(40), Y1, bz(18), 'sand');
  // Glass front wall at dx = 36 with open doorways into #1 (dz=12) and #2 (dz=16)
  for (let y = Y1 + 1; y <= Y1 + 5; y++) {
    for (let dz = 10; dz <= 18; dz++) {
      if ((dz === 12 || dz === 16) && y <= Y1 + 2) continue;
      set(bx(36), y, bz(dz), 'glass');
    }
  }
  setDoor(bx(36), Y1 + 1, bz(12), 'door_glass_closed', 3);
  setDoor(bx(36), Y1 + 1, bz(16), 'door_glass_closed', 3);
  // Folding glass divider between 미팅실 #1 and #2 at dz = 14
  for (let dx = 37; dx <= 40; dx++) {
    if (dx === 38) continue;
    set(bx(dx), Y1 + 1, bz(14), 'glass');
    set(bx(dx), Y1 + 2, bz(14), 'glass');
  }
  // Meeting Room #1 table & chairs
  set(bx(38), Y1 + 1, bz(12), 'planks');
  set(bx(39), Y1 + 1, bz(12), 'planks');
  set(bx(38), Y1 + 1, bz(11), 'stairs_wood', 2);
  set(bx(39), Y1 + 1, bz(11), 'stairs_wood', 2);
  set(bx(38), Y1 + 1, bz(13), 'stairs_wood', 0);
  set(bx(39), Y1 + 1, bz(13), 'stairs_wood', 0);
  addSign(bx(35), Y1 + 2, bz(11), '📋 미팅실 #1');
  // Meeting Room #2 table & chairs
  set(bx(38), Y1 + 1, bz(16), 'planks');
  set(bx(39), Y1 + 1, bz(16), 'planks');
  set(bx(38), Y1 + 1, bz(15), 'stairs_wood', 2);
  set(bx(39), Y1 + 1, bz(15), 'stairs_wood', 2);
  set(bx(38), Y1 + 1, bz(17), 'stairs_wood', 0);
  set(bx(39), Y1 + 1, bz(17), 'stairs_wood', 0);
  addSign(bx(35), Y1 + 2, bz(15), '📋 미팅실 #2');

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
    // Spawn on the sidewalk in front of the left main entrance, facing the building!
    spawn: { x: OX - 7.5, y: GROUND + 1.1, z: bz(6) + 0.5 }
  };
}
