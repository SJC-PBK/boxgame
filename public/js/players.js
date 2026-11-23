import * as THREE from '../vendor/three/three.module.min.js';
import { buildHeldItemMesh } from './heldItem.js';

function makeNameplateSprite(nickname, isAdmin) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, 256, 64);
  ctx.fillStyle = 'rgba(15, 23, 42, 0.78)';
  ctx.beginPath();
  ctx.roundRect(16, 12, 224, 40, 12);
  ctx.fill();

  ctx.font = 'bold 22px Pretendard, Malgun Gothic, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = isAdmin ? '#fde047' : '#ffffff';
  const label = isAdmin ? `🛡️ ${nickname}` : nickname;
  ctx.fillText(label.slice(0, 18), 128, 33);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(1.8, 0.45, 1);
  sprite.position.set(0, 2.32, 0);
  return sprite;
}

export function createAvatarRig(skin = {}, showNameplate = false, nickname = '', isAdmin = false) {
  const group = new THREE.Group();
  const skinMat = new THREE.MeshLambertMaterial({ color: skin.skinColor || '#f5cfa0' });
  const hairMat = new THREE.MeshLambertMaterial({ color: skin.hairColor || '#3b2416' });
  const shirtMat = new THREE.MeshLambertMaterial({ color: skin.shirtColor || '#38bdf8' });
  const pantsMat = new THREE.MeshLambertMaterial({ color: skin.pantsColor || '#334155' });
  const eyeMat = new THREE.MeshLambertMaterial({ color: skin.eyeColor || '#0f172a' });
  const blushMat = new THREE.MeshLambertMaterial({ color: '#f472b6' });
  const hatMat = new THREE.MeshLambertMaterial({ color: skin.hatColor || '#facc15' });

  // Legs
  const legGeo = new THREE.BoxGeometry(0.24, 0.65, 0.24);
  const leftLeg = new THREE.Mesh(legGeo, pantsMat);
  leftLeg.position.set(-0.14, 0.325, 0);
  const rightLeg = new THREE.Mesh(legGeo, pantsMat);
  rightLeg.position.set(0.14, 0.325, 0);

  // Torso
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.68, 0.28), shirtMat);
  torso.position.set(0, 0.99, 0);

  // Arms
  const armGeo = new THREE.BoxGeometry(0.2, 0.62, 0.22);
  const leftArm = new THREE.Mesh(armGeo, shirtMat);
  leftArm.position.set(-0.38, 0.99, 0);

  const rightArmPivot = new THREE.Group();
  rightArmPivot.position.set(0.38, 1.24, 0);
  const rightArmMesh = new THREE.Mesh(armGeo, shirtMat);
  rightArmMesh.position.set(0, -0.25, 0);
  rightArmPivot.add(rightArmMesh);

  const handAnchor = new THREE.Group();
  handAnchor.position.set(0, -0.52, -0.14);
  handAnchor.rotation.x = 0.25;
  rightArmPivot.add(handAnchor);

  // Head
  const head = new THREE.Group();
  head.position.set(0, 1.56, 0);
  const headBox = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.46, 0.46), skinMat);
  head.add(headBox);

  // Hair cap
  const hairGroup = new THREE.Group();
  const hairTop = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.14, 0.48), hairMat);
  hairTop.position.set(0, 0.2, 0);
  const hairBack = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.34, 0.12), hairMat);
  hairBack.position.set(0, 0.05, 0.2);
  hairGroup.add(hairTop, hairBack);
  head.add(hairGroup);

  // Optional hat
  const hatGroup = new THREE.Group();
  const hatCrown = new THREE.Mesh(new THREE.BoxGeometry(0.51, 0.16, 0.51), hatMat);
  hatCrown.position.set(0, 0.26, 0);
  const hatBrim = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.05, 0.22), hatMat);
  hatBrim.position.set(0, 0.18, -0.28);
  hatGroup.add(hatCrown, hatBrim);
  hatGroup.visible = !!skin.hatColor;
  head.add(hatGroup);

  // Eyes & Blush on -Z face
  const faceDetails = new THREE.Group();
  const eyeGeo = new THREE.BoxGeometry(0.08, 0.08, 0.02);
  const lEye = new THREE.Mesh(eyeGeo, eyeMat);
  lEye.position.set(-0.1, 0.02, -0.24);
  const rEye = new THREE.Mesh(eyeGeo, eyeMat);
  rEye.position.set(0.1, 0.02, -0.24);
  const blushGeo = new THREE.BoxGeometry(0.08, 0.04, 0.02);
  const lBlush = new THREE.Mesh(blushGeo, blushMat);
  lBlush.position.set(-0.14, -0.08, -0.24);
  const rBlush = new THREE.Mesh(blushGeo, blushMat);
  rBlush.position.set(0.14, -0.08, -0.24);
  lBlush.visible = !!skin.blush;
  rBlush.visible = !!skin.blush;
  faceDetails.add(lEye, rEye, lBlush, rBlush);
  head.add(faceDetails);

  group.add(leftLeg, rightLeg, torso, leftArm, rightArmPivot, head);

  let nameplate = null;
  if (showNameplate) {
    nameplate = makeNameplateSprite(nickname, isAdmin);
    group.add(nameplate);
  }

  const rig = {
    group, head, headBox, torso, leftArm, rightArmPivot, rightArmMesh, leftLeg, rightLeg, handAnchor, nameplate,
    mats: { skinMat, hairMat, shirtMat, pantsMat, eyeMat, hatMat },
    hairGroup, hatGroup, faceDetails, lBlush, rBlush
  };
  if (skin.pixelDataUrl) applySkinToRig(rig, skin);
  return rig;
}

