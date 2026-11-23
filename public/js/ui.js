import { PixelSkinEditor } from './skinEditor.js';
import { ImageAutoBuilder } from './imageBuilder.js';

const SMELT_INPUTS = new Set(['raw_iron', 'raw_gold', 'sand', 'cobble', 'raw_meat']);
const FUEL_ITEMS = new Set(['coal', 'wood', 'planks', 'stick']);

export class GameUI {
  constructor(callbacks) {
    this.cb = callbacks;
    this.catalog = {};
    this.recipes = [];
    this.textures = null;
    this.bag = [];
    this.activeSlot = 0;
    this.moveSourceIdx = null;
    this.currentChest = null;
    this.currentFurnace = null;
    this.pixelEditor = null;
    this.isAdmin = false;
    this.selfNick = '';
    this.blueprints = [];
    this.regions = [];
    this.skins = [];
    this.craftCat = '전체';
    this.bpPos1 = null;
    this.bpPos2 = null;
    this.regPos1 = null;
    this.regPos2 = null;
    this.openModalId = null;
    this.chatOpen = false;
    this.hp = 20;
    this.hunger = 20;

    this._bindEvents();
  }

  init(catalog, recipes, textures, self) {
    this.catalog = catalog;
    this.recipes = recipes || [];
    this.textures = textures;
    this.selfNick = self.nickname;
    this.isAdmin = !!self.isAdmin;
    this._renderSupplyCatalog();
    this._updateAdminUI();
    this._loadSkinIntoInputs(self.skin);
    this.updateVitals(20, 20);
  }

