/**
 * Poker menteur : la table en 3D (Three.js). Une table ronde en feutrine, un gobelet en cuir qui
 * glisse d'un joueur à l'autre, se secoue, se soulève (pour son détenteur, ou pour tous à la
 * révélation), et 5 dés de poker (9, 10, V, D, R, A ; lettres de la langue du joueur) qu'on touche
 * pour choisir ceux à relancer. Animations par interpolation (pas de physique : c'est un gobelet).
 *
 * Les faces : chaque dé garde la même orientation (face « haut » vers le ciel, lettre lisible depuis
 * la caméra) ; la face du dessus prend la texture de sa valeur, les autres faces des valeurs voisines.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { felt, leather, wood } from '../three/textures';
import { PM_DIE_BODY, PM_DIE_EDGE, PM_FACE_INK } from '../../../shared/pokermenteur/look';

const DIE = 0.56;
const ROW_Z = 1.05;
const ROW_GAP = 0.7;
type Tween = { t0: number; dur: number; step: (k: number) => void; done: () => void };
const ease = (k: number) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);
const easeOut = (k: number) => 1 - (1 - k) ** 3;

export interface SceneOpts { reducedMotion?: boolean; quality?: 'haute' | 'normale' | 'basse' }

export class PmScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(38, 1, 0.1, 60);
  private cup = new THREE.Group();
  private cupShadow: THREE.Mesh;
  private dice: THREE.Mesh[] = [];
  private rings: THREE.Mesh[] = [];
  private faceTex: THREE.CanvasTexture[] = [];
  private sideTex: THREE.CanvasTexture[] = [];
  private values = [0, 1, 2, 3, 4];
  private tweens: Tween[] = [];
  private raf = 0;
  private seats: THREE.Vector3[] = [new THREE.Vector3(0, 0, 2.3)];
  private cupSeat = 0;
  private selected = [false, false, false, false, false];
  private picking = false;
  private pickCb: ((i: number) => void) | null = null;
  private ro: ResizeObserver;
  private disposed = false;
  private glow: THREE.PointLight;
  private speed: number;

  constructor(private host: HTMLElement, labels: string[], opts: SceneOpts = {}) {
    this.speed = opts.reducedMotion ? 0.4 : 1;
    this.renderer = new THREE.WebGLRenderer({ antialias: opts.quality !== 'basse', alpha: false, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = opts.quality !== 'basse';
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, opts.quality === 'haute' ? 2 : 1.6));
    this.renderer.domElement.className = 'pk-canvas';
    host.appendChild(this.renderer.domElement);
    this.scene.background = new THREE.Color('#140d08');

    // Lumières : lampe de comptoir chaude au-dessus, ciel doux.
    this.scene.add(new THREE.HemisphereLight('#fff1d6', '#2b170b', 0.85));
    const sun = new THREE.DirectionalLight('#ffe6bf', 1.9);
    sun.position.set(-2.5, 7, 3.5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    const sc = sun.shadow.camera as THREE.OrthographicCamera;
    sc.left = -5; sc.right = 5; sc.top = 5; sc.bottom = -5; sc.near = 1; sc.far = 20;
    sun.shadow.bias = -0.0005;
    this.scene.add(sun);
    this.glow = new THREE.PointLight('#ffcf6a', 0, 4, 2);
    this.glow.position.set(0, 1.4, ROW_Z);
    this.scene.add(this.glow);

    // Table ronde : feutrine verte, bord en bois.
    const f = felt('#1f6b45', 7);
    f.map.repeat.set(3, 3); f.bump.repeat.set(3, 3);
    const top = new THREE.Mesh(new THREE.CircleGeometry(3.6, 64), new THREE.MeshStandardMaterial({ map: f.map, bumpMap: f.bump, bumpScale: 0.6, roughness: 0.95 }));
    top.rotation.x = -Math.PI / 2;
    top.scale.set(1.25, 0.82, 1);
    top.receiveShadow = true;
    this.scene.add(top);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(3.62, 0.2, 14, 80), new THREE.MeshStandardMaterial({ map: wood('#6b3d1d', '#3a1f0c'), roughness: 0.55, metalness: 0.05 }));
    rim.rotation.x = -Math.PI / 2;
    rim.scale.set(1.25, 0.82, 1);
    rim.position.y = 0.05;
    rim.castShadow = true;
    this.scene.add(rim);

    // Gobelet : cuir brun, liseré doré, ouvert en bas.
    const prof = [[0.66, 0], [0.64, 0.06], [0.58, 0.9], [0.56, 1.05], [0.0, 1.07]].map(([x, y]) => new THREE.Vector2(x, y));
    const cupMesh = new THREE.Mesh(new THREE.LatheGeometry(prof, 40), new THREE.MeshStandardMaterial({ map: leather('#6a2e17', 9), roughness: 0.7, side: THREE.DoubleSide }));
    cupMesh.castShadow = true;
    const band = (y: number, r: number) => { const m = new THREE.Mesh(new THREE.TorusGeometry(r, 0.035, 8, 48), new THREE.MeshStandardMaterial({ color: '#d4a64a', metalness: 0.8, roughness: 0.3 })); m.rotation.x = Math.PI / 2; m.position.y = y; return m; };
    this.cup.add(cupMesh, band(0.05, 0.655), band(0.95, 0.575));
    this.scene.add(this.cup);
    const blob = document.createElement('canvas'); blob.width = blob.height = 64;
    const g = blob.getContext('2d')!; const gr = g.createRadialGradient(32, 32, 4, 32, 32, 32); gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    this.cupShadow = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.9), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(blob), transparent: true, depthWrite: false }));
    this.cupShadow.rotation.x = -Math.PI / 2;
    this.cupShadow.position.y = 0.01;
    this.scene.add(this.cupShadow);

    // Dés.
    this.setLabels(labels);
    const geo = new RoundedBoxGeometry(DIE, DIE, DIE, 4, 0.085);
    for (let i = 0; i < 5; i++) {
      const mats = Array.from({ length: 6 }, () => new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0 }));
      const d = new THREE.Mesh(geo, mats);
      d.castShadow = true;
      d.userData.index = i;
      d.visible = false;
      this.scene.add(d);
      this.dice.push(d);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.48, 32), new THREE.MeshBasicMaterial({ color: '#ffcf5a', transparent: true, opacity: 0.95, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2;
      ring.visible = false;
      this.scene.add(ring);
      this.rings.push(ring);
      this.paintDie(i, i);
    }
    this.layoutRow();

    this.renderer.domElement.addEventListener('pointerdown', this.onPointer);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();
    this.placeCup(0, true);
    const loop = () => { if (this.disposed) return; this.raf = requestAnimationFrame(loop); this.frame(); };
    loop();
  }

  // --- Textures des faces -------------------------------------------------------------------------
  /** Lettres des faces (9, 10, V, D, R, A selon la langue). */
  setLabels(labels: string[]) {
    for (const t of [...this.faceTex, ...this.sideTex]) t.dispose();
    this.faceTex = labels.map((txt, v) => this.faceCanvas(txt, v, 1));
    // Faces de côté : signe estompé (on lit d'abord la face du dessus, la seule qui compte).
    this.sideTex = labels.map((txt, v) => this.faceCanvas(txt, v, 0.3));
    for (let i = 0; i < this.dice.length; i++) this.paintDie(i, this.values[i]);
  }
  private faceCanvas(txt: string, v: number, ink: number) {
    {
      const S = 256;
      const c = document.createElement('canvas'); c.width = c.height = S;
      const g = c.getContext('2d')!;
      const gr = g.createRadialGradient(S / 2, S / 2, S * 0.1, S / 2, S / 2, S * 0.75);
      gr.addColorStop(0, PM_DIE_BODY); gr.addColorStop(1, PM_DIE_EDGE);
      g.fillStyle = gr; g.fillRect(0, 0, S, S);
      g.strokeStyle = 'rgba(120,90,40,0.35)'; g.lineWidth = 6; g.strokeRect(22, 22, S - 44, S - 44);
      g.fillStyle = PM_FACE_INK[v];
      g.globalAlpha = ink;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      const size = txt.length > 1 ? 118 : 150;
      g.font = `900 ${size}px "Barlow Condensed", "Arial Narrow", Arial, sans-serif`;
      g.fillText(txt, S / 2, S / 2 + 8);
      // Petits ornements de coin (comme les vrais dés de poker).
      g.font = '900 36px Arial, sans-serif';
      g.fillText(v >= 2 && v <= 4 ? '♥' : '♠', 52, 54);
      g.save(); g.translate(S - 52, S - 50); g.rotate(Math.PI); g.fillText(v >= 2 && v <= 4 ? '♥' : '♠', 0, 0); g.restore();
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
      return t;
    }
  }
  /** Face du dessus = v ; la face vers la caméra (+z) et les autres : valeurs différentes. */
  private paintDie(i: number, v: number) {
    this.values[i] = v;
    const d = this.dice[i];
    if (!d || !this.faceTex.length) return;
    const mats = d.material as THREE.MeshStandardMaterial[];
    // Ordre des faces d'une boîte : +x, -x, +y, -y, +z, -z.
    const others = [0, 1, 2, 3, 4, 5].filter((x) => x !== v);
    const slots = [others[0], others[1], v, others[2], others[3], others[4]];
    slots.forEach((val, s) => { mats[s].map = s === 2 ? this.faceTex[val] : this.sideTex[val]; mats[s].needsUpdate = true; });
  }

  // --- Places autour de la table ------------------------------------------------------------------
  /** n joueurs ; `me` : ma place (en bas, face à la caméra) ; les suivants dans le sens du jeu (gauche, haut, droite). */
  setSeats(n: number, me: number | null) {
    const base = me ?? 0;
    this.seats = Array.from({ length: n }, (_, i) => {
      const k = (i - base + n) % n;
      const a = Math.PI / 2 + (2 * Math.PI * k) / n;
      return new THREE.Vector3(Math.cos(a) * 3.3, 0, Math.sin(a) * 2.15);
    });
  }
  private cupSpot(seat: number) {
    const s = this.seats[seat] ?? this.seats[0];
    return new THREE.Vector3(s.x * 0.55, 0, s.z * 0.5 - 0.15);
  }
  private placeCup(seat: number, instant = false) {
    this.cupSeat = seat;
    const p = this.cupSpot(seat);
    if (instant) { this.cup.position.copy(p); this.cup.rotation.set(0, 0, 0); this.cupShadow.position.set(p.x, 0.01, p.z); }
    return p;
  }

  // --- Interpolations -----------------------------------------------------------------------------
  private tween(dur: number, step: (k: number) => void): Promise<void> {
    return new Promise((done) => {
      const d = Math.max(1, dur / this.speed);
      this.tweens.push({ t0: performance.now(), dur: this.speed < 1 ? Math.min(d, dur) : d, step, done });
    });
  }
  private frame() {
    const now = performance.now();
    const left: Tween[] = [];
    for (const t of this.tweens) {
      const k = Math.min(1, (now - t.t0) / t.dur);
      t.step(k);
      if (k >= 1) t.done(); else left.push(t);
    }
    this.tweens = left;
    this.cupShadow.position.set(this.cup.position.x, 0.01, this.cup.position.z);
    const lift = Math.min(1, this.cup.position.y / 1.2);
    (this.cupShadow.material as THREE.MeshBasicMaterial).opacity = 1 - lift * 0.7;
    for (let i = 0; i < 5; i++) {
      const r = this.rings[i], d = this.dice[i];
      r.visible = d.visible && this.selected[i];
      r.position.set(d.position.x, 0.012, d.position.z);
    }
    this.renderer.render(this.scene, this.camera);
  }
  private resize() {
    const w = Math.max(1, this.host.clientWidth), h = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Cadrage : toute la table en largeur sur téléphone, plus serré quand l'écran est large.
    const narrow = w / h < 1.25;
    this.camera.fov = narrow ? 40 : 34;
    this.camera.position.set(0, narrow ? 6.6 : 6.2, narrow ? 6.0 : 5.4);
    this.camera.lookAt(0, 0, narrow ? 0.2 : 0.2);
    this.camera.updateProjectionMatrix();
  }

  // --- Dés en rangée (vus par le détenteur, ou par tous à la révélation) ---------------------------
  private rowPos(i: number) { return new THREE.Vector3((i - 2) * ROW_GAP, DIE / 2, ROW_Z); }
  private layoutRow() { for (let i = 0; i < 5; i++) { this.dice[i].position.copy(this.rowPos(i)); this.dice[i].rotation.set(0, 0, 0); } }

  /** Gobelet posé devant un joueur, dés cachés dessous. */
  async cupTo(seat: number, animate = true) {
    const from = this.cup.position.clone();
    const to = this.placeCup(seat);
    this.hideDice();
    if (!animate || from.distanceTo(to) < 0.01) { this.placeCup(seat, true); return; }
    const rot0 = this.cup.rotation.clone();
    await this.tween(650, (k) => {
      const e = ease(k);
      this.cup.position.set(from.x + (to.x - from.x) * e, from.y * (1 - e) + Math.sin(Math.PI * k) * 0.25, from.z + (to.z - from.z) * e);
      this.cup.rotation.set(rot0.x * (1 - e), 0, rot0.z * (1 - e) + Math.sin(Math.PI * k) * 0.12);
    });
  }
  /** Le gobelet secoué (nouveau lancer, ou relance sous le gobelet). */
  async shake(ms = 700) {
    const p = this.cup.position.clone();
    await this.tween(ms, (k) => {
      const a = Math.sin(k * Math.PI * 9) * (1 - k);
      this.cup.position.set(p.x + a * 0.12, Math.abs(Math.sin(k * Math.PI * 9)) * 0.18 * (1 - k), p.z + Math.cos(k * Math.PI * 7) * 0.05 * (1 - k));
      this.cup.rotation.set(0, 0, a * 0.18);
    });
    this.cup.position.copy(p);
    this.cup.rotation.set(0, 0, 0);
  }
  private hideDice() { for (const d of this.dice) d.visible = false; this.selected = [false, false, false, false, false]; this.picking = false; }

  /** Le détenteur regarde sous le gobelet : le gobelet se lève de côté, les dés apparaissent. */
  async peek(values: number[], animate = true) {
    values.forEach((v, i) => this.paintDie(i, v));
    this.layoutRow();
    const from = this.cup.position.clone();
    const to = new THREE.Vector3(2.35, 0, 0.35);
    for (const d of this.dice) d.visible = true;
    if (!animate) { this.cup.position.copy(to); this.cup.rotation.set(0, 0, 0); return; }
    for (let i = 0; i < 5; i++) this.dice[i].position.y = -DIE;
    await this.tween(520, (k) => {
      const e = easeOut(k);
      this.cup.position.set(from.x + (to.x - from.x) * e, Math.sin(Math.PI * k) * 0.9, from.z + (to.z - from.z) * e);
      this.cup.rotation.set(0, 0, -Math.sin(Math.PI * k) * 0.5);
      for (let i = 0; i < 5; i++) this.dice[i].position.y = -DIE + (DIE * 1.5) * Math.min(1, e * 1.2);
    });
    this.cup.rotation.set(0, 0, 0);
    this.layoutRow();
  }
  /** Relance de certains dés : ils sautent, tournent et retombent sur leur nouvelle valeur. */
  async reroll(positions: number[], values: number[]) {
    const ps = positions.filter((i) => i >= 0 && i < 5);
    this.selected = [false, false, false, false, false];
    await this.tween(700, (k) => {
      for (const i of ps) {
        const d = this.dice[i];
        const base = this.rowPos(i);
        d.position.set(base.x + Math.sin(k * 6 + i) * 0.08 * (1 - k), base.y + Math.sin(Math.PI * k) * 1.3, base.z - Math.sin(Math.PI * k) * 0.3);
        d.rotation.set(k * Math.PI * 4 * (i % 2 ? 1 : -1), k * Math.PI * 2, k * Math.PI * 3);
        if (k > 0.5) this.paintDie(i, values[i]);
      }
    });
    values.forEach((v, i) => this.paintDie(i, v));
    this.layoutRow();
  }
  /** « Menteur ! » : le gobelet se soulève devant tout le monde. `glow` : vrai Poker d'As (lumière dorée, sobre). */
  async reveal(values: number[], glow = false) {
    values.forEach((v, i) => this.paintDie(i, v));
    this.layoutRow();
    const from = this.cup.position.clone();
    for (const d of this.dice) { d.visible = true; d.scale.setScalar(0.6); }
    await this.tween(650, (k) => {
      const e = easeOut(k);
      this.cup.position.set(from.x * (1 - e) + 0 * e, e * 2.2, from.z * (1 - e) + (ROW_Z - 1.4) * e);
      this.cup.rotation.set(-e * 0.6, 0, 0);
      for (const d of this.dice) d.scale.setScalar(0.6 + 0.4 * e);
    });
    if (glow) await this.tween(900, (k) => { this.glow.intensity = Math.sin(Math.PI * k) * 6; });
  }
  /** Retour au calme après une révélation : le gobelet redescend chez `seat`, dés ramassés. */
  async collect(seat: number) {
    const from = this.cup.position.clone();
    const to = this.cupSpot(seat);
    this.cupSeat = seat;
    await this.tween(600, (k) => {
      const e = ease(k);
      this.cup.position.set(from.x + (to.x - from.x) * e, from.y * (1 - e), from.z + (to.z - from.z) * e);
      this.cup.rotation.set(-0.6 * (1 - e), 0, 0);
      for (const d of this.dice) d.scale.setScalar(1 - 0.7 * e);
    });
    for (const d of this.dice) { d.visible = false; d.scale.setScalar(1); }
    this.cup.rotation.set(0, 0, 0);
  }
  get holderSeat() { return this.cupSeat; }

  // --- Choix des dés à relancer -------------------------------------------------------------------
  setPicking(on: boolean, cb?: (i: number) => void) { this.picking = on; this.pickCb = cb ?? null; if (!on) this.setSelected([false, false, false, false, false]); }
  setSelected(sel: boolean[]) {
    this.selected = [...sel];
    for (let i = 0; i < 5; i++) { const b = this.rowPos(i); this.dice[i].position.y = b.y + (sel[i] ? 0.22 : 0); }
  }
  private onPointer = (e: PointerEvent) => {
    if (!this.picking || !this.pickCb) return;
    const r = this.renderer.domElement.getBoundingClientRect();
    const v = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(v, this.camera);
    // Cible un peu plus large que le dé : facile au doigt.
    let best = -1, bestD = Infinity;
    for (let i = 0; i < 5; i++) {
      const d = this.dice[i];
      if (!d.visible) continue;
      const dist = ray.ray.distanceToPoint(d.position);
      if (dist < DIE * 0.85 && dist < bestD) { best = i; bestD = dist; }
    }
    if (best >= 0) this.pickCb(best);
  };
  /** Position à l'écran (px dans l'hôte) d'un dé, pour placer une étiquette. */
  screenOf(i: number): { x: number; y: number } {
    const p = this.dice[i].position.clone().project(this.camera);
    return { x: (p.x + 1) / 2 * this.host.clientWidth, y: (1 - p.y) / 2 * this.host.clientHeight };
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.renderer.domElement.removeEventListener('pointerdown', this.onPointer);
    for (const t of this.tweens) t.done();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (mat) (Array.isArray(mat) ? mat : [mat]).forEach((x) => { const mm = x as THREE.MeshStandardMaterial; mm.map?.dispose(); mm.bumpMap?.dispose(); x.dispose(); });
    });
    for (const t of [...this.faceTex, ...this.sideTex]) t.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
