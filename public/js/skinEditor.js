import * as THREE from '../vendor/three/three.module.min.js';
import { createAvatarRig, applySkinToRig } from './players.js';

// Kids-friendly MS-Paint style 64x64 Minecraft-compatible Pixel Skin Studio + Live 3D Preview
const PALETTE = [
  '#0f172a', '#334155', '#64748b', '#cbd5e1', '#ffffff', '#f5cfa0', '#ecc092', '#d4a373',
  '#8d5524', '#4b2e19', '#ef4444', '#dc2626', '#f97316', '#facc15', '#22c55e', '#15803d',
  '#06b6d4', '#38bdf8', '#2563eb', '#1e3a8a', '#8b5cf6', '#ec4899', '#f472b6', '#fbbf24'
];

// Cute pixel-art stamps (centered around click point!)
const STAMPS = {
  star: [
    '...X...',
    '...X...',
    'XXXXXXX',
    '.XXXXX.',
    '..XXX..',
    '.XX.XX.',
    'X.....X'
  ],
  heart: [
    '.XX.XX.',
    'XXXXXXX',
    'XXXXXXX',
    '.XXXXX.',
    '..XXX..',
    '...X...'
  ],
  smile: [
    '.XXXXX.',
    'X.....X',
    'X.X.X.X',
    'X.....X',
    'X.X.X.X',
    'X..X..X',
    '.XXXXX.'
  ],
  crown: [
    'X..X..X',
    'XX.X.XX',
    'XXXXXXX',
    'XXXXXXX',
    '.XXXXX.'
  ],
  bolt: [
    '...XX..',
    '..XX...',
    '.XXXXX.',
    '...XX..',
    '..XX...',
    '.XX....'
  ]
};

export class PixelSkinEditor {
  constructor(canvasEl, paletteEl, preview3dCanvas = null) {
    this.canvas = canvasEl;
    this.ctx = canvasEl.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;

    this.off = document.createElement('canvas');
    this.off.width = 64;
    this.off.height = 64;
    this.octx = this.off.getContext('2d');

    this.tool = 'pencil'; // pencil | eraser | fill | picker | rect | circle | select | stamp
    this.stampName = 'star';
    this.brushSize = 1; // 1 | 2 | 3
    this.mirrorMode = false;
    this.color = '#38bdf8';
    this.drawing = false;
    this.dragStart = null;
    this.dragCur = null;
    this.selection = null; // { x, y, w, h }
    this.undoStack = [];
    this.redoStack = [];
    this._previewTimer = null;

    this._initDefaultTemplate();
    this._buildPalette(paletteEl);
    this._bindCanvas();
    if (preview3dCanvas) this._init3DPreview(preview3dCanvas);
    this.render();
  }

  _init3DPreview(canvas) {
    this._p3dCanvas = canvas;
    this._p3dRenderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this._p3dRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this._p3dRenderer.setSize(canvas.width, canvas.height, false);
    this._p3dScene = new THREE.Scene();
    this._p3dCam = new THREE.PerspectiveCamera(38, canvas.width / canvas.height, 0.1, 20);
    this._p3dCam.position.set(0, 1.05, 3.05);
    this._p3dCam.lookAt(0, 0.92, 0);

    const hemi = new THREE.HemisphereLight(0xffffff, 0x334155, 1.15);
    const dir = new THREE.DirectionalLight(0xffffff, 0.85);
    dir.position.set(2, 4, 3);
    this._p3dScene.add(hemi, dir);

    this._p3dRig = createAvatarRig({ pixelDataUrl: this.exportDataUrl() }, false);
    this._p3dScene.add(this._p3dRig.group);

    this._p3dYaw = 0.45;
    this._p3dDragging = false;
    this._p3dLastX = 0;

    canvas.style.touchAction = 'none';
    canvas.addEventListener('pointerdown', (e) => {
      this._p3dDragging = true;
      this._p3dLastX = e.clientX;
      canvas.setPointerCapture?.(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!this._p3dDragging) return;
      const dx = e.clientX - this._p3dLastX;
      this._p3dLastX = e.clientX;
      this._p3dYaw += dx * 0.015;
    });
    const endSpin = () => { this._p3dDragging = false; };
    window.addEventListener('pointerup', endSpin);
    window.addEventListener('pointercancel', endSpin);

    const loop = () => {
      requestAnimationFrame(loop);
      if (!this._p3dCanvas || this._p3dCanvas.offsetParent === null) return;
      if (!this._p3dDragging) this._p3dYaw += 0.012;
      this._p3dRig.group.rotation.y = this._p3dYaw;
      this._p3dRenderer.render(this._p3dScene, this._p3dCam);
    };
    requestAnimationFrame(loop);
  }

