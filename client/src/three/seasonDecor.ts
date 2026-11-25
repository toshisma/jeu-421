/**
 * Décor de saison du bac 3D (Saint-Nicolas : mandarines, spéculoos, pièce en chocolat ; fêtes : petit
 * sapin, boules, paquet cadeau, neige sur le rebord). Posé aux coins, hors du tapis : il ne cache
 * jamais les dés et ne touche pas à la physique (simple décor). Les géométries et matériaux sont
 * libérés avec le bac (clearTray).
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { SeasonDecorKind } from '../../../shared/progress/fetes';

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

// --- Calendrier de l'année (shared/progress/calendar.ts) : petits objets, toujours hors du tapis ---------
/** Chandeleur : une pile de crêpes dorées. */
function crepes(): THREE.Group {
  const g = new THREE.Group();
  const mat = std('#e8b45a', { roughness: 0.85 });
  for (let i = 0; i < 4; i++) {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.5 - i * 0.015, 0.5 - i * 0.015, 0.05, 28), mat);
    c.position.set((i % 2) * 0.03, 0.03 + i * 0.055, 0);
    g.add(c);
  }
  const sugar = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.4, 0.015, 24), std('#fbf6ec', { roughness: 0.95 }));
  sugar.position.y = 0.25;
  g.add(sugar);
  return g;
}
/** Chandeleur : petit pot de confiture. */
function jamJar(): THREE.Group {
  const g = new THREE.Group();
  const jar = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.4, 20), std('#a3162a', { roughness: 0.25, metalness: 0.05 }));
  jar.position.y = 0.2;
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.08, 20), std('#e8e0cf', { roughness: 0.7 }));
  lid.position.y = 0.44;
  g.add(jar, lid);
  return g;
}
/** Poisson d'avril : un poisson de papier, posé à plat sur le rebord. */
function paperFish(color: string): THREE.Group {
  const g = new THREE.Group();
  const paper = std(color, { roughness: 0.95, side: THREE.DoubleSide });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.42, 20, 12), paper);
  body.scale.set(1, 0.12, 0.55);
  body.position.y = 0.05;
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.32, 3), paper);
  tail.rotation.z = Math.PI / 2;
  tail.scale.set(1, 1, 0.25);
  tail.position.set(0.52, 0.05, 0);
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), std('#1b1b1b'));
  eye.position.set(-0.25, 0.1, 0.1);
  g.add(body, tail, eye);
  g.rotation.y = 0.6;
  return g;
}
/** Pâques : un œuf peint. */
function egg(color: string, band: string): THREE.Group {
  const g = new THREE.Group();
  const e = new THREE.Mesh(new THREE.SphereGeometry(0.3, 20, 16), std(color, { roughness: 0.4 }));
  e.scale.set(1, 1.3, 1);
  e.position.y = 0.39;
  const b = new THREE.Mesh(new THREE.TorusGeometry(0.29, 0.035, 8, 24), std(band, { roughness: 0.5 }));
  b.rotation.x = Math.PI / 2;
  b.position.y = 0.4;
  g.add(e, b);
  return g;
}
/** Fête de la musique : une croche dorée. */
function note(): THREE.Group {
  const g = new THREE.Group();
  const gold = std('#e0b54a', { metalness: 0.8, roughness: 0.3 });
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 18, 12), gold);
  head.scale.set(1.2, 0.85, 0.9);
  head.position.y = 0.17;
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.85, 8), gold);
  stem.position.set(0.2, 0.6, 0);
  const flag = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.07, 0.05), gold);
  flag.position.set(0.32, 0.95, 0);
  flag.rotation.z = -0.5;
  g.add(head, stem, flag);
  return g;
}
/** Nuit d'Halloween : une citrouille et une bougie. */
function pumpkin(): THREE.Group {
  const g = new THREE.Group();
  const orange = std('#e5751c', { roughness: 0.6 });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const lobe = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 12), orange);
    lobe.scale.set(0.75, 0.9, 0.75);
    lobe.position.set(Math.cos(a) * 0.16, 0.3, Math.sin(a) * 0.16);
    g.add(lobe);
  }
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 0.16, 8), std('#4c6a22'));
  stem.position.y = 0.6;
  g.add(stem);
  return g;
}
function candle(): THREE.Group {
  const g = new THREE.Group();
  const c = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.5, 16), std('#f3ead6', { roughness: 0.8 }));
  c.position.y = 0.25;
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 10), std('#ffcf5a', { emissive: '#ff9a1a', emissiveIntensity: 1.2 }));
  flame.position.y = 0.6;
  g.add(c, flame);
  return g;
}
/** Galette des rois : la galette dorée et sa couronne de papier. */
function galette(): THREE.Group {
  const g = new THREE.Group();
  const cake = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.52, 0.14, 32), std('#d79a3c', { roughness: 0.7 }));
  cake.position.y = 0.07;
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.48, 0.03, 32), std('#b9782a', { roughness: 0.6 }));
  top.position.y = 0.15;
  g.add(cake, top);
  return g;
}
function crown(): THREE.Group {
  const g = new THREE.Group();
  const gold = std('#f0c94a', { metalness: 0.7, roughness: 0.3, side: THREE.DoubleSide });
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.2, 24, 1, true), gold);
  band.position.y = 0.1;
  g.add(band);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const p = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.16, 4), gold);
    p.position.set(Math.cos(a) * 0.3, 0.28, Math.sin(a) * 0.3);
    g.add(p);
  }
  return g;
}

/** Objets de chaque décor, un par coin (au plus quatre). */
function itemsOf(kind: SeasonDecorKind): THREE.Object3D[] {
  switch (kind) {
    case 'saint-nicolas': return [mandarine(), speculoos(), mandarine(), chocoCoin()];
    case 'fetes': return [firTree(), bauble('#c62a2f'), gift(), bauble('#e2b23e')];
    case 'chandeleur': return [crepes(), jamJar(), crepes(), jamJar()];
    case 'poisson': return [paperFish('#ff8a3d'), new THREE.Group(), paperFish('#3d8bff')];
    case 'paques': return [egg('#ee86b0', '#2f74c0'), egg('#7cc95a', '#c8326a'), egg('#f2c230', '#6a46c0'), egg('#5aa8e6', '#e0781a')];
    case 'musique': return [note(), new THREE.Group(), note()];
    case 'halloween': return [pumpkin(), candle(), pumpkin(), candle()];
    case 'galette': return [galette(), new THREE.Group(), crown()];
  }
}

/** Objets du décor, posés aux coins du bac. */
export function buildSeasonDecor(kind: SeasonDecorKind, f: Frame): THREE.Group {
  const g = new THREE.Group();
  g.name = 'season-decor';
  // Rectangle : sur le rebord, aux coins. Autres formes : sur la table, aux coins du cadre.
  const cx = f.rect ? f.halfX + f.wall / 2 + 0.15 : (f.halfX + f.wall) * 0.92;
  const cz = f.rect ? f.halfZ + f.wall / 2 + 0.15 : (f.halfZ + f.wall) * 0.92;
  const y = f.rect ? f.height + 0.15 + (kind === 'fetes' ? 0.06 : 0) : -0.62;
  const s = f.rect ? 1.4 : 1.5;
  const corners: [number, number][] = [[-cx, -cz], [cx, -cz], [cx, cz], [-cx, cz]];
  const items = itemsOf(kind);
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
