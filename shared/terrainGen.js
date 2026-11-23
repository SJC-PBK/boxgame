// Shared Deterministic Procedural Terrain Generator (1024 x 96 x 1024)
// Used identically by BOTH Node.js server and Browser client for zero-latency chunk streaming!

export const STREAM_BOUNDS = {
  minX: -512,
  maxX: 511,
  minY: 0,
  maxY: 95,
  minZ: -512,
  maxZ: 511
};

export const SURFACE_BASE = 36;
export const SEA_LEVEL = 33;

// Fast deterministic integer hash -> 0..1
function hash2(x, z) {
  let h = (Math.imul(x, 374761393) + Math.imul(z, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function hash3(x, y, z) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 1442695041) + Math.imul(z, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

function valueNoise2D(x, z, scale) {
  const sx = x / scale;
  const sz = z / scale;
  const x0 = Math.floor(sx), z0 = Math.floor(sz);
  const fx = smoothstep(sx - x0);
  const fz = smoothstep(sz - z0);
  const n00 = hash2(x0, z0);
  const n10 = hash2(x0 + 1, z0);
  const n01 = hash2(x0, z0 + 1);
  const n11 = hash2(x0 + 1, z0 + 1);
  const nx0 = n00 + (n10 - n00) * fx;
  const nx1 = n01 + (n11 - n01) * fx;
  return nx0 + (nx1 - nx0) * fz;
}

function fbm2D(x, z) {
  return (
    valueNoise2D(x, z, 64) * 0.55 +
    valueNoise2D(x + 137, z - 89, 28) * 0.3 +
    valueNoise2D(x - 41, z + 211, 12) * 0.15
  );
}

export function getBiomeAt(x, z) {
  const dist = Math.hypot(x, z);
  if (dist < 28) return 'meadow'; // Always lush meadow around central spawn
  const temp = valueNoise2D(x + 500, z - 300, 140);
  const moist = valueNoise2D(x - 700, z + 600, 130);
  if (temp > 0.66 && moist < 0.48) return 'desert';
  if (temp < 0.34) return 'snow';
  if (moist > 0.58) return 'forest';
  return 'meadow';
}

export function getBiomeLabel(biome) {
  switch (biome) {
    case 'desert': return '🏜️ 사막';
    case 'snow':   return '❄️ 설원';
    case 'forest': return '🌲 숲';
    default:       return '🌿 초원';
  }
}

export function getSurfaceHeight(x, z) {
  const dist = Math.hypot(x, z);
  if (dist <= 18) return SURFACE_BASE;

  const biome = getBiomeAt(x, z);
  const n = fbm2D(x, z);
  let h = SURFACE_BASE + (n - 0.48) * 18;

  if (biome === 'snow') {
    h += Math.max(0, n - 0.45) * 28; // Dramatic snowy peaks up to ~Y=64!
  } else if (biome === 'desert') {
    h = SURFACE_BASE + (n - 0.45) * 10;
  }

  // Smoothly flatten near central spawn
  if (dist < 32) {
    const blend = smoothstep((dist - 18) / 14);
    h = SURFACE_BASE + (h - SURFACE_BASE) * blend;
  }

  return Math.max(26, Math.min(72, Math.round(h)));
}

// Check if a deterministic tree trunk stands at (tx, tz)
function hasTreeAt(tx, tz) {
  const dist = Math.hypot(tx, tz);
  if (dist < 14) return false;
  // Grid spacing of 7 blocks with jitter so trees never overlap awkwardly
  if (((tx % 7) + 7) % 7 !== 3 || ((tz % 7) + 7) % 7 !== 3) return false;
  const biome = getBiomeAt(tx, tz);
  if (biome === 'desert') return false;
  const surf = getSurfaceHeight(tx, tz);
  if (surf <= SEA_LEVEL + 1 || surf > 56) return false;
  const prob = biome === 'forest' ? 0.72 : (biome === 'snow' ? 0.28 : 0.32);
  return hash2(tx * 3 + 17, tz * 5 - 11) < prob;
}

function getTreeBlock(x, y, z) {
  const gx = Math.floor((x + 2) / 7) * 7 + 3;
  const gz = Math.floor((z + 2) / 7) * 7 + 3;
  for (let ox = -7; ox <= 7; ox += 7) {
    for (let oz = -7; oz <= 7; oz += 7) {
      const tx = gx + ox;
      const tz = gz + oz;
      const dx = x - tx;
      const dz = z - tz;
      if (Math.abs(dx) > 2 || Math.abs(dz) > 2) continue;
      if (!hasTreeAt(tx, tz)) continue;

      const baseY = getSurfaceHeight(tx, tz);
      const trunkH = 4 + (Math.abs(tx + tz) % 3);
      if (dx === 0 && dz === 0 && y > baseY && y <= baseY + trunkH) {
        return 'wood';
      }
      const dy = y - baseY;
      if (dy >= trunkH - 1 && dy <= trunkH + 1) {
        if (Math.abs(dx) === 2 && Math.abs(dz) === 2 && dy === trunkH + 1) continue;
        if (dx === 0 && dz === 0 && dy <= trunkH) continue;
        return 'leaves';
      }
      if (dx === 0 && dz === 0 && dy === trunkH + 2) {
        return 'leaves';
      }
    }
  }
  return null;
}

// Fast 3D cave carving in deep underground (Y=2..30)
function isCave(x, y, z) {
  if (y < 2 || y > 29) return false;
  // Protect spawn shaft & starter mine area from random caves
  if (Math.abs(x) < 28 && Math.abs(z) < 20) return false;
  const c1 = Math.sin(x * 0.08 + y * 0.14) * Math.cos(z * 0.08 - y * 0.11);
  const c2 = Math.cos((x + z) * 0.055) * Math.sin(y * 0.19 + x * 0.04);
  return (c1 * c1 + c2 * c2) < 0.045;
}

// Starter landmark overrides around (0, 36, 0) & deep mine (-21, 8, -9)
function getSpawnLandmarkBlock(x, y, z) {
  // 1. Central Spawn Plaza (-5..5, -5..5 at Y=36)
  if (Math.abs(x) <= 5 && Math.abs(z) <= 5) {
    if (y === SURFACE_BASE) {
      if (x === -4 && z === 0) return 'jumppad';
      const edge = Math.abs(x) === 5 || Math.abs(z) === 5;
      const center = Math.abs(x) <= 1 && Math.abs(z) <= 1;
      return center ? 'gold' : edge ? 'cobble' : 'planks';
    }
    if (y > SURFACE_BASE) {
      // Corner lamp posts
      if (Math.abs(x) === 5 && Math.abs(z) === 5) {
        if (y === SURFACE_BASE + 1 || y === SURFACE_BASE + 2) return 'wood';
        if (y === SURFACE_BASE + 3) return 'lamp';
      }
      // Starter interactive blocks
      if (y === SURFACE_BASE + 1) {
        if (x === 3 && z === 3) return 'chest';
        if (x === 4 && z === 3) return 'furnace';
        if (x === -3 && z === 3) return 'bed';
        if (x === 0 && z === -4) return 'sign';
        if (x === -4 && z === -4) return 'portal';
      }
      return null; // Keep plaza air clear
    }
  }

  // 2. Scenic Pond (x: 11..19, z: -5..4) & Starter Wheat Farm (x: 8..9, z: -2..1)
  if (x >= 11 && x <= 19 && z >= -5 && z <= 4) {
    const edge = x === 11 || x === 19 || z === -5 || z === 4;
    if (y === SURFACE_BASE) return edge ? 'sand' : 'water';
    if (y === SURFACE_BASE - 1 && !edge) return 'sand';
    if (y > SURFACE_BASE) return null;
  }
  if (x >= 8 && x <= 9 && z >= -2 && z <= 1) {
    if (y === SURFACE_BASE) return 'farmland';
    if (y === SURFACE_BASE + 1) return z <= -1 ? 'wheat_3' : 'wheat_2';
    if (y > SURFACE_BASE + 1) return null;
  }

  // 3. Lit Mine Staircase (-9..-36, z: -10..-8) descending from Y=36 to Y=8!
  if (x <= -9 && x >= -37 && z >= -11 && z <= -8) {
    const step = -9 - x;
    const stairY = SURFACE_BASE - step;
    if (step >= 0 && step <= 28) {
      if (z >= -10 && z <= -8) {
        if (y === stairY) return 'cobble';
        if (y > stairY && y <= stairY + 3) return null; // Tunnel air
      }
      if (z === -11 && step % 5 === 0 && y === stairY + 2) return 'lamp';
    }
  }

  // 4. Deep Underground Mining Cavern (-26..-18, Y=8..12, z: -12..-6) with visible ores & portal!
  if (x >= -26 && x <= -18 && z >= -12 && z <= -6 && y >= 7 && y <= 12) {
    if (y === 7) return (x === -23 && z === -9) ? 'diamond_ore' : 'stone';
    if (y === 8 && x === -21 && z === -9) return 'portal';
    if (y === 11 && x === -22 && z === -9) return 'lamp';
    if (x === -26 && y === 9 && (z === -9 || z === -8)) return 'coal_ore';
    if (x === -26 && y === 8 && (z === -9 || z === -8)) return 'iron_ore';
    if (z === -12 && y === 8 && x === -23) return 'gold_ore';
    if (x > -26 && x < -18 && z > -12 && z < -6 && y >= 8 && y <= 11) return null;
  }

  return undefined; // No landmark override at this coordinate
}

// Primary pure function: returns base block ID (string) or null (air) for ANY (x, y, z)
export function getBaseBlock(x, y, z) {
  if (
    x < STREAM_BOUNDS.minX || x > STREAM_BOUNDS.maxX ||
    y < STREAM_BOUNDS.minY || y > STREAM_BOUNDS.maxY ||
    z < STREAM_BOUNDS.minZ || z > STREAM_BOUNDS.maxZ
  ) return null;

  if (y === 0) return 'bedrock';

  const landmark = getSpawnLandmarkBlock(x, y, z);
  if (landmark !== undefined) return landmark;

  const surf = getSurfaceHeight(x, z);

  // Above surface: water (if below sea level) or trees or air
  if (y > surf) {
    if (y <= SEA_LEVEL) return 'water';
    if (y <= surf + 9) return getTreeBlock(x, y, z);
    return null;
  }

  // Deep caves
  if (y < surf - 3 && isCave(x, y, z)) return null;

  const biome = getBiomeAt(x, z);

  // Surface layer
  if (y === surf) {
    if (surf <= SEA_LEVEL + 1 || biome === 'desert') return 'sand';
    if (biome === 'snow' && surf >= 40) return 'wool_white';
    return 'grass';
  }

  // Sub-surface dirt / sand (3 layers)
  if (y >= surf - 3) {
    return (surf <= SEA_LEVEL + 1 || biome === 'desert') ? 'sand' : 'dirt';
  }

  // Deep underground stone + deterministic ore veins!
  // Clustered veins via 2x2x2 cell hashing
  const vx = x >> 1, vy = y >> 1, vz = z >> 1;
  const oreHash = hash3(vx, vy, vz);
  if (y <= 12 && oreHash < 0.012) return 'diamond_ore';
  if (y <= 19 && oreHash >= 0.012 && oreHash < 0.032) return 'gold_ore';
  if (y <= 27 && oreHash >= 0.032 && oreHash < 0.072) return 'iron_ore';
  if (y <= 34 && oreHash >= 0.072 && oreHash < 0.125) return 'coal_ore';

  return 'stone';
}
