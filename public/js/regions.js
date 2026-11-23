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

      // Crisp wireframe border only (zero transparent full-screen fill-rate lag!)
      const boxGeo = new THREE.BoxGeometry(w + 0.06, h + 0.06, d + 0.06);
      const edges = new THREE.EdgesGeometry(boxGeo);
      boxGeo.dispose();
      const line = new THREE.LineSegments(
        edges,
        new THREE.LineBasicMaterial({ color: r.id === 'beacon-auto-zone' ? 0x38bdf8 : 0xf59e0b })
      );
      line.position.set(r.minX + w / 2, r.minY + h / 2, r.minZ + d / 2);
      this.group.add(line);
    }

    this.group.visible = this.visible;
  }
}