  _bindEvents() {
    document.querySelectorAll('.modal-close').forEach((btn) => {
      btn.addEventListener('click', () => this.closeModal());
    });
    document.querySelectorAll('.modal').forEach((m) => {
      m.addEventListener('click', (e) => { if (e.target === m) this.closeModal(); });
    });

    const mobileMenuBtn = document.getElementById('btn-mobile-menu');
    const topRightMenu = document.getElementById('top-right-menu');
    if (mobileMenuBtn && topRightMenu) {
      mobileMenuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        topRightMenu.classList.toggle('mobile-open');
      });
      topRightMenu.addEventListener('click', () => {
        topRightMenu.classList.remove('mobile-open');
      });
    }
    document.getElementById('chat-hint')?.addEventListener('click', () => this.openChat());

    document.getElementById('btn-sound').addEventListener('click', (e) => {
      const muted = this.cb.onToggleSound();
      e.currentTarget.textContent = muted ? '🔇' : '🔊';
    });
    document.getElementById('btn-brush').addEventListener('click', () => this.cb.onToggleBrush());
    document.getElementById('btn-map').addEventListener('click', () => this.toggleModal('modal-map'));
    document.getElementById('btn-emote').addEventListener('click', () => this.toggleModal('modal-emote'));
    document.getElementById('btn-bag').addEventListener('click', () => this.toggleModal('modal-bag'));
    document.getElementById('btn-craft').addEventListener('click', () => this.toggleModal('modal-craft'));
    document.getElementById('btn-skin').addEventListener('click', () => this.toggleModal('modal-skin'));
    document.getElementById('btn-blueprint').addEventListener('click', () => this.toggleModal('modal-blueprint'));
    document.getElementById('btn-settings').addEventListener('click', () => this.toggleModal('modal-settings'));
    document.getElementById('btn-admin').addEventListener('click', () => this.toggleModal('modal-admin'));
    document.getElementById('btn-logout').addEventListener('click', () => {
      if (confirm('로그아웃하시겠습니까?\n개인 가방의 아이템은 자동 삭제되며, 상자에 넣은 아이템은 보존됩니다.')) {
        this.cb.onLogout();
      }
    });

    // Quick warp buttons in Minimap modal
    document.querySelectorAll('[data-warp]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const [x, y, z] = btn.dataset.warp.split(',').map(Number);
        this.cb.onWarp(x, y, z, btn.textContent);
        this.closeModal();
      });
    });

    // Emote buttons
    document.querySelectorAll('#emote-btns [data-em]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const [emoji, label] = btn.dataset.em.split('|');
        this.cb.send({ type: 'emote', emoji, label });
        this.closeModal();
      });
    });

    // Admin time / weather / announce controls
    document.getElementById('adm-time-day').addEventListener('click', () => this.cb.send({ type: 'admin_time', time: 0.25 }));
    document.getElementById('adm-time-sunset').addEventListener('click', () => this.cb.send({ type: 'admin_time', time: 0.49 }));
    document.getElementById('adm-time-night').addEventListener('click', () => this.cb.send({ type: 'admin_time', time: 0.75 }));
    document.getElementById('adm-w-clear').addEventListener('click', () => this.cb.send({ type: 'admin_weather', weather: 'clear' }));
    document.getElementById('adm-w-rain').addEventListener('click', () => this.cb.send({ type: 'admin_weather', weather: 'rain' }));
    document.getElementById('adm-w-snow').addEventListener('click', () => this.cb.send({ type: 'admin_weather', weather: 'snow' }));
    document.getElementById('btn-adm-announce').addEventListener('click', () => {
      const inp = document.getElementById('adm-announce-input');
      const txt = inp.value.trim();
      if (!txt) return;
      this.cb.send({ type: 'admin_announce', text: txt });
      inp.value = '';
    });

    // Admin Photo / Map Auto-Builder
    this._imgBuilder = new ImageAutoBuilder(document.getElementById('adm-img-preview'));
    this._pendingAutoBlocks = [];
    const refreshImgPreview = () => {
      const mode = document.getElementById('adm-img-mode').value;
      const w = Number(document.getElementById('adm-img-w').value);
      const h = Number(document.getElementById('adm-img-h').value);
      document.getElementById('adm-img-w-val').textContent = w;
      document.getElementById('adm-img-h-val').textContent = h;
      this._pendingAutoBlocks = this._imgBuilder.generate({ mode, width: w, height: h });
      document.getElementById('adm-img-count').textContent = this._pendingAutoBlocks.length > 0
        ? `변환 완료! 예상 블록 수: ${this._pendingAutoBlocks.length}개`
        : '이미지를 선택하면 변환 미리보기가 표시됩니다.';
      document.getElementById('btn-adm-img-build').disabled = this._pendingAutoBlocks.length === 0;
    };

    document.getElementById('adm-img-file').addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      this._imgBuilder.loadFile(file, refreshImgPreview);
    });
    document.getElementById('adm-img-mode').addEventListener('change', refreshImgPreview);
    document.getElementById('adm-img-w').addEventListener('input', refreshImgPreview);
    document.getElementById('adm-img-h').addEventListener('input', refreshImgPreview);
    document.getElementById('btn-adm-img-build').addEventListener('click', () => {
      if (this._pendingAutoBlocks.length === 0) return;
      const origin = this.cb.getFrontPos();
      const worldBlocks = this._pendingAutoBlocks.map(b => ({
        x: origin.x + b.dx,
        y: origin.y + b.dy,
        z: origin.z + b.dz,
        block: b.block
      }));
      this.cb.send({ type: 'admin_batch_build', blocks: worldBlocks });
      this.closeModal();
    });
    document.getElementById('btn-adm-img-undo').addEventListener('click', () => {
      this.cb.send({ type: 'admin_batch_undo' });
    });

    // Game Settings modal (persisted in localStorage)
    const defaultTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    document.getElementById('set-touch-ui').checked = defaultTouch;
    const bindSetting = () => {
      const s = {
        fov: Number(document.getElementById('set-fov').value),
        viewDist: Number(document.getElementById('set-dist').value),
        sensitivity: Number(document.getElementById('set-sens').value),
        volume: Number(document.getElementById('set-vol').value) / 100,
        quality: Number(document.getElementById('set-quality').value),
        invertY: document.getElementById('set-invert-y').checked,
        particles: document.getElementById('set-particles').checked,
        showCoords: document.getElementById('set-show-coords').checked,
        touchUI: document.getElementById('set-touch-ui').checked
      };
      document.getElementById('set-fov-val').textContent = `${s.fov}°`;
      document.getElementById('set-dist-val').textContent = String(s.viewDist);
      document.getElementById('set-sens-val').textContent = `${s.sensitivity.toFixed(1)}×`;
      document.getElementById('set-vol-val').textContent = `${Math.round(s.volume * 100)}%`;
      try { localStorage.setItem('boxworld_settings', JSON.stringify(s)); } catch {}
      this.cb.onApplySettings?.(s);
    };
    for (const id of ['set-fov', 'set-dist', 'set-sens', 'set-vol', 'set-quality', 'set-invert-y', 'set-particles', 'set-show-coords', 'set-touch-ui']) {
      document.getElementById(id).addEventListener('input', bindSetting);
      document.getElementById(id).addEventListener('change', bindSetting);
    }
    document.getElementById('btn-set-reset').addEventListener('click', () => {
      document.getElementById('set-fov').value = 75;
      document.getElementById('set-dist').value = 125;
      document.getElementById('set-sens').value = 1.0;
      document.getElementById('set-vol').value = 100;
      document.getElementById('set-quality').value = 2;
      document.getElementById('set-invert-y').checked = false;
      document.getElementById('set-particles').checked = true;
      document.getElementById('set-show-coords').checked = true;
      document.getElementById('set-touch-ui').checked = defaultTouch;
      bindSetting();
    });

    // Load saved settings immediately on boot
    try {
      const saved = JSON.parse(localStorage.getItem('boxworld_settings') || 'null');
      if (saved) {
        if (saved.fov) document.getElementById('set-fov').value = saved.fov;
        if (saved.viewDist) document.getElementById('set-dist').value = saved.viewDist;
        if (saved.sensitivity) document.getElementById('set-sens').value = saved.sensitivity;
        if (typeof saved.volume === 'number') document.getElementById('set-vol').value = Math.round(saved.volume * 100);
        if (saved.quality) document.getElementById('set-quality').value = saved.quality;
        document.getElementById('set-invert-y').checked = !!saved.invertY;
        document.getElementById('set-particles').checked = saved.particles !== false;
        document.getElementById('set-show-coords').checked = saved.showCoords !== false;
        document.getElementById('set-touch-ui').checked = typeof saved.touchUI === 'boolean' ? saved.touchUI : defaultTouch;
      }
      bindSetting();
    } catch {}

    // Skin tabs (Quick / 64x64 Pixel Editor / Gallery)
    document.querySelectorAll('#skin-tabs .tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#skin-tabs .tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const tab = btn.dataset.sktab;
        document.getElementById('sk-tab-quick').classList.toggle('hidden', tab !== 'quick');
        document.getElementById('sk-tab-pixel').classList.toggle('hidden', tab !== 'pixel');
        document.getElementById('sk-tab-gallery').classList.toggle('hidden', tab !== 'gallery');
        if (tab === 'pixel' && !this.pixelEditor) {
          this.pixelEditor = new PixelSkinEditor(
            document.getElementById('pixel-skin-canvas'),
            document.getElementById('px-palette')
          );
        }
        if (tab === 'gallery') this.renderSkinGallery();
      });
    });

    // 64x64 Pixel Editor controls
    document.querySelectorAll('#px-tool-btns [data-pxtool]').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#px-tool-btns [data-pxtool]').forEach(b => b.classList.remove('accent'));
        btn.classList.add('accent');
        this.pixelEditor?.setTool(btn.dataset.pxtool);
      });
    });
    document.getElementById('btn-px-undo').addEventListener('click', () => this.pixelEditor?.undo());
    document.getElementById('px-custom-color').addEventListener('input', (e) => this.pixelEditor?.setColor(e.target.value));
    document.getElementById('btn-px-download').addEventListener('click', () => this.pixelEditor?.downloadPng(`${this.selfNick || 'boxworld'}-skin.png`));
    document.getElementById('px-upload-input').addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => this.pixelEditor?.loadDataUrl(reader.result);
      reader.readAsDataURL(file);
    });
    document.getElementById('btn-px-apply').addEventListener('click', () => {
      if (!this.pixelEditor) return;
      const skin = { ...this._readSkinFromInputs(), pixelDataUrl: this.pixelEditor.exportDataUrl() };
      this.cb.onApplySkin(skin);
    });
    document.getElementById('btn-px-publish').addEventListener('click', () => {
      if (!this.pixelEditor) return;
      const name = document.getElementById('px-publish-name').value.trim() || `${this.selfNick}의 픽셀 스킨`;
      const skin = { ...this._readSkinFromInputs(), pixelDataUrl: this.pixelEditor.exportDataUrl() };
      this.cb.onApplySkin(skin);
      this.cb.send({ type: 'skin_publish', name, skin });
      document.getElementById('px-publish-name').value = '';
    });

    // Furnace take slots
    document.getElementById('furnace-input-slot').addEventListener('click', () => {
      if (this.currentFurnace?.input) {
        this.cb.send({ type: 'furnace_take', x: this.currentFurnace.x, y: this.currentFurnace.y, z: this.currentFurnace.z, slotName: 'input' });
      }
    });
    document.getElementById('furnace-fuel-slot').addEventListener('click', () => {
      if (this.currentFurnace?.fuel) {
        this.cb.send({ type: 'furnace_take', x: this.currentFurnace.x, y: this.currentFurnace.y, z: this.currentFurnace.z, slotName: 'fuel' });
      }
    });
    document.getElementById('furnace-output-slot').addEventListener('click', () => {
      if (this.currentFurnace?.output) {
        this.cb.send({ type: 'furnace_take', x: this.currentFurnace.x, y: this.currentFurnace.y, z: this.currentFurnace.z, slotName: 'output' });
      }
    });

    // Crafting tabs
    document.querySelectorAll('#craft-tabs .tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#craft-tabs .tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.craftCat = btn.dataset.cat;
        this.renderCraftModal();
      });
    });

    // Skin customizer
    document.getElementById('btn-skin-apply').addEventListener('click', () => {
      const skin = this._readSkinFromInputs();
      this.cb.onApplySkin(skin);
    });
    document.getElementById('btn-skin-random').addEventListener('click', () => {
      const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
      const randSkin = {
        skinColor: pick(['#f5cfa0', '#ecc092', '#f7d5b0', '#d4a373', '#8d5524']),
        hairColor: pick(['#3b2416', '#1e293b', '#7c2d12', '#facc15', '#dc2626', '#6366f1']),
        shirtColor: pick(['#38bdf8', '#22c55e', '#ef4444', '#f59e0b', '#a855f7', '#ec4899', '#14b8a6']),
        pantsColor: pick(['#334155', '#1e3a8a', '#3f3f46', '#475569', '#14532d']),
        eyeColor: pick(['#0f172a', '#1d4ed8', '#15803d', '#7c2d12']),
        hatColor: Math.random() > 0.4 ? pick(['#facc15', '#ef4444', '#2563eb', '#22c55e', '#f472b6']) : '',
        blush: Math.random() > 0.4
      };
      this._loadSkinIntoInputs(randSkin);
      this.cb.onApplySkin(randSkin);
    });
    document.getElementById('btn-skin-publish').addEventListener('click', () => {
      const name = document.getElementById('sk-publish-name').value.trim() || `${this.selfNick}의 스킨`;
      const skin = this._readSkinFromInputs();
      this.cb.onApplySkin(skin);
      this.cb.send({ type: 'skin_publish', name, skin });
      document.getElementById('sk-publish-name').value = '';
    });

    // Chest rename
    document.getElementById('btn-chest-rename').addEventListener('click', () => {
      if (!this.currentChest) return;
      const val = document.getElementById('chest-rename-input').value.trim();
      if (!val) return;
      this.cb.send({
        type: 'chest_rename',
        x: this.currentChest.x, y: this.currentChest.y, z: this.currentChest.z,
        label: val
      });
    });

    // Blueprint controls
    document.getElementById('bp-move-xm').addEventListener('click', () => this.cb.projector.nudge(-1, 0, 0));
    document.getElementById('bp-move-xp').addEventListener('click', () => this.cb.projector.nudge(1, 0, 0));
    document.getElementById('bp-move-ym').addEventListener('click', () => this.cb.projector.nudge(0, -1, 0));
    document.getElementById('bp-move-yp').addEventListener('click', () => this.cb.projector.nudge(0, 1, 0));
    document.getElementById('bp-move-zm').addEventListener('click', () => this.cb.projector.nudge(0, 0, -1));
    document.getElementById('bp-move-zp').addEventListener('click', () => this.cb.projector.nudge(0, 0, 1));
    document.getElementById('bp-rotate').addEventListener('click', () => this.cb.projector.rotate());
    document.getElementById('bp-clear').addEventListener('click', () => this.cb.projector.clear());

    document.getElementById('bp-set-pos1').addEventListener('click', () => {
      this.bpPos1 = this.cb.getPlayerBlockPos();
      document.getElementById('bp-pos1-label').textContent = `(${this.bpPos1.x}, ${this.bpPos1.y}, ${this.bpPos1.z})`;
    });
    document.getElementById('bp-set-pos2').addEventListener('click', () => {
      this.bpPos2 = this.cb.getPlayerBlockPos();
      document.getElementById('bp-pos2-label').textContent = `(${this.bpPos2.x}, ${this.bpPos2.y}, ${this.bpPos2.z})`;
    });
    document.getElementById('bp-capture-btn').addEventListener('click', () => {
      if (!this.bpPos1 || !this.bpPos2) return this.toast('Pos1과 Pos2를 먼저 지정해주세요.', 'warn');
      const name = document.getElementById('bp-new-name').value.trim() || '새 설계도';
      this.cb.send({ type: 'blueprint_capture', name, pos1: this.bpPos1, pos2: this.bpPos2 });
      document.getElementById('bp-new-name').value = '';
    });

    // Admin controls
    document.getElementById('btn-admin-unlock').addEventListener('click', () => {
      const pw = document.getElementById('admin-pw-input').value;
      if (!pw) return;
      this.cb.send({ type: 'admin_auth', password: pw });
      document.getElementById('admin-pw-input').value = '';
    });
    document.getElementById('reg-set-pos1').addEventListener('click', () => {
      this.regPos1 = this.cb.getPlayerBlockPos();
      document.getElementById('reg-pos1-label').textContent = `(${this.regPos1.x}, ${this.regPos1.y}, ${this.regPos1.z})`;
    });
    document.getElementById('reg-set-pos2').addEventListener('click', () => {
      this.regPos2 = this.cb.getPlayerBlockPos();
      document.getElementById('reg-pos2-label').textContent = `(${this.regPos2.x}, ${this.regPos2.y}, ${this.regPos2.z})`;
    });
    document.getElementById('btn-reg-add').addEventListener('click', () => {
      if (!this.regPos1 || !this.regPos2) return this.toast('Pos1과 Pos2를 먼저 지정해주세요.', 'warn');
      const name = document.getElementById('reg-name-input').value.trim() || '보호 구역';
      this.cb.send({ type: 'region_add', name, pos1: this.regPos1, pos2: this.regPos2 });
      document.getElementById('reg-name-input').value = '';
    });
    document.getElementById('toggle-region-boxes').addEventListener('change', (e) => {
      this.cb.regionVis.setVisible(e.target.checked);
    });

    // Chat
    const chatForm = document.getElementById('chat-form');
    const chatInput = document.getElementById('chat-input');
    chatForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = chatInput.value.trim();
      if (text) this.cb.send({ type: 'chat', text });
      chatInput.value = '';
      this.closeChat();
    });
  }

  _loadSkinIntoInputs(skin) {
    if (!skin) return;
    document.getElementById('sk-skin').value = skin.skinColor || '#f5cfa0';
    document.getElementById('sk-hair').value = skin.hairColor || '#3b2416';
    document.getElementById('sk-shirt').value = skin.shirtColor || '#38bdf8';
    document.getElementById('sk-pants').value = skin.pantsColor || '#334155';
    document.getElementById('sk-eye').value = skin.eyeColor || '#0f172a';
    document.getElementById('sk-hat').value = skin.hatColor || '#facc15';
    document.getElementById('sk-hat-on').checked = !!skin.hatColor;
    document.getElementById('sk-blush').checked = !!skin.blush;
  }

  _readSkinFromInputs() {
    return {
      skinColor: document.getElementById('sk-skin').value,
      hairColor: document.getElementById('sk-hair').value,
      shirtColor: document.getElementById('sk-shirt').value,
      pantsColor: document.getElementById('sk-pants').value,
      eyeColor: document.getElementById('sk-eye').value,
      hatColor: document.getElementById('sk-hat-on').checked ? document.getElementById('sk-hat').value : '',
      blush: document.getElementById('sk-blush').checked
    };
  }

  updateVitals(hp, hunger) {
    this.hp = Math.max(0, Math.min(20, hp));
    this.hunger = Math.max(0, Math.min(20, hunger));
    document.getElementById('hud-hp').textContent = `❤️ ${this.hp} / 20`;
    document.getElementById('hud-hunger').textContent = `🍎 ${this.hunger} / 20`;
  }

  setMiningProgress() {
    // Replaced by 3D crack-stage texture & break particle animation on the block itself!
  }

  openChat() {
    if (this.openModalId) return;
    this.chatOpen = true;
    if (document.pointerLockElement) document.exitPointerLock();
    document.getElementById('chat-form').classList.remove('hidden');
    document.getElementById('chat-hint').classList.add('hidden');
    document.getElementById('chat-input').focus();
  }

  closeChat() {
    this.chatOpen = false;
    document.getElementById('chat-form').classList.add('hidden');
    document.getElementById('chat-hint').classList.remove('hidden');
    document.getElementById('chat-input').blur();
  }

  toggleModal(id) {
    if (this.openModalId === id) this.closeModal();
    else this.openModal(id);
  }

  openModal(id) {
    this.closeChat();
    if (this.openModalId && this.openModalId !== id) {
      document.getElementById(this.openModalId).classList.add('hidden');
      if (this.openModalId === 'modal-chest') {
        this.cb.send({ type: 'chest_close' });
        this.currentChest = null;
      }
      if (this.openModalId === 'modal-furnace') {
        this.cb.send({ type: 'furnace_close' });
        this.currentFurnace = null;
      }
    }
    this.openModalId = id;
    this.moveSourceIdx = null;
    if (document.pointerLockElement) document.exitPointerLock();
    document.getElementById(id).classList.remove('hidden');
    if (id === 'modal-bag') this.renderBagModal();
    if (id === 'modal-craft') this.renderCraftModal();
    if (id === 'modal-skin') this.renderSkinGallery();
    if (id === 'modal-blueprint') this.renderBlueprints();
    if (id === 'modal-admin') { this.renderRegions(); this.renderAdminPlayers(); }
    if (id === 'modal-map') this.renderMinimap();
    this.cb.onModalChange(true);
  }

  closeModal() {
    if (!this.openModalId) return;
    const prev = this.openModalId;
    document.getElementById(prev).classList.add('hidden');
    this.openModalId = null;
    this.moveSourceIdx = null;
    if (prev === 'modal-chest') {
      this.cb.send({ type: 'chest_close' });
      this.currentChest = null;
    }
    if (prev === 'modal-furnace') {
      this.cb.send({ type: 'furnace_close' });
      this.currentFurnace = null;
    }
    this.cb.onModalChange(false);
  }

  setActiveSlot(idx) {
    this.activeSlot = ((idx % 9) + 9) % 9;
    this.renderHotbar();
    this.cb.onActiveSlotChange(this.getActiveItemId());
  }

  getActiveItemId() {
    return this.bag[this.activeSlot]?.block || null;
  }

  updateBag(bag) {
    this.bag = bag || [];
    this.renderHotbar();
    this.cb.onActiveSlotChange(this.getActiveItemId());
    if (this.openModalId === 'modal-bag') this.renderBagModal();
    if (this.openModalId === 'modal-craft') this.renderCraftModal();
    if (this.openModalId === 'modal-chest') this.renderChestModal();
    if (this.openModalId === 'modal-furnace') this.renderFurnaceModal();
  }

  _countInBag(itemId) {
    let total = 0;
    for (const s of this.bag) if (s && s.block === itemId) total += s.count;
    return total;
  }

  _makeSlotEl(slotData, opts = {}) {
    const el = document.createElement('div');
    el.className = 'slot';
    if (opts.active) el.classList.add('active');
    if (opts.selectedMove) el.classList.add('selected-move');

    if (opts.keyLabel !== undefined) {
      const k = document.createElement('span');
      k.className = 'slot-key';
      k.textContent = opts.keyLabel;
      el.appendChild(k);
    }

    if (slotData && slotData.block && slotData.count > 0) {
      const img = document.createElement('img');
      img.src = this.textures.getIcon(slotData.block);
      img.alt = slotData.block;
      el.appendChild(img);

      if (slotData.count > 1) {
        const cnt = document.createElement('span');
        cnt.className = 'slot-count';
        cnt.textContent = slotData.count;
        el.appendChild(cnt);
      }
      el.title = `${this.catalog[slotData.block]?.name || slotData.block} (${slotData.count})`;
    }
    return el;
  }

  renderHotbar() {
    const container = document.getElementById('hotbar');
    container.innerHTML = '';
    for (let i = 0; i < 9; i++) {
      const el = this._makeSlotEl(this.bag[i], { active: i === this.activeSlot, keyLabel: i + 1 });
      el.addEventListener('click', () => this.setActiveSlot(i));
      container.appendChild(el);
    }
    const cur = this.bag[this.activeSlot];
    const def = cur ? this.catalog[cur.block] : null;
    document.getElementById('hotbar-label').textContent = def
      ? `${def.name}${cur.count > 1 ? ` (${cur.count}개)` : ''}`
      : '맨손 (E 가방 · C 제작)';
  }

  renderBagModal() {
    const mainGrid = document.getElementById('bag-grid');
    const hotGrid = document.getElementById('bag-hotbar-grid');
    mainGrid.innerHTML = '';
    hotGrid.innerHTML = '';

    const bindBagSlot = (el, idx) => {
      el.addEventListener('click', () => {
        if (this.moveSourceIdx === null) {
          if (this.bag[idx]) { this.moveSourceIdx = idx; this.renderBagModal(); }
        } else {
          if (this.moveSourceIdx !== idx) {
            this.cb.send({ type: 'bag_move', fromIndex: this.moveSourceIdx, toIndex: idx });
          }
          this.moveSourceIdx = null;
          this.renderBagModal();
        }
      });
      el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        if (this.bag[idx]) this.cb.send({ type: 'bag_clear_slot', index: idx });
      });
    };

    for (let i = 9; i < 27; i++) {
      const el = this._makeSlotEl(this.bag[i], { selectedMove: this.moveSourceIdx === i });
      bindBagSlot(el, i);
      mainGrid.appendChild(el);
    }
    for (let i = 0; i < 9; i++) {
      const el = this._makeSlotEl(this.bag[i], { keyLabel: i + 1, selectedMove: this.moveSourceIdx === i });
      bindBagSlot(el, i);
      hotGrid.appendChild(el);
    }
  }

  _renderSupplyCatalog() {
    const grid = document.getElementById('supply-grid');
    grid.innerHTML = '';
    const supplyAllow = [
      'planks', 'cobble', 'brick', 'glass', 'wood', 'grass', 'dirt', 'sand', 'lamp',
      'wool_white', 'wool_red', 'wool_blue', 'wool_yellow', 'sapling', 'wheat_seeds',
      'bed', 'door_closed', 'ladder', 'sign', 'tnt', 'portal', 'jumppad', 'furnace', 'chest'
    ];
    for (const id of supplyAllow) {
      const def = this.catalog[id];
      if (!def) continue;
      const btn = document.createElement('div');
      btn.className = 'supply-item';
      const img = document.createElement('img');
      img.src = this.textures.getIcon(def.id);
      const span = document.createElement('span');
      span.textContent = def.name;
      btn.append(img, span);
      btn.addEventListener('click', () => {
        const amt = def.id === 'chest' ? 2 : 32;
        this.cb.send({ type: 'bag_supply', block: def.id, count: amt });
      });
      grid.appendChild(btn);
    }
  }

  renderCraftModal() {
    const list = document.getElementById('craft-list');
    list.innerHTML = '';
    const filtered = this.craftCat === '전체'
      ? this.recipes
      : this.recipes.filter(r => r.category === this.craftCat);

    for (const r of filtered) {
      const outDef = this.catalog[r.out.item];
      if (!outDef) continue;
      let canCraft = true;
      const reqTexts = r.in.map((req) => {
        const have = this._countInBag(req.item);
        if (have < req.count) canCraft = false;
        const name = this.catalog[req.item]?.name || req.item;
        return `${name} ${have}/${req.count}`;
      });

      const card = document.createElement('div');
      card.className = `craft-card${canCraft ? ' can-craft' : ''}`;

      const info = document.createElement('div');
      info.className = 'craft-info';
      const img = document.createElement('img');
      img.src = this.textures.getIcon(r.out.item);
      const txt = document.createElement('div');
      txt.innerHTML = `<div class="craft-name">${this._esc(outDef.name)} ×${r.out.count}</div><div class="craft-reqs">${reqTexts.join(' · ')}</div>`;
      info.append(img, txt);

      const btn = document.createElement('button');
      btn.className = `btn-sm${canCraft ? ' accent' : ''}`;
      btn.textContent = '제작';
      btn.disabled = !canCraft;
      btn.addEventListener('click', () => {
        this.cb.send({ type: 'craft', recipeId: r.id });
      });

      card.append(info, btn);
      list.appendChild(card);
    }
  }

  setSkins(list) {
    this.skins = list || [];
    if (this.openModalId === 'modal-skin') this.renderSkinGallery();
  }

  renderSkinGallery() {
    const grid = document.getElementById('skin-gallery');
    grid.innerHTML = '';
    for (const entry of this.skins) {
      const s = entry.skin || {};
      const card = document.createElement('div');
      card.className = 'skin-card';
      const previewHtml = s.pixelDataUrl
        ? `<img src="${s.pixelDataUrl}" class="skin-pixel-thumb" alt="pixel skin" />`
        : `<div class="skin-avatar-mini">
            ${s.hatColor ? `<div class="sk-m-hat" style="background:${this._esc(s.hatColor)}"></div>` : ''}
            <div class="sk-m-head" style="background:${this._esc(s.skinColor || '#f5cfa0')};border-top:5px solid ${this._esc(s.hairColor || '#3b2416')}"></div>
            <div class="sk-m-body" style="background:${this._esc(s.shirtColor || '#38bdf8')}"></div>
            <div class="sk-m-legs" style="background:${this._esc(s.pantsColor || '#334155')}"></div>
          </div>`;
      card.innerHTML = `
        ${previewHtml}
        <div class="skin-card-name">${this._esc(entry.name)}</div>
        <div class="skin-card-author">${this._esc(entry.author)} · ❤️ ${entry.likes || 0}</div>
      `;
      const row = document.createElement('div');
      row.className = 'btn-row';
      const wearBtn = document.createElement('button');
      wearBtn.className = 'btn-sm accent';
      wearBtn.textContent = '입기';
      wearBtn.addEventListener('click', () => {
        this._loadSkinIntoInputs(s);
        if (s.pixelDataUrl && this.pixelEditor) this.pixelEditor.loadDataUrl(s.pixelDataUrl);
        this.cb.onApplySkin(s);
      });
      const likeBtn = document.createElement('button');
      likeBtn.className = 'btn-sm';
      likeBtn.textContent = '♥';
      likeBtn.addEventListener('click', () => this.cb.send({ type: 'skin_like', id: entry.id }));
      row.append(wearBtn, likeBtn);
      card.appendChild(row);
      grid.appendChild(card);
    }
  }

  openFurnaceData(furnace) {
    this.currentFurnace = furnace;
    if (this.openModalId !== 'modal-furnace') this.openModal('modal-furnace');
    this.renderFurnaceModal();
  }

  _fillSingleSlot(el, slotData) {
    el.innerHTML = '';
    if (slotData && slotData.block && slotData.count > 0) {
      const img = document.createElement('img');
      img.src = this.textures.getIcon(slotData.block);
      el.appendChild(img);
      const cnt = document.createElement('span');
      cnt.className = 'slot-count';
      cnt.textContent = slotData.count;
      el.appendChild(cnt);
      el.title = `${this.catalog[slotData.block]?.name || slotData.block} (${slotData.count})`;
    } else {
      el.title = '';
    }
  }

  renderFurnaceModal() {
    if (!this.currentFurnace) return;
    const f = this.currentFurnace;
    this._fillSingleSlot(document.getElementById('furnace-input-slot'), f.input);
    this._fillSingleSlot(document.getElementById('furnace-fuel-slot'), f.fuel);
    this._fillSingleSlot(document.getElementById('furnace-output-slot'), f.output);

    const flame = document.getElementById('furnace-flame');
    flame.classList.toggle('burning', (f.burnLeft || 0) > 0);
    document.getElementById('furnace-status').textContent = (f.burnLeft || 0) > 0
      ? `제련 중... (${Math.round(((f.progress || 0) / 3) * 100)}%)`
      : '재료와 연료를 넣으세요';

    const bagGrid = document.getElementById('furnace-bag-grid');
    bagGrid.innerHTML = '';
    for (let i = 0; i < 27; i++) {
      const slot = this.bag[i];
      const el = this._makeSlotEl(slot, i < 9 ? { keyLabel: i + 1 } : {});
      el.addEventListener('click', () => {
        if (!slot) return;
        const target = SMELT_INPUTS.has(slot.block) ? 'input' : FUEL_ITEMS.has(slot.block) ? 'fuel' : null;
        if (!target) {
          this.toast('🔥 화로에는 원석·모래·조약돌·생고기 또는 연료(석탄/나무)만 넣을 수 있습니다.', 'warn');
          return;
        }
        this.cb.send({ type: 'furnace_put', x: f.x, y: f.y, z: f.z, target, bagIndex: i });
      });
      bagGrid.appendChild(el);
    }
  }

  openChestData(chest) {
    this.currentChest = chest;
    if (this.openModalId !== 'modal-chest') this.openModal('modal-chest');
    this.renderChestModal();
  }

  renderChestModal() {
    if (!this.currentChest) return;
    const c = this.currentChest;
    document.getElementById('chest-title').textContent = c.label || '보관 상자';
    document.getElementById('chest-info').textContent = `위치: (${c.x}, ${c.y}, ${c.z}) · 설치자: ${c.owner}`;
    document.getElementById('chest-rename-input').value = c.label || '';

    const chestGrid = document.getElementById('chest-grid');
    const bagGrid = document.getElementById('chest-bag-grid');
    chestGrid.innerHTML = '';
    bagGrid.innerHTML = '';

    for (let i = 0; i < 27; i++) {
      const slot = c.slots[i];
      const el = this._makeSlotEl(slot);
      el.addEventListener('click', (e) => {
        if (!slot) return;
        const amt = e.shiftKey ? Math.max(1, Math.ceil(slot.count / 2)) : slot.count;
        this.cb.send({ type: 'chest_transfer', x: c.x, y: c.y, z: c.z, direction: 'to_bag', fromIndex: i, amount: amt });
      });
      chestGrid.appendChild(el);
    }

    for (let i = 0; i < 27; i++) {
      const slot = this.bag[i];
      const el = this._makeSlotEl(slot, i < 9 ? { keyLabel: i + 1 } : {});
      el.addEventListener('click', (e) => {
        if (!slot) return;
        const amt = e.shiftKey ? Math.max(1, Math.ceil(slot.count / 2)) : slot.count;
        this.cb.send({ type: 'chest_transfer', x: c.x, y: c.y, z: c.z, direction: 'to_chest', fromIndex: i, amount: amt });
      });
      bagGrid.appendChild(el);
    }
  }

  setBlueprints(list) {
    this.blueprints = list || [];
    if (this.openModalId === 'modal-blueprint') this.renderBlueprints();
  }

  renderBlueprints() {
    const container = document.getElementById('bp-list');
    container.innerHTML = '';
    for (const bp of this.blueprints) {
      const row = document.createElement('div');
      row.className = 'list-row';
      const info = document.createElement('div');
      info.innerHTML = `<strong>${this._esc(bp.name)}</strong><div class="list-meta">작성자: ${this._esc(bp.author)} · ${bp.blocks.length}블록</div>`;
      const actions = document.createElement('div');
      actions.className = 'btn-row';
      const projBtn = document.createElement('button');
      projBtn.className = 'btn-sm accent';
      projBtn.textContent = '앞에 투영';
      projBtn.addEventListener('click', () => {
        this.cb.projector.project(bp, this.cb.getFrontPos());
        this.toast(`📐 "${bp.name}" 설계도를 투영했습니다!`, 'success');
      });
      actions.appendChild(projBtn);
      if (this.isAdmin || bp.author === this.selfNick) {
        const delBtn = document.createElement('button');
        delBtn.className = 'btn-sm danger';
        delBtn.textContent = '삭제';
        delBtn.addEventListener('click', () => this.cb.send({ type: 'blueprint_remove', id: bp.id }));
        actions.appendChild(delBtn);
      }
      row.append(info, actions);
      container.appendChild(row);
    }
  }

  updateBlueprintHUD(progress) {
    const hud = document.getElementById('bp-hud');
    const controls = document.getElementById('bp-controls');
    if (!progress) {
      hud.classList.add('hidden');
      controls.classList.add('hidden');
      return;
    }
    hud.classList.remove('hidden');
    controls.classList.remove('hidden');
    document.getElementById('bp-hud-name').textContent = progress.name;
    document.getElementById('bp-hud-fill').style.width = `${progress.percent}%`;
    document.getElementById('bp-hud-stats').textContent = `${progress.done} / ${progress.total} 블록 (${progress.percent}%)`;
    document.getElementById('bp-origin-info').textContent =
      `기준점: (${progress.origin.x}, ${progress.origin.y}, ${progress.origin.z}) · 회전: ${progress.rotation}°`;
  }

  setAdminStatus(isAdmin) {
    this.isAdmin = !!isAdmin;
    this._updateAdminUI();
    if (this.openModalId === 'modal-admin') this.renderRegions();
  }

  _updateAdminUI() {
    document.getElementById('hud-admin-badge').classList.toggle('hidden', !this.isAdmin);
    document.getElementById('admin-auth-box').classList.toggle('hidden', this.isAdmin);
    document.getElementById('admin-panel-box').classList.toggle('hidden', !this.isAdmin);
  }

  setRegions(list) {
    this.regions = list || [];
    this.cb.regionVis.setRegions(this.regions);
    if (this.openModalId === 'modal-admin') this.renderRegions();
  }

  renderRegions() {
    const container = document.getElementById('region-list');
    container.innerHTML = '';
    if (this.regions.length === 0) {
      container.innerHTML = '<div class="small-note">지정된 보호 구역이 없습니다.</div>';
      return;
    }
    for (const r of this.regions) {
      const row = document.createElement('div');
      row.className = 'list-row';
      const info = document.createElement('div');
      info.innerHTML = `<strong>🔒 ${this._esc(r.name)}</strong><div class="list-meta">(${r.minX},${r.minY},${r.minZ}) ~ (${r.maxX},${r.maxY},${r.maxZ}) · ${this._esc(r.createdBy)}</div>`;
      row.appendChild(info);
      if (this.isAdmin) {
        const delBtn = document.createElement('button');
        delBtn.className = 'btn-sm danger';
        delBtn.textContent = '해제';
        delBtn.addEventListener('click', () => this.cb.send({ type: 'region_remove', id: r.id }));
        row.appendChild(delBtn);
      }
      container.appendChild(row);
    }
  }

  updatePlayersList(self, remotePlayers, maxPlayers) {
    this._lastSelf = self;
    this._lastRemotes = remotePlayers || [];
    const all = [self, ...this._lastRemotes];
    document.getElementById('hud-players').textContent = `👥 ${all.length}/${maxPlayers}`;
    const list = document.getElementById('player-list');
    list.innerHTML = '';
    for (const p of all) {
      const chip = document.createElement('div');
      chip.className = 'player-chip';
      const dot = document.createElement('span');
      dot.className = 'player-dot';
      dot.style.background = p.skin?.shirtColor || p.color || '#38bdf8';
      const name = document.createElement('span');
      name.textContent = `${p.isAdmin ? '🛡️ ' : ''}${p.nickname}${p.id === self.id ? ' (나)' : ''}`;
      chip.append(dot, name);
      list.appendChild(chip);
    }
    if (this.openModalId === 'modal-admin') this.renderAdminPlayers();
  }

  renderAdminPlayers() {
    const container = document.getElementById('adm-player-list');
    if (!container) return;
    container.innerHTML = '';
    const remotes = this._lastRemotes || [];
    if (remotes.length === 0) {
      container.innerHTML = '<div class="small-note">현재 다른 접속자가 없습니다.</div>';
      return;
    }
    for (const p of remotes) {
      const row = document.createElement('div');
      row.className = 'list-row';
      row.innerHTML = `<span>${p.isAdmin ? '🛡️ ' : ''}${this._esc(p.nickname)}</span>`;
      const btn = document.createElement('button');
      btn.className = 'btn-sm danger';
      btn.textContent = '강퇴';
      btn.addEventListener('click', () => this.cb.send({ type: 'admin_kick', targetId: p.id }));
      row.appendChild(btn);
      container.appendChild(row);
    }
  }

  renderMinimap() {
    const canvas = document.getElementById('minimap-canvas');
    if (!canvas || !this.cb.getMinimapData) return;
    const ctx = canvas.getContext('2d');
    const { worldRenderer, playerPos, remotes, portals } = this.cb.getMinimapData();
    if (!worldRenderer) return;

    const b = worldRenderer.bounds;
    const W = b.maxX - b.minX + 1;
    const H = b.maxZ - b.minZ + 1;
    const img = ctx.createImageData(W, H);
    const COLORS = {
      grass: [94, 168, 50], dirt: [134, 96, 67], stone: [127, 132, 138], cobble: [118, 122, 128],
      wood: [110, 76, 44], planks: [184, 141, 86], leaves: [45, 135, 50], sand: [226, 211, 156],
      water: [37, 99, 235], gold: [250, 204, 21], brick: [169, 72, 59], farmland: [92, 61, 40],
      wheat_3: [234, 179, 8], portal: [168, 85, 247], jumppad: [34, 211, 238]
    };

    for (let iz = 0; iz < H; iz++) {
      for (let ix = 0; ix < W; ix++) {
        const wx = b.minX + ix;
        const wz = b.minZ + iz;
        let col = [30, 41, 59];
        for (let wy = b.maxY; wy >= 12; wy--) {
          const blk = worldRenderer.getBlock(wx, wy, wz);
          if (blk) {
            col = COLORS[blk] || [148, 163, 184];
            break;
          }
        }
        const idx = (iz * W + ix) * 4;
        img.data[idx] = col[0]; img.data[idx + 1] = col[1]; img.data[idx + 2] = col[2]; img.data[idx + 3] = 255;
      }
    }

    const tmp = document.createElement('canvas');
    tmp.width = W; tmp.height = H;
    tmp.getContext('2d').putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tmp, 0, 0, canvas.width, canvas.height);

    const sx = canvas.width / W;
    const sz = canvas.height / H;

    // Portals (purple)
    const warpRow = document.getElementById('map-portal-warps');
    warpRow.innerHTML = '';
    for (const p of Object.values(portals || {})) {
      ctx.fillStyle = '#c084fc';
      ctx.fillRect((p.x - b.minX) * sx - 3, (p.z - b.minZ) * sz - 3, 6, 6);
      const btn = document.createElement('button');
      btn.className = 'btn-sm';
      btn.textContent = `🌀 ${p.channel} (${p.x},${p.y},${p.z})`;
      btn.addEventListener('click', () => {
        this.cb.onWarp(p.x + 0.5, p.y + 1.1, p.z + 0.5, p.channel);
        this.closeModal();
      });
      warpRow.appendChild(btn);
    }

    // Remote players (green)
    for (const r of remotes) {
      ctx.fillStyle = '#22c55e';
      ctx.beginPath();
      ctx.arc((r.x - b.minX) * sx, (r.z - b.minZ) * sz, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Self (bright blue)
    ctx.fillStyle = '#38bdf8';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc((playerPos.x - b.minX) * sx, (playerPos.z - b.minZ) * sz, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  addChatMessage(msg) {
    const box = document.getElementById('chat-messages');
    const div = document.createElement('div');
    div.className = msg.system ? 'chat-msg system' : 'chat-msg';
    if (msg.system) {
      div.textContent = msg.text;
    } else {
      const badge = msg.isAdmin ? '🛡️ ' : '';
      div.innerHTML = `<strong style="color:${msg.color || '#38bdf8'}">${badge}${this._esc(msg.from)}</strong>: ${this._esc(msg.text)}`;
    }
    box.appendChild(div);
    while (box.children.length > 50) box.removeChild(box.firstChild);
    box.scrollTop = box.scrollHeight;
  }

  toast(text, level = 'info') {
    const container = document.getElementById('toast-container');
    const el = document.createElement('div');
    el.className = `toast ${level}`;
    el.textContent = text;
    container.appendChild(el);
    setTimeout(() => el.remove(), 3200);
  }

  _esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}