function cropCanvasTexture(img, sx, sy, sw, sh) {
  const c = document.createElement('canvas');
  c.width = sw; c.height = sh;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshLambertMaterial({ map: tex });
}

function disposeCustomSkinMats(rig) {
  if (!rig._customSkinMats) return;
  for (const m of rig._customSkinMats) {
    m.map?.dispose();
    m.dispose();
  }
  rig._customSkinMats = null;
}

export function applySkinToRig(rig, skin) {
  if (!rig || !skin) return;

  if (skin.pixelDataUrl) {
    const img = new Image();
    img.onload = () => {
      disposeCustomSkinMats(rig);
      const hMats = [
        cropCanvasTexture(img, 0, 8, 8, 8),
        cropCanvasTexture(img, 16, 8, 8, 8),
        cropCanvasTexture(img, 8, 0, 8, 8),
        cropCanvasTexture(img, 16, 0, 8, 8),
        cropCanvasTexture(img, 24, 8, 8, 8),
        cropCanvasTexture(img, 8, 8, 8, 8)
      ];
      const bodyFront = cropCanvasTexture(img, 20, 20, 8, 12);
      const bodyBack = cropCanvasTexture(img, 32, 20, 8, 12);
      const bodySide = cropCanvasTexture(img, 16, 20, 4, 12);
      const bodyTop = cropCanvasTexture(img, 20, 16, 8, 4);
      const armMat = cropCanvasTexture(img, 44, 20, 4, 12);
      const legMat = cropCanvasTexture(img, 4, 20, 4, 12);

      rig._customSkinMats = [...hMats, bodyFront, bodyBack, bodySide, bodyTop, armMat, legMat];
      rig.headBox.material = hMats;
      rig.torso.material = [bodySide, bodySide, bodyTop, bodyTop, bodyBack, bodyFront];
      rig.leftArm.material = armMat;
      rig.rightArmMesh.material = armMat;
      rig.leftLeg.material = legMat;
      rig.rightLeg.material = legMat;

      rig.hairGroup.visible = false;
      rig.faceDetails.visible = false;
      rig.hatGroup.visible = false;
    };
    img.src = skin.pixelDataUrl;
    return;
  }

  // Color-based skin
  disposeCustomSkinMats(rig);
  rig.headBox.material = rig.mats.skinMat;
  rig.torso.material = rig.mats.shirtMat;
  rig.leftArm.material = rig.mats.shirtMat;
  rig.rightArmMesh.material = rig.mats.shirtMat;
  rig.leftLeg.material = rig.mats.pantsMat;
  rig.rightLeg.material = rig.mats.pantsMat;
  rig.hairGroup.visible = true;
  rig.faceDetails.visible = true;

  if (skin.skinColor) rig.mats.skinMat.color.set(skin.skinColor);
  if (skin.hairColor) rig.mats.hairMat.color.set(skin.hairColor);
  if (skin.shirtColor) rig.mats.shirtMat.color.set(skin.shirtColor);
  if (skin.pantsColor) rig.mats.pantsMat.color.set(skin.pantsColor);
  if (skin.eyeColor) rig.mats.eyeMat.color.set(skin.eyeColor);
  if (skin.hatColor) {
    rig.mats.hatMat.color.set(skin.hatColor);
    rig.hatGroup.visible = true;
  } else {
    rig.hatGroup.visible = false;
  }
  rig.lBlush.visible = !!skin.blush;
  rig.rBlush.visible = !!skin.blush;
}

