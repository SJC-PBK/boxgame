import * as THREE from '../vendor/three/three.module.min.js';

function makeCelestialTexture(isSun) {
  const c = document.createElement('canvas');
  c.width = 32; c.height = 32;
  const ctx = c.getContext('2d');
  if (isSun) {
    // Warm glowing halo around bright sun
    const grad = ctx.createRadialGradient(16, 16, 4, 16, 16, 16);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.42, '#fef08a');
    grad.addColorStop(0.7, 'rgba(253, 224, 71, 0.55)');
    grad.addColorStop(1, 'rgba(253, 224, 71, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 32, 32);
    ctx.fillStyle = '#fef9c3';
    ctx.fillRect(9, 9, 14, 14);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(11, 11, 10, 10);
  } else {
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(4, 4, 24, 24);
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(7, 8, 6, 6);
    ctx.fillRect(17, 15, 6, 5);
    ctx.fillRect(11, 20, 5, 4);
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(8, 9, 3, 3);
    ctx.fillRect(18, 16, 3, 3);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Generate a warm, kid-friendly 360° panoramic sky + distant mountains + friendly town + green meadow backdrop!
function makePanoramaTexture(mode) {
  const W = 1024;
  const H = 512;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');

  // 1. Soft multi-stop sky gradient (top y=0 zenith -> y=256 horizon -> y=512 ground nadir)
  const skyGrad = ctx.createLinearGradient(0, 0, 0, H);
  if (mode === 'day') {
    skyGrad.addColorStop(0.00, '#3b9be8');
    skyGrad.addColorStop(0.28, '#7cc8f8');
    skyGrad.addColorStop(0.46, '#c7ecff');
    skyGrad.addColorStop(0.50, '#eef9ff');
    skyGrad.addColorStop(0.54, '#a7e0a8');
    skyGrad.addColorStop(0.68, '#7cc67e');
    skyGrad.addColorStop(1.00, '#5ea868');
  } else if (mode === 'sunset') {
    // Cozy pastel storybook sunset (lavender -> warm rose -> golden peach -> warm meadow)
    skyGrad.addColorStop(0.00, '#5a63b8');
    skyGrad.addColorStop(0.22, '#a78bfa');
    skyGrad.addColorStop(0.37, '#f4978e');
    skyGrad.addColorStop(0.46, '#fcd5a5');
    skyGrad.addColorStop(0.50, '#fef3c7');
    skyGrad.addColorStop(0.55, '#c8b288');
    skyGrad.addColorStop(0.72, '#8b9972');
    skyGrad.addColorStop(1.00, '#5f7359');
  } else {
    // Calm starry night sky with cozy deep blue-indigo horizon
    skyGrad.addColorStop(0.00, '#040814');
    skyGrad.addColorStop(0.32, '#0c1733');
    skyGrad.addColorStop(0.48, '#1b2c4e');
    skyGrad.addColorStop(0.53, '#172838');
    skyGrad.addColorStop(1.00, '#0f1c26');
  }
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, W, H);

  // Soft wispy high clouds painted into day & sunset sky
  if (mode !== 'night') {
    ctx.fillStyle = mode === 'day' ? 'rgba(255,255,255,0.45)' : 'rgba(255,237,213,0.48)';
    for (let i = 0; i < 18; i++) {
      const cx = (i * 59 + 25) % W;
      const cy = 95 + ((i * 37) % 105);
      const rw = 34 + (i % 4) * 16;
      const rh = 10 + (i % 3) * 4;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rw, rh, 0, 0, Math.PI * 2);
      ctx.ellipse(cx - rw * 0.45, cy + 4, rw * 0.55, rh * 0.8, 0, 0, Math.PI * 2);
      ctx.ellipse(cx + rw * 0.45, cy + 3, rw * 0.6, rh * 0.78, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Gentle pastel rainbow arc in daytime sky!
  if (mode === 'day') {
    const rbCols = [
      'rgba(248,113,113,0.16)', 'rgba(251,146,60,0.16)', 'rgba(250,204,21,0.16)',
      'rgba(74,222,128,0.16)', 'rgba(96,165,250,0.16)', 'rgba(167,139,250,0.16)'
    ];
    rbCols.forEach((col, idx) => {
      ctx.strokeStyle = col;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(260, 256, 128 - idx * 4, Math.PI * 1.05, Math.PI * 1.95);
      ctx.stroke();
    });
  }

  // 2. Seamless periodic distant mountain range (wraps cleanly at x=0 and x=W!)
  const drawWaveHill = (baseY, amp1, amp2, freq1, freq2, phase, color) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += 4) {
      const t = (x / W) * Math.PI * 2;
      const y = baseY - Math.sin(t * freq1 + phase) * amp1 - Math.cos(t * freq2 + phase * 1.7) * amp2;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fill();
  };

  // Far misty mountains
  drawWaveHill(
    244, 24, 12, 3, 7, 0.4,
    mode === 'day' ? '#93c5d8' : (mode === 'sunset' ? '#9d8ab8' : '#162542')
  );
  // Mid rolling hills
  drawWaveHill(
    252, 16, 8, 4, 9, 1.9,
    mode === 'day' ? '#78b88c' : (mode === 'sunset' ? '#8c7e8c' : '#132636')
  );

  // 3. Friendly distant town / Seoul-style buildings & trees silhouette along horizon
  const bldgColor = mode === 'day' ? '#8ca8b8' : (mode === 'sunset' ? '#7b6c80' : '#132036');
  const bldgLight = mode === 'day' ? '#b6cddb' : (mode === 'sunset' ? '#b08f92' : '#1d2f4d');
  for (let i = 0; i < 42; i++) {
    const bx = Math.floor((i * 24.4 + ((i * 13) % 7)) % (W - 20));
    const bw = 10 + (i % 4) * 5;
    const bh = 12 + ((i * 19) % 26);
    const by = 262 - bh;
    ctx.fillStyle = (i % 2 === 0) ? bldgColor : bldgLight;
    ctx.fillRect(bx, by, bw, bh + 10);

    // Tiny cozy windows (warm glowing yellow at sunset & night, soft sky reflection at day)
    ctx.fillStyle = mode === 'day'
      ? 'rgba(224,242,254,0.55)'
      : (mode === 'sunset' ? 'rgba(254,240,138,0.65)' : 'rgba(253,224,71,0.72)');
    for (let wy = by + 3; wy < 258; wy += 5) {
      for (let wx = bx + 2; wx < bx + bw - 3; wx += 4) {
        if (mode === 'night' && ((wx + wy + i) % 3 === 0)) continue;
        ctx.fillRect(wx, wy, 2, 3);
      }
    }
  }

  // 4. Foreground soft green treeline & sunlit meadow covering everything below the horizon!
  drawWaveHill(
    264, 7, 4, 6, 13, 0.9,
    mode === 'day' ? '#68b674' : (mode === 'sunset' ? '#6f8764' : '#112622')
  );
  drawWaveHill(
    274, 4, 3, 5, 11, 2.5,
    mode === 'day' ? '#5ea868' : (mode === 'sunset' ? '#5f7359' : '#0f1f1f')
  );

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

export class SkySystem {
  constructor(scene, hemiLight, dirLight) {
    this.scene = scene;
    this.hemiLight = hemiLight;
    this.dirLight = dirLight;
    this.time = 0.22; // 0..1 (0=dawn, 0.25=noon, 0.5=sunset, 0.75=midnight)

    this.group = new THREE.Group();
    this.scene.add(this.group);

    // 360° Scenic Panoramic Sky Domes (Day, Sunset, Night — smoothly blended so there is NEVER an empty scary void!)
    const domeGeo = new THREE.SphereGeometry(158, 32, 20);
    this.dayDomeMat = new THREE.MeshBasicMaterial({
      map: makePanoramaTexture('day'), side: THREE.BackSide, fog: false, depthWrite: false, transparent: true, opacity: 1
    });
    this.sunsetDomeMat = new THREE.MeshBasicMaterial({
      map: makePanoramaTexture('sunset'), side: THREE.BackSide, fog: false, depthWrite: false, transparent: true, opacity: 0
    });
    this.nightDomeMat = new THREE.MeshBasicMaterial({
      map: makePanoramaTexture('night'), side: THREE.BackSide, fog: false, depthWrite: false, transparent: true, opacity: 0
    });
    this.dayDome = new THREE.Mesh(domeGeo, this.dayDomeMat);
    this.sunsetDome = new THREE.Mesh(domeGeo, this.sunsetDomeMat);
    this.nightDome = new THREE.Mesh(domeGeo, this.nightDomeMat);
    this.dayDome.renderOrder = -12;
    this.sunsetDome.renderOrder = -11;
    this.nightDome.renderOrder = -10;
    this.group.add(this.dayDome, this.sunsetDome, this.nightDome);

    // Sun mesh (warm glowing sun)
    this.sun = new THREE.Mesh(
      new THREE.PlaneGeometry(22, 22),
      new THREE.MeshBasicMaterial({ map: makeCelestialTexture(true), side: THREE.DoubleSide, transparent: true, fog: false, depthWrite: false })
    );
    this.group.add(this.sun);

    // Moon mesh
    this.moon = new THREE.Mesh(
      new THREE.PlaneGeometry(14, 14),
      new THREE.MeshBasicMaterial({ map: makeCelestialTexture(false), side: THREE.DoubleSide, transparent: true, fog: false, depthWrite: false })
    );
    this.group.add(this.moon);

    // Fluffy 3D Drifting Clouds (warm & playful sky presence during day & sunset!)
    this.cloudGroup = new THREE.Group();
    this.cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.84, fog: false });
    this.clouds = [];
    const puffGeo = new THREE.BoxGeometry(1, 1, 1);
    for (let i = 0; i < 24; i++) {
      const cg = new THREE.Group();
      const ang = (i / 24) * Math.PI * 2 + (i % 3) * 0.14;
      const dist = 42 + (i % 5) * 16;
      const y = 38 + (i % 4) * 6;
      const mainW = 10 + (i % 4) * 4;
      const mainD = 6 + (i % 3) * 3;
      const p1 = new THREE.Mesh(puffGeo, this.cloudMat);
      p1.scale.set(mainW, 2.4, mainD);
      const p2 = new THREE.Mesh(puffGeo, this.cloudMat);
      p2.scale.set(mainW * 0.65, 2.0, mainD * 0.8);
      p2.position.set(mainW * 0.25, 1.3, 0.5);
      const p3 = new THREE.Mesh(puffGeo, this.cloudMat);
      p3.scale.set(mainW * 0.55, 1.8, mainD * 0.75);
      p3.position.set(-mainW * 0.3, 0.9, -0.4);
      cg.add(p1, p2, p3);
      cg.position.set(Math.cos(ang) * dist, y, Math.sin(ang) * dist);
      this.cloudGroup.add(cg);
      this.clouds.push({ mesh: cg, speed: 0.7 + (i % 4) * 0.28, baseY: y });
    }
    this.group.add(this.cloudGroup);

    // Night starfield
    const starPositions = [];
    for (let i = 0; i < 280; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 0.85 + 0.15); // upper hemisphere
      const r = 135;
      starPositions.push(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.cos(phi),
        r * Math.sin(phi) * Math.sin(theta)
      );
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));
    this.starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.4, transparent: true, opacity: 0, fog: false });
    this.stars = new THREE.Points(starGeo, this.starMat);
    this.group.add(this.stars);

    this.colDay = new THREE.Color('#a7dbf8');
    this.colSunset = new THREE.Color('#f6b48e');
    this.colNight = new THREE.Color('#091328');
    this.colUnderground = new THREE.Color('#04070f');
    this.colRain = new THREE.Color('#64748b');
    this.colCloudDay = new THREE.Color('#ffffff');
    this.colCloudSunset = new THREE.Color('#ffe4c4');
    this.colCloudNight = new THREE.Color('#334155');
    this.curSky = new THREE.Color();
    this.dayLight = 1;

    // Dynamic 3D Weather particles (Rain & Snow)
    this.weather = 'clear';
    this.weatherCount = 450;
    const wPos = new Float32Array(this.weatherCount * 3);
    for (let i = 0; i < this.weatherCount; i++) {
      wPos[i * 3] = (Math.random() - 0.5) * 44;
      wPos[i * 3 + 1] = Math.random() * 26;
      wPos[i * 3 + 2] = (Math.random() - 0.5) * 44;
    }
    this.weatherGeo = new THREE.BufferGeometry();
    this.weatherGeo.setAttribute('position', new THREE.BufferAttribute(wPos, 3));
    this.weatherMat = new THREE.PointsMaterial({ color: 0x93c5fd, size: 0.28, transparent: true, opacity: 0.78 });
    this.weatherPoints = new THREE.Points(this.weatherGeo, this.weatherMat);
    this.weatherPoints.visible = false;
    this.scene.add(this.weatherPoints);
  }

  setWeather(w) {
    this.weather = ['clear', 'rain', 'snow'].includes(w) ? w : 'clear';
    this.weatherPoints.visible = this.weather !== 'clear';
    if (this.weather === 'rain') {
      this.weatherMat.color.setHex(0x93c5fd);
      this.weatherMat.size = 0.22;
    } else if (this.weather === 'snow') {
      this.weatherMat.color.setHex(0xffffff);
      this.weatherMat.size = 0.34;
    }
  }

  setTime(t) {
    this.time = ((t % 1) + 1) % 1;
  }

  getTimeLabel() {
    const totalMinutes = Math.floor(((this.time + 0.25) % 1) * 24 * 60);
    const hh = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
    const mm = String(totalMinutes % 60).padStart(2, '0');
    const wIcon = this.weather === 'rain' ? ' 🌧️' : this.weather === 'snow' ? ' ❄️' : '';
    if (this.time >= 0.06 && this.time < 0.44) return `☀️ 낮 ${hh}:${mm}${wIcon}`;
    if (this.time >= 0.44 && this.time < 0.56) return `🌅 노을 ${hh}:${mm}${wIcon}`;
    if (this.time >= 0.94 || this.time < 0.06) return `🌄 새벽 ${hh}:${mm}${wIcon}`;
    return `🌙 밤 ${hh}:${mm}${wIcon}`;
  }

  update(dt, playerPos, surfaceY = 36) {
    // Smooth local progression between server sync ticks
    this.time = (this.time + dt / 360) % 1;

    // Center sky dome around player (keep horizon level anchored gently near player)
    this.group.position.set(playerPos.x, playerPos.y, playerPos.z);

    // Sun angle: 0 = rising east (+X), 0.25 = zenith (+Y), 0.5 = setting west (-X), 0.75 = nadir (-Y)
    const angle = this.time * Math.PI * 2;
    const radius = 128;
    const sunX = Math.cos(angle) * radius;
    const sunY = Math.sin(angle) * radius;
    const sunZ = -25;

    this.sun.position.set(sunX, sunY, sunZ);
    this.sun.lookAt(playerPos.x, playerPos.y, playerPos.z);

    this.moon.position.set(-sunX, -sunY, -sunZ);
    this.moon.lookAt(playerPos.x, playerPos.y, playerPos.z);

    const sunHeight = Math.sin(angle); // -1..1

    // Sky color & 360° panoramic dome blending (Day <-> Cozy Sunset <-> Starry Night)
    let wDay = 0, wSunset = 0, wNight = 0;
    if (sunHeight > 0.18) {
      wDay = 1;
      this.curSky.copy(this.colDay);
    } else if (sunHeight > -0.18) {
      const f = (sunHeight + 0.18) / 0.36; // 0 (night) .. 0.5 (sunset) .. 1 (day)
      if (f > 0.5) {
        const k = (f - 0.5) * 2;
        wDay = k;
        wSunset = 1 - k;
        this.curSky.copy(this.colSunset).lerp(this.colDay, k);
      } else {
        const k = f * 2;
        wSunset = k;
        wNight = 1 - k;
        this.curSky.copy(this.colNight).lerp(this.colSunset, k);
      }
    } else {
      wNight = 1;
      this.curSky.copy(this.colNight);
    }

    // Overcast tint during rain
    if (this.weather === 'rain') {
      this.curSky.lerp(this.colRain, 0.4);
    }

    // Darken sky & fade panoramic dome when deep underground
    const ug = surfaceY > 10 ? Math.max(0, Math.min(1, (surfaceY - 7 - playerPos.y) / 10)) : 0;
    this.curSky.lerp(this.colUnderground, ug * 0.9);
    const vis = 1 - ug;

    this.dayDomeMat.opacity = wDay * vis;
    this.sunsetDomeMat.opacity = wSunset * vis;
    this.nightDomeMat.opacity = wNight * vis;
    this.dayDome.visible = this.dayDomeMat.opacity > 0.01;
    this.sunsetDome.visible = this.sunsetDomeMat.opacity > 0.01;
    this.nightDome.visible = this.nightDomeMat.opacity > 0.01;

    // Gentle cloud drift & time-of-day tinting
    this.cloudGroup.visible = vis > 0.15;
    if (this.cloudGroup.visible) {
      this.cloudMat.color
        .copy(this.colCloudDay)
        .lerp(this.colCloudSunset, wSunset)
        .lerp(this.colCloudNight, wNight * 0.85);
      this.cloudMat.opacity = (0.35 + 0.5 * (1 - wNight)) * vis;
      for (const cl of this.clouds) {
        cl.mesh.position.x += cl.speed * dt;
        if (cl.mesh.position.x > 115) cl.mesh.position.x = -115;
      }
    }

    this.scene.background.copy(this.curSky);
    this.scene.fog.color.copy(this.curSky);

    // Animate falling rain / snow above ground
    if (this.weather !== 'clear') {
      this.weatherPoints.visible = ug < 0.6;
      this.weatherPoints.position.set(playerPos.x, playerPos.y - 4, playerPos.z);
      const posAttr = this.weatherGeo.attributes.position;
      const fallSpeed = this.weather === 'rain' ? 22 : 3.2;
      const drift = this.weather === 'snow' ? Math.sin(this.time * 900) * 0.8 * dt : 0;
      for (let i = 0; i < this.weatherCount; i++) {
        let y = posAttr.getY(i) - fallSpeed * dt;
        let x = posAttr.getX(i) + drift;
        if (y < 0) y = 26;
        if (x > 22) x = -22;
        if (x < -22) x = 22;
        posAttr.setXYZ(i, x, y, posAttr.getZ(i));
      }
      posAttr.needsUpdate = true;
    }

    // Stars visible at night above ground
    const nightAmt = Math.max(0, Math.min(1, (-sunHeight - 0.05) / 0.35)) * vis;
    this.starMat.opacity = nightAmt;
    this.stars.rotation.y = this.time * 0.5;

    // Lighting intensities (genuinely dark at night & deep underground; light-emitting blocks brighten nearby!)
    const dayLight = Math.max(0, Math.min(1, (sunHeight + 0.12) / 0.52)) * (1 - ug * 0.85);
    this.dayLight = dayLight;
    this.hemiLight.intensity = 0.055 + dayLight * 0.85;
    this.dirLight.intensity = 0.03 + dayLight * 0.85;
    this.dirLight.position.set(
      playerPos.x + (sunHeight >= 0 ? sunX : -sunX) * 0.5,
      playerPos.y + Math.abs(sunY) * 0.5 + 15,
      playerPos.z + 20
    );
    this.dirLight.color.setHex(sunHeight >= -0.05 ? 0xfff8dc : 0x64748b);
  }
}
