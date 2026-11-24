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
    this.remoteGroup = new THREE.Group();
    this.beaconGroup = new THREE.Group();
    this.scene.add(this.signGroup, this.portalGroup, this.remoteGroup, this.beaconGroup);

    this.ignitedTnts = []; // { mesh, mat, light, x, y, z, startTime, endTime, sparkAcc }
    this.explosions = [];  // { flashLight, core, outer, ring, debris, smokes, age, maxAge }
    this.fuseSparks = [];  // { meshes, light, age, maxAge }
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

  setBeaconsVisible(visible) {
    this.isAdminView = !!visible;
    this.syncBeacons(this._lastBeacons || {});
  }

  syncBeacons(beaconsObj) {
    this._lastBeacons = beaconsObj || {};
    while (this.beaconGroup.children.length > 0) {
      const ch = this.beaconGroup.children[0];
      ch.geometry?.dispose?.();
      ch.material?.map?.dispose?.();
      ch.material?.dispose?.();
      this.beaconGroup.remove(ch);
    }
    for (const b of Object.values(this._lastBeacons)) {
      if (b.stealth && !this.isAdminView) continue;
      // Lightweight single 4-sided vertical sky beam (low GPU cost)
      const beamGeo = new THREE.BoxGeometry(0.22, 32, 0.22);
      const beamMat = new THREE.MeshBasicMaterial({
        color: b.stealth ? 0xc084fc : 0x38bdf8,
        transparent: true,
        opacity: b.stealth ? 0.36 : 0.45,
        depthWrite: false
      });
      const beam = new THREE.Mesh(beamGeo, beamMat);
      beam.position.set(b.x + 0.5, b.y + 17, b.z + 0.5);
      this.beaconGroup.add(beam);

      const sp = makeBillboardSprite(
        [b.stealth ? '👻 투명 비콘' : '🛡️ 보호 비콘'],
        b.stealth ? 'rgba(59, 7, 100, 0.86)' : 'rgba(15, 23, 42, 0.86)',
        b.stealth ? '#c084fc' : '#38bdf8',
        b.stealth ? '#f5d0fe' : '#fde047',
        1.45, 0.44
      );
      sp.position.set(b.x + 0.5, b.y + 1.55, b.z + 0.5);
      this.beaconGroup.add(sp);
    }
  }

  syncRemoteLinks(links) {
    this._clearGroup(this.remoteGroup);
    for (const key of links || []) {
      const [x, y, z] = String(key).split(',').map(Number);
      if (!Number.isFinite(x)) continue;
      const sp = makeBillboardSprite(['📡 원격 TNT'], 'rgba(127, 29, 29, 0.88)', '#ef4444', '#fef08a', 1.25, 0.42);
      sp.position.set(x + 0.5, y + 1.32, z + 0.5);
      this.remoteGroup.add(sp);
    }
  }

  burnFuse(x, y, z) {
    const cx = x + 0.5, cy = y + 0.12, cz = z + 0.5;
    const light = new THREE.PointLight(0xf97316, 2.8, 6, 1.6);
    light.position.set(cx, cy + 0.25, cz);
    this.scene.add(light);

    const sparks = [];
    const cols = [0xffffff, 0xfef08a, 0xf97316, 0xef4444];
    for (let i = 0; i < 8; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: cols[i % cols.length], transparent: true, opacity: 1 });
      const m = new THREE.Mesh(this._sparkGeo, mat);
      m.position.set(cx + (Math.random() - 0.5) * 0.25, cy, cz + (Math.random() - 0.5) * 0.25);
      m.scale.setScalar(0.55 + Math.random() * 0.45);
      this.scene.add(m);
      sparks.push({
        mesh: m, mat,
        vx: (Math.random() - 0.5) * 2.4,
        vy: 1.8 + Math.random() * 2.4,
        vz: (Math.random() - 0.5) * 2.4
      });
    }
    this.fuseSparks.push({ sparks, light, age: 0, maxAge: 0.32 });
  }

  igniteTNT(x, y, z, durationMs = 2800, colorHex = 0xef4444, lightHex = 0xff7a1a) {
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1.06, 1.06, 1.06), mat);
    mesh.position.set(x + 0.5, y + 0.5, z + 0.5);
    this.scene.add(mesh);

    const light = new THREE.PointLight(lightHex, 2.2, 8, 1.5);
    light.position.set(x + 0.5, y + 1.15, z + 0.5);
    this.scene.add(light);

    const now = performance.now();
    this.ignitedTnts.push({
      mesh, mat, light, colorHex,
      x: x + 0.5, y: y + 0.5, z: z + 0.5,
      startTime: now, endTime: now + Math.max(250, Number(durationMs) || 2800),
      sparkAcc: 0
    });
  }

  explodeFillBomb(x, y, z) {
    const cx = x + 0.5, cy = y + 0.5, cz = z + 0.5;
    const flashLight = new THREE.PointLight(0x4ade80, 12, 24, 1.35);
    flashLight.position.set(cx, cy + 0.5, cz);
    this.scene.add(flashLight);

    const coreMat = new THREE.MeshBasicMaterial({ color: 0xecfdf5, transparent: true, opacity: 0.92, depthWrite: false });
    const core = new THREE.Mesh(this._sphereGeo, coreMat);
    core.position.set(cx, cy, cz);
    core.scale.setScalar(0.5);
    this.scene.add(core);

    const outerMat = new THREE.MeshBasicMaterial({ color: 0x22c55e, transparent: true, opacity: 0.68, depthWrite: false });
    const outer = new THREE.Mesh(this._sphereGeo, outerMat);
    outer.position.set(cx, cy, cz);
    outer.scale.setScalar(0.8);
    this.scene.add(outer);

    const ringMat = new THREE.MeshBasicMaterial({ color: 0x86efac, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false });
    const ring = new THREE.Mesh(this._ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(cx, cy + 0.1, cz);
    ring.scale.setScalar(0.6);
    this.scene.add(ring);

    const debris = [];
    const cols = [0x4ade80, 0x22c55e, 0xa16207, 0x78350f, 0xbbf7d0];
    for (let i = 0; i < 32; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: cols[i % cols.length], transparent: true, opacity: 1 });
      const m = new THREE.Mesh(this._sparkGeo, mat);
      m.position.set(cx + (Math.random() - 0.5) * 0.8, cy + (Math.random() - 0.5) * 0.8, cz + (Math.random() - 0.5) * 0.8);
      m.scale.setScalar(0.8 + Math.random() * 0.9);
      this.scene.add(m);
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI * 0.7;
      const spd = 4 + Math.random() * 7;
      debris.push({
        mesh: m, mat,
        vx: Math.cos(theta) * Math.sin(phi) * spd,
        vy: Math.cos(phi) * spd + 3 + Math.random() * 3,
        vz: Math.sin(theta) * Math.sin(phi) * spd,
        spinX: (Math.random() - 0.5) * 10,
        spinY: (Math.random() - 0.5) * 10,
        life: 0.75 + Math.random() * 0.55,
        maxLife: 1.3
      });
    }

    const smokes = [];
    const dustCols = [0x92400e, 0x78350f, 0x16a34a, 0x15803d];
    for (let i = 0; i < 12; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: dustCols[i % dustCols.length], transparent: true, opacity: 0.7, depthWrite: false });
      const m = new THREE.Mesh(this._smokeGeo, mat);
      const ang = Math.random() * Math.PI * 2;
      const r = Math.random() * 2.0;
      m.position.set(cx + Math.cos(ang) * r, cy + Math.random() * 1.2, cz + Math.sin(ang) * r);
      const baseScale = 0.6 + Math.random() * 0.7;
      m.scale.setScalar(baseScale);
      this.scene.add(m);
      smokes.push({
        mesh: m, mat,
        vx: Math.cos(ang) * (0.6 + Math.random() * 1.4),
        vy: 1.4 + Math.random() * 2.2,
        vz: Math.sin(ang) * (0.6 + Math.random() * 1.4),
        baseScale,
        life: 1.0 + Math.random() * 0.5,
        maxLife: 1.5
      });
    }

    this.explosions.push({ flashLight, core, coreMat, outer, outerMat, ring, ringMat, debris, smokes, age: 0, maxAge: 1.6, isFill: true });
  }

  explodeWaterBomb(x, y, z) {
    const cx = x + 0.5, cy = y + 0.5, cz = z + 0.5;
    const flashLight = new THREE.PointLight(0x38bdf8, 12, 24, 1.35);
    flashLight.position.set(cx, cy + 0.5, cz);
    this.scene.add(flashLight);

    const coreMat = new THREE.MeshBasicMaterial({ color: 0xf0f9ff, transparent: true, opacity: 0.92, depthWrite: false });
    const core = new THREE.Mesh(this._sphereGeo, coreMat);
    core.position.set(cx, cy, cz);
    core.scale.setScalar(0.5);
    this.scene.add(core);

    const outerMat = new THREE.MeshBasicMaterial({ color: 0x0284c7, transparent: true, opacity: 0.65, depthWrite: false });
    const outer = new THREE.Mesh(this._sphereGeo, outerMat);
    outer.position.set(cx, cy, cz);
    outer.scale.setScalar(0.8);
    this.scene.add(outer);

    const ringMat = new THREE.MeshBasicMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.92, side: THREE.DoubleSide, depthWrite: false });
    const ring = new THREE.Mesh(this._ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(cx, cy + 0.1, cz);
    ring.scale.setScalar(0.6);
    this.scene.add(ring);

    const debris = [];
    const cols = [0xe0f2fe, 0x7dd3fc, 0x38bdf8, 0x0284c7, 0xffffff];
    for (let i = 0; i < 34; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: cols[i % cols.length], transparent: true, opacity: 0.95 });
      const m = new THREE.Mesh(this._sparkGeo, mat);
      m.position.set(cx + (Math.random() - 0.5) * 0.8, cy + (Math.random() - 0.5) * 0.8, cz + (Math.random() - 0.5) * 0.8);
      m.scale.setScalar(0.75 + Math.random() * 0.9);
      this.scene.add(m);
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI * 0.72;
      const spd = 4.5 + Math.random() * 7.5;
      debris.push({
        mesh: m, mat,
        vx: Math.cos(theta) * Math.sin(phi) * spd,
        vy: Math.cos(phi) * spd + 3.2 + Math.random() * 3,
        vz: Math.sin(theta) * Math.sin(phi) * spd,
        spinX: (Math.random() - 0.5) * 10,
        spinY: (Math.random() - 0.5) * 10,
        life: 0.75 + Math.random() * 0.55,
        maxLife: 1.3
      });
    }

    const smokes = [];
    const mistCols = [0xbae6fd, 0x7dd3fc, 0x38bdf8, 0xe0f2fe];
    for (let i = 0; i < 12; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: mistCols[i % mistCols.length], transparent: true, opacity: 0.6, depthWrite: false });
      const m = new THREE.Mesh(this._smokeGeo, mat);
      const ang = Math.random() * Math.PI * 2;
      const r = Math.random() * 2.0;
      m.position.set(cx + Math.cos(ang) * r, cy + Math.random() * 1.2, cz + Math.sin(ang) * r);
      const baseScale = 0.65 + Math.random() * 0.75;
      m.scale.setScalar(baseScale);
      this.scene.add(m);
      smokes.push({
        mesh: m, mat,
        vx: Math.cos(ang) * (0.6 + Math.random() * 1.4),
        vy: 1.4 + Math.random() * 2.0,
        vz: Math.sin(ang) * (0.6 + Math.random() * 1.4),
        baseScale,
        life: 1.0 + Math.random() * 0.5,
        maxLife: 1.5
      });
    }

    this.explosions.push({ flashLight, core, coreMat, outer, outerMat, ring, ringMat, debris, smokes, age: 0, maxAge: 1.6, isFill: true });
  }

  explodeFlattenBomb(x, y, z) {
    const cx = x + 0.5, cy = y + 1.5, cz = z + 0.5;
    const flashLight = new THREE.PointLight(0xfacc15, 13, 26, 1.35);
    flashLight.position.set(cx, cy + 0.5, cz);
    this.scene.add(flashLight);

    const coreMat = new THREE.MeshBasicMaterial({ color: 0xfefce8, transparent: true, opacity: 0.94, depthWrite: false });
    const core = new THREE.Mesh(this._sphereGeo, coreMat);
    core.position.set(cx, cy, cz);
    core.scale.setScalar(0.5);
    this.scene.add(core);

    const outerMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.72, depthWrite: false });
    const outer = new THREE.Mesh(this._sphereGeo, outerMat);
    outer.position.set(cx, cy, cz);
    outer.scale.setScalar(0.9);
    this.scene.add(outer);

    const ringMat = new THREE.MeshBasicMaterial({ color: 0xfde047, transparent: true, opacity: 0.94, side: THREE.DoubleSide, depthWrite: false });
    const ring = new THREE.Mesh(this._ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(cx, y + 0.15, cz);
    ring.scale.setScalar(0.7);
    this.scene.add(ring);

    const debris = [];
    const cols = [0xfef08a, 0xfacc15, 0xf59e0b, 0x94a3b8, 0x475569];
    for (let i = 0; i < 36; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: cols[i % cols.length], transparent: true, opacity: 1 });
      const m = new THREE.Mesh(this._sparkGeo, mat);
      m.position.set(cx + (Math.random() - 0.5) * 2.2, cy + (Math.random() - 0.5) * 1.6, cz + (Math.random() - 0.5) * 2.2);
      m.scale.setScalar(0.8 + Math.random() * 1.0);
      this.scene.add(m);
      const theta = Math.random() * Math.PI * 2;
      const spd = 5 + Math.random() * 9;
      debris.push({
        mesh: m, mat,
        vx: Math.cos(theta) * spd,
        vy: 3 + Math.random() * 6,
        vz: Math.sin(theta) * spd,
        spinX: (Math.random() - 0.5) * 12,
        spinY: (Math.random() - 0.5) * 12,
        life: 0.75 + Math.random() * 0.55,
        maxLife: 1.3
      });
    }

    const smokes = [];
    const dustCols = [0x78716c, 0x57534e, 0xa8a29e, 0xf59e0b];
    for (let i = 0; i < 14; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: dustCols[i % dustCols.length], transparent: true, opacity: 0.65, depthWrite: false });
      const m = new THREE.Mesh(this._smokeGeo, mat);
      const ang = Math.random() * Math.PI * 2;
      const r = Math.random() * 2.4;
      m.position.set(cx + Math.cos(ang) * r, y + 0.5 + Math.random() * 2.0, cz + Math.sin(ang) * r);
      const baseScale = 0.7 + Math.random() * 0.75;
      m.scale.setScalar(baseScale);
      this.scene.add(m);
      smokes.push({
        mesh: m, mat,
        vx: Math.cos(ang) * (0.8 + Math.random() * 1.5),
        vy: 1.4 + Math.random() * 2.2,
        vz: Math.sin(ang) * (0.8 + Math.random() * 1.5),
        baseScale,
        life: 1.0 + Math.random() * 0.5,
        maxLife: 1.5
      });
    }

    this.explosions.push({ flashLight, core, coreMat, outer, outerMat, ring, ringMat, debris, smokes, age: 0, maxAge: 1.65, isFill: true });
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
        t.mat.color.setHex(flash ? 0xffffff : (t.colorHex || 0xef4444));
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
      if (!ex.isFill && outerP > 0.45) ex.outerMat.color.setHex(0xdc2626);

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

    // Update burning fuse spark bursts
    for (let i = this.fuseSparks.length - 1; i >= 0; i--) {
      const f = this.fuseSparks[i];
      f.age += dt;
      const p = Math.min(1, f.age / f.maxAge);
      f.light.intensity = 2.8 * (1 - p);
      for (const s of f.sparks) {
        s.vy -= 9 * dt;
        s.mesh.position.x += s.vx * dt;
        s.mesh.position.y += s.vy * dt;
        s.mesh.position.z += s.vz * dt;
        s.mat.opacity = 1 - p;
      }
      if (f.age >= f.maxAge) {
        this.scene.remove(f.light);
        for (const s of f.sparks) { this.scene.remove(s.mesh); s.mat.dispose(); }
        this.fuseSparks.splice(i, 1);
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

    this._updateElevator();
  }

  // ---- Real Animated 3D Elevator Cab (Happiness Plus Center) ----
  syncElevator(state) {
    if (!state || !state.config) {
      if (this._elevGroup) {
        this.scene.remove(this._elevGroup);
        this._elevGroup = null;
      }
      this._elevState = null;
      return;
    }
    const cfg = state.config;
    if (!this._elevGroup) {
      const g = new THREE.Group();
      const w = cfg.maxX - cfg.minX; // 2
      const d = cfg.maxZ - cfg.minZ; // 3
      const cx = (cfg.minX + cfg.maxX) * 0.5;
      const cz = (cfg.minZ + cfg.maxZ) * 0.5;

      // Brushed metal cab floor (top surface flush at local y = 1.0!)
      const floorMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.45, roughness: 0.35 });
      const floorMesh = new THREE.Mesh(new THREE.BoxGeometry(w - 0.04, 0.24, d - 0.04), floorMat);
      floorMesh.position.set(cx, 0.88, cz);
      g.add(floorMesh);

      // Dark trim border around cab floor
      const trimMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.5, roughness: 0.4 });
      const backPanel = new THREE.Mesh(new THREE.BoxGeometry(w - 0.08, 3.0, 0.08), new THREE.MeshStandardMaterial({
        color: 0xcbd5e1, metalness: 0.55, roughness: 0.25
      }));
      backPanel.position.set(cx, 2.5, cfg.minZ + 0.08);
      g.add(backPanel);

      // Side handrails
      const railGeo = new THREE.BoxGeometry(0.08, 0.08, d - 0.3);
      const railL = new THREE.Mesh(railGeo, trimMat);
      railL.position.set(cfg.minX + 0.1, 1.95, cz);
      const railR = new THREE.Mesh(railGeo, trimMat);
      railR.position.set(cfg.maxX - 0.1, 1.95, cz);
      g.add(railL, railR);

      // Glowing cab ceiling panel + warm interior light
      const ceilMesh = new THREE.Mesh(new THREE.BoxGeometry(w - 0.06, 0.14, d - 0.06), new THREE.MeshBasicMaterial({ color: 0xe0f2fe }));
      ceilMesh.position.set(cx, 4.05, cz);
      g.add(ceilMesh);

      // Cyan LED accent bar on back wall
      const ledBar = new THREE.Mesh(new THREE.BoxGeometry(w - 0.4, 0.12, 0.06), new THREE.MeshBasicMaterial({ color: 0x38bdf8 }));
      ledBar.position.set(cx, 3.6, cfg.minZ + 0.14);
      g.add(ledBar);

      this.scene.add(g);
      this._elevGroup = g;
    }

    this._elevState = {
      ...state,
      receivedAt: performance.now()
    };
    this._updateElevator();
  }

  _updateElevator() {
    if (!this._elevState || !this._elevGroup) return;
    const s = this._elevState;
    let y = s.targetY;
    if (s.moving && s.durationMs > 0) {
      const elapsed = s.elapsedMs + (performance.now() - s.receivedAt);
      const t = Math.max(0, Math.min(1, elapsed / s.durationMs));
      const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      y = s.startY + (s.targetY - s.startY) * ease;
    }
    this._elevCurrentY = y;
    this._elevGroup.position.y = y;
  }

  getElevatorTopY() {
    if (!this._elevState) return null;
    return (this._elevCurrentY ?? this._elevState.targetY) + 1.005;
  }

  isElevatorMoving() {
    return !!(this._elevState && this._elevState.moving);
  }

  getElevatorState() {
    return this._elevState || null;
  }

  isInsideElevator(pos) {
    if (!this._elevState || !this._elevState.config) return false;
    const c = this._elevState.config;
    return pos.x >= c.minX - 0.1 && pos.x <= c.maxX + 0.1 &&
           pos.z >= c.minZ - 0.1 && pos.z <= c.maxZ + 0.15;
  }

  isNearElevator(pos) {
    if (!this._elevState || !this._elevState.config) return false;
    const c = this._elevState.config;
    return pos.x >= c.minX - 1.5 && pos.x <= c.maxX + 1.5 &&
           pos.z >= c.minZ - 0.2 && pos.z <= c.maxZ + 2.5;
  }

  // ---- Iconic Navy-Blue Freestanding Pylon Sign (1F Entrance, Photo 6!) ----
  syncCenterPylon(show) {
    if (!show) {
      if (this._pylonGroup) {
        this.scene.remove(this._pylonGroup);
        this._pylonGroup = null;
      }
      return;
    }
    if (this._pylonGroup) return;

    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 1400;
    const ctx = c.getContext('2d');

    // Deep navy body background
    ctx.fillStyle = '#1b2a4a';
    ctx.fillRect(0, 0, 512, 1400);

    // Top circular white medallion ("행복플러스")
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(256, 175, 92, 0, Math.PI * 2);
    ctx.fill();
    // Colorful ribbon accent
    ctx.strokeStyle = '#e11d48';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(278, 152, 22, 0.2, Math.PI * 1.4);
    ctx.stroke();
    ctx.strokeStyle = '#0ea5e9';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(245, 160, 20, Math.PI * 0.9, Math.PI * 2.1);
    ctx.stroke();
    ctx.fillStyle = '#0f3b7a';
    ctx.font = 'bold 42px Pretendard, Malgun Gothic, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('행복플러스', 256, 198);

    // Rounded white directory board
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    ctx.roundRect(42, 315, 428, 760, 26);
    ctx.fill();

    const drawBadge = (x, y, w, h, color, lines) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, 14);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 30px Pretendard, Malgun Gothic, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const step = h / (lines.length + 1);
      lines.forEach((ln, i) => ctx.fillText(ln, x + w / 2, y + step * (i + 1)));
    };

    const drawDivider = (y) => {
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(64, y);
      ctx.lineTo(448, y);
      ctx.stroke();
    };

    // 6F
    drawBadge(66, 355, 76, 95, '#1b7a78', ['6F']);
    ctx.fillStyle = '#475569';
    ctx.font = 'bold 20px Pretendard, Malgun Gothic, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('서울특별시', 162, 386);
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 30px Pretendard, Malgun Gothic, sans-serif';
    ctx.fillText('장애인권익옹호기관', 162, 424);
    drawDivider(478);

    // 5F / 4F / 3F
    drawBadge(66, 505, 76, 155, '#5d7b3a', ['5F', '4F', '3F']);
    ctx.fillStyle = '#475569';
    ctx.font = 'bold 20px Pretendard, Malgun Gothic, sans-serif';
    ctx.fillText('서울특별시', 162, 566);
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 32px Pretendard, Malgun Gothic, sans-serif';
    ctx.fillText('장애인일자리센터', 162, 606);
    drawDivider(690);

    // 2F
    drawBadge(66, 718, 76, 130, '#7c5295', ['2F']);
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 28px Pretendard, Malgun Gothic, sans-serif';
    ctx.fillText('서울시그룹홈지원센터', 162, 748);
    ctx.fillStyle = '#475569';
    ctx.font = 'bold 17px Pretendard, Malgun Gothic, sans-serif';
    ctx.fillText('서울시장애인생산품판매시설', 162, 792);
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 28px Pretendard, Malgun Gothic, sans-serif';
    ctx.fillText('경영지원센터', 162, 826);
    drawDivider(878);

    // 1F
    drawBadge(66, 908, 76, 118, '#d95b5b', ['1F']);
    ctx.fillStyle = '#475569';
    ctx.font = 'bold 20px Pretendard, Malgun Gothic, sans-serif';
    ctx.fillText('서울특별시  IL-RO(일로)', 162, 948);
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 32px Pretendard, Malgun Gothic, sans-serif';
    ctx.fillText('장애인일자리센터', 162, 990);

    // Bottom footer on navy base
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.arc(82, 1152, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f43f5e';
    ctx.beginPath();
    ctx.arc(98, 1142, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 28px Pretendard, Malgun Gothic, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('서울시립장애인행복플러스센터', 120, 1152);

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;

    const navyMat = new THREE.MeshStandardMaterial({ color: 0x1b2a4a, roughness: 0.45, metalness: 0.25 });
    const faceMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.35, metalness: 0.1 });

    // BoxGeometry material order: +X, -X, +Y, -Y, +Z, -Z
    // Front face faces -X (toward entering player & street), back face faces +X
    const pylon = new THREE.Mesh(
      new THREE.BoxGeometry(0.46, 4.1, 1.42),
      [faceMat, faceMat, navyMat, navyMat, navyMat, navyMat]
    );
    pylon.position.set(0, 2.05, 0);

    // Sleek concrete base plinth
    const basePlinth = new THREE.Mesh(
      new THREE.BoxGeometry(0.62, 0.22, 1.58),
      new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.7 })
    );
    basePlinth.position.set(0, 0.11, 0);

    const group = new THREE.Group();
    group.add(pylon, basePlinth);
    // Positioned right next to the 1F entrance walkway & tactile paving!
    group.position.set(-25.2, 5.0, -0.5);
    this.scene.add(group);
    this._pylonGroup = group;
  }
}
