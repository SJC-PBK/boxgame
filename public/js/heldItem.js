import * as THREE from '../vendor/three/three.module.min.js';

// Build a crisp 3D held item mesh (used both for first-person hand & remote players!)
export function buildHeldItemMesh(itemId, catalog, textures) {
  const def = itemId ? catalog[itemId] : null;
  if (!def) return null;

  if (def.kind === 'tool') {
    const group = new THREE.Group();
    const handleMat = new THREE.MeshLambertMaterial({ color: '#784820' });
    const headMat = new THREE.MeshLambertMaterial({ color: def.color || '#cbd5e1' });

    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.48, 0.055), handleMat);
    handle.position.set(0, 0.14, 0);
    group.add(handle);

    if (def.toolType === 'pickaxe') {
      // Wide arched Pickaxe head with sharp curved tips
      const topBar = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.08, 0.42), headMat);
      topBar.position.set(0, 0.37, 0);
      const tipF = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.13, 0.08), headMat);
      tipF.position.set(0, 0.30, -0.21);
      tipF.rotation.x = 0.25;
      const tipB = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.13, 0.08), headMat);
      tipB.position.set(0, 0.30, 0.21);
      tipB.rotation.x = -0.25;
      group.add(topBar, tipF, tipB);
    } else if (def.toolType === 'axe') {
      // Wide heavy crescent Axe blade clearly facing forward
      const bladeMain = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.24, 0.22), headMat);
      bladeMain.position.set(0, 0.32, -0.11);
      const bladeEdge = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.28, 0.06), headMat);
      bladeEdge.position.set(0, 0.31, -0.22);
      const poll = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.10, 0.08), headMat);
      poll.position.set(0, 0.35, 0.05);
      group.add(bladeMain, bladeEdge, poll);
    } else if (def.toolType === 'shovel') {
      // Broad flat diamond-spade Shovel scoop at the top
      const collar = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.08), headMat);
      collar.position.set(0, 0.36, 0);
      const scoop = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.22, 0.045), headMat);
      scoop.position.set(0, 0.47, 0);
      const tip = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.07, 0.04), headMat);
      tip.position.set(0, 0.59, 0);
      group.add(collar, scoop, tip);
    } else if (def.toolType === 'hoe') {
      // Distinct L-shaped hooked farming Hoe pointing forward only
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.075, 0.26), headMat);
      bar.position.set(0, 0.37, -0.11);
      const hook = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.15, 0.065), headMat);
      hook.position.set(0, 0.28, -0.22);
      group.add(bar, hook);
    }
    group.rotation.set(-0.28, 0.12, 0.05);
    return group;
  }

  if (def.kind === 'block') {
    // Render custom silhouette items (furniture, stairs, thin slabs) using their crisp transparent sprite!
    if (itemId.startsWith('furn_') || itemId.startsWith('stairs_') || itemId.startsWith('slab_')) {
      const customTex = textures.getItemTexture(itemId);
      if (customTex) {
        const mat = new THREE.MeshBasicMaterial({ map: customTex, transparent: true, alphaTest: 0.2, side: THREE.DoubleSide });
        const plane = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.32), mat);
        plane.position.set(0, 0.16, -0.05);
        plane.rotation.y = Math.PI / 5;
        return plane;
      }
    }
    const mats = textures.getBoxMaterials(itemId);
    if (!mats) return null;
    const cube = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.24, 0.24), mats);
    cube.position.set(0, 0.12, -0.04);
    cube.rotation.set(0.15, 0.65, 0);
    return cube;
  }

  const tex = textures.getItemTexture(itemId);
  if (!tex) return null;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.2, side: THREE.DoubleSide });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.28), mat);
  plane.position.set(0, 0.16, -0.05);
  plane.rotation.y = Math.PI / 5;
  return plane;
}

