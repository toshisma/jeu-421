/**
 * Célébrations du 4-2-1 et des trois as, jouées dans le bac 3D (en plus du texte « 4-2-1 ! »).
 * Une mise en scène par effet de collection, et une par défaut (sans effet équipé) :
 * - défaut : onde dorée sur le tapis et gerbe d'étincelles ;
 * - Bravo ! : confettis tirés depuis les coins, qui virevoltent et retombent sur le tapis ;
 * - Ballons : ballons brillants qui s'envolent en se balançant ;
 * - Coup de tonnerre : éclair qui frappe les dés, la scène s'illumine, arcs électriques ;
 * - Pluie d'or : pièces dorées qui tombent, rebondissent et tintent sur le tapis ;
 * - Feu d'artifice : fusées qui montent et éclatent au-dessus du bac.
 * Durée : 3 s au plus ; tout est retiré et libéré à la fin (ou au lancer suivant).
 * Qualité normale : moitié moins d'objets, pas de lumière ajoutée.
 */
import * as THREE from 'three';
import { fxDef } from '../../../shared/progress/dice-collection';

export const CELEBRATION_MS = 3000;

interface Ctx {
  scene: THREE.Scene;
  /** Centre des dés (sur le tapis). */
  center: THREE.Vector3;
  /** Demi-dimensions du tapis. */
  half: [number, number];
  lite: boolean;
  /** Lumière principale à faire flamboyer (éclair, feu d'artifice). */
  flash: (k: number, color: THREE.Color) => void;
  /** Son ponctuel (tintement, explosion). */
  onSound?: (kind: 'coin' | 'boom' | 'pop' | 'thunder', strength: number) => void;
}

interface Show { step(t: number, dt: number): void; dispose(): void }

/** Texture de point doux (une seule pour toutes les célébrations). */
let dotTex: THREE.Texture | null = null;
function dot() {
  if (dotTex) return dotTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  dotTex = new THREE.CanvasTexture(c);
  return dotTex;
}