  _sync3DPreviewSoon() {
    if (!this._p3dRig) return;
    if (this._previewTimer) clearTimeout(this._previewTimer);
    this._previewTimer = setTimeout(() => {
      this._previewTimer = null;
      applySkinToRig(this._p3dRig, { pixelDataUrl: this.exportDataUrl() });
    }, 60);
  }

  _initDefaultTemplate() {
    const c = this.octx;
    c.clearRect(0, 0, 64, 64);

    // Head
    c.fillStyle = '#f5cfa0';
    c.fillRect(0, 8, 32, 8);
    c.fillRect(8, 0, 16, 8);
    c.fillStyle = '#3b2416';
    c.fillRect(8, 0, 8, 8);
    c.fillRect(24, 8, 8, 8);
    c.fillRect(0, 8, 8, 3);
    c.fillRect(16, 8, 8, 3);
    c.fillRect(8, 8, 8, 2);
    // Eyes & blush
    c.fillStyle = '#ffffff';
    c.fillRect(9, 11, 2, 2);
    c.fillRect(13, 11, 2, 2);
    c.fillStyle = '#0f172a';
    c.fillRect(10, 11, 1, 2);
    c.fillRect(13, 11, 1, 2);
    c.fillStyle = '#f472b6';
    c.fillRect(9, 13, 1, 1);
    c.fillRect(14, 13, 1, 1);
    c.fillStyle = '#9a3412';
    c.fillRect(11, 14, 2, 1);

    // Body
    c.fillStyle = '#38bdf8';
    c.fillRect(16, 20, 24, 12);
    c.fillRect(20, 16, 16, 4);
    c.fillStyle = '#facc15';
    c.fillRect(22, 20, 4, 2);

    // Arms
    c.fillStyle = '#38bdf8';
    c.fillRect(40, 20, 16, 8);
    c.fillRect(32, 52, 16, 8);
    c.fillStyle = '#f5cfa0';
    c.fillRect(40, 28, 16, 4);
    c.fillRect(32, 60, 16, 4);

    // Legs
    c.fillStyle = '#334155';
    c.fillRect(0, 20, 16, 10);
    c.fillRect(16, 52, 16, 10);
    c.fillStyle = '#1e293b';
    c.fillRect(0, 30, 16, 2);
    c.fillRect(16, 62, 16, 2);
  }

  resetTemplate() {
    this._pushUndo();
    this._initDefaultTemplate();
    this.selection = null;
    this.render();
  }

  _buildPalette(el) {
    el.innerHTML = '';
    for (const col of PALETTE) {
      const sw = document.createElement('button');
      sw.type = 'button';
      sw.className = 'pal-swatch';
      sw.style.background = col;
      sw.addEventListener('click', () => {
        this.color = col;
        const custom = document.getElementById('px-custom-color');
        if (custom) custom.value = col;
      });
      el.appendChild(sw);
    }
  }

  setTool(t) { this.tool = t; }
  setStamp(name) { this.tool = 'stamp'; this.stampName = name; }
  setBrushSize(sz) { this.brushSize = Math.max(1, Math.min(3, Number(sz) || 1)); }
  setMirrorMode(on) { this.mirrorMode = !!on; }
  setColor(c) { this.color = c; }

  _pushUndo() {
    this.undoStack.push(this.octx.getImageData(0, 0, 64, 64));
    if (this.undoStack.length > 30) this.undoStack.shift();
    this.redoStack.length = 0;
  }

  undo() {
    const prev = this.undoStack.pop();
    if (!prev) return;
    this.redoStack.push(this.octx.getImageData(0, 0, 64, 64));
    this.octx.putImageData(prev, 0, 0);
    this.render();
  }

  redo() {
    const next = this.redoStack.pop();
    if (!next) return;
    this.undoStack.push(this.octx.getImageData(0, 0, 64, 64));
    this.octx.putImageData(next, 0, 0);
    this.render();
  }

