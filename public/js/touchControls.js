// Multi-touch Virtual Joystick, Screen-Drag Camera & Action Pad for Mobile / Tablet
export class TouchControls {
  constructor(canvas, callbacks) {
    this.canvas = canvas;
    this.cb = callbacks; // { onLook(dx, dy), onMineStart(), onMineEnd(), onUse(), onJumpStart(), onJumpEnd(), onDescendStart(), onDescendEnd(), onFlyToggle(), onChat(), onViewToggle(), onUndo() }
    this.enabled = false;
    this.isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

    // Analog joystick output (-1..1)
    this.moveX = 0; // +right, -left
    this.moveZ = 0; // +forward, -backward

    this._joyTouchId = null;
    this._lookTouchId = null;
    this._lookLastX = 0;
    this._lookLastY = 0;

    this.root = document.getElementById('touch-controls');
    this.joyZone = document.getElementById('touch-joystick');
    this.joyKnob = document.getElementById('touch-joy-knob');
    this.btnDescend = document.getElementById('touch-btn-descend');

    this._bindJoystick();
    this._bindCameraDrag();
    this._bindActionButtons();
  }

  setEnabled(v) {
    this.enabled = !!v;
    if (this.root) this.root.classList.toggle('hidden', !this.enabled);
    if (!this.enabled) {
      this.moveX = 0;
      this.moveZ = 0;
      this._joyTouchId = null;
      this._lookTouchId = null;
      this.cb.onMineEnd();
      this.cb.onJumpEnd();
      this.cb.onDescendEnd();
    }
  }

  setFlyMode(flying) {
    if (this.btnDescend) this.btnDescend.classList.toggle('hidden', !flying);
    const flyBtn = document.getElementById('touch-btn-fly');
    if (flyBtn) flyBtn.classList.toggle('active', flying);
  }

  _bindJoystick() {
    if (!this.joyZone || !this.joyKnob) return;
    const maxRadius = 42;

    const updateStick = (clientX, clientY) => {
      const rect = this.joyZone.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      let dx = clientX - cx;
      let dy = clientY - cy;
      const dist = Math.hypot(dx, dy);
      if (dist > maxRadius) {
        dx = (dx / dist) * maxRadius;
        dy = (dy / dist) * maxRadius;
      }
      this.joyKnob.style.transform = `translate(${dx}px, ${dy}px)`;
      this.moveX = Math.abs(dx) < 6 ? 0 : dx / maxRadius;
      this.moveZ = Math.abs(dy) < 6 ? 0 : -dy / maxRadius; // up = +forward
    };

    const resetStick = () => {
      this._joyTouchId = null;
      this.moveX = 0;
      this.moveZ = 0;
      this.joyKnob.style.transform = 'translate(0px, 0px)';
    };

    this.joyZone.addEventListener('touchstart', (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      e.stopPropagation();
      const t = e.changedTouches[0];
      if (this._joyTouchId === null) {
        this._joyTouchId = t.identifier;
        updateStick(t.clientX, t.clientY);
      }
    }, { passive: false });

    this.joyZone.addEventListener('touchmove', (e) => {
      if (!this.enabled || this._joyTouchId === null) return;
      e.preventDefault();
      e.stopPropagation();
      for (const t of e.changedTouches) {
        if (t.identifier === this._joyTouchId) {
          updateStick(t.clientX, t.clientY);
          break;
        }
      }
    }, { passive: false });

    const endHandler = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this._joyTouchId) {
          resetStick();
          break;
        }
      }
    };
    this.joyZone.addEventListener('touchend', endHandler);
    this.joyZone.addEventListener('touchcancel', endHandler);
  }

  _bindCameraDrag() {
    this.canvas.addEventListener('touchstart', (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (this._lookTouchId === null) {
          this._lookTouchId = t.identifier;
          this._lookLastX = t.clientX;
          this._lookLastY = t.clientY;
          break;
        }
      }
    }, { passive: false });

    this.canvas.addEventListener('touchmove', (e) => {
      if (!this.enabled || this._lookTouchId === null) return;
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.identifier === this._lookTouchId) {
          const dx = t.clientX - this._lookLastX;
          const dy = t.clientY - this._lookLastY;
          this._lookLastX = t.clientX;
          this._lookLastY = t.clientY;
          this.cb.onLook(dx, dy);
          break;
        }
      }
    }, { passive: false });

    const endLook = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this._lookTouchId) {
          this._lookTouchId = null;
          break;
        }
      }
    };
    this.canvas.addEventListener('touchend', endLook);
    this.canvas.addEventListener('touchcancel', endLook);
  }

  _bindHoldBtn(id, onStart, onEnd) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('touchstart', (e) => {
      e.preventDefault(); e.stopPropagation();
      el.classList.add('pressed');
      onStart();
    }, { passive: false });
    const stop = (e) => {
      e.preventDefault(); e.stopPropagation();
      el.classList.remove('pressed');
      onEnd();
    };
    el.addEventListener('touchend', stop, { passive: false });
    el.addEventListener('touchcancel', stop, { passive: false });
    // Also support mouse click when testing touch HUD on desktop
    el.addEventListener('mousedown', (e) => { e.preventDefault(); onStart(); });
    el.addEventListener('mouseup', (e) => { e.preventDefault(); onEnd(); });
    el.addEventListener('mouseleave', () => onEnd());
  }

  _bindTapBtn(id, onTap) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('touchstart', (e) => {
      e.preventDefault(); e.stopPropagation();
      onTap();
    }, { passive: false });
    el.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      if (!this.isTouchDevice) onTap();
    });
  }

  _bindActionButtons() {
    this._bindHoldBtn('touch-btn-mine', () => this.cb.onMineStart(), () => this.cb.onMineEnd());
    this._bindTapBtn('touch-btn-use', () => this.cb.onUse());
    this._bindHoldBtn('touch-btn-jump', () => this.cb.onJumpStart(), () => this.cb.onJumpEnd());
    this._bindHoldBtn('touch-btn-descend', () => this.cb.onDescendStart(), () => this.cb.onDescendEnd());
    this._bindTapBtn('touch-btn-fly', () => this.cb.onFlyToggle());
    this._bindTapBtn('touch-btn-tool', () => this.cb.onToolSwitch?.());
    this._bindTapBtn('touch-btn-chat', () => this.cb.onChat());
    this._bindTapBtn('touch-btn-view', () => this.cb.onViewToggle());
    this._bindTapBtn('touch-btn-undo', () => this.cb.onUndo());
  }
}
