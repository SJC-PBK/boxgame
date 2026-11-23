import {
  BLOCKS, WORLD_BOUNDS, WORLD_SIZE_X, WORLD_SIZE_Y, WORLD_SIZE_Z, WORLD_VOLUME, CHEST_SIZE
} from './blocks.js';

export function keyOf(x, y, z) {
  return `${x},${y},${z}`;
}

export function flatIndex(x, y, z) {
  const ix = x - WORLD_BOUNDS.minX;
  const iy = y - WORLD_BOUNDS.minY;
  const iz = z - WORLD_BOUNDS.minZ;
  return ix + WORLD_SIZE_X * (iz + WORLD_SIZE_Z * iy);
}

// Deterministic pseudo-random generator
function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function placeTreeOnGrid(grid, tx, baseY, tz, setFn) {
  const trunkH = 4 + ((Math.abs(tx * 7 + tz * 13)) % 2);
  for (let dy = 1; dy <= trunkH; dy++) {
    setFn(tx, baseY + dy, tz, 'wood');
  }
  for (let dx = -2; dx <= 2; dx++) {
    for (let dz = -2; dz <= 2; dz++) {
      for (let dy = trunkH - 1; dy <= trunkH + 1; dy++) {
        if (Math.abs(dx) === 2 && Math.abs(dz) === 2 && dy === trunkH + 1) continue;
        if (dx === 0 && dz === 0 && dy <= trunkH) continue;
        setFn(tx + dx, baseY + dy, tz + dz, 'leaves');
      }
    }
  }
  setFn(tx, baseY + trunkH + 2, tz, 'leaves');
}