export class FirstPersonHand {
  constructor(camera, catalog, textures) {
    this.camera = camera;
    this.catalog = catalog;
    this.textures = textures;

    // Shoulder-like pivot positioned at bottom-right of camera view
    this.root = new THREE.Group();
    this.basePos = new THREE.Vector3(0.46, -0.42, -0.58);
    this.root.position.copy(this.basePos);
    this.camera.add(this.root);

    this.skinMat = new THREE.MeshLambertMaterial({ color: '#f5cfa0' });
    this.sleeveMat = new THREE.MeshLambertMaterial({ color: '#38bdf8' });

    // Minecraft / HANKAN style sleek diagonal right arm
    this.armGroup = new THREE.Group();
    this.armGroup.rotation.set(-0.55, 0.38, -0.22);

    const handTip = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.22, 0.17), this.skinMat);
    handTip.position.set(0, 0.04, -0.06);
    const sleeve = new THREE.Mesh(new THREE.BoxGeometry(0.185, 0.44, 0.185), this.sleeveMat);
    sleeve.position.set(0, -0.24, 0.04);
    this.armGroup.add(handTip, sleeve);
    this.root.add(this.armGroup);

    // Held tool/block anchor at the fist
    this.itemAnchor = new THREE.Group();
    this.itemAnchor.position.set(-0.02, 0.08, -0.08);
    this.root.add(this.itemAnchor);

    this.currentItemId = null;
    this.swingProgress = 0; // 0 = idle, 0..1 = active swing
    this.swinging = false;
    this.bobPhase = 0;
  }

  setSkin(skin) {
    if (!skin) return;
    if (skin.skinColor) this.skinMat.color.set(skin.skinColor);
    if (skin.shirtColor) this.sleeveMat.color.set(skin.shirtColor);
  }

  setVisible(v) {
    this.root.visible = v;
  }

  setHeldItem(itemId) {
    if (this.currentItemId === itemId) return;
    this.currentItemId = itemId;
    while (this.itemAnchor.children.length > 0) {
      this.itemAnchor.remove(this.itemAnchor.children[0]);
    }
    const mesh = buildHeldItemMesh(itemId, this.catalog, this.textures);
    if (mesh) this.itemAnchor.add(mesh);
    // Show bare arm prominently when empty-handed, slightly tucked when holding a tool/block
    this.armGroup.position.set(mesh ? 0.04 : 0, mesh ? -0.05 : 0.04, mesh ? 0.06 : 0);
  }

  triggerSwing() {
    if (!this.swinging || this.swingProgress > 0.65) {
      this.swinging = true;
      this.swingProgress = 0;
    }
  }

  update(dt, isMoving, isMining) {
    if (isMining && !this.swinging) {
      this.swinging = true;
      this.swingProgress = 0;
    }

    if (this.swinging) {
      this.swingProgress += dt * 4.4; // Snappy ~0.23s Minecraft chop cycle
      if (this.swingProgress >= 1) {
        if (isMining) {
          this.swingProgress %= 1;
        } else {
          this.swingProgress = 0;
          this.swinging = false;
        }
      }
    }

    if (isMoving) this.bobPhase += dt * 9.5;

    // Authentic Minecraft sqrt-sine easing: fast downward strike, smooth ease-out return!
    const p = this.swinging ? this.swingProgress : 0;
    const s1 = Math.sin(Math.sqrt(p) * Math.PI);
    const s2 = Math.sin(p * p * Math.PI);

    const bobX = isMoving ? Math.cos(this.bobPhase * 0.5) * 0.02 : 0;
    const bobY = isMoving ? Math.abs(Math.sin(this.bobPhase * 0.5)) * 0.024 : 0;

    // Inward + forward + downward chop arc
    this.root.position.set(
      this.basePos.x + bobX - s1 * 0.24,
      this.basePos.y - bobY + Math.sin(Math.sqrt(p) * Math.PI * 2) * 0.04 - s2 * 0.08,
      this.basePos.z - s1 * 0.14
    );

    // Natural wrist pitch forward & inward roll
    this.root.rotation.set(
      -s1 * 1.05,
      s1 * 0.52 - s2 * 0.25,
      s1 * 0.42
    );
  }
}
