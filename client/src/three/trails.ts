/**
 * Traînées de lancer : un ruban lisse derrière chaque dé (il s'amincit et s'efface vers la
 * queue) et des particules propres à chaque effet (étincelles, flammes, étoiles, bulles…).
 * Tout est dessiné en trois appels (rubans, particules) ; rien ne reste à l'écran après le lancer.
 */
import * as THREE from 'three';
import { fxDef, type Rarity } from '../../../shared/progress/dice-collection';

type Shape = 0 | 1 | 2 | 3; // disque doux, étoile à 4 branches, anneau (bulle), carré (confetti)
interface TrailStyle {
  /** Ruban : largeur (unités du bac), durée de vie d'un point (s), intensité. 0 = pas de ruban. */
  ribbon: number; ribbonLife: number; ribbonAlpha: number;
  /** Couleurs du ruban : 'cycle' = défilent le long du ruban (arc-en-ciel), sinon dégradé tête → queue. */
  ribbonMode: 'grad' | 'cycle';
  additive: boolean;
  /** Particules par seconde et par dé (à pleine vitesse). */
  rate: number;
  life: [number, number];
  size: [number, number];
  /** Taille au cours de la vie : 'shrink', 'grow' (fumée), 'flicker' (flamme), 'twinkle' (étoile). */
  sizeMode: 'shrink' | 'grow' | 'flicker' | 'twinkle' | 'flat';
  shape: Shape;
  gravity: number;
  /** Vitesse de départ : hasard, montée, part de la vitesse du dé. */
  spread: number; rise: number; inherit: number;
  drag: number;
  /** Petit éclat lumineux autour de chaque dé (cœur de la comète). */
  halo: number;
}

const BASE: TrailStyle = {
  ribbon: 0, ribbonLife: 0.35, ribbonAlpha: 0.8, ribbonMode: 'grad', additive: true, rate: 40, life: [0.5, 0.9], size: [0.25, 0.5],
  sizeMode: 'shrink', shape: 0, gravity: 0, spread: 0.6, rise: 0.4, inherit: 0, drag: 1.5, halo: 0,
};
const RARITY_SCALE: Record<Rarity, number> = { commun: 0.7, rare: 1, epique: 1.25, legendaire: 1.5 };

/** Réglages par effet, d'après son nom. */
const STYLES: Record<string, Partial<TrailStyle>> = {
  'fx-poussiere': { additive: false, rate: 34, life: [0.6, 1.1], size: [0.35, 0.8], sizeMode: 'grow', spread: 0.5, rise: 0.25, drag: 3 },
  'fx-bulles': { additive: false, rate: 22, life: [0.8, 1.4], size: [0.16, 0.36], sizeMode: 'flat', shape: 2, rise: 1.4, spread: 0.35, drag: 2 },
  'fx-etincelles': { ribbon: 0.16, ribbonLife: 0.3, rate: 70, life: [0.25, 0.6], size: [0.1, 0.22], gravity: -6, spread: 2.6, rise: 2.2, inherit: 0.25, drag: 0.6, shape: 0 },
  'fx-confettis': { additive: false, rate: 34, life: [0.9, 1.5], size: [0.16, 0.26], sizeMode: 'flat', shape: 3, gravity: -3.5, spread: 1.6, rise: 2.6, drag: 2.2 },
  'fx-flammes': { ribbon: 0.6, ribbonLife: 0.4, ribbonAlpha: 1, rate: 70, life: [0.3, 0.65], size: [0.45, 0.85], sizeMode: 'flicker', rise: 2.1, spread: 0.45, drag: 1.2, halo: 0.9 },
  'fx-etoiles': { ribbon: 0.45, ribbonLife: 0.55, ribbonAlpha: 0.9, rate: 40, life: [0.6, 1.1], size: [0.18, 0.45], sizeMode: 'twinkle', shape: 1, spread: 0.5, rise: 0.3, drag: 2.5, halo: 0.8 },
  'fx-arc-en-ciel': { ribbon: 0.7, ribbonLife: 0.6, ribbonAlpha: 1, ribbonMode: 'cycle', rate: 36, life: [0.6, 1.1], size: [0.16, 0.36], sizeMode: 'twinkle', shape: 1, spread: 0.6, rise: 0.4, drag: 2, halo: 0.7 },
};