/** Nuage de particules additives (étincelles, éclats) avec gravité et traînée. */
class Sparks {
  readonly pts: THREE.Points;
  private geo = new THREE.BufferGeometry();
  private mat: THREE.PointsMaterial;
  pos: Float32Array; col: Float32Array; vel: Float32Array; life: Float32Array; max: Float32Array; tint: Float32Array;
  n = 0;
  constructor(readonly N: number, size: number, private gravity = -4, private drag = 1.2, additive = true) {
    this.pos = new Float32Array(N * 3).fill(-999); this.col = new Float32Array(N * 3); this.vel = new Float32Array(N * 3);
    this.life = new Float32Array(N); this.max = new Float32Array(N); this.tint = new Float32Array(N * 3);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.mat = new THREE.PointsMaterial({ size, map: dot(), vertexColors: true, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, sizeAttenuation: true });
    this.pts = new THREE.Points(this.geo, this.mat);
    this.pts.frustumCulled = false;
    this.pts.renderOrder = 4;
  }
  add(p: THREE.Vector3, v: THREE.Vector3, c: THREE.Color, life: number) {
    const j = this.n++ % this.N, o = j * 3;
    this.pos[o] = p.x; this.pos[o + 1] = p.y; this.pos[o + 2] = p.z;
    this.vel[o] = v.x; this.vel[o + 1] = v.y; this.vel[o + 2] = v.z;
    this.tint[o] = c.r; this.tint[o + 1] = c.g; this.tint[o + 2] = c.b;
    this.life[j] = this.max[j] = life;
  }
  step(dt: number, twinkle = 0, t = 0) {
    const dr = Math.exp(-this.drag * dt);
    for (let j = 0; j < this.N; j++) {
      const o = j * 3;
      if (this.life[j] <= 0) { this.col[o] = this.col[o + 1] = this.col[o + 2] = 0; continue; }
      this.life[j] -= dt;
      this.vel[o] *= dr; this.vel[o + 1] = this.vel[o + 1] * dr + this.gravity * dt; this.vel[o + 2] *= dr;
      this.pos[o] += this.vel[o] * dt; this.pos[o + 1] += this.vel[o + 1] * dt; this.pos[o + 2] += this.vel[o + 2] * dt;
      if (this.pos[o + 1] < 0.05) { this.pos[o + 1] = 0.05; this.vel[o + 1] *= -0.25; }
      const k = Math.max(0, this.life[j] / this.max[j]);
      const tw = twinkle ? 0.55 + 0.45 * Math.sin(t * 40 + j * 2.3) : 1;
      // Blanc chaud au départ, puis la couleur, puis s'éteint.
      const hot = Math.max(0, (k - 0.75) * 4);
      for (let c = 0; c < 3; c++) this.col[o + c] = (this.tint[o + c] * (1 - hot) + hot) * k * tw * 1.4;
    }
    (this.geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
  }
  dispose() { this.geo.dispose(); this.mat.dispose(); this.pts.removeFromParent(); }
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const colorsOf = (id: string | null, fallback: string[]) => (fxDef(id ?? undefined)?.colors ?? fallback).map((c) => new THREE.Color(c));

// ---------------------------------------------------------------------------------------------

/** Par défaut : onde dorée sur le tapis et gerbe d'étincelles autour des dés. */
function defaultShow(x: Ctx): Show {
  const g = new THREE.Group();
  const ringGeo = new THREE.RingGeometry(0.85, 1, 64); ringGeo.rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffd36b, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const rings = [0, 0.25].map(() => { const m = new THREE.Mesh(ringGeo, ringMat.clone()); m.position.copy(x.center).setY(0.03); g.add(m); return m; });
  const sp = new Sparks(x.lite ? 90 : 180, 0.35, -5, 1.4);
  g.add(sp.pts); x.scene.add(g);
  const gold = [new THREE.Color('#ffe08a'), new THREE.Color('#fff4d0'), new THREE.Color('#ffb02e')];
  for (let k = 0; k < sp.N; k++) {
    const a = rnd(0, Math.PI * 2), s = rnd(2, 7);
    sp.add(x.center.clone().setY(0.6), new THREE.Vector3(Math.cos(a) * s, rnd(3, 9), Math.sin(a) * s), gold[k % 3], rnd(0.8, 1.6));
  }
  return {
    step(t, dt) {
      rings.forEach((r, i) => { const k = Math.max(0, t - i * 0.25); r.scale.setScalar(1 + k * 7); (r.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - k / 1.1) * 0.9; });
      sp.step(dt);
    },
    dispose() { sp.dispose(); ringGeo.dispose(); ringMat.dispose(); rings.forEach((r) => (r.material as THREE.Material).dispose()); g.removeFromParent(); },
  };
}

/** Bravo ! : confettis tirés de deux coins, qui tournoient, flottent et se posent sur le tapis. */
function confettiShow(x: Ctx, id: string): Show {
  const N = x.lite ? 140 : 300;
  const cols = colorsOf(id, ['#ffd23f', '#ffffff']).concat([new THREE.Color('#ff5d73'), new THREE.Color('#3ec1d3')]);
  const geo = new THREE.PlaneGeometry(0.3, 0.17);
  const mat = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.45, metalness: 0.25, envMapIntensity: 1.2 });
  const mesh = new THREE.InstancedMesh(geo, mat, N);
  mesh.frustumCulled = false;
  const P = new Float32Array(N * 3), V = new Float32Array(N * 3), A = new Float32Array(N * 3), W = new Float32Array(N * 3), landed = new Uint8Array(N), delay = new Float32Array(N);
  const [hx, hz] = x.half;
  for (let i = 0; i < N; i++) {
    // Gerbe qui jaillit des dés dans toutes les directions (lisible quel que soit l'angle de la caméra).
    const a = rnd(0, Math.PI * 2), s = rnd(2, 6.5);
    P[i * 3] = x.center.x + Math.cos(a) * 0.6; P[i * 3 + 1] = 0.8; P[i * 3 + 2] = x.center.z + Math.sin(a) * 0.6;
    V[i * 3] = Math.cos(a) * s; V[i * 3 + 1] = rnd(9, 15); V[i * 3 + 2] = Math.sin(a) * s;
    A[i * 3] = rnd(0, 6); A[i * 3 + 1] = rnd(0, 6); A[i * 3 + 2] = rnd(0, 6);
    W[i * 3] = rnd(-12, 12); W[i * 3 + 1] = rnd(-8, 8); W[i * 3 + 2] = rnd(-12, 12);
    delay[i] = (i % 3) * 0.12; // trois salves
    mesh.setColorAt(i, cols[i % cols.length]);
  }
  x.scene.add(mesh);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s1 = new THREE.Vector3(1, 1, 1), s0 = new THREE.Vector3(0, 0, 0), p = new THREE.Vector3();
  x.onSound?.('pop', 1);
  return {
    step(t, dt) {
      const fade = Math.min(1, Math.max(0, (CELEBRATION_MS / 1000 - t) / 0.5));
      for (let i = 0; i < N; i++) {
        const o = i * 3;
        if (t < delay[i]) { m4.compose(p.set(0, -50, 0), q, s0); mesh.setMatrixAt(i, m4); continue; }
        if (!landed[i]) {
          // Air : traînée forte (le papier flotte), balancement latéral.
          const drag = Math.exp(-1.8 * dt);
          V[o] = V[o] * drag + Math.sin(t * 5 + i) * 2.2 * dt; V[o + 1] = V[o + 1] * drag - 9 * dt; V[o + 2] = V[o + 2] * drag + Math.cos(t * 4 + i) * 2.2 * dt;
          if (V[o + 1] < -2.6) V[o + 1] = -2.6; // vitesse limite : il virevolte
          P[o] += V[o] * dt; P[o + 1] += V[o + 1] * dt; P[o + 2] += V[o + 2] * dt;
          A[o] += W[o] * dt; A[o + 1] += W[o + 1] * dt; A[o + 2] += W[o + 2] * dt;
          if (P[o + 1] < 0.02 && V[o + 1] < 0) { P[o + 1] = 0.015 + (i % 7) * 0.002; landed[i] = 1; A[o] = -Math.PI / 2; A[o + 2] = 0; }
          P[o] = Math.max(-hx, Math.min(hx, P[o])); P[o + 2] = Math.max(-hz, Math.min(hz, P[o + 2]));
        }
        q.setFromEuler(e.set(A[o], A[o + 1], A[o + 2]));
        m4.compose(p.set(P[o], P[o + 1], P[o + 2]), q, s1.setScalar(fade));
        mesh.setMatrixAt(i, m4);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
    dispose() { geo.dispose(); mat.dispose(); mesh.dispose(); mesh.removeFromParent(); },
  };
}

/** Ballons : ballons brillants qui s'élèvent du bac en se balançant, ficelle comprise. */
function balloonShow(x: Ctx, id: string): Show {
  const N = x.lite ? 9 : 16;
  const cols = colorsOf(id, ['#ff5d73', '#3ec1d3', '#ffd23f', '#9d6bff']);
  const geo = new THREE.SphereGeometry(0.62, x.lite ? 16 : 24, x.lite ? 12 : 18);
  geo.scale(1, 1.18, 1);
  const knotGeo = new THREE.ConeGeometry(0.1, 0.16, 8); knotGeo.translate(0, -0.78, 0);
  const strGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, -0.8, 0), new THREE.Vector3(0.08, -1.6, 0), new THREE.Vector3(-0.05, -2.5, 0)]);
  const strMat = new THREE.LineBasicMaterial({ color: 0xf2f2f2, transparent: true, opacity: 0.7 });
  const g = new THREE.Group();
  const items = Array.from({ length: N }, (_, i) => {
    const mat = new THREE.MeshPhysicalMaterial({ color: cols[i % cols.length], roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.12, envMapIntensity: 0.35, transparent: true, opacity: 0.97 });
    const b = new THREE.Mesh(geo, mat);
    b.add(new THREE.Mesh(knotGeo, mat), new THREE.Line(strGeo, strMat));
    const [hx, hz] = x.half;
    const start = new THREE.Vector3(rnd(-hx * 0.8, hx * 0.8), -1.2, rnd(-hz * 0.8, hz * 0.8));
    b.position.copy(start);
    b.castShadow = !x.lite;
    g.add(b);
    return { b, mat, start, delay: (i / N) * 0.7 + rnd(0, 0.15), speed: rnd(3.2, 4.6), ph: rnd(0, 6), sway: rnd(0.4, 0.9) };
  });
  x.scene.add(g);
  return {
    step(t) {
      for (const it of items) {
        const k = Math.max(0, t - it.delay);
        if (k <= 0) { it.b.visible = false; continue; }
        it.b.visible = true;
        // Gonflé en 0,2 s, puis montée qui accélère un peu.
        const inflate = Math.min(1, k / 0.2);
        it.b.scale.setScalar(0.3 + 0.7 * inflate * (1 + 0.06 * Math.sin(k * 9) * (1 - inflate)));
        it.b.position.set(it.start.x + Math.sin(k * 2.2 + it.ph) * it.sway, it.start.y + 1.8 + k * it.speed + k * k * 0.9, it.start.z + Math.cos(k * 1.7 + it.ph) * it.sway * 0.6);
        it.b.rotation.z = Math.sin(k * 2.2 + it.ph) * 0.25;
        it.mat.opacity = 0.96 * Math.min(1, Math.max(0, (CELEBRATION_MS / 1000 - t) / 0.4));
      }
    },
    dispose() { geo.dispose(); knotGeo.dispose(); strGeo.dispose(); strMat.dispose(); for (const it of items) it.mat.dispose(); g.removeFromParent(); },
  };
}