  // Selection operations (Rect Select toolbar)
  fillSelection() {
    if (!this.selection) return;
    this._pushUndo();
    const { x, y, w, h } = this.selection;
    this.octx.fillStyle = this.color;
    this.octx.fillRect(x, y, w, h);
    this.render();
  }

  clearSelectionPixels() {
    if (!this.selection) return;
    this._pushUndo();
    const { x, y, w, h } = this.selection;
    this.octx.clearRect(x, y, w, h);
    this.render();
  }

  flipSelectionH() {
    if (!this.selection) return;
    this._pushUndo();
    const { x, y, w, h } = this.selection;
    const img = this.octx.getImageData(x, y, w, h);
    const out = this.octx.createImageData(w, h);
    for (let row = 0; row < h; row++) {
      for (let col = 0; col < w; col++) {
        const si = (row * w + col) * 4;
        const di = (row * w + (w - 1 - col)) * 4;
        out.data[di] = img.data[si];
        out.data[di + 1] = img.data[si + 1];
        out.data[di + 2] = img.data[si + 2];
        out.data[di + 3] = img.data[si + 3];
      }
    }
    this.octx.putImageData(out, x, y);
    this.render();
  }

  clearSelectionBox() {
    this.selection = null;
    this.render();
  }

  _pixelCoords(e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = Math.floor(((e.clientX - rect.left) / rect.width) * 64);
    const y = Math.floor(((e.clientY - rect.top) / rect.height) * 64);
    return { x: Math.max(0, Math.min(63, x)), y: Math.max(0, Math.min(63, y)) };
  }

  _mirrorX(x) {
    // Smart per-UV-part horizontal mirror (Face 8..15, Body front 20..27, else canvas center)
    if (x >= 8 && x <= 15) return 23 - x;
    if (x >= 20 && x <= 27) return 47 - x;
    return 63 - x;
  }

  _drawBrushPixel(x, y, isErase = false) {
    const half = Math.floor(this.brushSize / 2);
    const paint = (px, py) => {
      if (isErase) this.octx.clearRect(px - half, py - half, this.brushSize, this.brushSize);
      else {
        this.octx.fillStyle = this.color;
        this.octx.fillRect(px - half, py - half, this.brushSize, this.brushSize);
      }
    };
    paint(x, y);
    if (this.mirrorMode) {
      paint(this._mirrorX(x), y);
    }
  }

  _stampAt(cx, cy) {
    const pattern = STAMPS[this.stampName] || STAMPS.star;
    const h = pattern.length;
    const w = pattern[0].length;
    const x0 = cx - Math.floor(w / 2);
    const y0 = cy - Math.floor(h / 2);
    this.octx.fillStyle = this.color;
    for (let r = 0; r < h; r++) {
      for (let c = 0; c < w; c++) {
        if (pattern[r][c] === 'X') {
          const px = x0 + c, py = y0 + r;
          if (px >= 0 && px < 64 && py >= 0 && py < 64) {
            this.octx.fillRect(px, py, 1, 1);
          }
        }
      }
    }
  }

