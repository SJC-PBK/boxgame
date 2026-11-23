import * as THREE from '../vendor/three/three.module.min.js';

function createAnimalMesh(type) {
  const group = new THREE.Group();
  let bodyCol = '#f9a8d4', headCol = '#f9a8d4', legCol = '#f472b6';
  let bodySize = [0.65, 0.52, 0.95], legH = 0.35;

  if (type === 'sheep') {
    bodyCol = '#f8fafc'; headCol = '#e2d5c3'; legCol = '#cbd5e1';
    bodySize = [0.7, 0.58, 0.96];
  } else if (type === 'cow') {
    bodyCol = '#5c3a21'; headCol = '#4a2e19'; legCol = '#3b2416';
    bodySize = [0.75, 0.68, 1.12]; legH = 0.45;
  } else if (type === 'chicken') {
    bodyCol = '#ffffff'; headCol = '#ffffff'; legCol = '#f59e0b';
    bodySize = [0.38, 0.34, 0.48]; legH = 0.22;
  }

  const bodyMat = new THREE.MeshLambertMaterial({ color: bodyCol });
  const headMat = new THREE.MeshLambertMaterial({ color: headCol });
  const legMat = new THREE.MeshLambertMaterial({ color: legCol });
  const eyeMat = new THREE.MeshLambertMaterial({ color: '#0f172a' });

  const body = new THREE.Mesh(new THREE.BoxGeometry(...bodySize), bodyMat);
  body.position.set(0, legH + bodySize[1] / 2, 0);
  group.add(body);

  // Cow white spots
  if (type === 'cow') {
    const spotMat = new THREE.MeshLambertMaterial({ color: '#f1f5f9' });
    const s1 = new THREE.Mesh(new THREE.BoxGeometry(0.77, 0.26, 0.35), spotMat);
    s1.position.set(0, legH + bodySize[1] / 2 + 0.08, 0.12);
    group.add(s1);
  }

  // Sheep wool coat (hidden when sheared)
  let woolCoat = null;
  if (type === 'sheep') {
    woolCoat = new THREE.Mesh(
      new THREE.BoxGeometry(0.82, 0.68, 1.04),
      new THREE.MeshLambertMaterial({ color: '#ffffff' })
    );
    woolCoat.position.copy(body.position);
    group.add(woolCoat);
  }

  // Head
  const hScale = type === 'chicken' ? 0.26 : 0.42;
  const head = new THREE.Mesh(new THREE.BoxGeometry(hScale, hScale, hScale), headMat);
  head.position.set(0, legH + bodySize[1] * 0.72, -bodySize[2] / 2 - hScale * 0.35);
  group.add(head);

  // Eyes
  const eyeGeo = new THREE.BoxGeometry(0.06, 0.06, 0.02);
  const le = new THREE.Mesh(eyeGeo, eyeMat);
  le.position.set(-hScale * 0.25, 0.04, -hScale / 2 - 0.01);
  const re = new THREE.Mesh(eyeGeo, eyeMat);
  re.position.set(hScale * 0.25, 0.04, -hScale / 2 - 0.01);
  head.add(le, re);

  // Snout / Beak
  if (type === 'pig') {
    const snout = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, 0.1), new THREE.MeshLambertMaterial({ color: '#f472b6' }));
    snout.position.set(0, -0.05, -hScale / 2 - 0.05);
    head.add(snout);
  } else if (type === 'chicken') {
    const beak = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, 0.12), new THREE.MeshLambertMaterial({ color: '#f59e0b' }));
    beak.position.set(0, -0.02, -hScale / 2 - 0.06);
    const comb = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.09, 0.14), new THREE.MeshLambertMaterial({ color: '#ef4444' }));
    comb.position.set(0, hScale / 2 + 0.04, 0);
    head.add(beak, comb);
  }

  // Legs
  const legs = [];
  const legW = type === 'chicken' ? 0.07 : 0.16;
  const legGeo = new THREE.BoxGeometry(legW, legH, legW);
  const legOffsets = type === 'chicken'
    ? [[-0.1, 0], [0.1, 0]]
    : [[-bodySize[0] * 0.32, -bodySize[2] * 0.32], [bodySize[0] * 0.32, -bodySize[2] * 0.32], [-bodySize[0] * 0.32, bodySize[2] * 0.32], [bodySize[0] * 0.32, bodySize[2] * 0.32]];
  for (const [lx, lz] of legOffsets) {
    const l = new THREE.Mesh(legGeo, legMat);
    l.position.set(lx, legH / 2, lz);
    group.add(l);
    legs.push(l);
  }

  return { group, legs, woolCoat };
}

export class AnimalRenderer {
  constructor(scene) {
    this.scene = scene;
    this.map = new Map();
    this.raycaster = new THREE.Raycaster();
  }

  syncAll(list) {
    const seen = new Set();
    for (const a of list || []) {
      seen.add(a.id);
      let entry = this.map.get(a.id);
      if (!entry) {
        const mesh = createAnimalMesh(a.type);
        mesh.group.userData.animalId = a.id;
        mesh.group.userData.animalType = a.type;
        mesh.group.traverse((c) => { c.userData.animalId = a.id; c.userData.animalType = a.type; });
        mesh.group.position.set(a.x, a.y, a.z);
        mesh.group.rotation.y = a.yaw;
        this.scene.add(mesh.group);
        entry = {
          data: a,
          mesh,
          targetPos: new THREE.Vector3(a.x, a.y, a.z),
          targetYaw: a.yaw,
          phase: Math.random() * 10
        };
        this.map.set(a.id, entry);
      } else {
        entry.data = a;
        entry.targetPos.set(a.x, a.y, a.z);
        entry.targetYaw = a.yaw;
      }
      if (entry.mesh.woolCoat) {
        entry.mesh.woolCoat.visible = !a.sheared;
      }
    }

    for (const [id, entry] of this.map.entries()) {
      if (!seen.has(id)) {
        this.scene.remove(entry.mesh.group);
        this.map.delete(id);
      }
    }
  }

  clear() {
    for (const entry of this.map.values()) this.scene.remove(entry.mesh.group);
    this.map.clear();
  }

  raycast(origin, direction, maxDist = 5.5) {
    if (this.map.size === 0) return null;
    this.raycaster.set(origin, direction);
    this.raycaster.far = maxDist;
    const roots = [...this.map.values()].map(e => e.mesh.group);
    const hits = this.raycaster.intersectObjects(roots, true);
    if (hits.length === 0) return null;
    const obj = hits[0].object;
    return {
      id: obj.userData.animalId,
      type: obj.userData.animalType,
      point: hits[0].point
    };
  }

  update(dt) {
    const f = Math.min(1, dt * 8);
    for (const entry of this.map.values()) {
      const dist = entry.mesh.group.position.distanceTo(entry.targetPos);
      entry.mesh.group.position.lerp(entry.targetPos, f);
      entry.mesh.group.rotation.y = entry.targetYaw;
      if (dist > 0.02) {
        entry.phase += dt * 11;
        entry.mesh.legs.forEach((l, i) => {
          l.rotation.x = Math.sin(entry.phase + (i % 2 ? Math.PI : 0)) * 0.45;
        });
      } else {
        entry.mesh.legs.forEach((l) => { l.rotation.x *= 0.8; });
      }
    }
  }
}