/** Tracé d'éclair en zigzag avec ramifications (listes de points). */
function boltPaths(from: THREE.Vector3, to: THREE.Vector3, jag: number, depth = 0): { pts: THREE.Vector3[]; w: number }[] {
  const pts: THREE.Vector3[] = [from.clone()];
  const n = 16;
  for (let k = 1; k < n; k++) {
    const p = from.clone().lerp(to, k / n);
    const off = jag * Math.sin((k / n) * Math.PI);
    p.x += rnd(-off, off); p.z += rnd(-off, off);
    pts.push(p);
  }
  pts.push(to.clone());
  const out = [{ pts, w: depth ? 0.45 : 1 }];
  if (depth < 1) for (let k = 0; k < 3; k++) {
    const a = pts[4 + Math.floor(Math.random() * 9)];
    const end = a.clone().add(new THREE.Vector3(rnd(-3, 3), -rnd(1.5, 3.5), rnd(-3, 3)));
    end.y = Math.max(0.3, end.y);
    out.push(...boltPaths(a, end, jag * 0.5, depth + 1));
  }
  return out;
}
/** Ruban (deux plans croisés) le long d'un tracé, pour qu'il se voie sous tous les angles. */
function ribbon(pts: THREE.Vector3[], width: number): THREE.BufferGeometry {
  const pos: number[] = [];
  for (let k = 0; k < pts.length - 1; k++) {
    const a = pts[k], b = pts[k + 1];
    const w = width * (1 - (k / pts.length) * 0.5);
    for (const [dx, dz] of [[w, 0], [0, w]]) pos.push(a.x - dx, a.y, a.z - dz, a.x + dx, a.y, a.z + dz, b.x + dx, b.y, b.z + dz, a.x - dx, a.y, a.z - dz, b.x + dx, b.y, b.z + dz, b.x - dx, b.y, b.z - dz);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return g;
}

/** Coup de tonnerre : deux éclairs frappent les dés, flash de la scène, arcs et étincelles. */
function thunderShow(x: Ctx, id: string): Show {
  const [c1, c2] = colorsOf(id, ['#fff6b0', '#8fb4ff']);
  const g = new THREE.Group();
  const core = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const glow = new THREE.MeshBasicMaterial({ color: c2, opacity: 0.35, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const geos: THREE.BufferGeometry[] = [];
  const bolt = (to: THREE.Vector3) => {
    const from = to.clone().add(new THREE.Vector3(rnd(-2, 2), 16, rnd(-3, 0)));
    const grp = new THREE.Group();
    for (const path of boltPaths(from, to, 1.3)) {
      const c = ribbon(path.pts, 0.035 * path.w), h = ribbon(path.pts, 0.13 * path.w);
      grp.add(new THREE.Mesh(h, glow), new THREE.Mesh(c, core));
      geos.push(c, h);
    }
    grp.visible = false;
    g.add(grp);
    return grp;
  };
  const strikes = [bolt(x.center.clone().setY(0.6)), bolt(x.center.clone().add(new THREE.Vector3(rnd(-1.5, 1.5), 0.6, rnd(-1, 1))))];
  const sp = new Sparks(x.lite ? 80 : 160, 0.3, -6, 1);
  g.add(sp.pts);
  // Brûlure au sol : tache claire qui s'estompe.
  const scorchGeo = new THREE.CircleGeometry(1.6, 32); scorchGeo.rotateX(-Math.PI / 2);
  const scorchMat = new THREE.MeshBasicMaterial({ map: dot(), color: c2, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
  const scorch = new THREE.Mesh(scorchGeo, scorchMat); scorch.position.copy(x.center).setY(0.03);
  g.add(scorch);
  x.scene.add(g);
  let fired = [false, false];
  const times = [0.05, 0.42];
  return {
    step(t, dt) {
      strikes.forEach((s, i) => {
        const k = t - times[i];
        // Éclair : visible 0,25 s en clignotant.
        s.visible = k > 0 && k < 0.28 && Math.sin(k * 90) > -0.4;
        if (k > 0 && !fired[i]) {
          fired[i] = true;
          x.onSound?.('thunder', i ? 0.7 : 1);
          for (let j = 0; j < sp.N / 2; j++) { const a = rnd(0, Math.PI * 2), v = rnd(2, 8); sp.add(x.center.clone().setY(0.5), new THREE.Vector3(Math.cos(a) * v, rnd(2, 7), Math.sin(a) * v), j % 2 ? c1 : c2, rnd(0.4, 1)); }
        }
      });
      const f1 = Math.max(0, 1 - Math.abs(t - 0.07) / 0.12), f2 = Math.max(0, 1 - Math.abs(t - 0.45) / 0.1) * 0.8;
      const flick = t < 0.7 ? Math.max(f1, f2) * (0.7 + 0.3 * Math.sin(t * 120)) : 0;
      x.flash(flick * 1.6, c2);
      scorchMat.opacity = Math.max(0, Math.min(1, t * 12)) * Math.max(0, 1 - t / 2.2) * 0.3;
      sp.step(dt, 1, t);
    },
    dispose() { for (const geo of geos) geo.dispose(); core.dispose(); glow.dispose(); sp.dispose(); scorchGeo.dispose(); scorchMat.dispose(); g.removeFromParent(); x.flash(0, c2); },
  };
}

/** Pluie d'or : pièces dorées (avec relief) qui tombent en tournoyant, rebondissent et se couchent. */
function coinShow(x: Ctx, id: string): Show {
  const N = x.lite ? 40 : 90;
  const cols = colorsOf(id, ['#ffe08a', '#d4ad2f', '#b8892c']);
  // Pièce : cylindre biseauté, face frappée d'un « 421 » en relief (texture).
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const cg = c.getContext('2d')!;
  const gr = cg.createRadialGradient(54, 50, 6, 64, 64, 64); gr.addColorStop(0, '#fff3b8'); gr.addColorStop(0.6, '#e2b84a'); gr.addColorStop(1, '#a8781c');
  cg.fillStyle = gr; cg.fillRect(0, 0, 128, 128);
  cg.strokeStyle = 'rgba(110,70,10,0.8)'; cg.lineWidth = 5; cg.beginPath(); cg.arc(64, 64, 52, 0, Math.PI * 2); cg.stroke();
  cg.fillStyle = 'rgba(120,78,12,0.85)'; cg.font = 'bold 44px sans-serif'; cg.textAlign = 'center'; cg.textBaseline = 'middle'; cg.fillText('421', 64, 66);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const geo = new THREE.CylinderGeometry(0.34, 0.34, 0.06, x.lite ? 18 : 28);
  const face = new THREE.MeshStandardMaterial({ map: tex, metalness: 0.9, roughness: 0.28, envMapIntensity: 1.6 });
  const edge = new THREE.MeshStandardMaterial({ color: cols[1] ?? cols[0], metalness: 0.95, roughness: 0.3, envMapIntensity: 1.6 });
  const mesh = new THREE.InstancedMesh(geo, [edge, face, face], N);
  mesh.castShadow = !x.lite;
  mesh.frustumCulled = false;
  const P = new Float32Array(N * 3), V = new Float32Array(N * 3), A = new Float32Array(N * 3), W = new Float32Array(N * 3), state = new Uint8Array(N), delay = new Float32Array(N);
  const [hx, hz] = x.half;
  for (let i = 0; i < N; i++) {
    // Plus dense autour des dés.
    const near = i % 3 !== 0;
    P[i * 3] = near ? x.center.x + rnd(-3, 3) : rnd(-hx * 0.9, hx * 0.9);
    P[i * 3 + 1] = rnd(9, 16);
    P[i * 3 + 2] = near ? x.center.z + rnd(-3, 3) : rnd(-hz * 0.9, hz * 0.9);
    V[i * 3 + 1] = rnd(-4, -1);
    A[i * 3] = rnd(0, 6); A[i * 3 + 2] = rnd(0, 6);
    W[i * 3] = rnd(-14, 14); W[i * 3 + 2] = rnd(-10, 10);
    delay[i] = rnd(0, 1.1);
  }
  x.scene.add(mesh);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();
  let clinks = 0;
  return {
    step(t, dt) {
      const fade = Math.min(1, Math.max(0, (CELEBRATION_MS / 1000 - t) / 0.45));
      for (let i = 0; i < N; i++) {
        const o = i * 3;
        if (t < delay[i]) { m4.compose(p.set(0, -50, 0), q, s.set(0, 0, 0)); mesh.setMatrixAt(i, m4); continue; }
        if (state[i] < 2) {
          V[o + 1] -= 22 * dt;
          P[o] += V[o] * dt; P[o + 1] += V[o + 1] * dt; P[o + 2] += V[o + 2] * dt;
          A[o] += W[o] * dt; A[o + 2] += W[o + 2] * dt;
          // Les pièces ne traversent pas les dés : elles rebondissent dessus (approximation : cylindre autour du centre).
          if (P[o + 1] < 0.035) {
            P[o + 1] = 0.035;
            if (state[i] === 0 && V[o + 1] < -3) {
              V[o + 1] *= -0.32; V[o] = rnd(-1.2, 1.2); V[o + 2] = rnd(-1.2, 1.2); W[o] *= 0.4; W[o + 2] *= 0.4; state[i] = 1;
              if (clinks++ < 10 && i % 3 === 0) x.onSound?.('coin', rnd(0.4, 1));
            } else {
              // Couchée à plat.
              state[i] = 2; A[o] = Math.round(A[o] / Math.PI) * Math.PI; A[o + 2] = Math.round(A[o + 2] / Math.PI) * Math.PI + rnd(-0.08, 0.08);
            }
          }
          P[o] = Math.max(-hx, Math.min(hx, P[o])); P[o + 2] = Math.max(-hz, Math.min(hz, P[o + 2]));
        }
        q.setFromEuler(e.set(A[o], A[o + 1], A[o + 2]));
        m4.compose(p.set(P[o], P[o + 1] - (1 - fade) * 0.1, P[o + 2]), q, s.setScalar(fade));
        mesh.setMatrixAt(i, m4);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
    dispose() { geo.dispose(); face.dispose(); edge.dispose(); tex.dispose(); mesh.dispose(); mesh.removeFromParent(); },
  };
}

/** Feu d'artifice : fusées qui montent (traînée), éclatent en pivoines colorées qui scintillent. */
function fireworkShow(x: Ctx, id: string): Show {
  const cols = colorsOf(id, ['#ff4d4d', '#ffe14d', '#4db8ff', '#9d6bff', '#59d97a']);
  const sp = new Sparks(x.lite ? 700 : 1600, 0.3, -2.6, 1.1);
  const trail = new Sparks(x.lite ? 160 : 320, 0.3, -1, 3);
  const g = new THREE.Group(); g.add(sp.pts, trail.pts);
  x.scene.add(g);
  const [hx, hz] = x.half;
  const nRockets = x.lite ? 4 : 6;
  const rockets = Array.from({ length: nRockets }, (_, i) => {
    const from = new THREE.Vector3(rnd(-hx * 0.7, hx * 0.7), 0.3, rnd(-hz * 0.6, hz * 0.3));
    const to = new THREE.Vector3(x.center.x * 0.4 + rnd(-hx * 0.6, hx * 0.6), rnd(3.5, 5.5), x.center.z * 0.4 + rnd(-hz * 0.6, hz * 0.6));
    return { from, to, t0: i * (x.lite ? 0.38 : 0.28) + rnd(0, 0.08), up: 0.55, done: false, color: cols[i % cols.length], color2: cols[(i + 2) % cols.length], ring: i % 3 === 2 };
  });
  const per = Math.floor(sp.N / nRockets);
  const p = new THREE.Vector3();
  return {
    step(t, dt) {
      let light = 0;
      for (const r of rockets) {
        const k = (t - r.t0) / r.up;
        if (k < 0) continue;
        if (k < 1) {
          const e = 1 - (1 - k) * (1 - k);
          p.lerpVectors(r.from, r.to, e);
          for (let j = 0; j < 2; j++) trail.add(p, new THREE.Vector3(rnd(-0.3, 0.3), rnd(-1, 0), rnd(-0.3, 0.3)), new THREE.Color('#ffd9a0'), rnd(0.2, 0.45));
        } else if (!r.done) {
          r.done = true;
          x.onSound?.('boom', 1);
          // Pivoine : sphère d'éclats ; un sur trois est un anneau.
          for (let j = 0; j < per; j++) {
            const u = rnd(-1, 1), a = rnd(0, Math.PI * 2), s = Math.sqrt(1 - u * u);
            const dir = r.ring ? new THREE.Vector3(Math.cos(a), rnd(-0.08, 0.08), Math.sin(a)) : new THREE.Vector3(s * Math.cos(a), u, s * Math.sin(a));
            const speed = r.ring ? 4.2 : rnd(3.2, 4.4);
            sp.add(r.to, dir.multiplyScalar(speed), j % 4 === 0 ? r.color2 : r.color, rnd(1.1, 1.6));
          }
        }
        const since = t - r.t0 - r.up;
        if (since > 0 && since < 0.3) light = Math.max(light, 1 - since / 0.3);
      }
      const last = rockets[rockets.length - 1];
      x.flash(light * 0.8, last.color);
      sp.step(dt, 1, t);
      trail.step(dt);
    },
    dispose() { sp.dispose(); trail.dispose(); g.removeFromParent(); x.flash(0, cols[0]); },
  };
}

export class Celebrations {
  private show: Show | null = null;
  private t = 0;
  constructor(public ctx: Omit<Ctx, 'center' | 'lite'> & { lite: () => boolean }) {}
  /** Lance la célébration de l'effet `id` (null : célébration par défaut) autour de `center`. */
  start(id: string | null, center: THREE.Vector3) {
    this.stop();
    const x: Ctx = { ...this.ctx, center, lite: this.ctx.lite() };
    this.t = 0;
    switch (id) {
      case 'fx-bravo': this.show = confettiShow(x, id); break;
      case 'fx-ballons': this.show = balloonShow(x, id); break;
      case 'fx-eclair': this.show = thunderShow(x, id); break;
      case 'fx-pluie-or': this.show = coinShow(x, id); break;
      case 'fx-feu-artifice': this.show = fireworkShow(x, id); break;
      default: this.show = defaultShow(x);
    }
  }
  get active() { return !!this.show; }
  /** Avance l'animation ; renvoie vrai tant qu'elle dure. */
  step(dt: number): boolean {
    if (!this.show) return false;
    this.t += dt;
    if (this.t * 1000 >= CELEBRATION_MS) { this.stop(); return false; }
    this.show.step(this.t, dt);
    return true;
  }
  stop() { this.show?.dispose(); this.show = null; }
}
