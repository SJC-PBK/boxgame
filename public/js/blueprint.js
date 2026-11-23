import * as THREE from '../vendor/three/three.module.min.js';

export class BlueprintProjector {
  constructor(scene, worldRenderer) {
    this.scene = scene;
    this.world = worldRenderer;
    this.group = new THREE.Group();
    this.scene.add(this.group);

    this.activeBlueprint = null;
    this.origin = { x: 0, y: 4, z: 0 };
    this.rotation = 0; // 0, 1, 2, 3 (x 90 deg)

    this.ghostGeo = new THREE.BoxGeometry(0.96, 0.96, 0.96);
    this.ghostMatNormal = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.36,
      depthWrite: false
    });
    this.ghostMatMismatch = new THREE.MeshBasicMaterial({
      color: 0xef4444,
      transparent: true,
      opacity: 0.48,
      depthWrite: false
    });
    this.edgeGeo = new THREE.EdgesGeometry(this.ghostGeo);
    this.edgeMat = new THREE.LineBasicMaterial({
      color: 0x7dd3fc,
      transparent: true,
      opacity: 0.75
    });

    this.onProgressChange = null;
  }

  project(blueprint, origin) {
    this.activeBlueprint = blueprint;
    this.origin = {
      x: Math.round(origin.x),
      y: Math.round(origin.y),
      z: Math.round(origin.z)
    };
    this.rotation = 0;
    this.refresh();
  }

  nudge(dx, dy, dz) {
    if (!this.activeBlueprint) return;
    this.origin.x += dx;
    this.origin.y += dy;
    this.origin.z += dz;
    this.refresh();
  }

  rotate() {
    if (!this.activeBlueprint) return;
    this.rotation = (this.rotation + 1) % 4;
    this.refresh();
  }

  clear() {
    this.activeBlueprint = null;
    this._clearMeshes();
    if (this.onProgressChange) this.onProgressChange(null);
  }

  _clearMeshes() {
    while (this.group.children.length > 0) {
      this.group.remove(this.group.children[0]);
    }
  }

  _transformOffset(dx, dz) {
    switch (this.rotation) {
      case 1: return [-dz, dx];
      case 2: return [-dx, -dz];
      case 3: return [dz, -dx];
      default: return [dx, dz];
    }
  }

  refresh() {
    this._clearMeshes();
    if (!this.activeBlueprint) {
      if (this.onProgressChange) this.onProgressChange(null);
      return;
    }

    let total = 0;
    let done = 0;

    for (const item of this.activeBlueprint.blocks) {
      total++;
      const [rx, rz] = this._transformOffset(item.dx, item.dz);
      const wx = this.origin.x + rx;
      const wy = this.origin.y + item.dy;
      const wz = this.origin.z + rz;

      const current = this.world.getBlock(wx, wy, wz);
      if (current === item.block) {
        done++;
        continue; // Already built correctly -> hide ghost
      }

      const mismatch = current !== null && current !== 'water';
      const mesh = new THREE.Mesh(
        this.ghostGeo,
        mismatch ? this.ghostMatMismatch : this.ghostMatNormal
      );
      mesh.position.set(wx + 0.5, wy + 0.5, wz + 0.5);
      mesh.renderOrder = 3;
      this.group.add(mesh);

      const line = new THREE.LineSegments(this.edgeGeo, this.edgeMat);
      line.position.copy(mesh.position);
      this.group.add(line);
    }

    if (this.onProgressChange) {
      this.onProgressChange({
        name: this.activeBlueprint.name,
        done,
        total,
        percent: total > 0 ? Math.round((done / total) * 100) : 0,
        origin: { ...this.origin },
        rotation: this.rotation * 90
      });
    }
  }
}
