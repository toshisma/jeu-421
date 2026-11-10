/**
 * Décor de saison du bac 3D (Saint-Nicolas : mandarines, spéculoos, pièce en chocolat ; fêtes : petit
 * sapin, boules, paquet cadeau, neige sur le rebord). Posé aux coins, hors du tapis : il ne cache
 * jamais les dés et ne touche pas à la physique (simple décor). Les géométries et matériaux sont
 * libérés avec le bac (clearTray).
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { FeteId } from '../../../shared/progress/fetes';

interface Frame { rect: boolean; halfX: number; halfZ: number; wall: number; height: number }

const std = (color: string, o: Partial<THREE.MeshStandardMaterialParameters> = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0, ...o });
const put = (m: THREE.Object3D, x: number, y: number, z: number) => { m.position.set(x, y, z); m.traverse((c) => { if (c instanceof THREE.Mesh) { c.castShadow = true; c.receiveShadow = true; } }); return m; };

function mandarine(): THREE.Group {
  const g = new THREE.Group();
  const fruit = new THREE.Mesh(new THREE.SphereGeometry(0.5, 24, 16), std('#f28a1a', { roughness: 0.8 }));
  fruit.scale.set(1, 0.82, 1);
  fruit.position.y = 0.41;
  const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), std('#2f7a2a', { roughness: 0.6 }));
  leaf.scale.set(1, 0.18, 0.5);
  leaf.position.set(0.14, 0.82, 0.02);
  leaf.rotation.z = -0.35;
  g.add(fruit, leaf);
  return g;
}
function speculoos(): THREE.Group {
  const g = new THREE.Group();
  const mat = std('#b06a2c', { roughness: 0.9 });
  for (let i = 0; i < 2; i++) {
    const b = new THREE.Mesh(new RoundedBoxGeometry(1.0, 0.14, 0.62, 2, 0.05), mat);
    b.position.y = 0.07 + i * 0.15;
    b.rotation.y = i * 0.5;
    g.add(b);
  }
  return g;
}
function chocoCoin(): THREE.Mesh {
  const c = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.07, 28), std('#e0b54a', { metalness: 0.85, roughness: 0.3 }));
  c.position.y = 0.04;
  return c;
}
function firTree(): THREE.Group {
  const g = new THREE.Group();
  const green = std('#1f6a3a', { roughness: 0.85 });
  [[0.62, 0.62, 0.32], [0.48, 0.52, 0.72], [0.32, 0.44, 1.06]].forEach(([r, h, y]) => {
    const c = new THREE.Mesh(new THREE.ConeGeometry(r, h, 14), green);
    c.position.y = y;
    g.add(c);
  });
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.2, 8), std('#5a3a1e'));
  trunk.position.y = 0.05;
  const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.12), std('#f6d25a', { metalness: 0.7, roughness: 0.3, emissive: '#6b5210' }));
  star.position.y = 1.36;
  g.add(trunk, star);
  const balls = std('#d0262b', { roughness: 0.25, metalness: 0.2 });
  for (const [x, y, z] of [[0.3, 0.35, 0.3], [-0.28, 0.6, 0.2], [0.18, 0.85, -0.2]]) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), balls);
    b.position.set(x, y, z);
    g.add(b);
  }
  return g;
}
function bauble(color: string): THREE.Group {
  const g = new THREE.Group();
  const b = new THREE.Mesh(new THREE.SphereGeometry(0.3, 20, 14), std(color, { roughness: 0.18, metalness: 0.45 }));
  b.position.y = 0.3;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.09, 10), std('#d9c27a', { metalness: 0.8, roughness: 0.3 }));
  cap.position.y = 0.62;
  g.add(b, cap);
  return g;
}
function gift(): THREE.Group {
  const g = new THREE.Group();
  const box = new THREE.Mesh(new RoundedBoxGeometry(0.62, 0.5, 0.62, 2, 0.04), std('#b8202a', { roughness: 0.55 }));
  box.position.y = 0.25;
  const gold = std('#f1cc7d', { metalness: 0.6, roughness: 0.35 });
  const r1 = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.52, 0.1), gold);
  const r2 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.52, 0.64), gold);
  r1.position.y = r2.position.y = 0.25;
  g.add(box, r1, r2);
  g.rotation.y = 0.4;
  return g;
}

/** Objets du décor, posés aux quatre coins du bac. */
export function buildSeasonDecor(kind: FeteId, f: Frame): THREE.Group {
  const g = new THREE.Group();
  g.name = 'season-decor';
  // Rectangle : sur le rebord, aux coins. Autres formes : sur la table, aux coins du cadre.
  const cx = f.rect ? f.halfX + f.wall / 2 + 0.15 : (f.halfX + f.wall) * 0.92;
  const cz = f.rect ? f.halfZ + f.wall / 2 + 0.15 : (f.halfZ + f.wall) * 0.92;
  const y = f.rect ? f.height + 0.15 + (kind === 'fetes' ? 0.06 : 0) : -0.62;
  const s = f.rect ? 1.4 : 1.5;
  const corners: [number, number][] = [[-cx, -cz], [cx, -cz], [cx, cz], [-cx, cz]];
  const items = kind === 'saint-nicolas' ? [mandarine(), speculoos(), mandarine(), chocoCoin()] : [firTree(), bauble('#c62a2f'), gift(), bauble('#e2b23e')];
  items.forEach((o, i) => { o.scale.multiplyScalar(s); g.add(put(o, corners[i][0], y, corners[i][1])); });
  if (kind === 'fetes' && f.rect) {
    // Neige sur le rebord : une fine couche blanche sur le chapeau des quatre côtés.
    const snow = std('#f4f8fb', { roughness: 0.95 });
    const W = f.halfX * 2, D = f.halfZ * 2, T = f.wall;
    for (const [x, z, sx, sz] of [[0, f.halfZ + T / 2, W + T, T * 0.5], [0, -f.halfZ - T / 2, W + T, T * 0.5], [f.halfX + T / 2, 0, T * 0.5, D], [-f.halfX - T / 2, 0, T * 0.5, D]] as const) {
      const m = new THREE.Mesh(new RoundedBoxGeometry(sx, 0.07, sz, 2, 0.03), snow);
      m.position.set(x, f.height + 0.17, z);
      m.receiveShadow = true;
      g.add(m);
    }
  }
  return g;
}