export function generateInitialWorld() {
  const grid = new Uint8Array(WORLD_VOLUME);
  const chests = {};
  const rnd = mulberry32(20261123);

  const inB = (x, y, z) => (
    x >= WORLD_BOUNDS.minX && x <= WORLD_BOUNDS.maxX &&
    y >= WORLD_BOUNDS.minY && y <= WORLD_BOUNDS.maxY &&
    z >= WORLD_BOUNDS.minZ && z <= WORLD_BOUNDS.maxZ
  );

  const set = (x, y, z, blockId) => {
    if (!inB(x, y, z)) return;
    grid[flatIndex(x, y, z)] = blockId ? (BLOCKS[blockId]?.numId || 0) : 0;
  };

  const getNum = (x, y, z) => {
    if (!inB(x, y, z)) return 0;
    return grid[flatIndex(x, y, z)];
  };

  const SURFACE_Y = 16;

  // 1. Base terrain: deep underground (Y=0..15) + rolling hills on surface (Y=16..24)
  for (let x = WORLD_BOUNDS.minX; x <= WORLD_BOUNDS.maxX; x++) {
    for (let z = WORLD_BOUNDS.minZ; z <= WORLD_BOUNDS.maxZ; z++) {
      const dist = Math.hypot(x, z);
      let topY = SURFACE_Y;
      if (dist > 20) {
        const h1 = Math.sin(x * 0.09) * Math.cos(z * 0.09) * 4.0;
        const h2 = Math.sin((x + z) * 0.05) * 2.5;
        const blend = Math.min(1, (dist - 20) / 14);
        topY = Math.max(SURFACE_Y - 1, Math.round(SURFACE_Y + Math.max(0, h1 + h2) * blend));
      }

      set(x, 0, z, 'bedrock');
      for (let y = 1; y <= topY - 3; y++) {
        set(x, y, z, 'stone');
      }
      set(x, topY - 2, z, 'dirt');
      set(x, topY - 1, z, 'dirt');
      set(x, topY, z, 'grass');
    }
  }

  // 2. Underground ore veins (Coal, Iron, Gold, Diamond)
  const spawnOreVeins = (blockId, count, minY, maxY, veinSize) => {
    const numId = BLOCKS[blockId].numId;
    const stoneId = BLOCKS.stone.numId;
    for (let i = 0; i < count; i++) {
      let cx = WORLD_BOUNDS.minX + 2 + Math.floor(rnd() * (WORLD_SIZE_X - 4));
      let cy = minY + Math.floor(rnd() * (maxY - minY + 1));
      let cz = WORLD_BOUNDS.minZ + 2 + Math.floor(rnd() * (WORLD_SIZE_Z - 4));
      for (let step = 0; step < veinSize; step++) {
        if (inB(cx, cy, cz) && getNum(cx, cy, cz) === stoneId) {
          grid[flatIndex(cx, cy, cz)] = numId;
        }
        cx += Math.floor(rnd() * 3) - 1;
        cy += Math.floor(rnd() * 3) - 1;
        cz += Math.floor(rnd() * 3) - 1;
        cy = Math.max(minY, Math.min(maxY, cy));
      }
    }
  };

  spawnOreVeins('coal_ore',    260, 3, 14, 7);
  spawnOreVeins('iron_ore',    190, 2, 11, 6);
  spawnOreVeins('gold_ore',     95, 1, 7,  5);
  spawnOreVeins('diamond_ore',  55, 1, 5,  4);

  // 3. Natural underground caverns (Y=3..10) so mining feels exciting!
  for (let i = 0; i < 18; i++) {
    let cx = WORLD_BOUNDS.minX + 10 + Math.floor(rnd() * (WORLD_SIZE_X - 20));
    let cy = 4 + Math.floor(rnd() * 6);
    let cz = WORLD_BOUNDS.minZ + 10 + Math.floor(rnd() * (WORLD_SIZE_Z - 20));
    for (let seg = 0; seg < 12; seg++) {
      const r = 2 + Math.floor(rnd() * 2);
      for (let dx = -r; dx <= r; dx++) {
        for (let dy = -2; dy <= 2; dy++) {
          for (let dz = -r; dz <= r; dz++) {
            if (dx * dx + dy * dy * 1.4 + dz * dz <= r * r + 1) {
              const ny = cy + dy;
              if (ny >= 2 && ny <= 11) {
                set(cx + dx, ny, cz + dz, null);
              }
            }
          }
        }
      }
      cx += Math.floor(rnd() * 5) - 2;
      cz += Math.floor(rnd() * 5) - 2;
    }
  }

  // 4. Mine Entrance Staircase near spawn (-9, 16, -9) descending down to Y=4 cavern
  for (let step = 0; step <= 12; step++) {
    const mx = -9 - step;
    const my = SURFACE_Y - step;
    for (let mz = -10; mz <= -8; mz++) {
      set(mx, my, mz, 'cobble');
      set(mx, my + 1, mz, null);
      set(mx, my + 2, mz, null);
      set(mx, my + 3, mz, null);
    }
    if (step % 4 === 0) {
      set(mx, my + 2, -11, 'lamp');
    }
  }
  // Starter underground mining room at (-24..-18, 4..7, -12..-6) with visible coal & iron!
  for (let x = -26; x <= -20; x++) {
    for (let z = -12; z <= -6; z++) {
      set(x, 3, z, 'stone');
      for (let y = 4; y <= 7; y++) set(x, y, z, null);
    }
  }
  set(-23, 7, -9, 'lamp');
  set(-26, 5, -9, 'coal_ore');
  set(-26, 5, -8, 'coal_ore');
  set(-26, 4, -9, 'iron_ore');
  set(-26, 4, -8, 'iron_ore');
  set(-23, 4, -12, 'gold_ore');
  set(-23, 3, -9, 'diamond_ore');

  // 5. Central spawn plaza (-5..5, -5..5 at Y=16)
  for (let x = -5; x <= 5; x++) {
    for (let z = -5; z <= 5; z++) {
      const edge = Math.abs(x) === 5 || Math.abs(z) === 5;
      const center = Math.abs(x) <= 1 && Math.abs(z) <= 1;
      set(x, SURFACE_Y, z, center ? 'gold' : edge ? 'cobble' : 'planks');
    }
  }
  for (const [lx, lz] of [[-5, -5], [5, -5], [-5, 5], [5, 5]]) {
    set(lx, SURFACE_Y + 1, lz, 'wood');
    set(lx, SURFACE_Y + 2, lz, 'wood');
    set(lx, SURFACE_Y + 3, lz, 'lamp');
  }

  // 6. Starter Community Chest (3,17,3), Furnace (4,17,3), Bed (-3,17,3), Sign (0,17,-4), JumpPad (-4,16,0), Linked Portals!
  set(3, SURFACE_Y + 1, 3, 'chest');
  set(4, SURFACE_Y + 1, 3, 'furnace');
  set(-3, SURFACE_Y + 1, 3, 'bed');
  set(0, SURFACE_Y + 1, -4, 'sign');
  set(-4, SURFACE_Y, 0, 'jumppad');
  set(-4, SURFACE_Y + 1, -4, 'portal'); // Linked to underground mine!
  set(-21, 4, -9, 'portal');            // Underground mine portal!
  const starterChestSlots = Array(CHEST_SIZE).fill(null);
  starterChestSlots[0] = { block: 'stone_pickaxe', count: 1 };
  starterChestSlots[1] = { block: 'coal', count: 16 };
  starterChestSlots[2] = { block: 'raw_iron', count: 8 };
  starterChestSlots[3] = { block: 'iron_ingot', count: 6 };
  starterChestSlots[4] = { block: 'brick', count: 64 };
  starterChestSlots[5] = { block: 'glass', count: 32 };
  starterChestSlots[6] = { block: 'wool_red', count: 32 };
  starterChestSlots[7] = { block: 'wool_yellow', count: 32 };
  starterChestSlots[8] = { block: 'lamp', count: 16 };
  chests[keyOf(3, SURFACE_Y + 1, 3)] = {
    x: 3, y: SURFACE_Y + 1, z: 3,
    label: '공용 보관 상자',
    owner: 'System',
    createdAt: new Date().toISOString(),
    slots: starterChestSlots
  };

  // Starter sample farm plot near the pond (x: 8..9, z: -2..1)
  for (let x = 8; x <= 9; x++) {
    for (let z = -2; z <= 1; z++) {
      set(x, SURFACE_Y, z, 'farmland');
      set(x, SURFACE_Y + 1, z, z <= -1 ? 'wheat_3' : 'wheat_2');
    }
  }

  // 7. Scenic pond (x: 11..19, z: -5..4)
  for (let x = 11; x <= 19; x++) {
    for (let z = -5; z <= 4; z++) {
      const edge = x === 11 || x === 19 || z === -5 || z === 4;
      if (edge) {
        set(x, SURFACE_Y, z, 'sand');
      } else {
        set(x, SURFACE_Y - 1, z, 'sand');
        set(x, SURFACE_Y, z, 'water');
      }
    }
  }

  // 8. Lush forest trees (36 trees across the 128x128 world)
  const treeCoords = [
    [-12, 8], [-15, 16], [-8, 18], [10, 14], [18, 18], [24, 10],
    [16, -14], [6, -16], [-4, -18], [-18, -22], [28, -20], [34, 4],
    [-28, 6], [-34, -8], [-24, 26], [8, 28], [26, 28], [40, -14],
    [-40, 18], [-44, -24], [44, 22], [38, 36], [-36, 38], [14, -34],
    [-14, -36], [32, -38], [-48, 2], [48, -4], [0, 36], [0, -34],
    [-20, 12], [22, -6], [-30, -30], [30, 16], [-10, 30], [42, -30]
  ];
  for (const [tx, tz] of treeCoords) {
    let baseY = SURFACE_Y;
    for (let y = WORLD_BOUNDS.maxY - 8; y >= SURFACE_Y - 2; y--) {
      if (getNum(tx, y, tz) === BLOCKS.grass.numId) {
        baseY = y;
        break;
      }
    }
    placeTreeOnGrid(grid, tx, baseY, tz, set);
  }

  return { grid, chests };
}