const MAXP = 900;
const HIST = 34;

const VERT_P = `
attribute float aSize; attribute vec4 aColor; attribute float aShape; attribute float aRot;
varying vec4 vColor; varying float vShape; varying float vRot;
uniform float uScale;
void main() {
  vColor = aColor; vShape = aShape; vRot = aRot;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uScale / -mv.z;
  gl_Position = projectionMatrix * mv;
}`;
const FRAG_P = `
varying vec4 vColor; varying float vShape; varying float vRot;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float c = cos(vRot), s = sin(vRot);
  p = mat2(c, -s, s, c) * p;
  float r = length(p), a = 0.0;
  if (vShape < 0.5) a = smoothstep(1.0, 0.0, r) * smoothstep(1.0, 0.25, r) + smoothstep(0.35, 0.0, r);
  else if (vShape < 1.5) { a = smoothstep(0.12, 0.0, abs(p.x) * (0.3 + abs(p.y))) + smoothstep(0.12, 0.0, abs(p.y) * (0.3 + abs(p.x))); a = a * smoothstep(1.0, 0.3, r) + smoothstep(0.4, 0.0, r); }
  else if (vShape < 2.5) { a = smoothstep(0.16, 0.0, abs(r - 0.78)) * 0.9 + smoothstep(0.32, 0.0, length(p - vec2(-0.32, -0.32))) * 0.9 + 0.12 * step(r, 0.8); }
  else { vec2 q = abs(p); a = step(q.x, 0.9) * step(q.y, 0.5); }
  if (a < 0.01) discard;
  gl_FragColor = vec4(vColor.rgb, vColor.a * clamp(a, 0.0, 1.0));
}`;

