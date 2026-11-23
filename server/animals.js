// Lightweight server-side animal simulation (pigs, sheep, cows, chickens)
import { BLOCKS, WORLD_BOUNDS } from './blocks.js';

const SPECIES = [
  { type: 'pig',     name: '돼지', hp: 6, speed: 1.4, drop: 'raw_meat',   dropCount: 2 },
  { type: 'sheep',   name: '양',   hp: 6, speed: 1.3, drop: 'wool_white', dropCount: 2, shearDrop: 'wool_white' },
  { type: 'cow',     name: '소',   hp: 8, speed: 1.2, drop: 'raw_meat',   dropCount: 3 },
  { type: 'chicken', name: '닭',   hp: 4, speed: 1.7, drop: 'raw_meat',   dropCount: 1 }
];

export class AnimalManager {
  constructor(store) {
    this.store = store;
    this.animals = new Map();
    this.nextId = 1;
    this.targetCount = 12;
    this._spawnInitial();
  }

  _findSurfaceY(x, z) {
    for (let y = WORLD_BOUNDS.maxY - 2; y >= 10; y--) {
      const b = this.store.getBlock(x, y, z);
      if (b && BLOCKS[b]?.solid) {
        if (b === 'water') return null;
        return y + 1;
      }
    }
    return null;
  }

  _spawnOne(spec = null) {
    const s = spec || SPECIES[Math.floor(Math.random() * SPECIES.length)];
    for (let tries = 0; tries < 20; tries++) {
      const x = Math.floor((Math.random() - 0.5) * 70);
      const z = Math.floor((Math.random() - 0.5) * 70);
      if (Math.hypot(x, z) < 7) continue; // Keep spawn plaza clear
      const y = this._findSurfaceY(x, z);
      if (y === null) continue;
      const below = this.store.getBlock(x, y - 1, z);
      if (below !== 'grass' && below !== 'sand') continue;

      const id = `a${this.nextId++}`;
      const animal = {
        id,
        type: s.type,
        name: s.name,
        x: x + 0.5,
        y,
        z: z + 0.5,
        yaw: Math.random() * Math.PI * 2,
        hp: s.hp,
        maxHp: s.hp,
        speed: s.speed,
        drop: s.drop,
        dropCount: s.dropCount,
        shearDrop: s.shearDrop || null,
        shearedUntil: 0,
        moveTimer: 1 + Math.random() * 3,
        moving: false
      };
      this.animals.set(id, animal);
      return animal;
    }
    return null;
  }

  _spawnInitial() {
    for (let i = 0; i < this.targetCount; i++) {
      this._spawnOne(SPECIES[i % SPECIES.length]);
    }
  }

  serializeAll() {
    const out = [];
    for (const a of this.animals.values()) {
      out.push({
        id: a.id,
        type: a.type,
        name: a.name,
        x: Number(a.x.toFixed(2)),
        y: Number(a.y.toFixed(2)),
        z: Number(a.z.toFixed(2)),
        yaw: Number(a.yaw.toFixed(2)),
        sheared: Date.now() < a.shearedUntil
      });
    }
    return out;
  }

  tick(dt) {
    // Respawn if population dropped
    if (this.animals.size < this.targetCount && Math.random() < 0.08) {
      this._spawnOne();
    }

    for (const a of this.animals.values()) {
      a.moveTimer -= dt;
      if (a.moveTimer <= 0) {
        a.moving = Math.random() < 0.65;
        a.yaw = Math.random() * Math.PI * 2;
        a.moveTimer = a.moving ? (1.5 + Math.random() * 2.5) : (1.5 + Math.random() * 3.0);
      }

      if (a.moving) {
        const nx = a.x - Math.sin(a.yaw) * a.speed * dt;
        const nz = a.z - Math.cos(a.yaw) * a.speed * dt;
        const bx = Math.floor(nx);
        const bz = Math.floor(nz);

        if (bx < WORLD_BOUNDS.minX + 4 || bx > WORLD_BOUNDS.maxX - 4 || bz < WORLD_BOUNDS.minZ + 4 || bz > WORLD_BOUNDS.maxZ - 4) {
          a.yaw += Math.PI;
          continue;
        }

        const sy = this._findSurfaceY(bx, bz);
        if (sy !== null && Math.abs(sy - a.y) <= 1.1) {
          a.x = nx;
          a.z = nz;
          a.y = sy;
        } else {
          a.yaw += Math.PI * 0.6;
        }
      }
    }
  }

  interact(id, action) {
    const a = this.animals.get(id);
    if (!a) return null;

    if (action === 'shear' && a.shearDrop) {
      if (Date.now() < a.shearedUntil) {
        return { message: `🐑 ${a.name}의 털이 아직 자라는 중입니다.` };
      }
      a.shearedUntil = Date.now() + 30000;
      return {
        item: a.shearDrop,
        count: 2,
        message: `✂️ ${a.name}에게서 하양 양털 2개를 얻었습니다!`
      };
    }

    if (action === 'hit') {
      a.hp -= 3;
      // Flee briefly
      a.moving = true;
      a.yaw = Math.random() * Math.PI * 2;
      a.moveTimer = 2.0;
      if (a.hp <= 0) {
        this.animals.delete(id);
        return {
          killed: true,
          item: a.drop,
          count: a.dropCount,
          message: `🍖 ${a.name}에게서 아이템을 얻었습니다!`
        };
      }
      return { hit: true, hp: a.hp, maxHp: a.maxHp };
    }
    return null;
  }
}
