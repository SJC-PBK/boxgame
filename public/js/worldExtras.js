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

    this.ignitedTnts = []; // { mesh, mat, light, x, y, z, startTime, endTime, sparkAcc }
    this.explosions = [];  // { flashLight, core, outer, ring, debris, smokes, age, maxAge }
    this.emotes = [];      // { sprite, targetFn, life }
    this._sparkGeo = new THREE.BoxGeometry(0.14, 0.14, 0.14);
    this._smokeGeo = new THREE.BoxGeometry(0.65, 0.65, 0.65);
    this._sphereGeo = new THREE.SphereGeometry(1, 14, 10);
    this._ringGeo = new THREE.RingGeometry(0.75, 1.0, 28);
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

    const light = new THREE.PointLight(0xff7a1a, 2.2, 8, 1.5);
    light.position.set(x + 0.5, y + 1.15, z + 0.5);
    this.scene.add(light);

    const now = performance.now();
    this.ignitedTnts.push({
      mesh, mat, light,
      x: x + 0.5, y: y + 0.5, z: z + 0.5,
      startTime: now, endTime: now + 2950,
      sparkAcc: 0
    });
  }

  explodeTNT(x, y, z) {
    const cx = x + 0.5, cy = y + 0.5, cz = z + 0.5;

    // 1. Intense blast flash light (illuminates crater & night sky!)
    const flashLight = new THREE.PointLight(0xffaa44, 14, 28, 1.35);
    flashLight.position.set(cx, cy + 0.5, cz);
    this.scene.add(flashLight);

    // 2. Inner white-yellow fireball core + outer fiery orange sphere
    const coreMat = new THREE.MeshBasicMaterial({ color: 0xfffbeb, transparent: true, opacity: 0.96, depthWrite: false });
    const core = new THREE.Mesh(this._sphereGeo, coreMat);
    core.position.set(cx, cy, cz);
    core.scale.setScalar(0.4);
    this.scene.add(core);

    const outerMat = new THREE.MeshBasicMaterial({ color: 0xf97316, transparent: true, opacity: 0.78, depthWrite: false });
    const outer = new THREE.Mesh(this._sphereGeo, outerMat);
    outer.position.set(cx, cy, cz);
    outer.scale.setScalar(0.6);
    this.scene.add(outer);

    // 3. Expanding horizontal shockwave ring
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xfde047, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false });
    const ring = new THREE.Mesh(this._ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(cx, cy + 0.1, cz);
    ring.scale.setScalar(0.5);
    this.scene.add(ring);

    // 4. Radial fiery embers & glowing sparks (36 cubes)
    const debris = [];
    const sparkColors = [0xffffff, 0xfef08a, 0xfacc15, 0xf97316, 0xef4444];
    for (let i = 0; i < 36; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: sparkColors[i % sparkColors.length],
        transparent: true,
        opacity: 1
      });
      const m = new THREE.Mesh(this._sparkGeo, mat);
      m.position.set(cx + (Math.random() - 0.5) * 0.6, cy + (Math.random() - 0.5) * 0.6, cz + (Math.random() - 0.5) * 0.6);
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI * 0.75;
      const spd = 6 + Math.random() * 11;
      const s = 0.7 + Math.random() * 1.1;
      m.scale.setScalar(s);
      this.scene.add(m);
      debris.push({
        mesh: m, mat,
        vx: Math.cos(theta) * Math.sin(phi) * spd,
        vy: Math.cos(phi) * spd + 3.5 + Math.random() * 4,
        vz: Math.sin(theta) * Math.sin(phi) * spd,
        spinX: (Math.random() - 0.5) * 12,
        spinY: (Math.random() - 0.5) * 12,
        life: 0.75 + Math.random() * 0.65,
        maxLife: 1.4
      });
    }

    // 5. Rising billowing mushroom smoke puffs (16 voxel cubes)
    const smokes = [];
    const smokeColors = [0x334155, 0x475569, 0x1e293b, 0x64748b];
    for (let i = 0; i < 16; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: smokeColors[i % smokeColors.length],
        transparent: true,
        opacity: 0.78,
        depthWrite: false
      });
      const m = new THREE.Mesh(this._smokeGeo, mat);
      const ang = Math.random() * Math.PI * 2;
      const r = Math.random() * 1.6;
      m.position.set(cx + Math.cos(ang) * r, cy + Math.random() * 1.0, cz + Math.sin(ang) * r);
      const baseScale = 0.7 + Math.random() * 0.9;
      m.scale.setScalar(baseScale);
      this.scene.add(m);
      smokes.push({
        mesh: m, mat,
        vx: Math.cos(ang) * (0.8 + Math.random() * 1.8),
        vy: 1.8 + Math.random() * 2.8,
        vz: Math.sin(ang) * (0.8 + Math.random() * 1.8),
        baseScale,
        life: 1.1 + Math.random() * 0.7,
        maxLife: 1.8
      });
    }

    this.explosions.push({ flashLight, core, coreMat, outer, outerMat, ring, ringMat, debris, smokes, age: 0, maxAge: 1.85 });
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
        this.scene.remove(t.light);
        t.mesh.geometry.dispose();
        t.mat.dispose();
        this.ignitedTnts.splice(i, 1);
      } else {
        const prog = Math.max(0, Math.min(1, (now - t.startTime) / (t.endTime - t.startTime)));
        // Accelerate flashing & swelling as detonation nears!
        const freq = 0.015 + prog * 0.065;
        const flash = Math.sin(now * freq) > 0;
        t.mat.color.setHex(flash ? 0xffffff : 0xef4444);
        t.mat.opacity = 0.55 + prog * 0.4;
        const swell = 1.03 + prog * 0.28 + Math.abs(Math.sin(now * freq * 0.8)) * 0.14;
        t.mesh.scale.setScalar(swell);
        t.light.intensity = (flash ? 3.2 : 1.0) + prog * 2.5;
      }
    }

    // Update multi-stage TNT explosions
    for (let i = this.explosions.length - 1; i >= 0; i--) {
      const ex = this.explosions[i];
      ex.age += dt;

      // Flash light decays rapidly over 0.65s
      const flashT = Math.max(0, 1 - ex.age / 0.65);
      ex.flashLight.intensity = 14 * flashT * flashT;

      // Core & outer fireballs expand & fade over 0.45s / 0.65s
      const coreP = Math.min(1, ex.age / 0.42);
      ex.core.visible = coreP < 1;
      ex.core.scale.setScalar(0.4 + coreP * 3.4);
      ex.coreMat.opacity = (1 - coreP) * 0.95;

      const outerP = Math.min(1, ex.age / 0.65);
      ex.outer.visible = outerP < 1;
      ex.outer.scale.setScalar(0.6 + outerP * 4.5);
      ex.outerMat.opacity = (1 - outerP) * 0.72;
      if (outerP > 0.45) ex.outerMat.color.setHex(0xdc2626);

      // Shockwave ring expands quickly over 0.55s
      const ringP = Math.min(1, ex.age / 0.55);
      ex.ring.visible = ringP < 1;
      ex.ring.scale.setScalar(0.5 + ringP * 8.5);
      ex.ringMat.opacity = (1 - ringP) * 0.85;

      // Sparks / fiery debris
      for (const d of ex.debris) {
        if (d.life <= 0) { d.mesh.visible = false; continue; }
        d.life -= dt;
        d.vy -= 18 * dt;
        d.mesh.position.x += d.vx * dt;
        d.mesh.position.y += d.vy * dt;
        d.mesh.position.z += d.vz * dt;
        d.mesh.rotation.x += d.spinX * dt;
        d.mesh.rotation.y += d.spinY * dt;
        d.mat.opacity = Math.max(0, d.life / 0.6);
      }

      // Billowing smoke puffs
      for (const s of ex.smokes) {
        if (s.life <= 0) { s.mesh.visible = false; continue; }
        s.life -= dt;
        s.vx *= 0.96;
        s.vz *= 0.96;
        s.vy *= 0.985;
        s.mesh.position.x += s.vx * dt;
        s.mesh.position.y += s.vy * dt;
        s.mesh.position.z += s.vz * dt;
        s.mesh.rotation.y += dt * 0.8;
        const p = 1 - Math.max(0, s.life / s.maxLife);
        s.mesh.scale.setScalar(s.baseScale * (1 + p * 2.1));
        s.mat.opacity = Math.max(0, (1 - p) * 0.7);
      }

      if (ex.age >= ex.maxAge) {
        this.scene.remove(ex.flashLight, ex.core, ex.outer, ex.ring);
        ex.coreMat.dispose();
        ex.outerMat.dispose();
        ex.ringMat.dispose();
        for (const d of ex.debris) { this.scene.remove(d.mesh); d.mat.dispose(); }
        for (const s of ex.smokes) { this.scene.remove(s.mesh); s.mat.dispose(); }
        this.explosions.splice(i, 1);
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
