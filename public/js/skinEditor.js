// Interactive 64x64 Minecraft-compatible Pixel Skin Editor
const PALETTE = [
  '#0f172a', '#334155', '#64748b', '#cbd5e1', '#ffffff', '#f5cfa0', '#ecc092', '#d4a373',
  '#8d5524', '#4b2e19', '#ef4444', '#dc2626', '#f97316', '#facc15', '#22c55e', '#15803d',
  '#06b6d4', '#38bdf8', '#2563eb', '#1e3a8a', '#8b5cf6', '#ec4899', '#f472b6', '#fbbf24'
];

export class PixelSkinEditor {
  constructor(canvasEl, paletteEl) {
    this.canvas = canvasEl;
    this.ctx = canvasEl.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;

    // Backing 64x64 offscreen canvas
    this.off = document.createElement('canvas');
    this.off.width = 64;
    this.off.height = 64;
    this.octx = this.off.getContext('2d');

    this.tool = 'pencil'; // pencil | eraser | fill | picker
    this.color = '#38bdf8';
    this.drawing = false;
    this.undoStack = [];

    this._initDefaultTemplate();
    this._buildPalette(paletteEl);
    this._bindCanvas();
    this.render();
  }

  _initDefaultTemplate() {
    const c = this.octx;
    c.clearRect(0, 0, 64, 64);

    // Head (8,8..16,16 front; 0..32,0..16 full head UV)
    c.fillStyle = '#f5cfa0';
    c.fillRect(0, 8, 32, 8);
    c.fillRect(8, 0, 16, 8);
    // Hair top + back + bangs
    c.fillStyle = '#3b2416';
    c.fillRect(8, 0, 8, 8);
    c.fillRect(24, 8, 8, 8);
    c.fillRect(0, 8, 8, 3);
    c.fillRect(16, 8, 8, 3);
    c.fillRect(8, 8, 8, 2);
    // Eyes & blush on face (8..15, 8..15)
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

    // Body (16..40, 16..32)
    c.fillStyle = '#38bdf8';
    c.fillRect(16, 20, 24, 12);
    c.fillRect(20, 16, 16, 4);
    // Collar detail
    c.fillStyle = '#facc15';
    c.fillRect(22, 20, 4, 2);

    // Right Arm (40..56, 16..32) & Left Arm (32..48, 48..64)
    c.fillStyle = '#38bdf8';
    c.fillRect(40, 20, 16, 8);
    c.fillRect(32, 52, 16, 8);
    c.fillStyle = '#f5cfa0';
    c.fillRect(40, 28, 16, 4);
    c.fillRect(32, 60, 16, 4);

    // Right Leg (0..16, 16..32) & Left Leg (16..32, 48..64)
    c.fillStyle = '#334155';
    c.fillRect(0, 20, 16, 10);
    c.fillRect(16, 52, 16, 10);
    c.fillStyle = '#1e293b';
    c.fillRect(0, 30, 16, 2);
    c.fillRect(16, 62, 16, 2);
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

  setTool(t) {
    this.tool = t;
  }

  setColor(c) {
    this.color = c;
  }

  _pushUndo() {
    this.undoStack.push(this.octx.getImageData(0, 0, 64, 64));
    if (this.undoStack.length > 25) this.undoStack.shift();
  }

  undo() {
    const prev = this.undoStack.pop();
    if (!prev) return;
    this.octx.putImageData(prev, 0, 0);
    this.render();
  }

  _pixelCoords(e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = Math.floor(((e.clientX - rect.left) / rect.width) * 64);
    const y = Math.floor(((e.clientY - rect.top) / rect.height) * 64);
    return { x: Math.max(0, Math.min(63, x)), y: Math.max(0, Math.min(63, y)) };
  }

  _applyAt(x, y) {
    if (this.tool === 'pencil') {
      this.octx.fillStyle = this.color;
      this.octx.fillRect(x, y, 1, 1);
    } else if (this.tool === 'eraser') {
      this.octx.clearRect(x, y, 1, 1);
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
    this.canvas.addEventListener('mousedown', (e) => {
      e.preventDefault();
      this._pushUndo();
      this.drawing = true;
      const { x, y } = this._pixelCoords(e);
      this._applyAt(x, y);
    });
    this.canvas.addEventListener('mousemove', (e) => {
      if (!this.drawing || this.tool === 'fill' || this.tool === 'picker') return;
      const { x, y } = this._pixelCoords(e);
      this._applyAt(x, y);
    });
    window.addEventListener('mouseup', () => { this.drawing = false; });
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
    const s = W / 64;
    const ctx = this.ctx;

    // Checkerboard background
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#263449';
    for (let y = 0; y < 64; y += 4) {
      for (let x = 0; x < 64; x += 4) {
        if (((x + y) / 4) % 2 === 0) ctx.fillRect(x * s, y * s, 4 * s, 4 * s);
      }
    }

    // Draw 64x64 skin scaled crisp
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.off, 0, 0, W, H);

    // Subtle UV part guides (Face, Body, Arms, Legs)
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.55)';
    ctx.lineWidth = 1;
    ctx.strokeRect(8 * s, 8 * s, 8 * s, 8 * s);   // Face front
    ctx.strokeRect(20 * s, 20 * s, 8 * s, 12 * s); // Body front
    ctx.strokeRect(44 * s, 20 * s, 4 * s, 12 * s); // R Arm front
    ctx.strokeRect(4 * s, 20 * s, 4 * s, 12 * s);  // R Leg front

    ctx.font = 'bold 10px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText('얼굴', 8 * s + 2, 8 * s + 11);
    ctx.fillText('몸통', 20 * s + 2, 20 * s + 11);
    ctx.fillText('팔', 44 * s + 2, 20 * s + 11);
    ctx.fillText('다리', 4 * s + 2, 20 * s + 11);
  }
}