  _drawShape(ctx, kind, x0, y0, x1, y1, scale = 1) {
    const minX = Math.min(x0, x1), maxX = Math.max(x0, x1);
    const minY = Math.min(y0, y1), maxY = Math.max(y0, y1);
    ctx.fillStyle = this.color;
    if (kind === 'rect') {
      ctx.fillRect(minX * scale, minY * scale, (maxX - minX + 1) * scale, (maxY - minY + 1) * scale);
    } else if (kind === 'circle') {
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      const rx = Math.max(0.5, (maxX - minX) / 2 + 0.35);
      const ry = Math.max(0.5, (maxY - minY) / 2 + 0.35);
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          const nx = (x - cx) / rx, ny = (y - cy) / ry;
          if (nx * nx + ny * ny <= 1.0) {
            ctx.fillRect(x * scale, y * scale, scale, scale);
          }
        }
      }
    }
  }

  _applyAt(x, y) {
    if (this.tool === 'pencil') {
      this._drawBrushPixel(x, y, false);
    } else if (this.tool === 'eraser') {
      this._drawBrushPixel(x, y, true);
    } else if (this.tool === 'stamp') {
      this._stampAt(x, y);
    } else if (this.tool === 'picker') {
      const px = this.octx.getImageData(x, y, 1, 1).data;
      if (px[3] > 0) {
        const hex = '#' + [px[0], px[1], px[2]].map(v => v.toString(16).padStart(2, '0')).join('');
        this.color = hex;
        const custom = document.getElementById('px-custom-color');
        if (custom) custom.value = hex;
      }
      this.tool = 'pencil';
    } else if (this.tool === 'fill') {
      this._floodFill(x, y, this.color);
    }
    this.render();
  }

  _floodFill(sx, sy, hex) {
    const img = this.octx.getImageData(0, 0, 64, 64);
    const d = img.data;
    const idx0 = (sy * 64 + sx) * 4;
    const tR = d[idx0], tG = d[idx0 + 1], tB = d[idx0 + 2], tA = d[idx0 + 3];
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    if (tR === r && tG === g && tB === b && tA === 255) return;

    const stack = [[sx, sy]];
    const visited = new Uint8Array(64 * 64);
    while (stack.length > 0) {
      const [x, y] = stack.pop();
      if (x < 0 || x >= 64 || y < 0 || y >= 64) continue;
      const p = y * 64 + x;
      if (visited[p]) continue;
      const i = p * 4;
      if (d[i] !== tR || d[i + 1] !== tG || d[i + 2] !== tB || d[i + 3] !== tA) continue;
      visited[p] = 1;
      d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
    this.octx.putImageData(img, 0, 0);
  }

  _bindCanvas() {
    this.canvas.style.touchAction = 'none';
    this.canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.canvas.setPointerCapture?.(e.pointerId);
      const { x, y } = this._pixelCoords(e);
      this.drawing = true;

      if (this.tool === 'rect' || this.tool === 'circle' || this.tool === 'select') {
        this.dragStart = { x, y };
        this.dragCur = { x, y };
        this.render();
        return;
      }
      this._pushUndo();
      this._applyAt(x, y);
    });

    this.canvas.addEventListener('pointermove', (e) => {
      if (!this.drawing) return;
      e.preventDefault();
      const { x, y } = this._pixelCoords(e);
      if (this.tool === 'rect' || this.tool === 'circle' || this.tool === 'select') {
        this.dragCur = { x, y };
        this.render();
        return;
      }
      if (this.tool === 'fill' || this.tool === 'picker' || this.tool === 'stamp') return;
      this._applyAt(x, y);
    });

    const endDraw = () => {
      if (!this.drawing) return;
      this.drawing = false;
      if (this.dragStart && this.dragCur) {
        const minX = Math.min(this.dragStart.x, this.dragCur.x);
        const minY = Math.min(this.dragStart.y, this.dragCur.y);
        const maxX = Math.max(this.dragStart.x, this.dragCur.x);
        const maxY = Math.max(this.dragStart.y, this.dragCur.y);
        if (this.tool === 'select') {
          this.selection = { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
        } else if (this.tool === 'rect' || this.tool === 'circle') {
          this._pushUndo();
          this._drawShape(this.octx, this.tool, this.dragStart.x, this.dragStart.y, this.dragCur.x, this.dragCur.y, 1);
        }
        this.dragStart = null;
        this.dragCur = null;
        this.render();
      }
    };
    window.addEventListener('pointerup', endDraw);
    window.addEventListener('pointercancel', endDraw);
  }

  loadDataUrl(dataUrl) {
    if (!dataUrl) return;
    const img = new Image();
    img.onload = () => {
      this._pushUndo();
      this.octx.clearRect(0, 0, 64, 64);
      this.octx.drawImage(img, 0, 0, 64, 64);
      this.render();
    };
    img.src = dataUrl;
  }

  loadFromColorSkin(s = {}) {
    this._pushUndo();
    const c = this.octx;
    c.clearRect(0, 0, 64, 64);
    const skin = s.skinColor || '#f5cfa0';
    const hair = s.hairColor || '#3b2416';
    const shirt = s.shirtColor || '#38bdf8';
    const pants = s.pantsColor || '#334155';
    const eye = s.eyeColor || '#0f172a';

    c.fillStyle = skin;
    c.fillRect(0, 8, 32, 8);
    c.fillRect(8, 0, 16, 8);
    c.fillStyle = s.hatColor || hair;
    c.fillRect(8, 0, 8, 8);
    c.fillRect(24, 8, 8, 8);
    c.fillRect(0, 8, 8, 3);
    c.fillRect(16, 8, 8, 3);
    c.fillRect(8, 8, 8, 2);
    c.fillStyle = '#ffffff';
    c.fillRect(9, 11, 2, 2); c.fillRect(13, 11, 2, 2);
    c.fillStyle = eye;
    c.fillRect(10, 11, 1, 2); c.fillRect(13, 11, 1, 2);
    if (s.blush) {
      c.fillStyle = '#f472b6';
      c.fillRect(9, 13, 1, 1); c.fillRect(14, 13, 1, 1);
    }
    c.fillStyle = '#9a3412';
    c.fillRect(11, 14, 2, 1);
    c.fillStyle = shirt;
    c.fillRect(16, 20, 24, 12); c.fillRect(20, 16, 16, 4);
    c.fillRect(40, 20, 16, 8); c.fillRect(32, 52, 16, 8);
    c.fillStyle = skin;
    c.fillRect(40, 28, 16, 4); c.fillRect(32, 60, 16, 4);
    c.fillStyle = pants;
    c.fillRect(0, 20, 16, 12); c.fillRect(16, 52, 16, 12);
    this.render();
  }

  exportDataUrl() {
    return this.off.toDataURL('image/png');
  }

  downloadPng(filename = 'boxworld-skin.png') {
    const a = document.createElement('a');
    a.href = this.exportDataUrl();
    a.download = filename;
    a.click();
  }

  render() {
    const W = this.canvas.width;
    const H = this.canvas.height;
    const ctx = this.ctx;
    const cell = W / 64;

    // Checkerboard transparent backdrop
    ctx.clearRect(0, 0, W, H);
    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 64; x++) {
        ctx.fillStyle = ((x + y) % 2 === 0) ? '#1e293b' : '#263348';
        ctx.fillRect(x * cell, y * cell, cell, cell);
      }
    }

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.off, 0, 0, W, H);

    // Live drag preview for rect/circle/select
    if (this.drawing && this.dragStart && this.dragCur) {
      if (this.tool === 'rect' || this.tool === 'circle') {
        ctx.save();
        ctx.globalAlpha = 0.72;
        this._drawShape(ctx, this.tool, this.dragStart.x, this.dragStart.y, this.dragCur.x, this.dragCur.y, cell);
        ctx.restore();
      } else if (this.tool === 'select') {
        const minX = Math.min(this.dragStart.x, this.dragCur.x);
        const minY = Math.min(this.dragStart.y, this.dragCur.y);
        const w = Math.abs(this.dragCur.x - this.dragStart.x) + 1;
        const h = Math.abs(this.dragCur.y - this.dragStart.y) + 1;
        ctx.save();
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 3]);
        ctx.strokeRect(minX * cell, minY * cell, w * cell, h * cell);
        ctx.restore();
      }
    }

    // Active selection marquee
    if (this.selection) {
      const { x, y, w, h } = this.selection;
      ctx.save();
      ctx.strokeStyle = '#facc15';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 3]);
      ctx.strokeRect(x * cell, y * cell, w * cell, h * cell);
      ctx.restore();
    }

    // Minecraft UV region guide labels
    const guides = [
      { x: 8, y: 8, w: 8, h: 8, label: '얼굴' },
      { x: 20, y: 20, w: 8, h: 12, label: '앞몸통' },
      { x: 32, y: 20, w: 8, h: 12, label: '등' },
      { x: 44, y: 20, w: 4, h: 12, label: '오른팔' },
      { x: 36, y: 52, w: 4, h: 12, label: '왼팔' },
      { x: 4, y: 20, w: 4, h: 12, label: '오른다리' },
      { x: 20, y: 52, w: 4, h: 12, label: '왼다리' }
    ];
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.55)';
    ctx.lineWidth = 1;
    ctx.font = 'bold 10px sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.78)';
    for (const g of guides) {
      ctx.strokeRect(g.x * cell, g.y * cell, g.w * cell, g.h * cell);
      ctx.fillText(g.label, g.x * cell + 2, g.y * cell + 11);
    }

    this._sync3DPreviewSoon();
  }
}