export function generateDefaultBlueprints() {
  const cabin = [];
  for (let x = 0; x < 5; x++) {
    for (let z = 0; z < 5; z++) cabin.push({ dx: x, dy: 0, dz: z, block: 'cobble' });
  }
  for (let y = 1; y <= 3; y++) {
    for (let x = 0; x < 5; x++) {
      for (let z = 0; z < 5; z++) {
        const edge = x === 0 || x === 4 || z === 0 || z === 4;
        if (!edge) continue;
        if (x === 2 && z === 0 && y <= 2) continue;
        const corner = (x === 0 || x === 4) && (z === 0 || z === 4);
        const isWindow = y === 2 && (x === 2 || z === 2) && !(x === 2 && z === 0);
        cabin.push({ dx: x, dy: y, dz: z, block: corner ? 'wood' : isWindow ? 'glass' : 'planks' });
      }
    }
  }
  for (let x = 0; x < 5; x++) for (let z = 0; z < 5; z++) cabin.push({ dx: x, dy: 4, dz: z, block: 'brick' });
  for (let x = 1; x <= 3; x++) for (let z = 1; z <= 3; z++) cabin.push({ dx: x, dy: 5, dz: z, block: 'brick' });
  cabin.push({ dx: 2, dy: 3, dz: 2, block: 'lamp' });

  const tower = [];
  for (let y = 0; y < 6; y++) {
    for (let x = 0; x < 3; x++) {
      for (let z = 0; z < 3; z++) {
        const edge = x === 0 || x === 2 || z === 0 || z === 2;
        if (!edge) continue;
        if (x === 1 && z === 0 && y <= 1) continue;
        const corner = (x === 0 || x === 2) && (z === 0 || z === 2);
        tower.push({ dx: x, dy: y, dz: z, block: corner ? 'stone' : (y === 4 ? 'glass' : 'cobble') });
      }
    }
  }
  for (let x = 0; x < 3; x++) for (let z = 0; z < 3; z++) tower.push({ dx: x, dy: 6, dz: z, block: 'planks' });
  tower.push({ dx: 1, dy: 7, dz: 1, block: 'lamp' });

  const heartPattern = ['..R.R..', '.RRRRR.', 'RRRRRRR', '.RRRRR.', '..RRR..', '...R...'];
  const heart = [];
  for (let row = 0; row < heartPattern.length; row++) {
    const dy = heartPattern.length - 1 - row;
    for (let col = 0; col < heartPattern[row].length; col++) {
      if (heartPattern[row][col] === 'R') heart.push({ dx: col, dy, dz: 0, block: 'wool_red' });
    }
  }

  const bridge = [];
  for (let x = 0; x < 7; x++) {
    const archY = (x === 0 || x === 6) ? 0 : (x === 1 || x === 5) ? 1 : 2;
    for (let z = 0; z < 3; z++) {
      bridge.push({ dx: x, dy: archY, dz: z, block: 'planks' });
      if (z === 0 || z === 2) bridge.push({ dx: x, dy: archY + 1, dz: z, block: 'wood' });
    }
  }

  return [
    { id: 'bp-cabin',  name: '아담한 오두막', author: 'System', blocks: cabin },
    { id: 'bp-tower',  name: '전망대 타워',   author: 'System', blocks: tower },
    { id: 'bp-heart',  name: '하트 조형물',   author: 'System', blocks: heart },
    { id: 'bp-bridge', name: '아치형 다리',   author: 'System', blocks: bridge }
  ];
}

