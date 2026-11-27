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
      case 'door_stone_closed':
      case 'door_stone_open': {
        if (blockId === 'door_stone_open') {
          ctx.fillStyle = 'rgba(100, 116, 139, 0.4)';
          ctx.fillRect(0, 0, 3, 16); ctx.fillRect(13, 0, 3, 16); ctx.fillRect(0, 0, 16, 2);
        } else {
          fillNoise(ctx, ['#64748b', '#788496', '#475569'], 981);
          ctx.fillStyle = '#334155';
          ctx.fillRect(0, 0, 16, 2); ctx.fillRect(0, 14, 16, 2);
          ctx.fillRect(0, 0, 2, 16); ctx.fillRect(14, 0, 2, 16);
          ctx.fillRect(4, 3, 8, 5);
          ctx.fillStyle = '#1e293b';
          ctx.fillRect(5, 4, 6, 3);
          ctx.fillStyle = '#cbd5e1';
          ctx.fillRect(11, 10, 2, 2);
        }
        break;
      }
      case 'door_iron_closed':
      case 'door_iron_open': {
        if (blockId === 'door_iron_open') {
          ctx.fillStyle = 'rgba(203, 213, 225, 0.45)';
          ctx.fillRect(0, 0, 3, 16); ctx.fillRect(13, 0, 3, 16); ctx.fillRect(0, 0, 16, 2);
        } else {
          fillNoise(ctx, ['#cbd5e1', '#e2e8f0', '#94a3b8'], 982);
          ctx.fillStyle = '#64748b';
          ctx.fillRect(0, 0, 16, 2); ctx.fillRect(0, 14, 16, 2);
          ctx.fillRect(0, 0, 2, 16); ctx.fillRect(14, 0, 2, 16);
          ctx.clearRect(4, 3, 8, 5);
          ctx.fillStyle = '#475569';
          ctx.fillRect(7, 3, 2, 5);
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(11, 10, 2, 2);
        }
        break;
      }
      case 'door_glass_closed':
      case 'door_glass_open': {
        if (blockId === 'door_glass_open') {
          ctx.fillStyle = 'rgba(186, 230, 253, 0.35)';
          ctx.fillRect(0, 0, 2, 16); ctx.fillRect(14, 0, 2, 16); ctx.fillRect(0, 0, 16, 2);
        } else {
          ctx.fillStyle = 'rgba(186, 230, 253, 0.38)';
          ctx.fillRect(2, 2, 12, 12);
          ctx.fillStyle = '#475569';
          ctx.fillRect(0, 0, 16, 2); ctx.fillRect(0, 14, 16, 2);
          ctx.fillRect(0, 0, 2, 16); ctx.fillRect(14, 0, 2, 16);
          ctx.fillStyle = 'rgba(255,255,255,0.65)';
          ctx.fillRect(4, 4, 3, 1); ctx.fillRect(3, 5, 2, 2);
          ctx.fillStyle = '#facc15';
          ctx.fillRect(11, 9, 2, 3);
        }
        break;
      }
      case 'stairs_wood': {
        fillNoise(ctx, ['#b88248', '#c69255', '#a6743d'], 505);
        ctx.fillStyle = '#785026';
        ctx.fillRect(0, 7, 16, 1); ctx.fillRect(0, 15, 16, 1);
        break;
      }
      case 'stairs_cobble': {
        fillNoise(ctx, ['#7c838a', '#646b73', '#9198a0', '#545b63'], 506);
        ctx.fillStyle = '#475569';
        ctx.fillRect(0, 7, 16, 1); ctx.fillRect(0, 15, 16, 1);
        break;
      }
      case 'stairs_brick': {
        ctx.fillStyle = '#b94a3e';
        ctx.fillRect(0, 0, 16, 16);
        ctx.fillStyle = '#d6d3d1';
        for (let y = 0; y < 16; y += 4) ctx.fillRect(0, y, 16, 1);
        for (let y = 0; y < 16; y += 4) {
          const off = (y % 8 === 0) ? 0 : 4;
          for (let x = off; x < 16; x += 8) ctx.fillRect(x, y, 1, 4);
        }
        break;
      }
      case 'stairs_stone': {
        fillNoise(ctx, ['#8e949c', '#7d838b', '#9aa0a8'], 507);
        ctx.fillStyle = '#64748b';
        ctx.fillRect(0, 7, 16, 1); ctx.fillRect(0, 15, 16, 1);
        break;
      }
      case 'torch': {
        if (face === 'top') {
          ctx.fillStyle = '#fef08a';
          ctx.fillRect(0, 0, 16, 16);
          ctx.fillStyle = '#f97316';
          ctx.fillRect(0, 0, 16, 3); ctx.fillRect(0, 13, 16, 3);
        } else {
          ctx.fillStyle = '#784820';
          ctx.fillRect(0, 0, 16, 16);
          ctx.fillStyle = '#5c3616';
          ctx.fillRect(0, 6, 4, 10);
          // Glowing flame top
          ctx.fillStyle = '#f97316';
          ctx.fillRect(0, 0, 16, 6);
          ctx.fillStyle = '#facc15';
          ctx.fillRect(2, 0, 12, 4);
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(5, 1, 6, 2);
        }
        break;
      }
      case 'redstone_wire': {
        ctx.clearRect(0, 0, 16, 16);
        ctx.fillStyle = '#991b1b';
        ctx.fillRect(0, 6, 16, 4); ctx.fillRect(6, 0, 4, 16);
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(0, 7, 16, 2); ctx.fillRect(7, 0, 2, 16);
        ctx.fillStyle = '#fca5a5';
        ctx.fillRect(6, 6, 4, 4);
        break;
      }
      case 'lever_off':
      case 'lever_on': {
        fillNoise(ctx, ['#64748b', '#475569', '#94a3b8'], 988);
        ctx.fillStyle = blockId === 'lever_on' ? '#ef4444' : '#334155';
        ctx.fillRect(5, 2, 6, 6);
        if (blockId === 'lever_on') {
          ctx.fillStyle = '#fef08a';
          ctx.fillRect(7, 4, 2, 2);
        }
        break;
      }
      case 'pressure_plate': {
        fillNoise(ctx, ['#b88248', '#c69255', '#a6743d'], 989);
        ctx.fillStyle = '#785026';
        ctx.fillRect(0, 0, 16, 1); ctx.fillRect(0, 15, 16, 1);
        ctx.fillRect(0, 0, 1, 16); ctx.fillRect(15, 0, 1, 16);
        ctx.fillStyle = '#facc15';
        ctx.fillRect(6, 6, 4, 4);
        break;
      }
      case 'redstone_lamp_off': {
        fillNoise(ctx, ['#451a03', '#78350f', '#5c2d0c'], 990);
        ctx.fillStyle = '#292524';
        ctx.fillRect(0, 0, 16, 2); ctx.fillRect(0, 14, 16, 2);
        ctx.fillRect(0, 0, 2, 16); ctx.fillRect(14, 0, 2, 16);
        ctx.fillStyle = '#92400e';
        ctx.fillRect(5, 5, 6, 6);
        break;
      }
      case 'redstone_lamp_on': {
        fillNoise(ctx, ['#fef08a', '#fde047', '#facc15'], 991);
        ctx.fillStyle = '#b45309';
        ctx.fillRect(0, 0, 16, 2); ctx.fillRect(0, 14, 16, 2);
        ctx.fillRect(0, 0, 2, 16); ctx.fillRect(14, 0, 2, 16);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(5, 5, 6, 6);
        break;
      }
      case 'furn_office_desk': {
        fillNoise(ctx, ['#d6b07c', '#c79e68', '#b98e57'], 1011);
        ctx.fillStyle = '#926939';
        ctx.fillRect(0, 0, 16, 1); ctx.fillRect(0, 15, 16, 1);
        if (face === 'side') {
          ctx.fillStyle = '#1e293b';
          ctx.fillRect(2, 2, 12, 7);
          ctx.fillStyle = '#38bdf8';
          ctx.fillRect(3, 3, 10, 5);
        }
        break;
      }
      case 'furn_office_chair': {
        fillNoise(ctx, ['#1e293b', '#334155', '#0f172a'], 1012);
        ctx.fillStyle = '#475569';
        for (let y = 2; y < 14; y += 2) ctx.fillRect(2, y, 12, 1);
        break;
      }
      case 'furn_white_table': {
        fillNoise(ctx, ['#f8fafc', '#f1f5f9', '#e2e8f0'], 1013);
        ctx.fillStyle = '#cbd5e1';
        ctx.fillRect(0, 0, 16, 1); ctx.fillRect(0, 15, 16, 1);
        ctx.fillRect(0, 0, 1, 16); ctx.fillRect(15, 0, 1, 16);
        break;
      }
      case 'furn_partition': {
        fillNoise(ctx, ['#cbd5e1', '#b8c4d4', '#a8b5c7'], 1014);
        ctx.fillStyle = '#64748b';
        ctx.fillRect(0, 0, 16, 2); ctx.fillRect(0, 14, 16, 2);
        ctx.fillRect(0, 0, 1, 16); ctx.fillRect(15, 0, 1, 16);
        break;
      }
      case 'furn_cabinet': {
        fillNoise(ctx, ['#c99e63', '#b88b50', '#a67b42'], 1015);
        ctx.fillStyle = '#7c582b';
        ctx.fillRect(0, 0, 16, 1); ctx.fillRect(0, 15, 16, 1);
        ctx.fillRect(7, 1, 2, 14);
        if (face === 'side') {
          ctx.fillStyle = '#e2e8f0';
          ctx.fillRect(5, 6, 1, 4); ctx.fillRect(10, 6, 1, 4);
        }
        break;
      }
      case 'furn_potted_plant': {
        if (face === 'top') {
          fillNoise(ctx, ['#22c55e', '#16a34a', '#15803d', '#4ade80'], 1016);
        } else {
          fillNoise(ctx, ['#f8fafc', '#f1f5f9', '#e2e8f0'], 1017);
          ctx.fillStyle = '#16a34a';
          ctx.fillRect(0, 0, 16, 7);
          ctx.fillStyle = '#4ade80';
          ctx.fillRect(2, 1, 5, 4); ctx.fillRect(9, 2, 5, 4);
          ctx.fillStyle = '#cbd5e1';
          ctx.fillRect(0, 7, 16, 1);
        }
        break;
      }
      case 'furn_cafe_table': {
        fillNoise(ctx, ['#c28d53', '#b07b42', '#9e6c37'], 1018);
        ctx.fillStyle = '#784e24';
        ctx.fillRect(0, 0, 16, 1); ctx.fillRect(0, 15, 16, 1);
        ctx.fillRect(0, 0, 1, 16); ctx.fillRect(15, 0, 1, 16);
        break;
      }
      case 'furn_sofa': {
        fillNoise(ctx, ['#d6cfc2', '#c8bfb0', '#bab0a0'], 1019);
        ctx.fillStyle = '#9e9484';
        ctx.fillRect(0, 8, 16, 1);
        ctx.fillRect(0, 0, 16, 1); ctx.fillRect(0, 15, 16, 1);
        break;
      }
      case 'furn_tv_screen': {
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, 16, 16);
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(1, 2, 14, 12);
        ctx.fillStyle = '#334155';
        ctx.fillRect(2, 3, 12, 10);
        ctx.fillStyle = '#38bdf8';
        ctx.fillRect(3, 5, 5, 2);
        ctx.fillStyle = '#94a3b8';
        ctx.fillRect(3, 8, 9, 1); ctx.fillRect(3, 10, 7, 1);
        break;
      }
      case 'furn_ceiling_ac': {
        fillNoise(ctx, ['#f8fafc', '#f1f5f9', '#e2e8f0'], 1020);
        ctx.fillStyle = '#94a3b8';
        ctx.fillRect(2, 2, 12, 1); ctx.fillRect(2, 13, 12, 1);
        ctx.fillRect(2, 2, 1, 12); ctx.fillRect(13, 2, 1, 12);
        ctx.fillStyle = '#cbd5e1';
        ctx.fillRect(5, 5, 6, 6);
        break;
      }
      case 'slab_metal': {
        fillNoise(ctx, ['#94a3b8', '#a3b1c2', '#8695a8'], 1021);
        ctx.fillStyle = '#64748b';
        ctx.fillRect(0, 0, 16, 1); ctx.fillRect(0, 15, 16, 1);
        ctx.fillRect(0, 0, 1, 16); ctx.fillRect(15, 0, 1, 16);
        break;
      }
      case 'slab_wood': {
        fillNoise(ctx, ['#c69255', '#b88248', '#d4a36a'], 1022);
        ctx.fillStyle = '#8c5d2c';
        ctx.fillRect(0, 4, 16, 1); ctx.fillRect(0, 11, 16, 1);
        break;
      }
      case 'slab_stone': {
        fillNoise(ctx, ['#8e949c', '#7d838b', '#9aa0a8'], 1023);
        ctx.fillStyle = '#64748b';
        ctx.fillRect(0, 0, 16, 1); ctx.fillRect(0, 15, 16, 1);
        ctx.fillRect(0, 0, 1, 16); ctx.fillRect(15, 0, 1, 16);
        break;
      }
      case 'slab_white': {
        fillNoise(ctx, ['#f8fafc', '#f1f5f9', '#e8eef5'], 1024);
        ctx.fillStyle = '#cbd5e1';
        ctx.fillRect(0, 0, 16, 1); ctx.fillRect(0, 15, 16, 1);
        ctx.fillRect(0, 0, 1, 16); ctx.fillRect(15, 0, 1, 16);
        break;
      }
      case 'slab_carpet': {
        fillNoise(ctx, ['#1e3a8a', '#1d4ed8', '#2563eb'], 1025);
        ctx.fillStyle = '#172554';
        ctx.fillRect(0, 0, 16, 1); ctx.fillRect(0, 15, 16, 1);
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
      case 'sign':
      case 'sign_fixed': {
        ctx.fillStyle = '#784820';
        ctx.fillRect(7, 9, 2, 7);
        ctx.fillStyle = blockId === 'sign_fixed' ? '#d4a36a' : '#c2975f';
        ctx.fillRect(1, 2, 14, 8);
        if (blockId === 'sign_fixed') {
          ctx.fillStyle = '#925c28';
          ctx.fillRect(1, 2, 14, 1); ctx.fillRect(1, 9, 14, 1);
          ctx.fillRect(1, 2, 1, 8); ctx.fillRect(14, 2, 1, 8);
        }
        ctx.fillStyle = '#5c3f24';
        ctx.fillRect(3, 4, 10, 1);
        ctx.fillRect(3, 6, 8, 1);
        break;
      }
      case 'furn_toilet_closed':
      case 'furn_toilet_open':
      case 'furn_urinal': {
        fillNoise(ctx, ['#f8fafc', '#f1f5f9', '#e2e8f0'], 1030);
        ctx.fillStyle = '#cbd5e1';
        ctx.fillRect(0, 0, 16, 1); ctx.fillRect(0, 15, 16, 1);
        ctx.fillRect(0, 0, 1, 16); ctx.fillRect(15, 0, 1, 16);
        if (blockId === 'furn_toilet_open' && face === 'top') {
          ctx.fillStyle = '#38bdf8';
          ctx.fillRect(4, 4, 8, 8);
          ctx.fillStyle = '#0284c7';
          ctx.fillRect(6, 6, 4, 4);
        }
        break;
      }
      case 'btn_white':
      case 'btn_red':
      case 'btn_blue':
      case 'btn_yellow':
      case 'btn_green':
      case 'btn_metal': {
        const bCols = {
          btn_white:  ['#f8fafc', '#e2e8f0', '#cbd5e1'],
          btn_red:    ['#ef4444', '#dc2626', '#f87171'],
          btn_blue:   ['#3b82f6', '#2563eb', '#60a5fa'],
          btn_yellow: ['#facc15', '#eab308', '#fde047'],
          btn_green:  ['#22c55e', '#16a34a', '#4ade80'],
          btn_metal:  ['#cbd5e1', '#94a3b8', '#e2e8f0']
        };
        const pal = bCols[blockId] || bCols.btn_metal;
        ctx.fillStyle = pal[1];
        ctx.fillRect(0, 0, 16, 16);
        ctx.fillStyle = pal[0];
        ctx.fillRect(2, 2, 12, 12);
        ctx.fillStyle = pal[2];
        ctx.fillRect(3, 3, 10, 3);
        break;
      }
      case 'rail_straight':
      case 'rail_curve':
      case 'rail_cross':
      case 'rail_branch':
      case 'rail_branch_turn':
      case 'rail_xbranch':
      case 'rail_xbranch_turn':
      case 'rail_card_red':
      case 'rail_card_yellow':
      case 'rail_card_green':
      case 'rail_up':
      case 'rail_down':
      case 'rail_signal':
      case 'rail_gate_open':
      case 'rail_gate_closed': {
        if ((blockId === 'rail_branch' || blockId === 'rail_xbranch') && face === 'top') {
          // Crisp Blue badge with bold white 'L' (facing North -Z upright!)
          ctx.fillStyle = '#1d4ed8';
          ctx.fillRect(0, 0, 16, 16);
          ctx.fillStyle = '#2563eb';
          ctx.fillRect(1, 1, 14, 14);
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(5, 3, 2, 10);
          ctx.fillRect(5, 11, 7, 2);
          break;
        }
        if ((blockId === 'rail_branch_turn' || blockId === 'rail_xbranch_turn') && face === 'top') {
          // Crisp Green badge with bold white 'R' (facing North -Z upright!)
          ctx.fillStyle = '#15803d';
          ctx.fillRect(0, 0, 16, 16);
          ctx.fillStyle = '#16a34a';
          ctx.fillRect(1, 1, 14, 14);
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(4, 3, 2, 10);
          ctx.fillRect(6, 3, 5, 2);
          ctx.fillRect(10, 5, 2, 3);
          ctx.fillRect(6, 7, 4, 2);
          ctx.fillRect(9, 9, 2, 2);
          ctx.fillRect(10, 11, 2, 2);
          break;
        }
        fillNoise(ctx, ['#94a3b8', '#cbd5e1', '#64748b'], 1040);
        if (blockId === 'rail_card_red') {
          ctx.fillStyle = '#ef4444';
          ctx.fillRect(3, 3, 10, 10);
        } else if (blockId === 'rail_card_yellow') {
          ctx.fillStyle = '#facc15';
          ctx.fillRect(3, 3, 10, 10);
        } else if (blockId === 'rail_card_green') {
          ctx.fillStyle = '#22c55e';
          ctx.fillRect(3, 3, 10, 10);
        } else if (blockId === 'rail_branch' || blockId === 'rail_xbranch') {
          ctx.fillStyle = '#2563eb';
          ctx.fillRect(2, 2, 12, 12);
        } else if (blockId === 'rail_branch_turn' || blockId === 'rail_xbranch_turn') {
          ctx.fillStyle = '#16a34a';
          ctx.fillRect(2, 2, 12, 12);
        }
        break;
      }
      case 'train_engine': {
        ctx.fillStyle = '#dc2626';
        ctx.fillRect(0, 0, 16, 16);
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(0, 0, 16, 4);
        ctx.fillStyle = '#facc15';
        ctx.fillRect(4, 6, 8, 4);
        break;
      }
      case 'train_car': {
        ctx.fillStyle = '#2563eb';
        ctx.fillRect(0, 0, 16, 16);
        ctx.fillStyle = '#bae6fd';
        ctx.fillRect(2, 4, 5, 5);
        ctx.fillRect(9, 4, 5, 5);
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(0, 11, 16, 2);
        break;
      }
      case 'invisible_block': {
        ctx.clearRect(0, 0, 16, 16);
        ctx.strokeStyle = 'rgba(186, 230, 253, 0.75)';
        ctx.setLineDash([2, 2]);
        ctx.strokeRect(1.5, 1.5, 13, 13);
        ctx.setLineDash([]);
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
      case 'stealth_beacon': {
        ctx.fillStyle = '#1e1b4b';
        ctx.fillRect(0, 0, 16, 16);
        ctx.fillStyle = '#a855f7';
        ctx.fillRect(2, 2, 12, 12);
        ctx.fillStyle = '#f3e8ff';
        ctx.fillRect(5, 4, 6, 7);
        ctx.fillStyle = '#1e1b4b';
        ctx.fillRect(6, 6, 1, 2);
        ctx.fillRect(9, 6, 1, 2);
        ctx.fillStyle = '#c084fc';
        ctx.fillRect(0, 13, 16, 3);
        break;
      }
      case 'npc_beacon': {
        if (face === 'top') {
          // Crisp emerald pad with bold bright-yellow forward arrow pointing North (-Z, y=0)
          ctx.fillStyle = '#064e3b';
          ctx.fillRect(0, 0, 16, 16);
          ctx.fillStyle = '#10b981';
          ctx.fillRect(1, 1, 14, 14);
          ctx.fillStyle = '#065f46';
          ctx.fillRect(2, 2, 12, 12);
          // Upward arrow (tip at y=2, shaft down to y=13)
          ctx.fillStyle = '#fde047';
          ctx.fillRect(7, 2, 2, 12);
          ctx.fillRect(5, 4, 6, 2);
          ctx.fillRect(4, 6, 8, 2);
        } else {
          ctx.fillStyle = '#064e3b';
          ctx.fillRect(0, 0, 16, 16);
          ctx.fillStyle = '#10b981';
          ctx.fillRect(1, 1, 14, 14);
          ctx.fillStyle = '#a7f3d0';
          ctx.fillRect(0, 13, 16, 3);
        }
        break;
      }
      case 'flatten_bomb': {
        if (face === 'top' || face === 'bottom') {
          ctx.fillStyle = '#f59e0b';
          ctx.fillRect(0, 0, 16, 16);
          ctx.fillStyle = '#1e293b';
          for (let i = 0; i < 16; i += 4) ctx.fillRect(i, 0, 2, 16);
          ctx.fillStyle = '#fef08a';
          ctx.fillRect(5, 5, 6, 6);
        } else {
          ctx.fillStyle = '#f59e0b';
          ctx.fillRect(0, 0, 16, 16);
          ctx.fillStyle = '#1e293b';
          ctx.fillRect(0, 0, 16, 3);
          ctx.fillRect(0, 13, 16, 3);
          ctx.fillStyle = '#fefce8';
          ctx.fillRect(0, 5, 16, 6);
          ctx.fillStyle = '#0f172a';
          // Pixel "5x5"
          ctx.fillRect(2, 6, 3, 1); ctx.fillRect(2, 6, 1, 2); ctx.fillRect(2, 8, 3, 1); ctx.fillRect(4, 8, 1, 2); ctx.fillRect(2, 9, 3, 1);
          ctx.fillRect(7, 7, 1, 1); ctx.fillRect(9, 7, 1, 1); ctx.fillRect(8, 8, 1, 1); ctx.fillRect(7, 9, 1, 1); ctx.fillRect(9, 9, 1, 1);
          ctx.fillRect(11, 6, 3, 1); ctx.fillRect(11, 6, 1, 2); ctx.fillRect(11, 8, 3, 1); ctx.fillRect(13, 8, 1, 2); ctx.fillRect(11, 9, 3, 1);
        }
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
      } else if (def.toolType === 'sword') {
        // Legendary glowing crimson-gold Sabo Sword (⚔️ 사보검)!
        px(3, 25, 5, 5, '#eab308');
        px(4, 26, 3, 3, '#fef08a');
        px(9, 14, 10, 4, '#ca8a04');
        px(12, 16, 4, 9, '#ca8a04');
        px(11, 15, 7, 3, '#fef08a');
        for (let i = 0; i < 14; i++) {
          px(15 + i, 15 - i, 4, 4, '#9f1239');
          px(16 + i, 14 - i, 3, 3, '#f43f5e');
          px(17 + i, 13 - i, 2, 2, '#fda4af');
        }
        px(27, 2, 3, 3, '#ffffff');
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

        if (def.id.startsWith('stairs_')) {
          const ic = makeCanvas((ctx) => {
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(sideC, 0, 0, 32, 32);
            // Cut out top-left quadrant to form unmistakable L-shaped 2-step stair icon!
            ctx.clearRect(0, 0, 16, 16);
            // Bright top-tread highlights on both steps
            ctx.fillStyle = 'rgba(255,255,255,0.42)';
            ctx.fillRect(16, 1, 15, 3);
            ctx.fillRect(1, 16, 15, 3);
            // Subtle shadow under riser
            ctx.fillStyle = 'rgba(0,0,0,0.28)';
            ctx.fillRect(16, 4, 2, 13);
            // Crisp dark outline around stair silhouette
            ctx.fillStyle = 'rgba(15,23,42,0.85)';
            ctx.fillRect(15, 0, 17, 2);   // upper top edge
            ctx.fillRect(30, 0, 2, 32);   // right edge
            ctx.fillRect(0, 30, 32, 2);   // bottom edge
            ctx.fillRect(0, 15, 2, 17);   // lower left edge
            ctx.fillRect(0, 15, 17, 2);   // lower tread edge
            ctx.fillRect(15, 0, 2, 17);   // vertical riser edge
          }, 32);
          this.icons[def.id] = ic.toDataURL();
          this.itemTextures[def.id] = toTexture(ic);
        } else if (def.id.startsWith('slab_')) {
          const ic = makeCanvas((ctx) => {
            ctx.imageSmoothingEnabled = false;
            // Thin floor-panel silhouette on bottom third of 32x32 icon!
            ctx.drawImage(sideC, 0, 0, 16, 16, 2, 18, 28, 11);
            ctx.fillStyle = 'rgba(255,255,255,0.45)';
            ctx.fillRect(2, 18, 28, 3);
            ctx.fillStyle = 'rgba(15,23,42,0.85)';
            ctx.fillRect(1, 17, 30, 2);
            ctx.fillRect(1, 28, 30, 2);
            ctx.fillRect(1, 17, 2, 13);
            ctx.fillRect(29, 17, 2, 13);
          }, 32);
          this.icons[def.id] = ic.toDataURL();
          this.itemTextures[def.id] = toTexture(ic);
        } else if (def.id.startsWith('furn_')) {
          const ic = makeCanvas((ctx) => {
            ctx.imageSmoothingEnabled = false;
            const outline = '#0f172a';
            if (def.id === 'furn_office_chair') {
              // Crisp ergonomic office chair silhouette (backrest + armrests + cushion + stem + wheels)
              ctx.fillStyle = '#334155';
              ctx.fillRect(7, 3, 18, 12); // backrest
              ctx.fillStyle = '#475569';
              ctx.fillRect(9, 5, 14, 8);  // mesh highlight
              ctx.fillStyle = '#1e293b';
              ctx.fillRect(6, 15, 20, 4); // seat cushion
              ctx.fillRect(5, 11, 2, 7);  // left armrest
              ctx.fillRect(25, 11, 2, 7); // right armrest
              ctx.fillStyle = '#64748b';
              ctx.fillRect(14, 19, 4, 7); // center pneumatic stem
              ctx.fillRect(8, 26, 16, 2); // 5-star base bar
              ctx.fillStyle = outline;
              ctx.fillRect(7, 28, 3, 2); ctx.fillRect(14, 28, 4, 2); ctx.fillRect(22, 28, 3, 2); // wheels
              ctx.strokeStyle = outline; ctx.lineWidth = 1.5;
              ctx.strokeRect(7, 3, 18, 12);
            } else if (def.id === 'furn_office_desk') {
              // Dual monitor on warm wooden office desk with legs
              ctx.fillStyle = '#0f172a';
              ctx.fillRect(5, 4, 10, 8); ctx.fillRect(17, 4, 10, 8); // dual monitors
              ctx.fillStyle = '#38bdf8';
              ctx.fillRect(6, 5, 8, 6); ctx.fillRect(18, 5, 8, 6);   // glowing blue screens
              ctx.fillStyle = '#475569';
              ctx.fillRect(9, 12, 2, 3); ctx.fillRect(21, 12, 2, 3); // monitor stands
              ctx.fillStyle = '#c79e68';
              ctx.fillRect(2, 15, 28, 4); // wooden desktop
              ctx.fillStyle = '#926939';
              ctx.fillRect(3, 19, 4, 11); ctx.fillRect(25, 19, 4, 11); // desk legs
              ctx.fillStyle = '#d6b07c';
              ctx.fillRect(20, 19, 6, 9); // drawer unit
              ctx.fillStyle = '#e2e8f0';
              ctx.fillRect(22, 21, 2, 1); ctx.fillRect(22, 25, 2, 1);
            } else if (def.id === 'furn_white_table') {
              // Clean white folding training table + slim silver legs
              ctx.fillStyle = '#f8fafc';
              ctx.fillRect(2, 11, 28, 5);
              ctx.fillStyle = '#cbd5e1';
              ctx.fillRect(2, 15, 28, 2);
              ctx.fillStyle = '#64748b';
              ctx.fillRect(4, 17, 3, 12); ctx.fillRect(25, 17, 3, 12);
              ctx.fillRect(4, 24, 24, 2); // crossbar
              ctx.strokeStyle = '#334155'; ctx.lineWidth = 1;
              ctx.strokeRect(2, 11, 28, 5);
            } else if (def.id === 'furn_partition') {
              // Modern office gray fabric divider panel with dark frame & feet
              ctx.fillStyle = '#64748b';
              ctx.fillRect(4, 4, 24, 22);
              ctx.fillStyle = '#cbd5e1';
              ctx.fillRect(6, 6, 20, 18);
              ctx.fillStyle = '#94a3b8';
              ctx.fillRect(6, 14, 20, 2); // mid trim bar
              ctx.fillStyle = '#334155';
              ctx.fillRect(5, 26, 6, 3); ctx.fillRect(21, 26, 6, 3); // stand feet
            } else if (def.id === 'furn_cabinet') {
              // Warm oak 2-door office filing cabinet with handles
              ctx.fillStyle = '#7c582b';
              ctx.fillRect(4, 3, 24, 26);
              ctx.fillStyle = '#c99e63';
              ctx.fillRect(6, 5, 9, 22); ctx.fillRect(17, 5, 9, 22);
              ctx.fillStyle = '#f1f5f9';
              ctx.fillRect(13, 13, 1, 6); ctx.fillRect(18, 13, 1, 6); // metallic handles
            } else if (def.id === 'furn_potted_plant') {
              // White ceramic pot with lush green leaves
              ctx.fillStyle = '#15803d';
              ctx.fillRect(9, 4, 14, 12);
              ctx.fillStyle = '#22c55e';
              ctx.fillRect(6, 7, 20, 9);
              ctx.fillStyle = '#4ade80';
              ctx.fillRect(11, 5, 5, 5); ctx.fillRect(18, 8, 5, 4);
              ctx.fillStyle = '#f8fafc';
              ctx.fillRect(9, 17, 14, 12);
              ctx.fillStyle = '#cbd5e1';
              ctx.fillRect(8, 16, 16, 3);
              ctx.strokeStyle = '#64748b'; ctx.lineWidth = 1;
              ctx.strokeRect(9, 17, 14, 12);
            } else if (def.id === 'furn_cafe_table') {
              // Warm wood cafe tabletop + center pedestal & base
              ctx.fillStyle = '#c28d53';
              ctx.fillRect(3, 10, 26, 5);
              ctx.fillStyle = '#784e24';
              ctx.fillRect(3, 14, 26, 2);
              ctx.fillStyle = '#334155';
              ctx.fillRect(14, 16, 4, 11); // center pedestal
              ctx.fillRect(8, 27, 16, 3);  // heavy base
            } else if (def.id === 'furn_sofa') {
              // Cozy beige lounge sofa with backrest, seat & armrests
              ctx.fillStyle = '#b5ab9b';
              ctx.fillRect(5, 7, 22, 10); // backrest
              ctx.fillStyle = '#d6cfc2';
              ctx.fillRect(3, 14, 26, 10); // seat & arms
              ctx.fillStyle = '#c2b8a8';
              ctx.fillRect(3, 12, 4, 12); ctx.fillRect(25, 12, 4, 12); // armrests
              ctx.fillStyle = '#784e24';
              ctx.fillRect(5, 24, 3, 4); ctx.fillRect(24, 24, 3, 4); // wooden legs
              ctx.strokeStyle = '#64748b'; ctx.lineWidth = 1;
              ctx.strokeRect(5, 7, 22, 10);
            } else if (def.id === 'furn_tv_screen') {
              // Sleek wide electronic whiteboard / TV display on stand
              ctx.fillStyle = '#0f172a';
              ctx.fillRect(2, 5, 28, 17);
              ctx.fillStyle = '#1e293b';
              ctx.fillRect(4, 7, 24, 13);
              ctx.fillStyle = '#38bdf8';
              ctx.fillRect(6, 9, 10, 3);
              ctx.fillStyle = '#94a3b8';
              ctx.fillRect(6, 14, 18, 2); ctx.fillRect(6, 17, 13, 2);
              ctx.fillStyle = '#475569';
              ctx.fillRect(13, 22, 6, 4); ctx.fillRect(9, 26, 14, 2); // stand
            } else if (def.id === 'furn_ceiling_ac') {
              // 4-way ceiling cassette air conditioner unit
              ctx.fillStyle = '#f8fafc';
              ctx.fillRect(3, 6, 26, 20);
              ctx.strokeStyle = '#64748b'; ctx.lineWidth = 2;
              ctx.strokeRect(3, 6, 26, 20);
              ctx.fillStyle = '#334155';
              ctx.fillRect(7, 8, 18, 2); ctx.fillRect(7, 22, 18, 2); // top/bottom vents
              ctx.fillRect(5, 10, 2, 12); ctx.fillRect(25, 10, 2, 12); // left/right vents
              ctx.fillStyle = '#cbd5e1';
              ctx.fillRect(10, 12, 12, 8); // center grille
              ctx.fillStyle = '#38bdf8';
              ctx.fillRect(22, 19, 2, 2); // power LED
            } else if (def.id === 'furn_toilet_closed' || def.id === 'furn_toilet_open') {
              // Crisp white ceramic toilet silhouette (tank + bowl + closed or raised lid!)
              ctx.fillStyle = '#e2e8f0';
              ctx.fillRect(6, 4, 10, 14); // rear water tank
              ctx.fillStyle = '#f8fafc';
              ctx.fillRect(7, 5, 8, 12);
              ctx.fillStyle = '#94a3b8';
              ctx.fillRect(12, 7, 3, 2); // chrome flush handle
              ctx.fillStyle = '#f8fafc';
              ctx.fillRect(10, 17, 15, 7); // bowl body
              ctx.fillRect(11, 24, 11, 5); // pedestal base
              if (def.id === 'furn_toilet_open') {
                // Raised lid leaning against tank + blue water glint
                ctx.fillStyle = '#cbd5e1';
                ctx.fillRect(15, 8, 3, 10);
                ctx.fillStyle = '#38bdf8';
                ctx.fillRect(17, 17, 6, 2);
              } else {
                // Flat closed lid
                ctx.fillStyle = '#cbd5e1';
                ctx.fillRect(10, 15, 16, 3);
              }
              ctx.strokeStyle = '#475569'; ctx.lineWidth = 1.2;
              ctx.strokeRect(6, 4, 10, 14);
              ctx.strokeRect(10, 17, 15, 7);
            } else if (def.id === 'furn_urinal') {
              // Sleek wall-mounted porcelain urinal + top chrome flush pipe
              ctx.fillStyle = '#94a3b8';
              ctx.fillRect(14, 2, 4, 5); // flush pipe
              ctx.fillRect(12, 3, 8, 2); // flush valve
              ctx.fillStyle = '#f8fafc';
              ctx.fillRect(8, 7, 16, 18); // outer ceramic body
              ctx.fillRect(10, 25, 12, 3); // curved bottom
              ctx.fillStyle = '#cbd5e1';
              ctx.fillRect(11, 10, 10, 12); // inner basin shadow
              ctx.fillStyle = '#38bdf8';
              ctx.fillRect(14, 19, 4, 2); // drain accent
              ctx.strokeStyle = '#475569'; ctx.lineWidth = 1.2;
              ctx.strokeRect(8, 7, 16, 18);
            }
          }, 32);
          this.icons[def.id] = ic.toDataURL();
          this.itemTextures[def.id] = toTexture(ic);
        } else if (def.id.startsWith('btn_')) {
          const ic = makeCanvas((ctx) => {
            ctx.imageSmoothingEnabled = false;
            const cMap = {
              btn_white:  ['#f8fafc', '#cbd5e1'],
              btn_red:    ['#ef4444', '#991b1b'],
              btn_blue:   ['#3b82f6', '#1d4ed8'],
              btn_yellow: ['#facc15', '#a16207'],
              btn_green:  ['#22c55e', '#15803d'],
              btn_metal:  ['#cbd5e1', '#64748b']
            };
            const [main, dark] = cMap[def.id] || cMap.btn_metal;
            // Sleek dark bezel plate + raised glossy colored button cap
            ctx.fillStyle = '#1e293b';
            ctx.fillRect(5, 7, 22, 18);
            ctx.fillStyle = '#334155';
            ctx.fillRect(6, 8, 20, 16);
            ctx.fillStyle = dark;
            ctx.fillRect(9, 11, 14, 11);
            ctx.fillStyle = main;
            ctx.fillRect(9, 10, 14, 9);
            ctx.fillStyle = 'rgba(255,255,255,0.45)';
            ctx.fillRect(10, 11, 12, 3);
          }, 32);
          this.icons[def.id] = ic.toDataURL();
          this.itemTextures[def.id] = toTexture(ic);
        } else if (def.id === 'sign_fixed' || def.id === 'sign') {
          const ic = makeCanvas((ctx) => {
            ctx.imageSmoothingEnabled = false;
            ctx.fillStyle = '#784820';
            ctx.fillRect(14, 18, 4, 12);
            ctx.fillStyle = def.id === 'sign_fixed' ? '#d4a36a' : '#c2975f';
            ctx.fillRect(3, 5, 26, 15);
            ctx.strokeStyle = '#5c3f24'; ctx.lineWidth = 2;
            ctx.strokeRect(3, 5, 26, 15);
            ctx.fillStyle = '#5c3f24';
            ctx.fillRect(7, 9, 18, 2);
            ctx.fillRect(7, 13, 14, 2);
            if (def.id === 'sign_fixed') {
              // Small cyan "fixed front" pin badge
              ctx.fillStyle = '#38bdf8';
              ctx.fillRect(23, 6, 4, 4);
            }
          }, 32);
          this.icons[def.id] = ic.toDataURL();
          this.itemTextures[def.id] = toTexture(ic);
        } else if (def.id === 'torch') {
          const ic = makeCanvas((ctx) => {
            ctx.imageSmoothingEnabled = false;
            // Glowing flame halo & tip + slim vertical wooden torch stick
            ctx.fillStyle = 'rgba(251, 146, 60, 0.35)';
            ctx.fillRect(10, 2, 12, 12);
            ctx.fillStyle = '#f97316';
            ctx.fillRect(12, 4, 8, 8);
            ctx.fillStyle = '#facc15';
            ctx.fillRect(13, 5, 6, 6);
            ctx.fillStyle = '#fef9c3';
            ctx.fillRect(14, 6, 4, 4);
            ctx.fillStyle = '#5c3818';
            ctx.fillRect(13, 12, 6, 18);
            ctx.fillStyle = '#9a6534';
            ctx.fillRect(14, 12, 4, 17);
            ctx.fillStyle = '#b8834d';
            ctx.fillRect(14, 13, 2, 15);
          }, 32);
          this.icons[def.id] = ic.toDataURL();
          this.itemTextures[def.id] = toTexture(ic);
        } else if (def.id === 'ladder') {
          const ic = makeCanvas((ctx) => {
            ctx.imageSmoothingEnabled = false;
            ctx.fillStyle = '#5c3818';
            ctx.fillRect(6, 1, 5, 30); ctx.fillRect(21, 1, 5, 30);
            ctx.fillStyle = '#9a6534';
            ctx.fillRect(7, 2, 3, 28); ctx.fillRect(22, 2, 3, 28);
            for (const ry of [5, 12, 19, 25]) {
              ctx.fillStyle = '#5c3818';
              ctx.fillRect(9, ry, 14, 4);
              ctx.fillStyle = '#c28d53';
              ctx.fillRect(10, ry + 1, 12, 2);
            }
          }, 32);
          this.icons[def.id] = ic.toDataURL();
          this.itemTextures[def.id] = toTexture(ic);
        } else if (def.id.startsWith('door_')) {
          const ic = makeCanvas((ctx) => {
            ctx.imageSmoothingEnabled = false;
            // Tall narrow 1x2 door silhouette centered in 32x32!
            ctx.drawImage(sideC, 0, 0, 16, 16, 7, 2, 18, 28);
            ctx.strokeStyle = 'rgba(15,23,42,0.88)'; ctx.lineWidth = 2;
            ctx.strokeRect(7, 2, 18, 28);
            // Crisp metallic doorknob on right side
            ctx.fillStyle = '#facc15';
            ctx.fillRect(20, 15, 3, 3);
          }, 32);
          this.icons[def.id] = ic.toDataURL();
          this.itemTextures[def.id] = toTexture(ic);
        } else if (def.id === 'lever_off' || def.id === 'lever_on') {
          const ic = makeCanvas((ctx) => {
            ctx.imageSmoothingEnabled = false;
            // Stone base pedestal + tilted switch handle
            ctx.fillStyle = '#475569';
            ctx.fillRect(6, 22, 20, 8);
            ctx.fillStyle = '#94a3b8';
            ctx.fillRect(8, 23, 16, 5);
            const on = def.id === 'lever_on';
            for (let i = 0; i < 12; i++) {
              const x = on ? (15 - Math.floor(i * 0.6)) : (15 + Math.floor(i * 0.6));
              const y = 22 - i;
              ctx.fillStyle = '#784820';
              ctx.fillRect(x, y, 4, 3);
            }
            ctx.fillStyle = on ? '#ef4444' : '#cbd5e1';
            ctx.fillRect(on ? 6 : 20, 8, 6, 5);
          }, 32);
          this.icons[def.id] = ic.toDataURL();
          this.itemTextures[def.id] = toTexture(ic);
        } else if (def.id === 'pressure_plate') {
          const ic = makeCanvas((ctx) => {
            ctx.imageSmoothingEnabled = false;
            ctx.fillStyle = '#5c3818';
            ctx.fillRect(3, 21, 26, 7);
            ctx.fillStyle = '#b8834d';
            ctx.fillRect(4, 21, 24, 5);
            ctx.fillStyle = '#e0b07a';
            ctx.fillRect(5, 22, 22, 2);
          }, 32);
          this.icons[def.id] = ic.toDataURL();
          this.itemTextures[def.id] = toTexture(ic);
        } else if (def.id === 'bed') {
          const ic = makeCanvas((ctx) => {
            ctx.imageSmoothingEnabled = false;
            // Unmistakable side-view bed: wooden legs + frame + white pillow + red blanket!
            ctx.fillStyle = '#784820';
            ctx.fillRect(3, 19, 26, 5); // wood frame
            ctx.fillRect(3, 24, 4, 5); ctx.fillRect(25, 24, 4, 5); // legs
            ctx.fillRect(3, 12, 3, 8); // headboard
            ctx.fillStyle = '#f8fafc';
            ctx.fillRect(6, 13, 7, 6); // pillow
            ctx.fillStyle = '#dc2626';
            ctx.fillRect(12, 14, 17, 6); // red blanket
            ctx.fillStyle = '#f87171';
            ctx.fillRect(13, 14, 15, 2); // blanket highlight
            ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 1.2;
            ctx.strokeRect(3, 12, 26, 12);
          }, 32);
          this.icons[def.id] = ic.toDataURL();
          this.itemTextures[def.id] = toTexture(ic);
        } else if (def.id.startsWith('rail_')) {
          const ic = makeCanvas((ctx) => {
            ctx.imageSmoothingEnabled = false;
            const tie = '#8b5a2b';
            const rail = '#cbd5e1';
            const railDark = '#475569';
            if (def.id === 'rail_up' || def.id === 'rail_down') {
              // Sloped ascending / descending rail icon (matches stairs!)
              const isUp = def.id === 'rail_up';
              ctx.fillStyle = '#5c3818';
              for (let i = 0; i < 4; i++) {
                const x = isUp ? (4 + i * 6) : (22 - i * 6);
                const y = 24 - i * 6;
                ctx.fillRect(x, y, 6, 4);
              }
              ctx.strokeStyle = railDark; ctx.lineWidth = 5;
              ctx.beginPath();
              if (isUp) { ctx.moveTo(3, 27); ctx.lineTo(29, 5); }
              else { ctx.moveTo(3, 5); ctx.lineTo(29, 27); }
              ctx.stroke();
              ctx.strokeStyle = rail; ctx.lineWidth = 2.5;
              ctx.beginPath();
              if (isUp) { ctx.moveTo(3, 27); ctx.lineTo(29, 5); }
              else { ctx.moveTo(3, 5); ctx.lineTo(29, 27); }
              ctx.stroke();
              ctx.fillStyle = isUp ? '#38bdf8' : '#f97316';
              ctx.font = 'bold 12px sans-serif';
              ctx.textAlign = 'center';
              ctx.fillText(isUp ? '▲' : '▼', isUp ? 9 : 23, isUp ? 13 : 13);
            } else if (def.id === 'rail_signal') {
              // Railway traffic signal post (red + yellow + green lights)
              ctx.fillStyle = '#334155'; ctx.fillRect(14, 18, 4, 12);
              ctx.fillStyle = '#0f172a'; ctx.fillRect(10, 2, 12, 18);
              ctx.fillStyle = '#ef4444'; ctx.fillRect(13, 4, 6, 4);
              ctx.fillStyle = '#facc15'; ctx.fillRect(13, 9, 6, 4);
              ctx.fillStyle = '#22c55e'; ctx.fillRect(13, 14, 6, 4);
              ctx.fillStyle = '#475569'; ctx.fillRect(10, 28, 12, 3);
            } else if (def.id === 'rail_gate_open' || def.id === 'rail_gate_closed') {
              // Yellow-black striped crossing base + red-white striped barrier boom!
              ctx.fillStyle = '#facc15'; ctx.fillRect(4, 18, 8, 12);
              ctx.fillStyle = '#0f172a'; ctx.fillRect(4, 21, 8, 3); ctx.fillRect(4, 27, 8, 3);
              ctx.fillStyle = '#ef4444'; ctx.fillRect(6, 13, 4, 4); // warning light
              if (def.id === 'rail_gate_closed') {
                for (let x = 10; x < 30; x += 4) {
                  ctx.fillStyle = ((x / 4) % 2 === 0) ? '#ef4444' : '#ffffff';
                  ctx.fillRect(x, 19, 4, 4);
                }
              } else {
                for (let y = 3; y < 21; y += 4) {
                  ctx.fillStyle = (((y - 3) / 4) % 2 === 0) ? '#ef4444' : '#ffffff';
                  ctx.fillRect(11, y, 4, 4);
                }
              }
            } else if (def.id === 'rail_straight' || def.id === 'rail_card_red' || def.id === 'rail_card_yellow' || def.id === 'rail_card_green') {
              for (const y of [4, 11, 18, 25]) { ctx.fillStyle = tie; ctx.fillRect(5, y, 22, 3); }
              ctx.fillStyle = railDark; ctx.fillRect(7, 1, 5, 30); ctx.fillRect(20, 1, 5, 30);
              ctx.fillStyle = rail; ctx.fillRect(8, 1, 3, 30); ctx.fillRect(21, 1, 3, 30);
              if (def.id === 'rail_card_red') {
                ctx.fillStyle = '#dc2626'; ctx.fillRect(10, 9, 12, 14);
                ctx.fillStyle = '#ffffff'; ctx.fillRect(13, 13, 6, 6);
              } else if (def.id === 'rail_card_yellow') {
                ctx.fillStyle = '#eab308'; ctx.fillRect(10, 9, 12, 14);
                ctx.fillStyle = '#fef9c3'; ctx.fillRect(12, 11, 8, 10);
                ctx.fillStyle = '#0f172a'; ctx.fillRect(14, 13, 4, 6);
              } else if (def.id === 'rail_card_green') {
                ctx.fillStyle = '#16a34a'; ctx.fillRect(10, 9, 12, 14);
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(15, 11, 2, 10);
                ctx.fillRect(13, 17, 6, 2);
                ctx.fillRect(14, 19, 4, 2);
              }
            } else if (def.id === 'rail_curve') {
              ctx.fillStyle = tie;
              ctx.fillRect(6, 5, 10, 3); ctx.fillRect(9, 12, 11, 3); ctx.fillRect(15, 19, 10, 3);
              ctx.strokeStyle = railDark; ctx.lineWidth = 5;
              ctx.beginPath(); ctx.arc(28, 4, 19, Math.PI * 0.5, Math.PI); ctx.stroke();
              ctx.beginPath(); ctx.arc(28, 4, 9, Math.PI * 0.5, Math.PI); ctx.stroke();
              ctx.strokeStyle = rail; ctx.lineWidth = 3;
              ctx.beginPath(); ctx.arc(28, 4, 19, Math.PI * 0.5, Math.PI); ctx.stroke();
              ctx.beginPath(); ctx.arc(28, 4, 9, Math.PI * 0.5, Math.PI); ctx.stroke();
            } else if (def.id === 'rail_cross') {
              ctx.fillStyle = tie;
              for (const p of [5, 14, 24]) { ctx.fillRect(5, p, 22, 3); ctx.fillRect(p, 5, 3, 22); }
              ctx.fillStyle = railDark;
              ctx.fillRect(8, 1, 4, 30); ctx.fillRect(20, 1, 4, 30);
              ctx.fillRect(1, 8, 30, 4); ctx.fillRect(1, 20, 30, 4);
              ctx.fillStyle = rail;
              ctx.fillRect(9, 1, 2, 30); ctx.fillRect(21, 1, 2, 30);
              ctx.fillRect(1, 9, 30, 2); ctx.fillRect(1, 21, 30, 2);
            } else {
              // T-branch or X-branch rail with clear Blue 'L' / Green 'R' center badge!
              const isX = def.id.startsWith('rail_xbranch');
              const isR = def.id.endsWith('_turn');
              ctx.fillStyle = tie;
              ctx.fillRect(1, 14, 30, 4);
              ctx.fillRect(14, isX ? 1 : 14, 4, isX ? 30 : 17);
              ctx.fillStyle = railDark;
              ctx.fillRect(1, 9, 30, 3); ctx.fillRect(1, 20, 30, 3);
              ctx.fillRect(9, isX ? 1 : 16, 3, isX ? 30 : 15);
              ctx.fillRect(20, isX ? 1 : 16, 3, isX ? 30 : 15);
              ctx.fillStyle = rail;
              ctx.fillRect(1, 10, 30, 1); ctx.fillRect(1, 21, 30, 1);
              ctx.fillRect(10, isX ? 1 : 16, 1, isX ? 30 : 15);
              ctx.fillRect(21, isX ? 1 : 16, 1, isX ? 30 : 15);
              ctx.fillStyle = isR ? '#16a34a' : '#2563eb';
              ctx.fillRect(9, 9, 14, 14);
              ctx.fillStyle = '#ffffff';
              ctx.font = 'bold 12px sans-serif';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText(isR ? 'R' : 'L', 16, 16.5);
            }
          }, 32);
          this.icons[def.id] = ic.toDataURL();
          this.itemTextures[def.id] = toTexture(ic);
        } else if (def.id === 'train_engine' || def.id === 'train_car') {
          const ic = makeCanvas((ctx) => {
            ctx.imageSmoothingEnabled = false;
            if (def.id === 'train_engine') {
              // Classic bright red/navy steam locomotive silhouette!
              ctx.fillStyle = '#1e293b'; ctx.fillRect(7, 4, 5, 8); // chimney
              ctx.fillStyle = '#f8fafc'; ctx.fillRect(6, 1, 6, 3); // puff of steam
              ctx.fillStyle = '#dc2626'; ctx.fillRect(4, 12, 24, 11); // main boiler & cab
              ctx.fillStyle = '#991b1b'; ctx.fillRect(17, 7, 11, 16); // driver cab
              ctx.fillStyle = '#bae6fd'; ctx.fillRect(19, 10, 7, 5); // cab window
              ctx.fillStyle = '#facc15'; ctx.fillRect(3, 14, 3, 4); // headlight
              ctx.fillStyle = '#0f172a'; ctx.fillRect(6, 23, 6, 6); ctx.fillRect(19, 23, 6, 6); // wheels
              ctx.fillStyle = '#94a3b8'; ctx.fillRect(8, 25, 2, 2); ctx.fillRect(21, 25, 2, 2);
            } else {
              // Cozy blue passenger railcar silhouette!
              ctx.fillStyle = '#1d4ed8'; ctx.fillRect(3, 9, 26, 14);
              ctx.fillStyle = '#3b82f6'; ctx.fillRect(4, 10, 24, 11);
              ctx.fillStyle = '#bae6fd';
              ctx.fillRect(6, 12, 5, 5); ctx.fillRect(13, 12, 6, 5); ctx.fillRect(21, 12, 5, 5);
              ctx.fillStyle = '#f8fafc'; ctx.fillRect(4, 19, 24, 2);
              ctx.fillStyle = '#0f172a'; ctx.fillRect(6, 23, 5, 5); ctx.fillRect(21, 23, 5, 5);
            }
          }, 32);
          this.icons[def.id] = ic.toDataURL();
          this.itemTextures[def.id] = toTexture(ic);
        } else if (def.id === 'npc_beacon') {
          const ic = makeCanvas((ctx) => {
            ctx.imageSmoothingEnabled = false;
            ctx.clearRect(0, 0, 32, 32);
            // Emerald glowing beacon tile with crisp yellow forward arrow!
            ctx.fillStyle = '#064e3b';
            ctx.fillRect(3, 3, 26, 26);
            ctx.fillStyle = '#10b981';
            ctx.fillRect(5, 5, 22, 22);
            ctx.fillStyle = '#065f46';
            ctx.fillRect(7, 7, 18, 18);
            ctx.fillStyle = '#fde047';
            ctx.fillRect(14, 8, 4, 16);
            ctx.fillRect(11, 10, 10, 3);
            ctx.fillRect(9, 13, 14, 3);
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(15, 7, 2, 2);
          }, 32);
          this.icons[def.id] = ic.toDataURL();
          this.itemTextures[def.id] = toTexture(ic);
        } else if (def.id === 'invisible_block') {
          const ic = makeCanvas((ctx) => {
            ctx.imageSmoothingEnabled = false;
            ctx.clearRect(0, 0, 32, 32);
            // Crisp dashed sky-blue cube outline + subtle sparkle so it's unmistakable in hotbar/bag!
            ctx.fillStyle = 'rgba(186, 230, 253, 0.16)';
            ctx.fillRect(4, 4, 24, 24);
            ctx.fillStyle = '#7dd3fc';
            for (let i = 3; i <= 25; i += 6) {
              ctx.fillRect(i, 3, 4, 2); ctx.fillRect(i, 27, 4, 2);
              ctx.fillRect(3, i, 2, 4); ctx.fillRect(27, i, 2, 4);
            }
            ctx.fillStyle = '#e0f2fe';
            ctx.fillRect(15, 10, 2, 12);
            ctx.fillRect(10, 15, 12, 2);
          }, 32);
          this.icons[def.id] = ic.toDataURL();
          this.itemTextures[def.id] = toTexture(ic);
        } else if (def.id === 'redstone_wire' || def.id === 'fuse' || def.id === 'sapling') {
          const ic = makeCanvas((ctx) => {
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(sideC, 0, 0, 32, 32);
          }, 32);
          this.icons[def.id] = ic.toDataURL();
          this.itemTextures[def.id] = toTexture(ic);
        } else {
          this.icons[def.id] = sideC.toDataURL();
        }

        const isTransparent = !!def.transparent;
        const isCross = def.id === 'sapling' || def.id.startsWith('wheat_') || def.id === 'ladder' || def.id === 'sign' || def.id === 'fuse' || def.id === 'redstone_wire';
        const isDoor = def.id.startsWith('door_');
        const isStair = def.id.startsWith('stairs_');
        const opts = {
          transparent: isTransparent && !isStair,
          opacity: def.id === 'water' ? 0.72 : (def.id === 'portal' ? 0.78 : (def.id === 'stealth_beacon' ? 0.58 : (def.id === 'npc_beacon' ? 0.74 : 1.0))),
          depthWrite: def.id !== 'water' && def.id !== 'stealth_beacon' && def.id !== 'npc_beacon',
          alphaTest: (def.id === 'leaves' || isCross || isDoor) ? 0.25 : 0,
          side: (isCross || def.id === 'water' || def.id === 'stealth_beacon' || def.id === 'npc_beacon' || isDoor || def.id === 'portal') ? THREE.DoubleSide : THREE.FrontSide,
          emissive: def.id === 'lamp' || def.id === 'redstone_lamp_on' ? new THREE.Color('#fef08a')
            : def.id === 'torch' ? new THREE.Color('#fb923c')
            : def.id === 'redstone_wire' || def.id === 'lever_on' ? new THREE.Color('#ef4444')
            : def.id === 'portal' ? new THREE.Color('#a855f7')
            : def.id === 'furnace' ? new THREE.Color('#f97316')
            : def.id === 'jumppad' ? new THREE.Color('#22d3ee')
            : def.id === 'protect_beacon' ? new THREE.Color('#38bdf8')
            : def.id === 'stealth_beacon' ? new THREE.Color('#c084fc')
            : def.id === 'npc_beacon' ? new THREE.Color('#10b981')
            : new THREE.Color('#000000'),
          emissiveIntensity: def.id === 'torch' ? 0.82
            : (def.id === 'lamp' || def.id === 'redstone_lamp_on' ? 0.8 : (def.id === 'portal' || def.id === 'protect_beacon' || def.id === 'stealth_beacon' || def.id === 'npc_beacon' ? 0.65 : (def.id === 'redstone_wire' || def.id === 'lever_on' ? 0.45 : (def.id === 'furnace' ? 0.24 : (def.id === 'jumppad' ? 0.35 : 0)))))
        };

        const applyBlockLightShader = (mat) => {
          mat.onBeforeCompile = (shader) => {
            shader.vertexShader = shader.vertexShader
              .replace('#include <common>', '#include <common>\nattribute vec3 aBlockLight;\nattribute float aAoDark;\nvarying vec3 vBlockLight;\nvarying float vAoDark;')
              .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBlockLight = aBlockLight;\nvAoDark = aAoDark;');
            shader.fragmentShader = shader.fragmentShader
              .replace('#include <common>', '#include <common>\nvarying vec3 vBlockLight;\nvarying float vAoDark;')
              .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\nfloat bwAo = 1.0 - vAoDark;\nreflectedLight.directDiffuse *= bwAo;\nreflectedLight.indirectDiffuse *= bwAo;\nreflectedLight.directDiffuse += diffuseColor.rgb * vBlockLight * (0.65 + 0.35 * bwAo);');
          };
          mat.customProgramCacheKey = () => 'boxworld_block_light_ao_v2';
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
