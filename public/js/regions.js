import * as THREE from '../vendor/three/three.module.min.js';

export class RegionVisualizer {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.scene.add(this.group);
    this.visible = true;
    this.regions = [];
  }

  setVisible(v) {
    this.visible = v;
    this.group.visible = v;
  }

  setRegions(regions) {
    this.regions = regions || [];
    while (this.group.children.length > 0) {
      const child = this.group.children[0];
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
      this.group.remove(child);
    }

    for (const r of this.regions) {
      const w = r.maxX - r.minX + 1;
      const h = r.maxY - r.minY + 1;
      const d = r.maxZ - r.minZ + 1;

      const boxGeo = new THREE.BoxGeometry(w + 0.04, h + 0.04, d + 0.04);
      const edges = new THREE.EdgesGeometry(boxGeo);
      const line = new THREE.LineSegments(
        edges,
        new THREE.LineBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.9 })
      );
      line.position.set(r.minX + w / 2, r.minY + h / 2, r.minZ + d / 2);
      this.group.add(line);

      const fill = new THREE.Mesh(
        boxGeo,
        new THREE.MeshBasicMaterial({
          color: 0xf59e0b,
          transparent: true,
          opacity: 0.07,
          depthWrite: false,
          side: THREE.DoubleSide
        })
      );
      fill.position.copy(line.position);
      this.group.add(fill);
    }

    this.group.visible = this.visible;
  }
}
