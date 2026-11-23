import * as THREE from '../vendor/three/three.module.min.js';

function makeCelestialTexture(isSun) {
  const c = document.createElement('canvas');
  c.width = 16; c.height = 16;
  const ctx = c.getContext('2d');
  if (isSun) {
    ctx.fillStyle = '#fde047';
    ctx.fillRect(0, 0, 16, 16);
    ctx.fillStyle = '#fef9c3';
    ctx.fillRect(2, 2, 12, 12);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(4, 4, 8, 8);
  } else {
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(0, 0, 16, 16);
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(2, 3, 4, 4);
    ctx.fillRect(9, 8, 4, 3);
    ctx.fillRect(5, 11, 3, 2);
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(3, 4, 2, 2);
    ctx.fillRect(10, 9, 2, 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
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

    // Sun mesh
    this.sun = new THREE.Mesh(
      new THREE.PlaneGeometry(16, 16),
      new THREE.MeshBasicMaterial({ map: makeCelestialTexture(true), side: THREE.DoubleSide, fog: false })
    );
    this.group.add(this.sun);

    // Moon mesh
    this.moon = new THREE.Mesh(
      new THREE.PlaneGeometry(13, 13),
      new THREE.MeshBasicMaterial({ map: makeCelestialTexture(false), side: THREE.DoubleSide, fog: false })
    );
    this.group.add(this.moon);

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

    this.colDay = new THREE.Color('#87ceeb');
    this.colSunset = new THREE.Color('#fb923c');
    this.colNight = new THREE.Color('#090f24');
    this.colUnderground = new THREE.Color('#0c1324');
    this.colRain = new THREE.Color('#475569');
    this.curSky = new THREE.Color();

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

    // Center sky dome around player
    this.group.position.set(playerPos.x, playerPos.y, playerPos.z);

    // Sun angle: 0 = rising east (+X), 0.25 = zenith (+Y), 0.5 = setting west (-X), 0.75 = nadir (-Y)
    const angle = this.time * Math.PI * 2;
    const radius = 120;
    const sunX = Math.cos(angle) * radius;
    const sunY = Math.sin(angle) * radius;
    const sunZ = -25;

    this.sun.position.set(sunX, sunY, sunZ);
    this.sun.lookAt(playerPos.x, playerPos.y, playerPos.z);

    this.moon.position.set(-sunX, -sunY, -sunZ);
    this.moon.lookAt(playerPos.x, playerPos.y, playerPos.z);

    const sunHeight = Math.sin(angle); // -1..1

    // Sky color interpolation
    if (sunHeight > 0.15) {
      this.curSky.copy(this.colDay);
    } else if (sunHeight > -0.15) {
      const f = (sunHeight + 0.15) / 0.3;
      if (f > 0.5) {
        this.curSky.copy(this.colSunset).lerp(this.colDay, (f - 0.5) * 2);
      } else {
        this.curSky.copy(this.colNight).lerp(this.colSunset, f * 2);
      }
    } else {
      this.curSky.copy(this.colNight);
    }

    // Overcast tint during rain
    if (this.weather === 'rain') {
      this.curSky.lerp(this.colRain, 0.45);
    }

    // Darken sky when deep underground (relative to world's surfaceY)
    const ug = surfaceY > 10 ? Math.max(0, Math.min(1, (surfaceY - 7 - playerPos.y) / 10)) : 0;
    this.curSky.lerp(this.colUnderground, ug * 0.9);

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
    const nightAmt = Math.max(0, Math.min(1, (-sunHeight - 0.05) / 0.35)) * (1 - ug);
    this.starMat.opacity = nightAmt;
    this.stars.rotation.y = this.time * 0.5;

    // Lighting intensities
    const dayLight = Math.max(0, Math.min(1, (sunHeight + 0.2) / 0.6));
    this.hemiLight.intensity = 0.26 + dayLight * 0.65;
    this.dirLight.intensity = 0.16 + dayLight * 0.72;
    this.dirLight.position.set(
      playerPos.x + (sunHeight >= 0 ? sunX : -sunX) * 0.5,
      playerPos.y + Math.abs(sunY) * 0.5 + 15,
      playerPos.z + 20
    );
    this.dirLight.color.setHex(sunHeight >= -0.05 ? 0xfff8dc : 0x93c5fd);
  }
}
