// Procedural Web Audio API 3D Spatial Sound Engine (zero external files, works offline!)
export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.volume = 1.0;
    this.listenerPos = { x: 0, y: 17, z: 0 };
  }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, Number(v)));
  }

  _ensureCtx() {
    if (this.muted) return null;
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    return this.ctx;
  }

  setMuted(m) {
    this.muted = !!m;
  }

  updateListener(pos, yaw) {
    this.listenerPos = { x: pos.x, y: pos.y, z: pos.z };
    if (!this.ctx || !this.ctx.listener) return;
    const L = this.ctx.listener;
    if (L.positionX) {
      L.positionX.value = pos.x;
      L.positionY.value = pos.y;
      L.positionZ.value = pos.z;
      L.forwardX.value = -Math.sin(yaw);
      L.forwardY.value = 0;
      L.forwardZ.value = -Math.cos(yaw);
      L.upX.value = 0;
      L.upY.value = 1;
      L.upZ.value = 0;
    }
  }

  _connectOutput(ctx, node, worldPos) {
    if (worldPos && ctx.createPanner) {
      const panner = ctx.createPanner();
      panner.panningModel = 'HRTF';
      panner.distanceModel = 'inverse';
      panner.refDistance = 3;
      panner.maxDistance = 32;
      panner.rolloffFactor = 1.4;
      panner.positionX.value = worldPos.x;
      panner.positionY.value = worldPos.y;
      panner.positionZ.value = worldPos.z;
      node.connect(panner);
      panner.connect(ctx.destination);
    } else {
      node.connect(ctx.destination);
    }
  }

  _noiseBurst(duration, freq, q, gainAmt, worldPos = null) {
    const ctx = this._ensureCtx();
    if (!ctx) return;
    const len = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);

    const src = ctx.createBufferSource();
    src.buffer = buf;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = freq;
    filter.Q.value = q;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(Math.max(0.001, gainAmt * this.volume), ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

    src.connect(filter);
    filter.connect(gain);
    this._connectOutput(ctx, gain, worldPos);
    src.start();
  }

  _tone(type, freqStart, freqEnd, duration, gainAmt, worldPos = null) {
    const ctx = this._ensureCtx();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), ctx.currentTime + duration);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(Math.max(0.001, gainAmt * this.volume), ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

    osc.connect(gain);
    this._connectOutput(ctx, gain, worldPos);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  }

  playHit(material = 'stone', worldPos = null) {
    if (material === 'wood') {
      this._tone('triangle', 220, 110, 0.07, 0.14, worldPos);
      this._noiseBurst(0.05, 700, 1.5, 0.08, worldPos);
    } else if (material === 'dirt') {
      this._noiseBurst(0.07, 450, 1.0, 0.12, worldPos);
    } else if (material === 'glass') {
      this._tone('sine', 1600, 900, 0.08, 0.1, worldPos);
    } else {
      this._tone('square', 320, 150, 0.06, 0.08, worldPos);
      this._noiseBurst(0.05, 1100, 2.0, 0.09, worldPos);
    }
  }

  playBreak(material = 'stone', worldPos = null) {
    if (material === 'wood') {
      this._tone('triangle', 190, 75, 0.14, 0.22, worldPos);
      this._noiseBurst(0.14, 600, 1.2, 0.18, worldPos);
    } else if (material === 'dirt') {
      this._noiseBurst(0.15, 380, 0.9, 0.22, worldPos);
    } else if (material === 'glass') {
      this._tone('sine', 2200, 1100, 0.14, 0.16, worldPos);
      this._noiseBurst(0.14, 3200, 2.5, 0.16, worldPos);
    } else {
      this._tone('sawtooth', 260, 90, 0.13, 0.14, worldPos);
      this._noiseBurst(0.15, 950, 1.6, 0.2, worldPos);
    }
  }

  playPlace(material = 'wood', worldPos = null) {
    const f = material === 'stone' ? 280 : material === 'dirt' ? 160 : 210;
    this._tone('triangle', f, f * 0.65, 0.08, 0.18, worldPos);
    this._noiseBurst(0.05, f * 2.5, 1.5, 0.08, worldPos);
  }

  playTreeFell(worldPos = null) {
    this._tone('triangle', 140, 55, 0.35, 0.25, worldPos);
    this._noiseBurst(0.38, 420, 0.8, 0.22, worldPos);
  }

  playStep() {
    this._noiseBurst(0.045, 340, 1.2, 0.055, null);
  }

  playEat() {
    this._noiseBurst(0.08, 1200, 1.8, 0.15, null);
    setTimeout(() => this._noiseBurst(0.08, 1400, 1.8, 0.14, null), 100);
  }

  playCraft() {
    this._tone('sine', 520, 780, 0.12, 0.14, null);
    setTimeout(() => this._tone('sine', 780, 1040, 0.15, 0.12, null), 90);
  }

  playOpen() {
    this._tone('triangle', 180, 260, 0.12, 0.14, null);
  }

  playAnimal(type, worldPos = null) {
    if (type === 'pig') this._tone('sawtooth', 160, 110, 0.14, 0.12, worldPos);
    else if (type === 'sheep') this._tone('triangle', 340, 260, 0.22, 0.12, worldPos);
    else if (type === 'cow') this._tone('sawtooth', 110, 85, 0.3, 0.14, worldPos);
    else this._tone('sine', 720, 520, 0.1, 0.1, worldPos);
  }

  playExplosion(worldPos = null) {
    this._tone('sawtooth', 110, 28, 0.55, 0.35, worldPos);
    this._noiseBurst(0.65, 220, 0.6, 0.4, worldPos);
  }

  playJumpPad() {
    this._tone('sine', 240, 880, 0.24, 0.2, null);
  }

  playWarp() {
    this._tone('sine', 300, 1200, 0.28, 0.18, null);
    setTimeout(() => this._tone('triangle', 900, 420, 0.2, 0.14, null), 100);
  }

  playDoor() {
    this._tone('triangle', 260, 180, 0.1, 0.16, null);
  }

  playEmote() {
    this._tone('sine', 600, 920, 0.12, 0.12, null);
  }

  playElevatorChime() {
    this._tone('sine', 659.25, 659.25, 0.22, 0.16, null);
    setTimeout(() => this._tone('sine', 523.25, 523.25, 0.35, 0.16, null), 180);
  }
}