export function setRigHeldItem(rig, itemId, catalog, textures) {
  if (!rig || !catalog || !textures) return;
  while (rig.handAnchor.children.length > 0) {
    rig.handAnchor.remove(rig.handAnchor.children[0]);
  }
  const mesh = buildHeldItemMesh(itemId, catalog, textures);
  if (mesh) {
    mesh.scale.setScalar(0.85);
    rig.handAnchor.add(mesh);
  }
}

export class RemotePlayers {
  constructor(scene) {
    this.scene = scene;
    this.catalog = null;
    this.textures = null;
    this.map = new Map();
  }

  setAssets(catalog, textures) {
    this.catalog = catalog;
    this.textures = textures;
  }

  addOrUpdate(p) {
    if (this.map.has(p.id)) {
      this.setTarget(p.id, p.x, p.y, p.z, p.yaw, p.pitch);
      return;
    }

    const rig = createAvatarRig(p.skin || { shirtColor: p.color }, true, p.nickname, p.isAdmin);
    rig.group.position.set(p.x, p.y, p.z);
    rig.group.rotation.y = p.yaw || 0;
    this.scene.add(rig.group);

    if (p.heldItem) {
      setRigHeldItem(rig, p.heldItem, this.catalog, this.textures);
    }

    this.map.set(p.id, {
      data: { ...p },
      rig,
      targetPos: new THREE.Vector3(p.x, p.y, p.z),
      targetYaw: p.yaw || 0,
      targetPitch: p.pitch || 0,
      phase: 0
    });
  }

  setTarget(id, x, y, z, yaw, pitch) {
    const entry = this.map.get(id);
    if (!entry) return;
    entry.targetPos.set(x, y, z);
    entry.targetYaw = yaw;
    entry.targetPitch = pitch;
    entry.data.x = x; entry.data.y = y; entry.data.z = z;
  }

  setHeldItem(id, itemId) {
    const entry = this.map.get(id);
    if (!entry) return;
    entry.data.heldItem = itemId;
    setRigHeldItem(entry.rig, itemId, this.catalog, this.textures);
  }

  setSkin(id, skin) {
    const entry = this.map.get(id);
    if (!entry) return;
    entry.data.skin = skin;
    applySkinToRig(entry.rig, skin);
  }

  setAdmin(id, isAdmin) {
    const entry = this.map.get(id);
    if (!entry) return;
    entry.data.isAdmin = isAdmin;
    if (entry.rig.nameplate) {
      entry.rig.group.remove(entry.rig.nameplate);
      entry.rig.nameplate.material.map.dispose();
      entry.rig.nameplate.material.dispose();
    }
    entry.rig.nameplate = makeNameplateSprite(entry.data.nickname, isAdmin);
    entry.rig.group.add(entry.rig.nameplate);
  }

  remove(id) {
    const entry = this.map.get(id);
    if (!entry) return;
    this.scene.remove(entry.rig.group);
    if (entry.rig.nameplate) {
      entry.rig.nameplate.material.map.dispose();
      entry.rig.nameplate.material.dispose();
    }
    this.map.delete(id);
  }

  clear() {
    for (const id of [...this.map.keys()]) this.remove(id);
  }

  update(dt) {
    const lerpFactor = Math.min(1, dt * 12);
    for (const entry of this.map.values()) {
      const { rig } = entry;
      const dist = rig.group.position.distanceTo(entry.targetPos);
      rig.group.position.lerp(entry.targetPos, lerpFactor);
      rig.group.rotation.y = entry.targetYaw;
      rig.head.rotation.x = Math.max(-0.8, Math.min(0.8, entry.targetPitch));

      if (dist > 0.02) {
        entry.phase += dt * 10;
        const swing = Math.sin(entry.phase) * 0.5;
        rig.leftLeg.rotation.x = swing;
        rig.rightLeg.rotation.x = -swing;
        rig.leftArm.rotation.x = -swing * 0.7;
        rig.rightArmPivot.rotation.x = swing * 0.5;
      } else {
        rig.leftLeg.rotation.x *= 0.8;
        rig.rightLeg.rotation.x *= 0.8;
        rig.leftArm.rotation.x *= 0.8;
        rig.rightArmPivot.rotation.x *= 0.8;
      }
    }
  }

  list() {
    return [...this.map.values()].map(e => e.data);
  }
}
