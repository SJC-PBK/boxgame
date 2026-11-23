import * as THREE from '../vendor/three/three.module.min.js';

function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCanvas(drawFn, size = 16) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  drawFn(ctx);
  return c;
}

function fillNoise(ctx, colors, seed) {
  const rnd = mulberry32(seed);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      ctx.fillStyle = colors[Math.floor(rnd() * colors.length)];
      ctx.fillRect(x, y, 1, 1);
    }
  }
}

function drawOreSpecks(ctx, colorMain, colorHi, seed) {
  fillNoise(ctx, ['#7f848a', '#74797f', '#8d9298', '#6a6f75'], seed);
  const rnd = mulberry32(seed + 77);
  const spots = [
    [3, 3], [10, 4], [5, 9], [11, 11], [2, 12], [8, 7]
  ];
  for (const [sx, sy] of spots) {
    ctx.fillStyle = colorMain;
    ctx.fillRect(sx, sy, 2, 2);
    if (rnd() > 0.3) ctx.fillRect(sx + 1, sy + 1, 2, 1);
    ctx.fillStyle = colorHi;
    ctx.fillRect(sx, sy, 1, 1);
  }
}

function toTexture(canvas) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function drawBlockFace(blockId, face) {
  return makeCanvas((ctx) => {
    switch (blockId) {
      case 'bedrock':
        fillNoise(ctx, ['#1e293b', '#334155', '#0f172a', '#475569'], 11);
        break;
      case 'grass': {
        if (face === 'top') {
          fillNoise(ctx, ['#5ea832', '#68b83a', '#53992c', '#74c443'], 101);
        } else if (face === 'bottom') {
          fillNoise(ctx, ['#866043', '#7a5539', '#926b4b', '#6d4c33'], 102);
        } else {
          fillNoise(ctx, ['#866043', '#7a5539', '#926b4b', '#6d4c33'], 103);
          const rnd = mulberry32(104);
          for (let x = 0; x < 16; x++) {
            const h = 3 + Math.floor(rnd() * 3);
            for (let y = 0; y < h; y++) {
              ctx.fillStyle = y === 0 ? '#68b83a' : '#53992c';
              ctx.fillRect(x, y, 1, 1);
            }
          }
        }
        break;
      }
      case 'dirt':
        fillNoise(ctx, ['#866043', '#7a5539', '#926b4b', '#6d4c33'], 201);
        break;
      case 'stone':
        fillNoise(ctx, ['#7f848a', '#74797f', '#8d9298', '#6a6f75'], 301);
        break;
      case 'cobble': {
        fillNoise(ctx, ['#767a80', '#63676d', '#8c9096', '#565a60'], 302);
        ctx.fillStyle = '#474b50';
        for (let y = 0; y < 16; y += 4) ctx.fillRect(0, y, 16, 1);
        for (let x = 0; x < 16; x += 5) ctx.fillRect(x, 0, 1, 16);
        break;
      }
      case 'coal_ore':
        drawOreSpecks(ctx, '#1e293b', '#475569', 310);
        break;
      case 'iron_ore':
        drawOreSpecks(ctx, '#d6b296', '#f3dec9', 320);
        break;
      case 'gold_ore':
        drawOreSpecks(ctx, '#eab308', '#fef08a', 330);
        break;
      case 'diamond_ore':
        drawOreSpecks(ctx, '#06b6d4', '#a5f3fc', 340);
        break;
      case 'wood': {
        if (face === 'top' || face === 'bottom') {
          ctx.fillStyle = '#a98556';
          ctx.fillRect(0, 0, 16, 16);
          ctx.strokeStyle = '#6c4d2d';
          ctx.lineWidth = 2;
          ctx.strokeRect(1, 1, 14, 14);
          ctx.strokeStyle = '#8b6840';
          ctx.lineWidth = 1;
          ctx.strokeRect(4, 4, 8, 8);
          ctx.fillStyle = '#6c4d2d';
          ctx.fillRect(7, 7, 2, 2);
        } else {
          const rnd = mulberry32(401);
          for (let x = 0; x < 16; x++) {
            ctx.fillStyle = x % 3 === 0 ? '#5c3f24' : (rnd() > 0.5 ? '#6e4c2c' : '#7b5633');
            ctx.fillRect(x, 0, 1, 16);
          }
        }
        break;
      }
      case 'planks': {
        fillNoise(ctx, ['#b88d56', '#c2975f', '#ad824c'], 402);
        ctx.fillStyle = '#7d5a32';
        for (let y = 0; y < 16; y += 4) ctx.fillRect(0, y, 16, 1);
        ctx.fillRect(7, 0, 1, 4);
        ctx.fillRect(13, 4, 1, 4);
        ctx.fillRect(4, 8, 1, 4);
        ctx.fillRect(10, 12, 1, 4);
        break;
      }
      case 'leaves': {
        const rnd = mulberry32(501);
        for (let y = 0; y < 16; y++) {
          for (let x = 0; x < 16; x++) {
            const v = rnd();
            if (v < 0.22) continue;
            ctx.fillStyle = v < 0.5 ? '#2d7a2d' : (v < 0.8 ? '#3b9637' : '#4db042');
            ctx.fillRect(x, y, 1, 1);
          }
        }
        break;
      }
      case 'sapling': {
        // Cute pixel-art sapling sprout
        ctx.fillStyle = '#6e4c2c';
        ctx.fillRect(7, 8, 2, 8);
        ctx.fillStyle = '#22c55e';
        ctx.fillRect(4, 4, 8, 5);
        ctx.fillRect(5, 2, 6, 2);
        ctx.fillStyle = '#4ade80';
        ctx.fillRect(6, 3, 3, 2);
        ctx.fillRect(9, 5, 2, 2);
        break;
      }
      case 'brick': {
        ctx.fillStyle = '#c8c2b8';
        ctx.fillRect(0, 0, 16, 16);
        const bricks = ['#a9483b', '#9a3e32', '#b55244'];
        const rnd = mulberry32(601);
        for (let row = 0; row < 4; row++) {
          const y = row * 4;
          const offset = (row % 2) * 4;
          for (let x = -4; x < 16; x += 8) {
            ctx.fillStyle = bricks[Math.floor(rnd() * bricks.length)];
            ctx.fillRect(x + offset + 1, y + 1, 7, 3);
          }
        }
        break;
      }
      case 'glass': {
        ctx.fillStyle = 'rgba(186, 230, 253, 0.28)';
        ctx.fillRect(0, 0, 16, 16);
        ctx.fillStyle = 'rgba(224, 242, 254, 0.92)';
        ctx.fillRect(0, 0, 16, 1);
        ctx.fillRect(0, 15, 16, 1);
        ctx.fillRect(0, 0, 1, 16);
        ctx.fillRect(15, 0, 1, 16);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
        ctx.fillRect(3, 3, 2, 1);
        ctx.fillRect(2, 4, 2, 1);
        ctx.fillRect(11, 11, 2, 1);
        break;
      }
      case 'sand':
        fillNoise(ctx, ['#e2d39c', '#d8c78d', '#eadca9', '#cfbe82'], 701);
        break;
      case 'water':
        fillNoise(ctx, ['rgba(37,99,235,0.72)', 'rgba(59,130,246,0.72)', 'rgba(29,78,216,0.72)'], 702);
        break;
      case 'gold':
        fillNoise(ctx, ['#facc15', '#eab308', '#fde047', '#ca8a04'], 801);
        ctx.strokeStyle = '#a16207';
        ctx.strokeRect(0.5, 0.5, 15, 15);
        break;
      case 'diamond':
        fillNoise(ctx, ['#38bdf8', '#22d3ee', '#7dd3fc', '#0ea5e9'], 802);
        ctx.strokeStyle = '#0284c7';
        ctx.strokeRect(0.5, 0.5, 15, 15);
        break;
      case 'lamp':
        fillNoise(ctx, ['#fef08a', '#fde047', '#f59e0b', '#fef9c3'], 803);
        ctx.strokeStyle = '#b45309';
        ctx.strokeRect(0.5, 0.5, 15, 15);
        break;
      case 'wool_white':
        fillNoise(ctx, ['#f1f5f9', '#e2e8f0', '#ffffff', '#cbd5e1'], 901);
        break;
      case 'wool_red':
        fillNoise(ctx, ['#ef4444', '#dc2626', '#f87171', '#b91c1c'], 902);
        break;
      case 'wool_blue':
        fillNoise(ctx, ['#3b82f6', '#2563eb', '#60a5fa', '#1d4ed8'], 903);
        break;
      case 'wool_yellow':
        fillNoise(ctx, ['#facc15', '#eab308', '#fde047', '#f59e0b'], 904);
        break;
      case 'chest': {
        fillNoise(ctx, ['#a66a32', '#945b28', '#b4763c'], 950);
        ctx.fillStyle = '#3f2814';
        ctx.fillRect(0, 0, 16, 2);
        ctx.fillRect(0, 14, 16, 2);
        ctx.fillRect(0, 0, 2, 16);
        ctx.fillRect(14, 0, 2, 16);
        if (face !== 'top' && face !== 'bottom') {
          ctx.fillStyle = '#291a0c';
          ctx.fillRect(0, 5, 16, 2);
          ctx.fillStyle = '#facc15';
          ctx.fillRect(6, 4, 4, 4);
          ctx.fillStyle = '#a16207';
          ctx.fillRect(7, 5, 2, 2);
        }
        break;
      }
      case 'furnace': {
        fillNoise(ctx, ['#767a80', '#63676d', '#8c9096', '#565a60'], 960);
        ctx.fillStyle = '#334155';
        ctx.fillRect(0, 0, 16, 2);
        ctx.fillRect(0, 14, 16, 2);
        if (face !== 'top' && face !== 'bottom') {
          // Dark furnace opening + warm glowing embers
          ctx.fillStyle = '#1e293b';
          ctx.fillRect(3, 3, 10, 4);
          ctx.fillRect(3, 9, 10, 5);
          ctx.fillStyle = '#f97316';
          ctx.fillRect(4, 11, 8, 2);
          ctx.fillStyle = '#facc15';
          ctx.fillRect(6, 10, 4, 2);
        }
        break;
      }
      case 'farmland': {
        if (face === 'top') {
          fillNoise(ctx, ['#5c3d28', '#4d3220', '#6b4931'], 970);
          ctx.fillStyle = '#3a2416';
          for (let y = 2; y < 16; y += 4) ctx.fillRect(0, y, 16, 1);
        } else {
          fillNoise(ctx, ['#866043', '#7a5539', '#6d4c33'], 971);
        }
        break;
      }
      case 'wheat_1':
      case 'wheat_2':
      case 'wheat_3': {
        const h = blockId === 'wheat_1' ? 5 : blockId === 'wheat_2' ? 10 : 15;
        const col = blockId === 'wheat_3' ? '#eab308' : '#22c55e';
        const tip = blockId === 'wheat_3' ? '#fef08a' : '#4ade80';
        for (const sx of [2, 6, 10, 13]) {
          ctx.fillStyle = col;
          ctx.fillRect(sx, 16 - h, 2, h);
          ctx.fillStyle = tip;
          ctx.fillRect(sx, 16 - h, 2, 2);
        }
        break;
      }
      case 'bed': {
        if (face === 'top') {
          ctx.fillStyle = '#dc2626';
          ctx.fillRect(0, 0, 16, 16);
          ctx.fillStyle = '#f8fafc';
          ctx.fillRect(1, 1, 14, 5);
          ctx.fillStyle = '#ef4444';
          ctx.fillRect(0, 7, 16, 2);
        } else {
          ctx.fillStyle = '#8b5a2b';
          ctx.fillRect(0, 10, 16, 6);
          ctx.fillStyle = '#dc2626';
          ctx.fillRect(0, 4, 16, 6);
          ctx.fillStyle = '#f8fafc';
          ctx.fillRect(0, 2, 16, 2);
        }
        break;
      }
      case 'door_closed':
      case 'door_open': {
        if (blockId === 'door_open') {
          ctx.fillStyle = 'rgba(139, 90, 43, 0.35)';
          ctx.fillRect(0, 0, 3, 16);
          ctx.fillRect(13, 0, 3, 16);
          ctx.fillRect(0, 0, 16, 2);
        } else {
          fillNoise(ctx, ['#9a6534', '#8b5a2b', '#a8703c'], 980);
          ctx.fillStyle = '#4e3116';
          ctx.fillRect(0, 0, 16, 2); ctx.fillRect(0, 14, 16, 2);
          ctx.fillRect(0, 0, 2, 16); ctx.fillRect(14, 0, 2, 16);
          // Window cutout & brass doorknob
          ctx.fillStyle = 'rgba(186, 230, 253, 0.55)';
          ctx.fillRect(4, 3, 8, 5);
          ctx.fillStyle = '#facc15';
          ctx.fillRect(11, 10, 2, 2);
        }
        break;
      }
      case 'ladder': {
        ctx.fillStyle = '#9a6534';
        ctx.fillRect(2, 0, 2, 16);
        ctx.fillRect(12, 0, 2, 16);
        ctx.fillStyle = '#b8834d';
        for (let y = 2; y < 16; y += 4) ctx.fillRect(2, y, 12, 2);
        break;
      }
      case 'sign': {
        ctx.fillStyle = '#784820';
        ctx.fillRect(7, 9, 2, 7);
        ctx.fillStyle = '#c2975f';
        ctx.fillRect(1, 2, 14, 8);
        ctx.fillStyle = '#5c3f24';
        ctx.fillRect(3, 4, 10, 1);
        ctx.fillRect(3, 6, 8, 1);
        break;
      }
      case 'tnt': {
        if (face === 'top' || face === 'bottom') {
          fillNoise(ctx, ['#dc2626', '#b91c1c', '#991b1b'], 985);
          ctx.fillStyle = '#1e293b';
          ctx.fillRect(6, 6, 4, 4);
        } else {
          ctx.fillStyle = '#dc2626';
          ctx.fillRect(0, 0, 16, 16);
          ctx.fillStyle = '#b91c1c';
          for (let x = 0; x < 16; x += 4) ctx.fillRect(x, 0, 1, 16);
          ctx.fillStyle = '#f8fafc';
          ctx.fillRect(0, 5, 16, 6);
          ctx.fillStyle = '#0f172a';
          // Pixel "TNT"
          ctx.fillRect(2, 6, 3, 1); ctx.fillRect(3, 6, 1, 4);
          ctx.fillRect(6, 6, 1, 4); ctx.fillRect(7, 7, 1, 1); ctx.fillRect(8, 6, 1, 4);
          ctx.fillRect(11, 6, 3, 1); ctx.fillRect(12, 6, 1, 4);
        }
        break;
      }
      case 'fuse': {
        // Coiled gunpowder fuse cord (transparent background, bright braided rope + spark tip)
        ctx.clearRect(0, 0, 16, 16);
        ctx.fillStyle = '#3f2e21';
        ctx.fillRect(0, 6, 16, 4);
        ctx.fillRect(6, 0, 4, 16);
        ctx.fillStyle = '#92400e';
        ctx.fillRect(0, 7, 16, 2);
        ctx.fillRect(7, 0, 2, 16);
        // Gunpowder weave dots
        ctx.fillStyle = '#1e293b';
        for (let i = 1; i < 16; i += 3) {
          ctx.fillRect(i, 7, 1, 2);
          ctx.fillRect(7, i, 2, 1);
        }
        // Center red-orange spark knot
        ctx.fillStyle = '#f97316';
        ctx.fillRect(6, 6, 4, 4);
        ctx.fillStyle = '#fef08a';
        ctx.fillRect(7, 7, 2, 2);
        break;
      }
      case 'fill_bomb': {
        if (face === 'top' || face === 'bottom') {
          fillNoise(ctx, ['#15803d', '#166534', '#22c55e'], 986);
          ctx.fillStyle = '#78350f';
          ctx.fillRect(5, 5, 6, 6);
          ctx.fillStyle = '#bbf7d0';
          ctx.fillRect(7, 7, 2, 2);
        } else {
          ctx.fillStyle = '#16a34a';
          ctx.fillRect(0, 0, 16, 16);
          ctx.fillStyle = '#15803d';
          for (let x = 0; x < 16; x += 4) ctx.fillRect(x, 0, 1, 16);
          ctx.fillStyle = '#92400e';
          ctx.fillRect(0, 12, 16, 4);
          ctx.fillStyle = '#f0fdf4';
          ctx.fillRect(0, 5, 16, 6);
          ctx.fillStyle = '#14532d';
          // Pixel "FILL"
          ctx.fillRect(1, 6, 3, 1); ctx.fillRect(1, 6, 1, 4); ctx.fillRect(1, 8, 2, 1);
          ctx.fillRect(5, 6, 1, 4);
          ctx.fillRect(8, 6, 1, 4); ctx.fillRect(8, 9, 3, 1);
          ctx.fillRect(12, 6, 1, 4); ctx.fillRect(12, 9, 3, 1);
        }
        break;
      }
      case 'water_bomb': {
        if (face === 'top' || face === 'bottom') {
          fillNoise(ctx, ['#0284c7', '#0369a1', '#38bdf8'], 987);
          ctx.fillStyle = '#0c4a6e';
          ctx.fillRect(5, 5, 6, 6);
          ctx.fillStyle = '#e0f2fe';
          ctx.fillRect(7, 7, 2, 2);
        } else {
          ctx.fillStyle = '#0284c7';
          ctx.fillRect(0, 0, 16, 16);
          ctx.fillStyle = '#0369a1';
          for (let x = 0; x < 16; x += 4) ctx.fillRect(x, 0, 1, 16);
          ctx.fillStyle = '#38bdf8';
          ctx.fillRect(0, 12, 16, 4);
          ctx.fillStyle = '#f0f9ff';
          ctx.fillRect(0, 5, 16, 6);
          ctx.fillStyle = '#0c4a6e';
          // Pixel "H2O"
          ctx.fillRect(2, 6, 1, 4); ctx.fillRect(3, 8, 1, 1); ctx.fillRect(4, 6, 1, 4);
          ctx.fillRect(6, 6, 3, 1); ctx.fillRect(8, 7, 1, 1); ctx.fillRect(6, 8, 3, 1); ctx.fillRect(6, 9, 1, 1); ctx.fillRect(6, 9, 3, 1);
          ctx.fillRect(11, 6, 3, 1); ctx.fillRect(11, 6, 1, 4); ctx.fillRect(13, 6, 1, 4); ctx.fillRect(11, 9, 3, 1);
        }
        break;
      }
      case 'protect_beacon': {
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, 16, 16);
        ctx.fillStyle = '#38bdf8';
        ctx.fillRect(2, 2, 12, 12);
        ctx.fillStyle = '#e0f2fe';
        ctx.fillRect(4, 4, 8, 8);
        ctx.fillStyle = '#facc15';
        ctx.fillRect(6, 6, 4, 4);
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(0, 13, 16, 3);
        break;
      }
      case 'portal': {
        fillNoise(ctx, ['rgba(147,51,234,0.78)', 'rgba(192,132,252,0.82)', 'rgba(88,28,135,0.82)', 'rgba(56,189,248,0.75)'], 990);
        ctx.fillStyle = 'rgba(255,255,255,0.65)';
        ctx.fillRect(6, 6, 4, 4);
        break;
      }
      case 'jumppad': {
        if (face === 'top') {
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(0, 0, 16, 16);
          ctx.fillStyle = '#22d3ee';
          ctx.fillRect(1, 1, 14, 14);
          ctx.fillStyle = '#facc15';
          ctx.fillRect(3, 3, 10, 10);
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(6, 5, 4, 2);
          ctx.fillRect(5, 7, 6, 2);
          ctx.fillRect(7, 9, 2, 3);
        } else {
          ctx.fillStyle = '#334155';
          ctx.fillRect(0, 0, 16, 16);
          ctx.fillStyle = '#facc15';
          ctx.fillRect(0, 0, 16, 4);
          ctx.fillStyle = '#22d3ee';
          ctx.fillRect(0, 4, 16, 2);
        }
        break;
      }
      case 'job_counter': {
        fillNoise(ctx, ['#9a6534', '#8b5a2b', '#a8703c'], 991);
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(3, 2, 10, 7);
        ctx.fillStyle = '#38bdf8';
        ctx.fillRect(4, 3, 8, 5);
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(5, 4, 5, 1); ctx.fillRect(5, 6, 4, 1);
        break;
      }
      case 'job_espresso': {
        fillNoise(ctx, ['#475569', '#334155', '#64748b'], 992);
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(2, 2, 12, 4);
        ctx.fillRect(4, 7, 8, 7);
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(11, 3, 2, 2);
        ctx.fillStyle = '#78350f';
        ctx.fillRect(7, 8, 2, 4);
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(6, 11, 4, 3);
        break;
      }
      case 'job_fridge': {
        fillNoise(ctx, ['#e2e8f0', '#f1f5f9', '#cbd5e1'], 993);
        ctx.fillStyle = '#94a3b8';
        ctx.fillRect(0, 0, 16, 1); ctx.fillRect(0, 15, 16, 1);
        ctx.fillRect(0, 0, 1, 16); ctx.fillRect(15, 0, 1, 16);
        ctx.fillStyle = '#38bdf8';
        ctx.fillRect(3, 3, 10, 5);
        ctx.fillStyle = '#64748b';
        ctx.fillRect(12, 9, 2, 4);
        break;
      }
      case 'job_mixer': {
        fillNoise(ctx, ['#b88d56', '#a87c45', '#c2975f'], 994);
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(4, 3, 8, 9);
        ctx.fillStyle = '#f59e0b';
        ctx.fillRect(5, 6, 6, 5);
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(3, 12, 10, 3);
        break;
      }
      case 'job_pickup': {
        fillNoise(ctx, ['#8b5a2b', '#784820', '#9a6534'], 995);
        ctx.fillStyle = '#facc15';
        ctx.fillRect(4, 6, 8, 5);
        ctx.fillRect(6, 4, 4, 2);
        ctx.fillStyle = '#fef08a';
        ctx.fillRect(6, 6, 2, 3);
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(3, 11, 10, 2);
        break;
      }
      default:
        fillNoise(ctx, ['#94a3b8', '#64748b'], 999);
    }
  });
}