const VERT_R = `
attribute vec4 aColor; varying vec4 vColor; attribute float aSide; varying float vSide;
void main() { vColor = aColor; vSide = aSide; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FRAG_R = `
varying vec4 vColor; varying float vSide;
void main() { float e = 1.0 - abs(vSide); gl_FragColor = vec4(vColor.rgb * (0.7 + 0.6 * e * e), vColor.a * smoothstep(0.0, 0.7, e)); }`;

export class Trails {
  readonly group = new THREE.Group();
  private st: TrailStyle | null = null;
  private colors: THREE.Color[] = [];
  private lite: boolean;
  // Particules
  private pGeo = new THREE.BufferGeometry();
  private pMat: THREE.ShaderMaterial;
  private pos = new Float32Array(MAXP * 3);
  private col = new Float32Array(MAXP * 4);
  private size = new Float32Array(MAXP);
  private shape = new Float32Array(MAXP);
  private rot = new Float32Array(MAXP);
  private vel = new Float32Array(MAXP * 3);
  private life = new Float32Array(MAXP);
  private max = new Float32Array(MAXP);
  private base = new Float32Array(MAXP);
  private spin = new Float32Array(MAXP);
  private rgb = new Float32Array(MAXP * 3);
  private next = 0;
  private acc = [0, 0, 0];
  // Rubans : un historique de positions par dé.
  private hist: { p: THREE.Vector3; t: number }[][] = [[], [], []];
  private rGeo = new THREE.BufferGeometry();
  private rMat: THREE.ShaderMaterial;
  private rPos = new Float32Array(3 * HIST * 2 * 3);
  private rCol = new Float32Array(3 * HIST * 2 * 4);
  private rSide = new Float32Array(3 * HIST * 2);
  private last: THREE.Vector3[] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  private clock = 0;
  private tmp = new THREE.Vector3();

  constructor(lite: boolean) {
    this.lite = lite;
    const a = (arr: Float32Array, n: number) => new THREE.BufferAttribute(arr, n).setUsage(THREE.DynamicDrawUsage);
    this.pos.fill(-999);
    this.pGeo.setAttribute('position', a(this.pos, 3));
    this.pGeo.setAttribute('aColor', a(this.col, 4));
    this.pGeo.setAttribute('aSize', a(this.size, 1));
    this.pGeo.setAttribute('aShape', a(this.shape, 1));
    this.pGeo.setAttribute('aRot', a(this.rot, 1));
    this.pMat = new THREE.ShaderMaterial({ vertexShader: VERT_P, fragmentShader: FRAG_P, uniforms: { uScale: { value: 400 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const pts = new THREE.Points(this.pGeo, this.pMat);
    pts.frustumCulled = false;
    pts.renderOrder = 3;
    // Rubans : bandes de triangles (deux sommets par point d'historique).
    this.rGeo.setAttribute('position', a(this.rPos, 3));
    this.rGeo.setAttribute('aColor', a(this.rCol, 4));
    this.rGeo.setAttribute('aSide', new THREE.BufferAttribute(this.rSide, 1));
    const idx: number[] = [];
    for (let d = 0; d < 3; d++) for (let k = 0; k < HIST - 1; k++) {
      const o = (d * HIST + k) * 2;
      idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2);
    }
    this.rGeo.setIndex(idx);
    for (let i = 0; i < this.rSide.length; i++) this.rSide[i] = i % 2 ? 1 : -1;
    this.rMat = new THREE.ShaderMaterial({ vertexShader: VERT_R, fragmentShader: FRAG_R, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const rib = new THREE.Mesh(this.rGeo, this.rMat);
    rib.frustumCulled = false;
    rib.renderOrder = 2;
    this.group.add(rib, pts);
    this.group.visible = false;
  }

  /** Effet de traînée (identifiant du catalogue) ou aucun. */
  set(id: string | null) {
    const def = fxDef(id ?? undefined);
    if (!def || def.kind !== 'trainee') { this.st = null; return; }
    const st = { ...BASE, ...(STYLES[def.id] ?? {}) };
    const k = RARITY_SCALE[def.rarity] * (this.lite ? 0.55 : 1);
    st.rate *= k;
    this.st = st;
    this.colors = def.colors.map((c) => new THREE.Color(c));
    for (const m of [this.pMat, this.rMat]) { m.blending = st.additive ? THREE.AdditiveBlending : THREE.NormalBlending; m.needsUpdate = true; }
  }
  setLite(lite: boolean) { this.lite = lite; }
  /** Taille des particules à l'écran (hauteur du canevas en pixels). */
  setScale(px: number) { this.pMat.uniforms.uScale.value = px * 1.2; }

  /** Vide tout (nouvel effet, fin de partie). */
  clear() {
    this.life.fill(0);
    for (let j = 0; j < MAXP; j++) { this.col[j * 4 + 3] = 0; this.pos[j * 3 + 1] = -999; }
    for (const h of this.hist) h.length = 0;
    this.group.visible = false;
  }

  /**
   * Avance d'un pas. `dice` : positions des dés, `emit` : le lancer est en cours.
   * Renvoie vrai s'il reste quelque chose à animer.
   */
  step(dt: number, dice: THREE.Vector3[], emit: boolean): boolean {
    this.clock += dt;
    const st = this.st;
    let alive = false;
    // --- Émission ---
    dice.forEach((p, i) => {
      const v = this.tmp.copy(p).sub(this.last[i]).divideScalar(Math.max(dt, 1e-3));
      const speed = v.length();
      this.last[i].copy(p);
      if (!emit || !st || speed > 60) { this.acc[i] = 0; return; }
      const h = this.hist[i];
      if (st.ribbon && speed > 0.6) { h.unshift({ p: p.clone(), t: this.clock }); if (h.length > HIST) h.length = HIST; }
      if (speed < 0.8) return;
      this.acc[i] += st.rate * dt * Math.min(1.6, 0.35 + speed / 8);
      while (this.acc[i] >= 1) {
        this.acc[i] -= 1;
        this.spawn(p, v, st);
      }
    });
    // --- Particules ---
    if (st || this.life.some((l) => l > 0)) {
      const s = st ?? BASE;
      const drag = Math.exp(-s.drag * dt);
      for (let j = 0; j < MAXP; j++) {
        if (this.life[j] <= 0) continue;
        this.life[j] -= dt;
        if (this.life[j] <= 0) { this.col[j * 4 + 3] = 0; this.pos[j * 3 + 1] = -999; this.size[j] = 0; continue; }
        alive = true;
        const o = j * 3;
        this.vel[o] *= drag; this.vel[o + 2] *= drag;
        this.vel[o + 1] = this.vel[o + 1] * drag + s.gravity * dt;
        if (s.shape === 2) this.vel[o] += Math.sin(this.clock * 7 + j) * dt * 1.2; // bulles qui zigzaguent
        this.pos[o] += this.vel[o] * dt; this.pos[o + 1] += this.vel[o + 1] * dt; this.pos[o + 2] += this.vel[o + 2] * dt;
        if (this.pos[o + 1] < 0.04) { this.pos[o + 1] = 0.04; this.vel[o + 1] *= -0.3; this.vel[o] *= 0.6; this.vel[o + 2] *= 0.6; }
        const t = 1 - this.life[j] / this.max[j]; // 0 → 1
        let sz = this.base[j], a = 1;
        switch (s.sizeMode) {
          case 'shrink': sz *= 1 - t * 0.7; a = 1 - t * t; break;
          case 'grow': sz *= 0.5 + t * 1.4; a = (1 - t) * Math.min(1, t * 6) * 0.55; break;
          case 'flicker': sz *= (1 - t * 0.5) * (0.8 + 0.4 * Math.sin(this.clock * 30 + j)); a = 1 - t; break;
          case 'twinkle': sz *= 0.6 + 0.6 * Math.pow(Math.abs(Math.sin(this.clock * 9 + j * 1.7)), 3); a = 1 - t * t; break;
          case 'flat': a = Math.min(1, (1 - t) * 3); break;
        }
        // Flammes : jaune au départ, rouge sombre à la fin.
        if (s.sizeMode === 'flicker' && this.colors.length > 1) {
          const c = this.colors, f = Math.min(c.length - 1.001, t * (c.length - 0.2)), k = Math.floor(f), m = f - k;
          this.col[j * 4] = c[k].r + (c[k + 1].r - c[k].r) * m; this.col[j * 4 + 1] = c[k].g + (c[k + 1].g - c[k].g) * m; this.col[j * 4 + 2] = c[k].b + (c[k + 1].b - c[k].b) * m;
        }
        this.size[j] = sz;
        this.rot[j] += this.spin[j] * dt;
        this.col[j * 4 + 3] = a;
      }
    }
    // --- Rubans ---
    let rib = false;
    const life = st?.ribbonLife ?? 0.3;
    for (let d = 0; d < 3; d++) {
      const h = this.hist[d];
      while (h.length && this.clock - h[h.length - 1].t > life) h.pop();
      if (!emit && h.length) h.splice(0, 0); // la tête cesse d'avancer : la queue rattrape et disparaît
      this.writeRibbon(d, h, st);
      if (h.length > 1) rib = true;
    }
    for (const n of ['position', 'aColor', 'aSize', 'aRot']) (this.pGeo.getAttribute(n) as THREE.BufferAttribute).needsUpdate = true;
    (this.rGeo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.rGeo.getAttribute('aColor') as THREE.BufferAttribute).needsUpdate = true;
    this.group.visible = alive || rib;
    return alive || rib;
  }

  private spawn(p: THREE.Vector3, v: THREE.Vector3, st: TrailStyle) {
    const j = this.next; this.next = (this.next + 1) % MAXP;
    const o = j * 3, r = Math.random;
    this.pos[o] = p.x + (r() - 0.5) * 0.5; this.pos[o + 1] = p.y + (r() - 0.4) * 0.4; this.pos[o + 2] = p.z + (r() - 0.5) * 0.5;
    this.vel[o] = (r() - 0.5) * st.spread + v.x * st.inherit; this.vel[o + 1] = st.rise * (0.4 + r() * 0.8) + v.y * st.inherit; this.vel[o + 2] = (r() - 0.5) * st.spread + v.z * st.inherit;
    const c = this.colors[Math.floor(r() * this.colors.length)];
    this.col[j * 4] = c.r; this.col[j * 4 + 1] = c.g; this.col[j * 4 + 2] = c.b; this.col[j * 4 + 3] = 1;
    this.rgb[o] = c.r; this.rgb[o + 1] = c.g; this.rgb[o + 2] = c.b;
    this.max[j] = this.life[j] = st.life[0] + r() * (st.life[1] - st.life[0]);
    this.base[j] = st.size[0] + r() * (st.size[1] - st.size[0]);
    this.size[j] = this.base[j];
    this.shape[j] = st.shape;
    this.rot[j] = r() * Math.PI * 2;
    this.spin[j] = st.shape === 3 ? (r() - 0.5) * 14 : st.shape === 1 ? (r() - 0.5) * 3 : 0;
  }

  /** Ruban d'un dé : face à la caméra (élargi à l'horizontale), plus fin et plus pâle vers la queue. */
  private writeRibbon(d: number, h: { p: THREE.Vector3; t: number }[], st: TrailStyle | null) {
    const base = d * HIST * 2;
    const n = h.length;
    const W = st?.ribbon ?? 0;
    for (let k = 0; k < HIST; k++) {
      const o = (base + k * 2) * 3, oc = (base + k * 2) * 4;
      if (k >= n || n < 2 || !st) { for (let q = 0; q < 6; q++) this.rPos[o + q] = 0; this.rCol[oc + 3] = this.rCol[oc + 7] = 0; continue; }
      const a = h[Math.max(0, k - 1)].p, b = h[Math.min(n - 1, k + 1)].p;
      // Direction perpendiculaire dans le plan du bac (vue de dessus).
      let px = -(b.z - a.z), pz = b.x - a.x;
      const l = Math.hypot(px, pz) || 1; px /= l; pz /= l;
      const age = Math.min(1, (this.clock - h[k].t) / st.ribbonLife);
      const f = (1 - k / (HIST - 1)) * (1 - age);
      const w = W * (0.15 + 0.85 * f) * (k === 0 ? 0.6 : 1);
      const p = h[k].p;
      const y = Math.max(0.06, p.y - 0.32); // près du tapis : le ruban passe sous les dés et reste visible
      this.rPos[o] = p.x + px * w; this.rPos[o + 1] = y; this.rPos[o + 2] = p.z + pz * w;
      this.rPos[o + 3] = p.x - px * w; this.rPos[o + 4] = y; this.rPos[o + 5] = p.z - pz * w;
      let c: THREE.Color;
      const cs = this.colors;
      if (st.ribbonMode === 'cycle') { const x = (k / 7 + this.clock * 2.5) % cs.length; const i0 = Math.floor(x); c = cs[i0].clone().lerp(cs[(i0 + 1) % cs.length], x - i0); }
      else { const x = Math.min(cs.length - 1.001, (k / (HIST - 1)) * (cs.length - 1) * 1.4); const i0 = Math.floor(x); c = cs[i0].clone().lerp(cs[Math.min(cs.length - 1, i0 + 1)], x - i0); }
      const alpha = st.ribbonAlpha * Math.pow(f, 0.9);
      for (const q of [0, 4]) { this.rCol[oc + q] = c.r; this.rCol[oc + q + 1] = c.g; this.rCol[oc + q + 2] = c.b; this.rCol[oc + q + 3] = alpha; }
    }
  }

  dispose() {
    this.pGeo.dispose(); this.pMat.dispose(); this.rGeo.dispose(); this.rMat.dispose();
    this.group.removeFromParent();
  }
}
