import * as THREE from '../vendor/three/three.module.min.js';

function makeBillboardSprite(lines, bgColor, borderColor, textColor, scaleW = 1.9, scaleH = 0.85) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 112;
  const ctx = c.getContext('2d');
  ctx.fillStyle = bgColor;
  ctx.beginPath();
  ctx.roundRect(6, 6, 244, 100, 12);
  ctx.fill();
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 4;
  ctx.stroke();

  ctx.fillStyle = textColor;
  ctx.font = 'bold 21px Pretendard, Malgun Gothic, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const arr = lines.slice(0, 3);
  const startY = 56 - ((arr.length - 1) * 26) / 2;
  arr.forEach((line, i) => ctx.fillText(line.slice(0, 18), 128, startY + i * 26));

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
  const sp = new THREE.Sprite(mat);
  sp.scale.set(scaleW, scaleH, 1);
  return sp;
}

export class WorldExtras {
  constructor(scene) {
    this.scene = scene;
    this.signGroup = new THREE.Group();
    this.portalGroup = new THREE.Group();
    this.scene.add(this.signGroup, this.portalGroup);

    this.ignitedTnts = []; // { mesh, endTime }
    this.emotes = [];      // { sprite, targetFn, life }
  }

  _clearGroup(g) {
    while (g.children.length > 0) {
      const ch = g.children[0];
      ch.material?.map?.dispose();
      ch.material?.dispose();
      g.remove(ch);
    }
  }

  syncSigns(signsObj) {
    this._clearGroup(this.signGroup);
    for (const s of Object.values(signsObj || {})) {
      const lines = String(s.text || '표지판').split('\n');
      const sp = makeBillboardSprite(lines, 'rgba(120, 72, 32, 0.92)', '#fde68a', '#ffffff', 1.85, 0.8);
      sp.position.set(s.x + 0.5, s.y + 1.35, s.z + 0.5);
      this.signGroup.add(sp);
    }
  }

  syncPortals(portalsObj) {
    this._clearGroup(this.portalGroup);
    for (const p of Object.values(portalsObj || {})) {
      const sp = makeBillboardSprite([`🌀 ${p.channel || '기본'}`], 'rgba(88, 28, 135, 0.85)', '#c084fc', '#f5d0fe', 1.5, 0.45);
      sp.position.set(p.x + 0.5, p.y + 1.45, p.z + 0.5);
      this.portalGroup.add(sp);
    }
  }

  igniteTNT(x, y, z) {
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1.06, 1.06, 1.06), mat);
    mesh.position.set(x + 0.5, y + 0.5, z + 0.5);
    this.scene.add(mesh);
    this.ignitedTnts.push({ mesh, mat, endTime: performance.now() + 2800 });
  }

  spawnEmote(emoji, label, posVec) {
    const sp = makeBillboardSprite([`${emoji} ${label}`], 'rgba(15, 23, 42, 0.86)', '#38bdf8', '#ffffff', 1.7, 0.55);
    sp.position.set(posVec.x, posVec.y + 2.6, posVec.z);
    this.scene.add(sp);
    this.emotes.push({ sprite: sp, life: 2.6 });
  }

  update(dt) {
    const now = performance.now();
    for (let i = this.ignitedTnts.length - 1; i >= 0; i--) {
      const t = this.ignitedTnts[i];
      if (now >= t.endTime) {
        this.scene.remove(t.mesh);
        t.mesh.geometry.dispose();
        t.mat.dispose();
        this.ignitedTnts.splice(i, 1);
      } else {
        const flash = Math.sin(now * 0.025) > 0;
        t.mat.color.setHex(flash ? 0xffffff : 0xef4444);
        const pulse = 1.04 + Math.abs(Math.sin(now * 0.015)) * 0.14;
        t.mesh.scale.setScalar(pulse);
      }
    }

    for (let i = this.emotes.length - 1; i >= 0; i--) {
      const e = this.emotes[i];
      e.life -= dt;
      if (e.life <= 0) {
        this.scene.remove(e.sprite);
        e.sprite.material.map.dispose();
        e.sprite.material.dispose();
        this.emotes.splice(i, 1);
      } else {
        e.sprite.position.y += dt * 0.45;
        e.sprite.material.opacity = Math.min(1, e.life);
      }
    }
  }
}