function drawItemIcon(def) {
  // Crisp 32x32 pixel-art icons with dark outlines & unmistakable tool silhouettes!
  return makeCanvas((ctx) => {
    const id = def.id;
    const px = (x, y, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(x, y, w, h); };

    if (def.kind === 'tool') {
      const tierColors = {
        1: { main: '#b87a3d', hi: '#e0a96d', dark: '#5c3818' }, // Wood
        2: { main: '#94a3b8', hi: '#cbd5e1', dark: '#475569' }, // Stone
        3: { main: '#e2e8f0', hi: '#ffffff', dark: '#64748b' }, // Iron
        4: { main: '#22d3ee', hi: '#a5f3fc', dark: '#0e7490' }  // Diamond
      };
      const tc = tierColors[def.tier] || tierColors[2];

      // Crisp diagonal wooden handle with outline
      for (let i = 4; i <= 21; i += 2) {
        const x = i, y = 27 - i;
        px(x - 1, y - 1, 4, 4, '#29170a');
        px(x, y, 2, 2, '#9a6534');
        px(x, y, 1, 1, '#c99055');
      }

      if (def.toolType === 'pickaxe') {
        // Wide curved symmetric T-shaped Pickaxe head
        const pts = [
          [7, 4], [9, 3], [11, 3], [13, 3], [15, 3], [17, 3], [19, 4], [21, 5],
          [23, 7], [25, 9], [26, 11], [27, 13], [27, 15], [27, 17], [26, 19],
          [24, 15], [23, 12], [21, 10], [19, 8], [16, 7], [13, 6], [10, 6]
        ];
        for (const [x, y] of pts) px(x - 1, y - 1, 4, 4, tc.dark);
        for (const [x, y] of pts) px(x, y, 2, 2, tc.main);
        px(13, 4, 5, 2, tc.hi);
        px(24, 10, 2, 5, tc.hi);
      } else if (def.toolType === 'axe') {
        // Heavy curved Axe blade on the left-top side + small flat back
        px(11, 3, 14, 14, tc.dark);
        px(12, 4, 12, 12, tc.main);
        // Hollow inner curve to make unmistakable axe shape
        px(11, 13, 6, 6, 'rgba(0,0,0,0)');
        ctx.clearRect(10, 14, 7, 6);
        px(12, 4, 4, 10, tc.hi);   // Bright sharp cutting edge!
        px(10, 5, 3, 8, tc.hi);
        px(22, 6, 4, 4, tc.dark);  // Flat poll on back
        px(23, 7, 2, 2, tc.main);
      } else if (def.toolType === 'shovel') {
        // Broad rounded diamond spade head at top-right tip
        px(18, 2, 11, 11, tc.dark);
        px(19, 3, 9, 9, tc.main);
        px(21, 1, 7, 3, tc.dark);
        px(22, 2, 5, 2, tc.main);
        px(26, 3, 3, 7, tc.dark);
        px(26, 4, 2, 5, tc.main);
        px(21, 4, 4, 5, tc.hi);    // Center scoop shine
      } else if (def.toolType === 'hoe') {
        // Sharp L-shaped farming Hoe blade (pointing left only — distinct from Pickaxe!)
        px(7, 3, 16, 5, tc.dark);
        px(8, 4, 14, 3, tc.main);
        px(7, 7, 6, 8, tc.dark);
        px(8, 7, 4, 6, tc.main);
        px(8, 12, 3, 4, tc.dark);
        px(9, 12, 2, 3, tc.hi);    // Sharp pointed tip
        px(10, 4, 9, 1, tc.hi);
      }
      return;
    }

    // Scale 16x16 item drawings cleanly to 32x32 (2x crisp pixels)
    ctx.scale(2, 2);
    switch (id) {
      case 'wheat_seeds':
        ctx.fillStyle = '#84cc16';
        ctx.fillRect(4, 9, 2, 2); ctx.fillRect(8, 6, 2, 2); ctx.fillRect(10, 10, 2, 2); ctx.fillRect(6, 11, 2, 2);
        break;
      case 'wheat':
        ctx.fillStyle = '#eab308';
        for (let i = 3; i <= 12; i++) ctx.fillRect(i, 15 - i, 2, 2);
        ctx.fillStyle = '#fef08a';
        ctx.fillRect(9, 2, 4, 4);
        break;
      case 'bread':
        ctx.fillStyle = '#b45309';
        ctx.fillRect(2, 6, 12, 6);
        ctx.fillStyle = '#d97706';
        ctx.fillRect(3, 5, 10, 5);
        ctx.fillStyle = '#fde68a';
        ctx.fillRect(5, 6, 2, 2); ctx.fillRect(9, 6, 2, 2);
        break;
      case 'raw_meat':
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(3, 5, 10, 7);
        ctx.fillStyle = '#fca5a5';
        ctx.fillRect(5, 6, 4, 2);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(11, 7, 2, 3);
        break;
      case 'cooked_meat':
        ctx.fillStyle = '#7c2d12';
        ctx.fillRect(3, 5, 10, 7);
        ctx.fillStyle = '#9a3412';
        ctx.fillRect(4, 6, 7, 4);
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(11, 7, 2, 3);
        break;
      case 'detonator':
        // Tactical remote detonator: metallic antenna + red LED + dark body + big red button!
        ctx.fillStyle = '#94a3b8';
        ctx.fillRect(10, 1, 2, 5);
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(10, 0, 2, 2);
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(3, 5, 10, 10);
        ctx.fillStyle = '#334155';
        ctx.fillRect(4, 6, 8, 8);
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(5, 7, 6, 2);
        ctx.fillStyle = '#22c55e';
        ctx.fillRect(6, 7, 2, 1);
        ctx.fillStyle = '#dc2626';
        ctx.fillRect(5, 10, 6, 3);
        ctx.fillStyle = '#f87171';
        ctx.fillRect(6, 10, 4, 1);
        break;
      case 'cup':
        ctx.fillStyle = '#e2e8f0'; ctx.fillRect(4, 4, 8, 10);
        ctx.fillStyle = '#cbd5e1'; ctx.fillRect(3, 3, 10, 2);
        break;
      case 'espresso':
        ctx.fillStyle = '#451a03'; ctx.fillRect(4, 5, 8, 8);
        ctx.fillStyle = '#92400e'; ctx.fillRect(4, 5, 8, 2);
        ctx.fillStyle = '#f8fafc'; ctx.fillRect(12, 7, 2, 4);
        break;
      case 'water_cup':
        ctx.fillStyle = '#38bdf8'; ctx.fillRect(4, 4, 8, 10);
        ctx.fillStyle = '#bae6fd'; ctx.fillRect(5, 5, 3, 4);
        break;
      case 'ice':
        ctx.fillStyle = '#7dd3fc'; ctx.fillRect(3, 3, 10, 10);
        ctx.fillStyle = '#e0f2fe'; ctx.fillRect(4, 4, 4, 4);
        break;
      case 'milk':
        ctx.fillStyle = '#f8fafc'; ctx.fillRect(4, 3, 8, 11);
        ctx.fillStyle = '#38bdf8'; ctx.fillRect(4, 6, 8, 3);
        break;
      case 'syrup_vanilla':
        ctx.fillStyle = '#fde68a'; ctx.fillRect(5, 4, 6, 10);
        ctx.fillStyle = '#d97706'; ctx.fillRect(6, 2, 4, 2);
        break;
      case 'syrup_choco':
        ctx.fillStyle = '#5c2d16'; ctx.fillRect(5, 4, 6, 10);
        ctx.fillStyle = '#9a3412'; ctx.fillRect(6, 2, 4, 2);
        break;
      case 'syrup_berry':
        ctx.fillStyle = '#f43f5e'; ctx.fillRect(5, 4, 6, 10);
        ctx.fillStyle = '#fda4af'; ctx.fillRect(6, 2, 4, 2);
        break;
      case 'drink_americano':
      case 'drink_ice_americano':
      case 'drink_latte':
      case 'drink_ice_latte':
      case 'drink_vanilla_latte':
      case 'drink_choco_latte':
      case 'drink_berry_latte': {
        const col = id.includes('berry') ? '#fb7185'
          : id.includes('choco') ? '#7c2d12'
          : id.includes('vanilla') ? '#fcd34d'
          : id.includes('latte') ? '#d6a473'
          : '#451a03';
        ctx.fillStyle = col; ctx.fillRect(4, 5, 8, 9);
        ctx.fillStyle = '#f8fafc'; ctx.fillRect(3, 4, 10, 2);
        if (id.includes('ice') || id.includes('berry') || id.includes('choco') || id.includes('vanilla')) {
          ctx.fillStyle = '#22c55e'; ctx.fillRect(8, 1, 2, 4); // straw
        }
        break;
      }
      case 'stick':
        ctx.fillStyle = '#8b5a2b';
        for (let i = 3; i <= 12; i++) ctx.fillRect(i, 15 - i, 2, 2);
        break;
      case 'coal':
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(4, 4, 8, 8);
        ctx.fillRect(5, 3, 6, 10);
        ctx.fillStyle = '#475569';
        ctx.fillRect(6, 5, 3, 2);
        break;
      case 'raw_iron':
        ctx.fillStyle = '#c29b7a';
        ctx.fillRect(4, 5, 8, 7);
        ctx.fillRect(5, 3, 6, 10);
        ctx.fillStyle = '#f3dec9';
        ctx.fillRect(6, 5, 3, 3);
        break;
      case 'iron_ingot':
        ctx.fillStyle = '#cbd5e1';
        ctx.fillRect(2, 6, 12, 5);
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(3, 6, 10, 2);
        ctx.fillStyle = '#64748b';
        ctx.fillRect(2, 10, 12, 1);
        break;
      case 'raw_gold':
        ctx.fillStyle = '#eab308';
        ctx.fillRect(4, 5, 8, 7);
        ctx.fillRect(5, 3, 6, 10);
        ctx.fillStyle = '#fef08a';
        ctx.fillRect(6, 5, 3, 3);
        break;
      case 'gold_ingot':
        ctx.fillStyle = '#facc15';
        ctx.fillRect(2, 6, 12, 5);
        ctx.fillStyle = '#fef08a';
        ctx.fillRect(3, 6, 10, 2);
        ctx.fillStyle = '#a16207';
        ctx.fillRect(2, 10, 12, 1);
        break;
      case 'diamond_gem':
        ctx.fillStyle = '#06b6d4';
        ctx.fillRect(5, 3, 6, 10);
        ctx.fillRect(3, 5, 10, 6);
        ctx.fillStyle = '#a5f3fc';
        ctx.fillRect(6, 5, 3, 3);
        break;
      case 'apple':
        ctx.fillStyle = '#dc2626';
        ctx.fillRect(4, 5, 8, 8);
        ctx.fillRect(5, 4, 6, 10);
        ctx.fillStyle = '#f87171';
        ctx.fillRect(5, 6, 2, 2);
        ctx.fillStyle = '#6e4c2c';
        ctx.fillRect(7, 2, 2, 3);
        ctx.fillStyle = '#22c55e';
        ctx.fillRect(9, 2, 3, 2);
        break;
      default:
        ctx.fillStyle = '#94a3b8';
        ctx.fillRect(4, 4, 8, 8);
    }
  }, 32);
}

