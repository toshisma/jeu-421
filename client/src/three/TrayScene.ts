/**
 * Rendu 3D du bac (Three.js). Ne connaît ni les règles ni le réseau : on lui demande
 * de lancer des dés vers des valeurs officielles, il simule (diceSim) puis rejoue.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  FACE_VALUES, FPS, PRELUDE_FRAMES, TRAY, offsetForTop, parkPoses, restingLayout, samplePose, simulateThrow, topFace,
  type DiePose, type ImpactKind, type ThrowGesture, type ThrowResult,
} from '../physics/diceSim';
import { brushed, dieFace, felt, leather, stone, wood } from './textures';
import { getShape, clampInside, insideShape, offsetVerts, type TrayShape } from '../physics/trayShapes';
import { getItem, resolveAppearance, type Appearance, type DiceItem, type ResolvedAppearance } from '../../../shared/progress/catalog';

export type Quality = 'haute' | 'normale';
export interface Insets { top: number; right: number; bottom: number; left: number }

export interface TraySceneOptions {
  appearance: Appearance;
  quality: Quality;
  onImpact?: (kind: ImpactKind, strength: number, pan: number) => void;
  /** Début d'un lancer : nombre de dés ramassés dans la main. */
  onPickup?: (dice: number) => void;
  /** Geste de lancer sur le bac (glisser rapide). */
  onSwipe?: (g: ThrowGesture) => void;
  onDieClick?: (index: number) => void;
  /** Lancer au gobelet : on le secoue, puis il se verse dans le bac. */
  cup?: boolean;
  onShake?: () => void;
  /**
   * Scène de vignettes (boutique) : pas de boucle d'animation, pas d'écouteurs, pas de changement
   * de couleur d'accent ; on rend à la demande avec `capture()`.
   */
  thumbnail?: boolean;
}

interface DieObj {
  mesh: THREE.Mesh;
  mats: THREE.MeshPhysicalMaterial[];
  ring: THREE.Mesh;
  /** Ombre de contact (tache douce posée sur le tapis, sous le dé). */
  contact: THREE.Mesh;
  pose: DiePose; // pose du corps physique
  offset: THREE.Quaternion; // rotation de maillage (étiquetage des faces)
}

