import * as THREE from '../vendor/three/three.module.min.js';

// Build a crisp 3D held item mesh (used both for first-person hand & remote players!)
export function buildHeldItemMesh(itemId, catalog, textures) {
  const def = itemId ? catalog[itemId] : null;
  if (!def) return null;

  if (def.kind === 'tool') {
    const group = new THREE.Group();
    const handleMat = new THREE.MeshLambertMaterial({ color: '#784820' });
    const headMat = new THREE.MeshLambertMaterial({ color: def.color || '#cbd5e1' });

    // Wooden handle
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.48, 0.055), handleMat);
    handle.position.set(0, 0.14, 0);
    group.add(handle);

    if (def.toolType === 'pickaxe') {
      const topBar = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.075, 0.36), headMat);
      topBar.position.set(0, 0.36, 0);
      const tipF = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.09, 0.07), headMat);
      tipF.position.set(0, 0.31, -0.17);
      const tipB = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.09, 0.07), headMat);
      tipB.position.set(0, 0.31, 0.17);
      group.add(topBar, tipF, tipB);
    } else if (def.toolType === 'axe') {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, 0.18), headMat);
      blade.position.set(0, 0.31, -0.09);
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.09, 0.07), headMat);
      back.position.set(0, 0.34, 0.04);
      group.add(blade, back);
    } else if (def.toolType === 'shovel') {
      const scoop = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.18, 0.055), headMat);
      scoop.position.set(0, 0.42, 0);
      group.add(scoop);
    } else if (def.toolType === 'hoe') {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.07, 0.22), headMat);
      bar.position.set(0, 0.36, -0.07);
      const tip = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.1, 0.06), headMat);
      tip.position.set(0, 0.3, -0.15);
      group.add(bar, tip);
    }
    group.rotation.x = -0.35;
    return group;
  }

  if (def.kind === 'block') {
    const mats = textures.getBoxMaterials(itemId);
    if (!mats) return null;
    const cube = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.24, 0.24), mats);
    cube.position.set(0, 0.12, -0.04);
    cube.rotation.set(0.15, 0.6, 0);
    return cube;
  }

  // Regular item / food (apple, coal, ingot, diamond_gem, stick)
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

    this.root = new THREE.Group();
    this.root.position.set(0.42, -0.38, -0.62);
    this.camera.add(this.root);

    // Blocky arm
    this.skinMat = new THREE.MeshLambertMaterial({ color: '#f5cfa0' });
    this.sleeveMat = new THREE.MeshLambertMaterial({ color: '#38bdf8' });

    const armGroup = new THREE.Group();
    const forearm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.34, 0.16), this.skinMat);
    forearm.position.set(0, -0.14, 0.08);
    forearm.rotation.x = 0.7;
    const sleeve = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.2, 0.17), this.sleeveMat);
    sleeve.position.set(0, -0.26, 0.2);
    sleeve.rotation.x = 0.7;
    armGroup.add(forearm, sleeve);
    this.root.add(armGroup);

    this.itemAnchor = new THREE.Group();
    this.itemAnchor.position.set(-0.04, 0.04, -0.04);
    this.root.add(this.itemAnchor);

    this.currentItemId = null;
    this.swingTime = 0;
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
  }

  triggerSwing() {
    this.swingTime = 1.0;
  }

  update(dt, isMoving, isMining) {
    if (isMining && this.swingTime <= 0.1) {
      this.swingTime = 1.0;
    }

    if (this.swingTime > 0) {
      this.swingTime = Math.max(0, this.swingTime - dt * 5.2);
    }

    if (isMoving) {
      this.bobPhase += dt * 9;
    }

    const swing = Math.sin(this.swingTime * Math.PI);
    const bobX = isMoving ? Math.cos(this.bobPhase * 0.5) * 0.018 : 0;
    const bobY = isMoving ? Math.abs(Math.sin(this.bobPhase * 0.5)) * 0.022 : 0;

    this.root.position.set(
      0.42 + bobX - swing * 0.14,
      -0.38 - bobY + swing * 0.06,
      -0.62 - swing * 0.16
    );
    this.root.rotation.set(
      -swing * 0.95,
      swing * 0.35,
      swing * 0.25
    );
  }
}