export class TextureLibrary {
  constructor(catalog) {
    this.materials = {};
    this.icons = {};
    this.itemTextures = {};

    for (const def of Object.values(catalog)) {
      if (def.kind === 'block') {
        const topC = drawBlockFace(def.id, 'top');
        const sideC = drawBlockFace(def.id, 'side');
        const botC = drawBlockFace(def.id, 'bottom');

        this.icons[def.id] = sideC.toDataURL();

        const isTransparent = !!def.transparent;
        const isCross = def.id === 'sapling' || def.id.startsWith('wheat_') || def.id === 'ladder' || def.id === 'sign' || def.id === 'fuse';
        const opts = {
          transparent: isTransparent,
          opacity: def.id === 'water' ? 0.72 : (def.id === 'portal' ? 0.78 : 1.0),
          depthWrite: def.id !== 'water',
          alphaTest: (def.id === 'leaves' || isCross || def.id === 'door_closed' || def.id === 'door_open') ? 0.25 : 0,
          side: (isCross || def.id === 'water' || def.id === 'door_closed' || def.id === 'door_open' || def.id === 'portal') ? THREE.DoubleSide : THREE.FrontSide,
          emissive: def.id === 'lamp' ? new THREE.Color('#fef08a')
            : def.id === 'portal' ? new THREE.Color('#a855f7')
            : def.id === 'furnace' ? new THREE.Color('#f97316')
            : def.id === 'jumppad' ? new THREE.Color('#22d3ee')
            : def.id === 'protect_beacon' ? new THREE.Color('#38bdf8')
            : new THREE.Color('#000000'),
          emissiveIntensity: def.id === 'lamp' ? 0.78 : (def.id === 'portal' ? 0.65 : (def.id === 'protect_beacon' ? 0.65 : (def.id === 'furnace' ? 0.24 : (def.id === 'jumppad' ? 0.35 : 0))))
        };

        const applyBlockLightShader = (mat) => {
          mat.onBeforeCompile = (shader) => {
            shader.vertexShader = shader.vertexShader
              .replace('#include <common>', '#include <common>\nattribute vec3 aBlockLight;\nvarying vec3 vBlockLight;')
              .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBlockLight = aBlockLight;');
            shader.fragmentShader = shader.fragmentShader
              .replace('#include <common>', '#include <common>\nvarying vec3 vBlockLight;')
              .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\nreflectedLight.directDiffuse += diffuseColor.rgb * vBlockLight;');
          };
          mat.customProgramCacheKey = () => 'boxworld_block_light_v1';
          return mat;
        };

        const topMat = applyBlockLightShader(new THREE.MeshLambertMaterial({ map: toTexture(topC), ...opts }));
        const sideMat = applyBlockLightShader(new THREE.MeshLambertMaterial({ map: toTexture(sideC), ...opts }));
        const botMat = applyBlockLightShader(new THREE.MeshLambertMaterial({ map: toTexture(botC), ...opts }));

        this.materials[def.id] = {
          top: topMat,
          side: sideMat,
          bottom: botMat,
          boxArray: [sideMat, sideMat, topMat, botMat, sideMat, sideMat]
        };
      } else {
        const c = drawItemIcon(def);
        this.icons[def.id] = c.toDataURL();
        this.itemTextures[def.id] = toTexture(c);
      }
    }

    // 10-stage progressive Minecraft mining crack textures (0..9)
    this.crackTextures = [];
    for (let stage = 0; stage < 10; stage++) {
      const c = makeCanvas((ctx) => {
        const rnd = mulberry32(7777 + stage * 13);
        ctx.fillStyle = 'rgba(0,0,0,0.78)';
        const rays = 2 + Math.floor(stage * 0.9);
        for (let r = 0; r < rays; r++) {
          let x = 7 + Math.floor(rnd() * 3) - 1;
          let y = 7 + Math.floor(rnd() * 3) - 1;
          const steps = 2 + stage;
          const dx = Math.cos((r / rays) * Math.PI * 2 + stage * 0.4);
          const dy = Math.sin((r / rays) * Math.PI * 2 + stage * 0.4);
          for (let s = 0; s < steps; s++) {
            const px = Math.max(0, Math.min(15, Math.round(x + dx * s * 0.85 + (rnd() - 0.5) * 1.4)));
            const py = Math.max(0, Math.min(15, Math.round(y + dy * s * 0.85 + (rnd() - 0.5) * 1.4)));
            ctx.fillRect(px, py, 1, 1);
            if (stage >= 5 && rnd() > 0.45) ctx.fillRect(Math.min(15, px + 1), py, 1, 1);
          }
        }
      });
      this.crackTextures.push(toTexture(c));
    }
  }

  getIcon(id) {
    return this.icons[id] || '';
  }

  getFaceMaterial(blockId, faceKind) {
    const entry = this.materials[blockId];
    if (!entry) return null;
    if (faceKind === 'top') return entry.top;
    if (faceKind === 'bottom') return entry.bottom;
    return entry.side;
  }

  getBoxMaterials(blockId) {
    return this.materials[blockId]?.boxArray || null;
  }

  getItemTexture(itemId) {
    return this.itemTextures[itemId] || null;
  }
}