export class TrayScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(36, 1, 0.1, 200);
  private dice: DieObj[] = [];
  private look: ResolvedAppearance = resolveAppearance(undefined);
  private shape: TrayShape = getShape('rectangle');
  private trayKey = '';
  private diceKey = '';
  /** Textures des dés, par modèle de dés (chaque joueur peut avoir les siens). */
  private faceCache = new Map<string, ReturnType<typeof dieFace>[]>();
  /** Dés d'un autre joueur affichés à la place des miens (null : les miens). */
  private skin: string | null = null;
  private glowBase = 0;
  private quality: Quality = 'normale';
  // Traînée de lancer : particules émises derrière les dés pendant qu'ils roulent.
  private fxTrail: string[] | null = null;
  private parts: { mat: THREE.PointsMaterial; geo: THREE.BufferGeometry; pos: Float32Array; col: Float32Array; vel: Float32Array; life: Float32Array; max: Float32Array; next: number } | null = null;
  private lastDie: THREE.Vector3[] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  private trayGroup = new THREE.Group();
  private disposables: { dispose(): void }[] = [];
  private raf = 0;
  // t0 = null : l'horloge du lancer démarre à la première image réellement affichée (pas au clic),
  // pour ne jamais sauter les premières images si le navigateur est occupé à cet instant.
  private playback: { sim: ThrowResult; t0: number | null; frame: number; dramatic: boolean; nextEvent: number; resolve: () => void; hold?: boolean } | null = null;
  /** Gobelet : secoué, versé, puis retiré pendant que les dés roulent. */
  private cup: THREE.Group | null = null;
  private cupMats: THREE.Material[] = [];
  private cupAnim: { t0: number; center: THREE.Vector3; axis: THREE.Vector3; dir: THREE.Vector3; released: boolean } | null = null;
  /** Ralenti et gros plan sur les grands coups (4-2-1, trois as). */
  private zoom = 0;
  private zoomTarget = 0;
  private zoomFocus = new THREE.Vector3();
  private baseCam = new THREE.Vector3();
  private zoomTimer: ReturnType<typeof setTimeout> | null = null;
  /** Positions de repos après le dernier lancer (base du placement des dés gardés). */
  private home: DiePose[] = [];
  /** Dés qui glissent vers le bord (gardés) ou reviennent (plus gardés). */
  private moves: { i: number; from: DiePose; to: DiePose; t0: number; dur: number }[] = [];
  /** Rendu à la demande : on ne redessine que si quelque chose a changé (batterie, chauffe, fluidité). */
  private dirty = true;
  /** Résolution adaptative : réduite automatiquement si l'appareil n'arrive pas à suivre. */
  private basePixelRatio = 1;
  private prScale = 1;
  private perf = { frames: 0, time: 0 };
  private tmpP = new THREE.Vector3();
  private tmpQ = new THREE.Quaternion();
  private kept = [false, false, false];
  private interactive = false;
  private hover = -1;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private insets: Insets = { top: 0, right: 0, bottom: 0, left: 0 };
  private resizeObs: ResizeObserver | null = null;
  /** Élévation de la caméra imposée (vignettes), en degrés. */
  private elevOverride: number | null = null;
  private lamp: THREE.SpotLight;
  private hemi!: THREE.HemisphereLight;
  private key: THREE.DirectionalLight;
  private time = 0;
  private downAt: { x: number; y: number } | null = null;
  private swipeEnabled = false;
  private trail: { x: number; y: number; t: number }[] = [];

  constructor(private container: HTMLElement, private opts: TraySceneOptions) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: opts.thumbnail ? 'low-power' : 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.className = 'tray-canvas';
    container.appendChild(this.renderer.domElement);

    // Reflets doux : environnement de pièce pré-filtré.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = envTex;
    this.disposables.push(envTex, pmrem);

    // Lumières : lampe de bar chaude au-dessus du tapis + lumière principale qui projette les ombres
    // (placée presque à la verticale, comme la lampe : les ombres tombent sous les dés).
    this.hemi = new THREE.HemisphereLight(0xffe9cc, 0x1a0e06, 0.14);
    this.scene.add(this.hemi);
    this.key = new THREE.DirectionalLight(0xffe7c4, 1.2);
    this.key.position.set(-4.5, 17, 4);
    this.key.castShadow = true;
    this.key.shadow.camera.left = -12;
    this.key.shadow.camera.right = 12;
    this.key.shadow.camera.top = 10;
    this.key.shadow.camera.bottom = -10;
    this.key.shadow.bias = -0.0004;
    this.key.shadow.normalBias = 0.02;
    this.key.shadow.radius = 4;
    this.scene.add(this.key);
    // Lampe suspendue : cône de lumière chaude centré sur le bac, la table s'assombrit autour.
    this.lamp = new THREE.SpotLight(0xffd9a0, 1250, 0, THREE.MathUtils.degToRad(34), 0.95, 2);
    this.lamp.position.set(0.3, 13, 0.3);
    this.lamp.target.position.set(0, 0, 0);
    this.scene.add(this.lamp, this.lamp.target);

    this.scene.add(this.trayGroup);
    this.buildDice();
    this.setQuality(opts.quality);
    this.setAppearance(opts.appearance);

    const layout = restingLayout();
    layout.forEach((p, i) => (this.dice[i].pose = p));
    this.home = layout;
    this.showValues([4, 2, 1], true);

    if (opts.thumbnail) {
      this.renderer.domElement.className = 'tray-thumb-canvas';
      this.renderer.compile(this.scene, this.camera);
      return;
    }
    const el = this.renderer.domElement;
    el.addEventListener('pointermove', this.onPointerMove);
    el.addEventListener('pointerdown', this.onPointerDown);
    el.addEventListener('pointerup', this.onPointerUp);
    el.addEventListener('pointerleave', () => this.setHover(-1));
    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(container);
    this.resize();
    // Compile les shaders dès maintenant : pas de micro-gel au premier lancer.
    this.renderer.compile(this.scene, this.camera);
    this.loop();
  }

  private invalidate() { this.dirty = true; }

  // ---------------------------------------------------------------------------------------------
  // Construction

  private buildDice() {
    // Arêtes bien arrondies (rayon 0,14) : visuel seulement, la physique garde son cube.
    const geo = new RoundedBoxGeometry(1, 1, 1, 4, 0.14);
    this.disposables.push(geo);
    const ringGeo = new THREE.RingGeometry(0.78, 0.92, 48);
    ringGeo.rotateX(-Math.PI / 2);
    this.disposables.push(ringGeo);
    // Ombre de contact : tache sombre très douce, plus nette et plus dense quand le dé est posé.
    const cc = document.createElement('canvas'); cc.width = cc.height = 64;
    const cg = cc.getContext('2d')!;
    const grd = cg.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(0,0,0,1)'); grd.addColorStop(0.3, 'rgba(0,0,0,0.85)'); grd.addColorStop(0.62, 'rgba(0,0,0,0.3)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
    cg.fillStyle = grd; cg.fillRect(0, 0, 64, 64);
    const contactTex = new THREE.CanvasTexture(cc);
    const contactGeo = new THREE.PlaneGeometry(2.0, 2.0);
    contactGeo.rotateX(-Math.PI / 2);
    this.disposables.push(contactTex, contactGeo);
    for (let i = 0; i < 3; i++) {
      const mats = FACE_VALUES.map(() => new THREE.MeshPhysicalMaterial({
        roughness: 0.32, metalness: 0, normalScale: new THREE.Vector2(1, 1),
        clearcoat: 0.55, clearcoatRoughness: 0.2, envMapIntensity: 0.55, sheen: 0,
      }));
      this.disposables.push(...mats);
      const mesh = new THREE.Mesh(geo, mats);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.die = i;
      const ringMat = new THREE.MeshBasicMaterial({ color: 0xf2c75c, transparent: true, opacity: 0, depthWrite: false });
      this.disposables.push(ringMat);
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.y = 0.012;
      const contactMat = new THREE.MeshBasicMaterial({ map: contactTex, transparent: true, opacity: 0.55, depthWrite: false, color: 0x000000 });
      this.disposables.push(contactMat);
      const contact = new THREE.Mesh(contactGeo, contactMat);
      contact.position.y = 0.006;
      contact.renderOrder = 1;
      this.scene.add(mesh, ring, contact);
      this.dice.push({ mesh, mats, ring, contact, pose: { p: [0, 0.5, 0], q: [0, 0, 0, 1] }, offset: new THREE.Quaternion() });
    }
  }

  private clearTray() {
    this.trayGroup.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.geometry.dispose();
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        for (const mat of mats) {
          for (const v of Object.values(mat)) if (v instanceof THREE.Texture) v.dispose();
          mat.dispose();
        }
      }
    });
    this.trayGroup.clear();
  }

  /** Applique une apparence (décor, tapis, rebords, forme, dés). Ne reconstruit que ce qui change. */
  setAppearance(a: Appearance) {
    this.look = resolveAppearance(a);
    const L = this.look;
    const trayKey = [L.decor.id, L.felt.id, L.rim.id, L.shape.id].join('|');
    if (trayKey !== this.trayKey) {
      this.trayKey = trayKey;
      const newShape = getShape(L.shape.shape);
      if (newShape !== this.shape) {
        this.shape = newShape;
        if (this.playback) this.finishPlayback();
        // Les dés au repos restent dans le nouveau plateau.
        for (const d of this.dice)
          if (!insideShape(newShape, d.pose.p[0], d.pose.p[2], 1.0)) {
            const [x, z] = clampInside(newShape, d.pose.p[0], d.pose.p[2], 1.0);
            d.pose = { p: [x, d.pose.p[1], z], q: d.pose.q };
          }
        this.home = this.dice.map((d) => d.pose);
        this.syncFromPoses();
      }
      this.buildTray();
    }
    this.styleDice();
    this.invalidate();
  }

  /** Traînée de lancer (couleurs des particules), ou aucune (null). */
  setTrail(colors: string[] | null, glow = true) {
    this.fxTrail = colors && colors.length ? colors : null;
    if (this.fxTrail && !this.parts) this.buildParticles();
    if (this.parts) { this.parts.mat.blending = glow ? THREE.AdditiveBlending : THREE.NormalBlending; this.parts.mat.needsUpdate = true; }
  }

  private buildParticles() {
    const N = 600;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(N * 3), col = new Float32Array(N * 4), vel = new Float32Array(N * 3), life = new Float32Array(N), max = new Float32Array(N);
    pos.fill(-999);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 4));
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.85)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c);
    const mat = new THREE.PointsMaterial({ size: 0.75, map: tex, vertexColors: true, transparent: true, depthWrite: false, sizeAttenuation: true });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    this.scene.add(pts);
    this.disposables.push(geo, mat, tex);
    this.parts = { mat, geo, pos, col, vel, life, max, next: 0 };
  }

  /** Émet et fait vivre les particules ; renvoie vrai s'il en reste à animer. */
  private stepParticles(dt: number, emit: boolean): boolean {
    const P = this.parts;
    if (!P) return false;
    const N = P.life.length;
    if (emit && this.fxTrail) {
      this.dice.forEach((d, i) => {
        const p = d.mesh.position;
        const speed = p.distanceTo(this.lastDie[i]) / Math.max(dt, 1e-3);
        this.lastDie[i].copy(p);
        if (speed < 0.8) return;
        const n = Math.min(6, 2 + Math.floor(speed / 3));
        for (let k = 0; k < n; k++) {
          const j = P.next; P.next = (P.next + 1) % N;
          P.pos[j * 3] = p.x + (Math.random() - 0.5) * 0.4; P.pos[j * 3 + 1] = p.y + (Math.random() - 0.3) * 0.3; P.pos[j * 3 + 2] = p.z + (Math.random() - 0.5) * 0.4;
          P.vel[j * 3] = (Math.random() - 0.5) * 0.6; P.vel[j * 3 + 1] = 0.4 + Math.random() * 0.8; P.vel[j * 3 + 2] = (Math.random() - 0.5) * 0.6;
          const c = new THREE.Color(this.fxTrail![Math.floor(Math.random() * this.fxTrail!.length)]);
          P.col[j * 4] = c.r; P.col[j * 4 + 1] = c.g; P.col[j * 4 + 2] = c.b; P.col[j * 4 + 3] = 1;
          P.max[j] = P.life[j] = 0.6 + Math.random() * 0.6;
        }
      });
    } else {
      this.dice.forEach((d, i) => this.lastDie[i].copy(d.mesh.position));
    }
    let alive = false;
    for (let j = 0; j < N; j++) {
      if (P.life[j] <= 0) continue;
      P.life[j] -= dt;
      if (P.life[j] <= 0) { P.col[j * 4 + 3] = 0; P.pos[j * 3 + 1] = -999; continue; }
      alive = true;
      P.vel[j * 3 + 1] -= 0.9 * dt;
      P.pos[j * 3] += P.vel[j * 3] * dt; P.pos[j * 3 + 1] = Math.max(0.05, P.pos[j * 3 + 1] + P.vel[j * 3 + 1] * dt); P.pos[j * 3 + 2] += P.vel[j * 3 + 2] * dt;
      P.col[j * 4 + 3] = P.life[j] / P.max[j];
    }
    (P.geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (P.geo.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
    return alive;
  }

  /** Affiche les dés d'un joueur (identifiant de dés du catalogue), ou les miens (null). */
  setDiceSkin(id: string | null) {
    this.skin = id;
    this.styleDice();
    this.invalidate();
  }

  private styleDice() {
    const other = this.skin ? getItem(this.skin) : undefined;
    const st: DiceItem = other && other.category === 'dice' ? other : this.look.dice;
    if (st.id === this.diceKey) return;
    this.diceKey = st.id;
    this.glowBase = st.glow ? 0.9 : 0;
    let faces = this.faceCache.get(st.id);
    if (!faces) {
      faces = FACE_VALUES.map((v) => dieFace(v, { ...st, id: st.id }));
      this.faceCache.set(st.id, faces);
    }
    const fin = diceFinish(st);
    for (const d of this.dice)
      d.mats.forEach((m, j) => {
        const f = faces![j];
        m.map = f.map;
        m.normalMap = f.normal;
        m.normalScale.setScalar(fin.relief);
        m.aoMap = f.orm;
        m.aoMapIntensity = 1;
        m.roughnessMap = f.orm;
        m.metalnessMap = f.orm;
        m.clearcoatMap = f.coat;
        m.clearcoatRoughnessMap = f.coat;
        m.specularIntensityMap = f.coat;
        // Qualité normale : le vernis reste lisse (une texture et un calcul de moins par pixel).
        m.clearcoatNormalMap = this.quality === 'haute' ? f.normal : null;
        m.clearcoatNormalScale.setScalar(fin.relief * 0.8);
        m.roughness = fin.roughness;
        m.metalness = st.metalness;
        m.clearcoat = fin.clearcoat;
        m.clearcoatRoughness = fin.clearcoatRoughness;
        m.specularIntensity = fin.specular;
        m.sheen = this.quality === 'haute' ? fin.sheen : 0;
        m.sheenRoughness = 0.6;
        m.sheenColor.set(fin.sheenColor);
        m.iridescence = st.iridescence ?? 0;
        m.iridescenceIOR = 1.6;
        m.iridescenceThicknessRange = [180, 620];
        m.emissiveMap = f.emissive;
        m.emissiveIntensity = 1;
        m.envMapIntensity = fin.env;
        m.needsUpdate = true;
      });
  }

  /** Matériau des rebords selon leur nature. */
  private rimMaterial(repeat: [number, number] | null): THREE.Material {
    const r = this.look.rim;
    const withRepeat = (t: THREE.Texture) => { if (repeat) t.repeat.set(...repeat); return t; };
    switch (r.kind) {
      case 'wood': return new THREE.MeshStandardMaterial({ map: withRepeat(wood(r.base, r.dark, 7)), roughness: 0.55, envMapIntensity: 0.5 });
      case 'leather': return new THREE.MeshStandardMaterial({ map: withRepeat(leather(r.base)), roughness: 0.7, envMapIntensity: 0.5 });
      case 'metal': return new THREE.MeshStandardMaterial({ map: withRepeat(brushed(r.base, r.dark)), roughness: 0.38, metalness: 0.8, envMapIntensity: 1 });
      case 'lacquer': return new THREE.MeshPhysicalMaterial({ color: r.base, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.15, envMapIntensity: 0.7 });
      case 'marble': return new THREE.MeshPhysicalMaterial({ map: withRepeat(stone(r.base, r.dark, 29)), roughness: 0.22, clearcoat: 0.9, clearcoatRoughness: 0.1, envMapIntensity: 0.7 });
    }
  }

  private buildTray() {
    const L = this.look;
    const decor = L.decor;
    this.clearTray();
    this.scene.background = new THREE.Color(decor.background);
    this.scene.fog = new THREE.Fog(decor.background, 30, 60);
    this.lamp.color.setHex(decor.lamp);

    const { wallHeight: H, wall: T } = TRAY;
    const g = this.trayGroup;
    const sh = this.shape;

    // Table
    const tk = decor.table;
    let tableMat: THREE.Material;
    if (tk.kind === 'lacquer') tableMat = new THREE.MeshPhysicalMaterial({ color: tk.base, roughness: 0.4, clearcoat: 0.8, clearcoatRoughness: 0.2, envMapIntensity: 0.6 });
    else {
      const tex = tk.kind === 'wood' ? wood(tk.base, tk.dark, 21) : stone(tk.base, tk.dark);
      tex.repeat.set(3, tk.kind === 'wood' ? 6 : 4);
      if (tk.kind === 'wood') tex.rotation = Math.PI / 2;
      tableMat = new THREE.MeshStandardMaterial({ map: tex, roughness: tk.kind === 'wood' ? 0.75 : 0.5, envMapIntensity: 0.3 });
    }
    const table = new THREE.Mesh(new THREE.PlaneGeometry(90, 60), tableMat);
    table.rotation.x = -Math.PI / 2;
    table.position.y = -0.62;
    table.receiveShadow = true;
    g.add(table);

    const capMat = new THREE.MeshStandardMaterial({
      color: L.rim.cap, roughness: L.rim.capMetal ? 0.3 : 0.6, metalness: L.rim.capMetal ? 0.85 : 0, envMapIntensity: 0.9,
    });
    const f = felt(L.felt.color, 3, L.felt.pattern);
    const feltMat = new THREE.MeshStandardMaterial({ map: f.map, bumpMap: f.bump, bumpScale: 0.9, roughness: 1, metalness: 0, envMapIntensity: 0.12 });

    if (sh.id === 'rectangle') {
      const W = sh.halfX * 2, D = sh.halfZ * 2;
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), feltMat);
      floor.rotation.x = -Math.PI / 2;
      floor.receiveShadow = true;
      g.add(floor);
      const rimMat = this.rimMaterial(null);
      const base = new THREE.Mesh(new RoundedBoxGeometry(W + 2 * T + 0.3, 0.6, D + 2 * T + 0.3, 3, 0.12), rimMat);
      base.position.y = -0.31;
      base.receiveShadow = true;
      base.castShadow = true;
      g.add(base);
      const walls: [number, number, number, number][] = [
        [0, D / 2 + T / 2, W + 2 * T, T],
        [0, -D / 2 - T / 2, W + 2 * T, T],
        [W / 2 + T / 2, 0, T, D],
        [-W / 2 - T / 2, 0, T, D],
      ];
      for (const [x, z, sx, sz] of walls) {
        const wall = new THREE.Mesh(new RoundedBoxGeometry(sx, H, sz, 3, 0.08), rimMat);
        wall.position.set(x, H / 2, z);
        wall.castShadow = true;
        wall.receiveShadow = true;
        g.add(wall);
        const cap = new THREE.Mesh(new RoundedBoxGeometry(sx + 0.06, 0.16, sz + 0.06, 2, 0.06), capMat);
        cap.position.set(x, H + 0.07, z);
        cap.castShadow = true;
        g.add(cap);
      }
    } else {
      // Formes polygonales ou rondes : contours extrudés (rebord = anneau entre deux contours).
      const round = sh.circleRadius != null;
      const contour = (off: number): THREE.Vector2[] => {
        if (round) {
          const r = sh.circleRadius! + off;
          return Array.from({ length: 96 }, (_, k) => new THREE.Vector2(r * Math.cos((k / 96) * Math.PI * 2), -r * Math.sin((k / 96) * Math.PI * 2)));
        }
        const vs = off === 0 ? sh.verts : offsetVerts(sh, off);
        return vs.map(([x, z]) => new THREE.Vector2(x, -z)); // (x, -z) : voir la rotation ci-dessous
      };
      // Les géométries sont construites dans le plan XY puis couchées : (x, y, h) → (x, h, -y).
      const lay = (geo: THREE.BufferGeometry) => { geo.rotateX(-Math.PI / 2); return geo; };
      const ring = (inner: number, outer: number, depth: number, bevel: number) => {
        const shp = new THREE.Shape(contour(outer));
        shp.holes.push(new THREE.Path(contour(inner).reverse()));
        return lay(new THREE.ExtrudeGeometry(shp, {
          depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 4,
        }));
      };
      const floorGeo = lay(new THREE.ShapeGeometry(new THREE.Shape(contour(0))));
      f.map.repeat.set(0.2, 0.2);
      f.bump.repeat.set(0.2, 0.2);
      const floor = new THREE.Mesh(floorGeo, feltMat);
      floor.receiveShadow = true;
      g.add(floor);
      const rimMat = this.rimMaterial([0.14, 0.14]);
      const baseShape = new THREE.Shape(contour(T + 0.15));
      const base = new THREE.Mesh(lay(new THREE.ExtrudeGeometry(baseShape, { depth: 0.6, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 2 })), rimMat);
      // Socle : 0,6 d'épaisseur + biseaux de 0,05 ; son dessus reste sous le tapis (y = −0,05).
      base.position.y = -0.70;
      base.receiveShadow = true;
      base.castShadow = true;
      g.add(base);
      const wall = new THREE.Mesh(ring(0.05, T - 0.05, H - 0.1, 0.05), rimMat);
      wall.position.y = 0.05;
      wall.castShadow = true;
      wall.receiveShadow = true;
      g.add(wall);
      const cap = new THREE.Mesh(ring(0.02, T + 0.02, 0.12, 0.03), capMat);
      cap.position.y = H;
      cap.castShadow = true;
      g.add(cap);
    }
    if (!this.opts.thumbnail) document.documentElement.style.setProperty('--accent', decor.accent);
    this.resize(); // recale caméra et brouillard sur la nouvelle forme
  }

  setQuality(q: Quality) {
    if (q !== this.quality) { this.quality = q; this.diceKey = ''; this.styleDice(); }
    this.basePixelRatio = Math.min(window.devicePixelRatio, q === 'haute' ? 2 : 1.25);
    this.prScale = 1;
    this.renderer.setPixelRatio(this.basePixelRatio);
    const size = q === 'haute' ? 2048 : 1024;
    this.key.shadow.mapSize.set(size, size);
    this.key.shadow.map?.dispose();
    (this.key.shadow as { map: THREE.WebGLRenderTarget | null }).map = null;
    this.resize();
  }

  setInsets(i: Insets) {
    this.insets = i;
    this.resize();
  }

  /** Cadre la caméra pour que tout le bac tienne dans la zone libre (entre les panneaux). */
  /** Orientation retenue pour le bac (null : pas encore décidée). */
  private portrait: boolean | null = null;

  private resize() {
    const w = this.thumbSize?.[0] ?? (this.container.clientWidth || 1);
    const h = this.thumbSize?.[1] ?? (this.container.clientHeight || 1);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    const { top, right, bottom, left } = this.insets;
    const freeW = Math.max(100, w - left - right);
    const freeH = Math.max(100, h - top - bottom);
    const tanV = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * (freeH / h);
    const tanH = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * (w / h) * (freeW / w);
    // En portrait, la caméra tourne de 90° : le grand côté du bac suit la hauteur de l'écran.
    // L'orientation dépend de l'écran entier (pas de la zone libre, qui change quand un bandeau
    // apparaît en partie), avec une marge : le bac ne bascule plus d'horizontal à vertical en jeu.
    if (this.thumbSize) this.portrait = freeW < freeH * 0.95; // vignettes : chaque image a son cadre
    else if (this.portrait === null) this.portrait = w < h;
    else if (this.portrait && w > h * 1.15) this.portrait = false;
    else if (!this.portrait && w < h * 0.87) this.portrait = true;
    const portrait = this.portrait;
    const elev = THREE.MathUtils.degToRad(this.elevOverride ?? (portrait ? 62 : 57));
    const longHalf = this.shape.halfX + TRAY.wall + 0.6;
    const shortHalf = this.shape.halfZ + TRAY.wall + 0.4;
    const acrossHalf = portrait ? shortHalf : longHalf; // demi-largeur à l'écran
    const alongHalf = (portrait ? longHalf : shortHalf) * Math.sin(elev) + TRAY.wallHeight * Math.cos(elev); // demi-hauteur
    const dist = Math.max(acrossHalf / tanH, alongHalf / tanV) * (this.thumbSize ? this.thumbFit : 1.04);
    const target = new THREE.Vector3(0, 0, 0);
    if (portrait) this.camera.position.set(Math.cos(elev) * dist, Math.sin(elev) * dist, 0);
    else this.camera.position.set(0, Math.sin(elev) * dist, Math.cos(elev) * dist);
    this.camera.position.add(target);
    this.camera.far = dist * 4;
    if (this.scene.fog instanceof THREE.Fog) { this.scene.fog.near = dist * 1.3; this.scene.fog.far = dist * 3; }
    this.camera.lookAt(target);
    this.baseCam.copy(this.camera.position);
    this.applyZoom();
    this.camera.setViewOffset(w, h, (right - left) / 2, (bottom - top) / 2, w, h);
    this.camera.updateProjectionMatrix();
    this.invalidate();
  }

  // ---------------------------------------------------------------------------------------------
  // Dés

  private applyPose(i: number, p: THREE.Vector3, q: THREE.Quaternion) {
    const d = this.dice[i];
    d.mesh.position.copy(p);
    d.mesh.quaternion.copy(q).multiply(d.offset);
    d.ring.position.x = p.x;
    d.ring.position.z = p.z;
    // Ombre de contact : dense quand le dé est posé, s'efface et s'élargit quand il saute.
    const lift = Math.max(0, p.y - 0.5);
    const k = Math.max(0, 1 - lift / 1.6);
    d.contact.position.x = p.x + lift * 0.18;
    d.contact.position.z = p.z - lift * 0.12;
    d.contact.scale.setScalar(1 + lift * 0.35);
    (d.contact.material as THREE.MeshBasicMaterial).opacity = 0.8 * k * k;
    d.contact.visible = d.mesh.visible && k > 0.02;
  }

  private syncFromPoses() {
    this.dice.forEach((d, i) => this.applyPose(i, new THREE.Vector3(...d.pose.p), new THREE.Quaternion(...d.pose.q)));
  }

  /** Valeurs actuellement visibles sur la face supérieure de chaque dé. */
  visibleValues(): number[] {
    return this.dice.map((d) => topFace(new THREE.Quaternion(...d.pose.q).multiply(d.offset)).value);
  }

  /**
   * Affiche des valeurs sans animation (reconnexion, arrivée en cours de partie).
   * Les dés qui montrent déjà la bonne valeur ne bougent pas.
   */
  showValues(values: number[], force = false) {
    if (this.playback) return;
    const vis = this.visibleValues();
    this.dice.forEach((d, i) => {
      if (!values[i] || (!force && vis[i] === values[i])) return;
      const o = offsetForTop(new THREE.Quaternion(...d.pose.q), values[i]);
      d.offset.copy(o);
    });
    this.home = this.dice.map((d) => d.pose);
    this.syncFromPoses();
    this.invalidate();
  }

  /** Lance les dés non conservés vers les valeurs officielles. Résout quand ils sont immobiles. */
  /** Autorise le lancer en glissant le doigt (ou la souris) sur le bac. */
  setSwipeEnabled(on: boolean) { this.swipeEnabled = on; }

  async roll(values: number[], keep: boolean[], seed: number, gesture?: ThrowGesture, dramatic = false): Promise<void> {
    if (this.playback) this.finishPlayback();
    // Les dés gardés partent du bord du bac : position calculée pareil chez tous les joueurs.
    const start = parkPoses(this.home, keep, this.shape.id);
    this.kept = [...keep];
    const wait = this.moveTo(start);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    this.finishMoves();
    const sim = simulateThrow(start, keep, values, seed, this.shape.id, gesture);
    // Les rotations de maillage sont fixées AVANT de jouer : elles restent constantes pendant
    // tout le lancer, la trajectoire n'est donc jamais modifiée.
    sim.offsets.forEach((o, i) => { if (o) this.dice[i].offset.set(...o); });
    this.kept = [...keep];
    const useCup = !!this.opts.cup && keep.some((k) => !k);
    if (!useCup) this.opts.onPickup?.(keep.filter((k) => !k).length);
    return new Promise((resolve) => {
      if (this.zoomTimer) clearTimeout(this.zoomTimer);
      this.zoomTarget = 0;
      this.playback = { sim, t0: null, frame: useCup ? PRELUDE_FRAMES : 0, dramatic, nextEvent: 0, resolve, hold: useCup };
      if (useCup) this.startCup(sim, keep);
    });
  }

  /** Rapproche la caméra des dés (zoom de 0 à 1) en gardant l'angle de vue. */
  private applyZoom() {
    const e = this.zoom * this.zoom * (3 - 2 * this.zoom);
    const close = this.zoomFocus.clone().add(this.baseCam.clone().sub(new THREE.Vector3(0, 0, 0)).multiplyScalar(0.68));
    this.camera.position.lerpVectors(this.baseCam, close, e);
    this.camera.lookAt(new THREE.Vector3().lerpVectors(new THREE.Vector3(0, 0, 0), this.zoomFocus, e));
  }

  // ---------------------------------------------------------------------------------------------
  // Gobelet

  private buildCup() {
    const g = new THREE.Group();
    const pts = [[0, -2.0], [0.92, -2.0], [1.0, -1.92], [1.06, -0.4], [1.13, -0.08], [1.12, 0]].map(([r, y]) => new THREE.Vector2(r, y));
    const tex = leather('#5a2e14', 11);
    const body = new THREE.MeshStandardMaterial({ map: tex, color: 0xffffff, roughness: 0.75, metalness: 0, side: THREE.DoubleSide, transparent: true });
    const brass = new THREE.MeshStandardMaterial({ color: 0xc9a046, roughness: 0.35, metalness: 0.9, transparent: true });
    const shell = new THREE.Mesh(new THREE.LatheGeometry(pts, 40), body);
    shell.castShadow = true;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1.12, 0.07, 10, 40), brass);
    rim.rotation.x = Math.PI / 2;
    const band = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.05, 8, 40), brass);
    band.rotation.x = Math.PI / 2;
    band.position.y = -1.85;
    g.add(shell, rim, band);
    g.visible = false;
    this.cupMats = [body, brass];
    this.disposables.push(tex, body, brass, shell.geometry, rim.geometry, band.geometry);
    this.scene.add(g);
    this.cup = g;
  }

  private startCup(sim: ThrowResult, keep: boolean[]) {
    if (!this.cup) this.buildCup();
    const center = new THREE.Vector3(), next = new THREE.Vector3(), q = new THREE.Quaternion(), p = new THREE.Vector3();
    let n = 0;
    for (let i = 0; i < 3; i++) {
      if (keep[i]) continue;
      samplePose(sim, PRELUDE_FRAMES, i, p, q); center.add(p);
      samplePose(sim, PRELUDE_FRAMES + 3, i, p, q); next.add(p);
      n++;
    }
    center.divideScalar(n); next.divideScalar(n);
    const dir = next.sub(center).setY(0);
    if (dir.lengthSq() < 1e-6) dir.set(0, 0, -1);
    dir.normalize();
    const axis = new THREE.Vector3(0, 1, 0).cross(dir).normalize();
    this.cupAnim = { t0: performance.now(), center, axis, dir, released: false };
    for (const m of this.cupMats) (m as THREE.MeshStandardMaterial).opacity = 1;
    this.cup!.visible = true;
    this.opts.onShake?.();
    this.invalidate();
  }

  /** Animation du gobelet : 0,6 s de secousses, 0,18 s pour verser, puis il s'éloigne. */
  private stepCup(now: number) {
    const a = this.cupAnim!, cup = this.cup!, pb = this.playback;
    const t = (now - a.t0) / 1000;
    const SHAKE = 0.6, POUR = 0.18, AWAY = 0.45;
    if (t < SHAKE) {
      const k = Math.min(1, t / 0.12);
      cup.position.set(
        a.center.x - a.dir.x * 0.8 + Math.sin(t * 34) * 0.22 * k,
        a.center.y + 1.6 + Math.abs(Math.sin(t * 26)) * 0.3 * k,
        a.center.z - a.dir.z * 0.8 + Math.cos(t * 29) * 0.18 * k);
      cup.quaternion.setFromAxisAngle(a.axis, -0.25 + Math.sin(t * 30) * 0.12 * k);
    } else if (t < SHAKE + POUR) {
      const e = (t - SHAKE) / POUR, s = e * e * (3 - 2 * e);
      cup.position.set(a.center.x - a.dir.x * 0.8 * (1 - s), a.center.y + 1.6 * (1 - s), a.center.z - a.dir.z * 0.8 * (1 - s));
      cup.quaternion.setFromAxisAngle(a.axis, -0.25 + 2.0 * s);
    } else {
      if (!a.released && pb) {
        a.released = true;
        pb.hold = false; // les dés sortent du gobelet : le lancer commence ici
        pb.t0 = null;
      }
      const e = Math.min(1, (t - SHAKE - POUR) / AWAY);
      cup.position.set(a.center.x - a.dir.x * 2.5 * e, a.center.y + 3 * e, a.center.z - a.dir.z * 2.5 * e);
      cup.quaternion.setFromAxisAngle(a.axis, 1.75 - 0.9 * e);
      for (const m of this.cupMats) (m as THREE.MeshStandardMaterial).opacity = 1 - e;
      if (e >= 1) { cup.visible = false; this.cupAnim = null; }
    }
  }

  private stopCup() {
    if (this.cup) this.cup.visible = false;
    this.cupAnim = null;
    for (const d of this.dice) { d.mesh.visible = true; d.contact.visible = true; }
  }

  private finishPlayback() {
    const pb = this.playback!;
    this.stopCup();
    if (pb.dramatic) {
      // On reste un instant sur le gros plan, puis la caméra revient.
      if (this.zoomTimer) clearTimeout(this.zoomTimer);
      this.zoomTimer = setTimeout(() => { this.zoomTarget = 0; this.invalidate(); }, 1600);
    }
    pb.sim.finalPoses.forEach((p, i) => (this.dice[i].pose = p));
    this.home = pb.sim.finalPoses;
    this.syncFromPoses();
    this.playback = null;
    this.invalidate();
    pb.resolve();
  }

  setKept(mask: boolean[]) {
    this.kept = [...mask];
    // Un dé gardé glisse au bord du bac ; s'il n'est plus gardé, il revient à sa place.
    if (!this.playback) this.moveTo(parkPoses(this.home, mask, this.shape.id));
    this.invalidate();
  }

  /** Lance les glissements vers les poses cibles ; renvoie leur durée (ms). */
  private moveTo(targets: DiePose[]): number {
    const now = performance.now();
    let longest = 0;
    this.moves = this.moves.filter((m) => now - m.t0 < m.dur);
    targets.forEach((to, i) => {
      const from = this.dice[i].pose;
      const dist = Math.hypot(to.p[0] - from.p[0], to.p[2] - from.p[2]);
      const turn = Math.abs(new THREE.Quaternion(...from.q).dot(new THREE.Quaternion(...to.q)));
      if (dist < 0.01 && turn > 0.9999) return;
      const dur = Math.min(520, 240 + dist * 45);
      this.moves = this.moves.filter((m) => m.i !== i);
      this.moves.push({ i, from: { p: [...from.p] as DiePose['p'], q: [...from.q] as DiePose['q'] }, to, t0: now, dur });
      this.dice[i].pose = to; // pose logique immédiate ; l'affichage suit l'animation
      longest = Math.max(longest, dur);
    });
    return longest;
  }

  private finishMoves() {
    for (const m of this.moves) this.applyPose(m.i, new THREE.Vector3(...m.to.p), new THREE.Quaternion(...m.to.q));
    this.moves = [];
  }

  setInteractive(on: boolean) {
    this.interactive = on;
    if (!on) this.setHover(-1);
  }

  setOptions(o: Partial<TraySceneOptions>) {
    Object.assign(this.opts, o);
  }

  // ---------------------------------------------------------------------------------------------
  // Boucle

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    const rawDt = (now - (this.time || now)) / 1000;
    const dt = Math.min(0.05, rawDt);
    this.time = now;

    let animating = false;
    if (this.cupAnim) { animating = true; this.stepCup(now); }
    if (this.playback?.hold) {
      // Dans le gobelet : les dés lancés sont cachés, les dés gardés restent au bord.
      animating = true;
      this.dice.forEach((d, i) => { d.mesh.visible = this.kept[i]; d.contact.visible = this.kept[i]; });
    } else if (this.playback) {
      this.dice.forEach((d) => { d.mesh.visible = true; d.contact.visible = true; });
      animating = true;
      const pb = this.playback;
      if (pb.t0 === null) pb.t0 = now;
      // Temps du lancer : normal, puis ralenti sur la fin quand le coup est exceptionnel.
      const slowFrom = pb.sim.frameCount - 80;
      const scale = pb.dramatic && pb.frame > slowFrom ? 0.3 : 1;
      if (pb.dramatic && pb.frame > slowFrom - 10 && this.zoomTarget === 0) {
        this.zoomTarget = 1;
        // Gros plan sur le centre des dés à leur position finale.
        this.zoomFocus.set(0, 0.5, 0);
        for (const p of pb.sim.finalPoses) this.zoomFocus.add(new THREE.Vector3(p.p[0] / 3, 0, p.p[2] / 3));
      }
      // Temps réel écoulé (plafonné à 1 s) : si l'appareil ralentit, le lancer rattrape son retard.
      pb.frame += Math.min(1, Math.max(0, rawDt)) * FPS * scale;
      const frame = pb.frame;
      for (let i = 0; i < 3; i++) {
        samplePose(pb.sim, frame, i, this.tmpP, this.tmpQ);
        this.applyPose(i, this.tmpP, this.tmpQ);
      }
      const ev = pb.sim.events;
      while (pb.nextEvent < ev.length && ev[pb.nextEvent].frame <= frame) {
        const e = ev[pb.nextEvent++];
        this.opts.onImpact?.(e.kind, e.strength, Math.max(-1, Math.min(1, e.x / this.shape.halfX)));
      }
      if (frame >= pb.sim.frameCount - 1) this.finishPlayback();
    }

    if (this.parts && this.stepParticles(dt, !!this.playback && !this.playback.hold)) animating = true;

    // Anneaux dorés sous les dés conservés, halo au survol.
    this.dice.forEach((d, i) => {
      const ringMat = d.ring.material as THREE.MeshBasicMaterial;
      const target = this.kept[i] && !this.playback ? 0.85 : this.kept[i] ? 0.55 : 0;
      const diff = target - ringMat.opacity;
      if (Math.abs(diff) > 0.005) { ringMat.opacity += diff * Math.min(1, dt * 10); animating = true; }
      else ringMat.opacity = target;
      d.ring.visible = ringMat.opacity > 0.01;
      const glow = this.kept[i] ? 0.18 : i === this.hover ? 0.1 : 0;
      const b = this.glowBase; // dés aux points lumineux : la carte lumineuse reste allumée
      for (const m of d.mats) m.emissive.setRGB(b + glow, b + glow * 0.75, b + glow * 0.25);
    });

    if (this.moves.length && !this.playback) {
      animating = true;
      const p = new THREE.Vector3(), q = new THREE.Quaternion();
      this.moves = this.moves.filter((m) => {
        const t = Math.min(1, (now - m.t0) / m.dur);
        const e = t * t * (3 - 2 * t);
        p.set(...m.from.p).lerp(new THREE.Vector3(...m.to.p), e);
        p.y += Math.sin(Math.PI * e) * 0.35; // petit soulèvement en glissant
        q.set(...m.from.q).slerp(new THREE.Quaternion(...m.to.q), e);
        this.applyPose(m.i, p, q);
        return t < 1;
      });
    }
    if (Math.abs(this.zoom - this.zoomTarget) > 0.002) {
      this.zoom += (this.zoomTarget - this.zoom) * Math.min(1, dt * (this.zoomTarget > this.zoom ? 2.2 : 1.6));
      this.applyZoom();
      animating = true;
    }
    if (!animating && !this.dirty) { this.perf.frames = 0; this.perf.time = 0; return; }
    this.dirty = false;
    this.renderer.render(this.scene, this.camera);
    if (animating) this.adaptResolution(rawDt);
  };

  /**
   * Si l'appareil tient moins de ~45 images/s pendant une animation, on baisse la résolution
   * interne par paliers (jamais sous 0,6× l'écran). Les dés restent nets, le mouvement fluide.
   */
  private adaptResolution(dt: number) {
    if (dt <= 0 || dt > 0.5) return; // onglet en arrière-plan, etc.
    this.perf.frames++;
    this.perf.time += dt;
    if (this.perf.frames < 40) return;
    const fps = this.perf.frames / this.perf.time;
    this.perf.frames = 0;
    this.perf.time = 0;
    if (fps < 45 && this.basePixelRatio * this.prScale > 0.6) {
      this.prScale *= 0.8;
      this.renderer.setPixelRatio(Math.max(0.6, this.basePixelRatio * this.prScale));
      this.resize();
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Clics sur les dés

  private pick(ev: PointerEvent): number {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObjects(this.dice.map((d) => d.mesh))[0];
    return hit ? (hit.object.userData.die as number) : -1;
  }

  private setHover(i: number) {
    if (this.hover !== i) this.invalidate();
    this.hover = i;
    this.renderer.domElement.style.cursor = i >= 0 ? 'pointer' : '';
  }

  private onPointerMove = (ev: PointerEvent) => {
    if (this.downAt) {
      this.trail.push({ x: ev.clientX, y: ev.clientY, t: performance.now() });
      if (this.trail.length > 40) this.trail.shift();
    }
    if (!this.interactive || this.playback || ev.pointerType === 'touch') return;
    this.setHover(this.pick(ev));
  };
  private onPointerDown = (ev: PointerEvent) => {
    this.downAt = { x: ev.clientX, y: ev.clientY };
    this.trail = [{ x: ev.clientX, y: ev.clientY, t: performance.now() }];
    if (this.swipeEnabled) this.renderer.domElement.setPointerCapture?.(ev.pointerId);
  };

  /** Point de l'écran → point du plan des dés (y = 0,5). */
  private toTray(x: number, y: number): THREE.Vector3 | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.5), hit) ? hit : null;
  }

  /**
   * Glisser rapide = lancer. Direction : celle du geste, ramenée sur le plan du bac (elle reste
   * juste quelle que soit l'orientation de la caméra). Force : vitesse du geste en fin de mouvement.
   */
  private detectSwipe(ev: PointerEvent): boolean {
    if (!this.swipeEnabled || this.playback || this.trail.length < 2) return false;
    const now = performance.now();
    const end = { x: ev.clientX, y: ev.clientY, t: now };
    const first = this.trail[0];
    if (Math.hypot(end.x - first.x, end.y - first.y) < 40) return false;
    const recent = this.trail.filter((p) => now - p.t < 110);
    const from = recent.length ? recent[0] : this.trail[this.trail.length - 1];
    const dt = Math.max(16, now - from.t) / 1000;
    const pxSpeed = Math.hypot(end.x - from.x, end.y - from.y) / dt;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const screens = pxSpeed / Math.min(rect.width, rect.height); // écrans par seconde
    if (screens < 0.6) return false;
    const a = this.toTray(first.x, first.y), b = this.toTray(end.x, end.y);
    if (!a || !b || a.distanceTo(b) < 0.5) return false;
    const angle = Math.atan2(b.z - a.z, b.x - a.x);
    const power = Math.min(1.35, Math.max(0.55, 0.45 + screens * 0.32));
    this.opts.onSwipe?.({ angle, power });
    return true;
  }

  private onPointerUp = (ev: PointerEvent) => {
    const d = this.downAt;
    this.downAt = null;
    if (d && this.detectSwipe(ev)) { this.trail = []; return; }
    this.trail = [];
    if (!d || Math.hypot(ev.clientX - d.x, ev.clientY - d.y) > 10) return;
    if (!this.interactive || this.playback) return;
    const i = this.pick(ev);
    if (i >= 0) this.opts.onDieClick?.(i);
  };

  // ---------------------------------------------------------------------------------------------
  // Vignettes (boutique)

  private thumbSize: [number, number] | null = null;
  private thumbFit = 1;

  /**
   * Rend la scène avec une apparence donnée et renvoie l'image (data URL). Une seule scène de
   * vignettes sert toute la boutique : on change l'apparence, on rend, on copie l'image.
   */
  capture(a: Appearance, w: number, h: number, elev = 48, fit = 1): string {
    this.thumbSize = [w, h];
    this.thumbFit = fit;
    this.elevOverride = elev;
    this.setAppearance(a);
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(w, h, false);
    this.resize();
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL('image/webp', 0.86);
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.resizeObs?.disconnect();
    if (this.playback) this.finishPlayback();
    this.clearTray();
    for (const d of this.disposables) d.dispose();
    // Les cartes de relief sont partagées entre toutes les scènes : on ne libère que les couleurs.
    for (const faces of this.faceCache.values()) for (const f of faces) { f.map.dispose(); f.emissive?.dispose(); }
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

/**
 * Fini de surface selon la matière du dé : le bois est mat et satiné, le marbre et la nacre
 * vernis et brillants, le métal reflète la pièce, les résines ont un vernis franc.
 */
export function diceFinish(st: DiceItem) {
  const metal = st.metalness > 0.5;
  const p = st.pattern;
  const wood = p === 'bois' || st.id === 'dice-bois';
  const stone = p === 'marbre' || st.id === 'dice-marbre' || st.id === 'dice-obsidienne';
  const pearl = p === 'nacre' || (st.iridescence ?? 0) > 0.5 || st.id === 'dice-pass-opale' || st.id === 'dice-diamant';
  // La carte de rugosité vaut 0,59 sur le corps du dé et 1 au fond des points (peinture mate).
  const base = Math.min(1, st.roughness / 0.59);
  if (wood) return { roughness: Math.max(0.95, base), clearcoat: Math.min(0.25, st.clearcoat), clearcoatRoughness: 0.45, specular: 0.5, sheen: 0.35, sheenColor: '#ffd9a8', env: 0.35, relief: 1.1 };
  if (metal) return { roughness: Math.max(0.34, base * 0.9), clearcoat: 0.25, clearcoatRoughness: 0.12, specular: 1, sheen: 0, sheenColor: '#000000', env: 1.35, relief: 1.2 };
  if (stone) return { roughness: Math.min(0.36, base), clearcoat: 1, clearcoatRoughness: 0.06, specular: 0.9, sheen: 0, sheenColor: '#000000', env: 0.75, relief: 1 };
  if (pearl) return { roughness: Math.min(0.32, base), clearcoat: 1, clearcoatRoughness: 0.08, specular: 1, sheen: 0.25, sheenColor: '#e8e0ff', env: 0.85, relief: 1 };
  return { roughness: base, clearcoat: st.clearcoat, clearcoatRoughness: 0.14 + st.roughness * 0.35, specular: 0.7, sheen: 0, sheenColor: '#000000', env: 0.6, relief: 1 };
}
