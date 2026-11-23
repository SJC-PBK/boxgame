// Admin Photo / Map Image -> 3D Building / Pixel Art / Terrain Relief Generator (100% client-side)

const BLOCK_PALETTE = [
  { id: 'wool_white',  r: 241, g: 245, b: 249 },
  { id: 'wool_red',    r: 220, g: 38,  b: 38  },
  { id: 'wool_blue',   r: 37,  g: 99,  b: 235 },
  { id: 'wool_yellow', r: 234, g: 179, b: 8   },
  { id: 'gold',        r: 250, g: 204, b: 21  },
  { id: 'diamond',     r: 34,  g: 211, b: 238 },
  { id: 'grass',       r: 94,  g: 168, b: 50  },
  { id: 'leaves',      r: 45,  g: 135, b: 50  },
  { id: 'wood',        r: 105, g: 72,  b: 42  },
  { id: 'planks',      r: 184, g: 141, b: 86  },
  { id: 'brick',       r: 169, g: 72,  b: 59  },
  { id: 'stone',       r: 127, g: 132, b: 138 },
  { id: 'cobble',      r: 95,  g: 100, b: 108 },
  { id: 'sand',        r: 226, g: 211, b: 156 },
  { id: 'dirt',        r: 134, g: 96,  b: 67  },
  { id: 'coal_ore',    r: 45,  g: 52,  b: 65  },
  { id: 'lamp',        r: 254, g: 240, b: 138 }
];

function nearestBlock(r, g, b) {
  let best = BLOCK_PALETTE[0].id;
  let bestD = Infinity;
  for (const p of BLOCK_PALETTE) {
    const dr = r - p.r, dg = g - p.g, db = b - p.b;
    const d = dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11;
    if (d < bestD) { bestD = d; best = p.id; }
  }
  return best;
}

export class ImageAutoBuilder {
  constructor(previewCanvas) {
    this.previewCanvas = previewCanvas;
    this.ctx = previewCanvas.getContext('2d');
    this.loadedImage = null;
  }

  loadFile(file, onLoaded) {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        this.loadedImage = img;
        if (onLoaded) onLoaded();
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  // Generate relative block offsets [{ dx, dy, dz, block }] and draw 2D preview
  generate({ mode = 'map3d', width = 20, height = 6 }) {
    if (!this.loadedImage) return [];
    const img = this.loadedImage;
    const aspect = img.height / Math.max(1, img.width);
    const w = Math.max(6, Math.min(36, Math.round(width)));
    const d = Math.max(6, Math.min(36, Math.round(w * aspect)));

    const off = document.createElement('canvas');
    off.width = w;
    off.height = d;
    const octx = off.getContext('2d');
    octx.drawImage(img, 0, 0, w, d);
    const data = octx.getImageData(0, 0, w, d).data;

    // Draw crisp preview on previewCanvas
    const pctx = this.ctx;
    pctx.clearRect(0, 0, this.previewCanvas.width, this.previewCanvas.height);
    pctx.imageSmoothingEnabled = false;
    pctx.drawImage(off, 0, 0, this.previewCanvas.width, this.previewCanvas.height);

    const blocks = [];

    if (mode === 'map3d') {
      // Map / Floorplan -> 3D Building!
      // Dark pixels or saturated building footprints extrude into 3D buildings with windows & roofs
      const mask = new Uint8Array(w * d);
      let avgLum = 0;
      for (let i = 0; i < w * d; i++) {
        avgLum += 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
      }
      avgLum /= (w * d);
      const thresh = Math.min(200, avgLum * 0.92);

      for (let z = 0; z < d; z++) {
        for (let x = 0; x < w; x++) {
          const idx = (z * w + x) * 4;
          const a = data[idx + 3];
          const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
          if (a > 80 && lum < thresh) {
            mask[z * w + x] = 1;
          }
        }
      }

      const maxH = Math.max(3, Math.min(14, Math.round(height)));
      for (let z = 0; z < d; z++) {
        for (let x = 0; x < w; x++) {
          if (!mask[z * w + x]) continue;
          const idx = (z * w + x) * 4;
          const wallBlock = nearestBlock(data[idx], data[idx + 1], data[idx + 2]);
          const isEdge =
            x === 0 || x === w - 1 || z === 0 || z === d - 1 ||
            !mask[z * w + (x - 1)] || !mask[z * w + (x + 1)] ||
            !mask[(z - 1) * w + x] || !mask[(z + 1) * w + x];

          // Ground floor
          blocks.push({ dx: x, dy: 0, dz: z, block: 'cobble' });
          if (isEdge) {
            for (let y = 1; y < maxH; y++) {
              const isWindow = y >= 2 && y <= maxH - 2 && y % 2 === 0 && ((x + z) % 2 === 0);
              blocks.push({ dx: x, dy: y, dz: z, block: isWindow ? 'glass' : wallBlock });
            }
          }
          // Roof
          blocks.push({ dx: x, dy: maxH, dz: z, block: 'brick' });
        }
      }
    } else if (mode === 'photo') {
      // Photo -> Vertical 3D Pixel Art Wall!
      const h = Math.max(6, Math.min(28, Math.round(w * aspect)));
      const pOff = document.createElement('canvas');
      pOff.width = w; pOff.height = h;
      const poctx = pOff.getContext('2d');
      poctx.drawImage(img, 0, 0, w, h);
      const pData = poctx.getImageData(0, 0, w, h).data;

      for (let py = 0; py < h; py++) {
        const dy = h - 1 - py;
        for (let px = 0; px < w; px++) {
          const idx = (py * w + px) * 4;
          if (pData[idx + 3] < 80) continue;
          const blk = nearestBlock(pData[idx], pData[idx + 1], pData[idx + 2]);
          blocks.push({ dx: px, dy, dz: 0, block: blk });
        }
      }
    } else {
      // Relief -> 3D Terrain Heightmap from brightness!
      const maxH = Math.max(3, Math.min(12, Math.round(height)));
      for (let z = 0; z < d; z++) {
        for (let x = 0; x < w; x++) {
          const idx = (z * w + x) * 4;
          if (data[idx + 3] < 80) continue;
          const lum = (0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]) / 255;
          const colH = Math.max(1, Math.round(lum * maxH));
          for (let y = 0; y < colH; y++) {
            let blk = 'stone';
            if (y === colH - 1) {
              blk = colH <= 1 ? 'sand' : (colH >= maxH - 1 ? 'wool_white' : 'grass');
            }
            blocks.push({ dx: x, dy: y, dz: z, block: blk });
          }
        }
      }
    }

    // Cap at 3,800 blocks for smooth server sync
    return blocks.slice(0, 3800);
  }
}