export function generateDefaultSkins() {
  return [
    {
      id: 'skin-explorer',
      name: '탐험가',
      author: 'System',
      likes: 3,
      skin: { skinColor: '#f5cfa0', hairColor: '#3b2416', shirtColor: '#38bdf8', pantsColor: '#334155', hatColor: '#facc15', eyeColor: '#0f172a', blush: true }
    },
    {
      id: 'skin-firefighter',
      name: '소방관',
      author: 'System',
      likes: 5,
      skin: { skinColor: '#f5cfa0', hairColor: '#27272a', shirtColor: '#dc2626', pantsColor: '#1e293b', hatColor: '#ef4444', eyeColor: '#0f172a', blush: false }
    },
    {
      id: 'skin-police',
      name: '경찰관',
      author: 'System',
      likes: 4,
      skin: { skinColor: '#f5cfa0', hairColor: '#1e293b', shirtColor: '#2563eb', pantsColor: '#1e3a8a', hatColor: '#1d4ed8', eyeColor: '#0f172a', blush: false }
    },
    {
      id: 'skin-miner',
      name: '광부',
      author: 'System',
      likes: 6,
      skin: { skinColor: '#ecc092', hairColor: '#573720', shirtColor: '#f59e0b', pantsColor: '#475569', hatColor: '#eab308', eyeColor: '#1e293b', blush: false }
    },
    {
      id: 'skin-iron',
      name: '아이언 수트',
      author: 'System',
      likes: 8,
      skin: { skinColor: '#facc15', hairColor: '#991b1b', shirtColor: '#b91c1c', pantsColor: '#991b1b', hatColor: '#dc2626', eyeColor: '#38bdf8', blush: false }
    },
    {
      id: 'skin-builder',
      name: '건축가',
      author: 'System',
      likes: 2,
      skin: { skinColor: '#f7d5b0', hairColor: '#4b2e19', shirtColor: '#facc15', pantsColor: '#2563eb', hatColor: '#fbbf24', eyeColor: '#111827', blush: true }
    }
  ];
}
