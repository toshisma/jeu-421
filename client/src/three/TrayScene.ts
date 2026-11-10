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
import { brushed, dieFace, disposeFace, felt, leather, stone, wood } from './textures';
import { finishAnimated, lookFinish, type LookFinish } from './dieLooks';
import { installDiceFx, setDiceFx, type DiceFxUniforms } from './diceFx';
import { Trails } from './trails';
import { Celebrations } from './celebrations';
import { getShape, clampInside, insideShape, offsetVerts, type TrayShape } from '../physics/trayShapes';
import { getItem, resolveAppearance, type Appearance, type DiceItem, type ResolvedAppearance } from '../../../shared/progress/catalog';

export type Quality = 'haute' | 'normale';
export interface Insets {
  top: number; right: number; bottom: number; left: number;
  /** Hauteur du bas à prévoir pour CHOISIR l'orientation (panneau qui grandit pendant la partie) ; le cadrage suit `bottom`. */
  orientBottom?: number;
}

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
  /** Sons ponctuels des célébrations (pièces, explosions, tonnerre). */
  onFx?: (kind: 'coin' | 'boom' | 'pop' | 'thunder', strength: number) => void;
  /**
   * Scène de vignettes (boutique) : pas de boucle d'animation, pas d'écouteurs, pas de changement
   * de couleur d'accent ; on rend à la demande avec `capture()`.
   */
  thumbnail?: boolean;
  /** Nombre de dés dans le bac (3 pour le 421, 6 pour le Dix mille). */
  diceCount?: number;
}

interface DieObj {
  mesh: THREE.Mesh;
  mats: THREE.MeshPhysicalMaterial[];
  ring: THREE.Mesh;
  /** Ombre de contact (tache douce posée sur le tapis, sous le dé). */
  contact: THREE.Mesh;
  /** Effets animés (scintillement, lueur qui pulse, reflet, éclat des brillants). */
  fx: DiceFxUniforms[];
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
  // Traînée de lancer : ruban et particules derrière les dés pendant qu'ils roulent.
  private trails: Trails | null = null;
  private trailId: string | null = null;
  /** Célébration du 4-2-1 / trois as dans le bac. */
  private party: Celebrations | null = null;
  /** Lumière d'appoint des célébrations (éclair, feu d'artifice). */
  private flashLight: THREE.PointLight | null = null;
  /** Horloge des effets animés des dés. */
  private fxTime = { value: 0 };
  /** Les dés affichés ont des effets animés (scintillement, lueur, reflets). */
  private diceAnimated = false;
  private lastIdleFx = 0;
  private diePos: THREE.Vector3[] = [];
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
  private kept: boolean[] = [];
  /** Dés retirés du bac (mis de côté au Dix mille) : invisibles et hors de la physique. */
  private hidden: boolean[] = [];
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

    const layout = restingLayout(7, this.dice.length);
    layout.forEach((p, i) => (this.dice[i].pose = p));
    this.home = layout;
    this.showValues(this.dice.length === 3 ? [4, 2, 1] : [1, 2, 3, 4, 5, 6, 1, 5].slice(0, this.dice.length), true);

    if (opts.thumbnail) {
      this.renderer.domElement.className = 'tray-thumb-canvas';
      this.renderer.compile(this.scene, this.camera);
      return;
    }
    const el = this.renderer.domElement;
    // Mesure (captures automatiques) : taille des dés à l'écran, en pixels CSS.
    (el as HTMLCanvasElement & { diceBoxes?: () => { w: number; h: number; x: number; y: number }[] }).diceBoxes = () => this.diceScreenBoxes();
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

  /** Boîte englobante de chaque dé visible à l'écran (pixels CSS, relatifs au bac). */
  diceScreenBoxes() {
    const w = this.container.clientWidth || 1, h = this.container.clientHeight || 1;
    this.camera.updateMatrixWorld();
    const box = new THREE.Box3(), v = new THREE.Vector3();
    return this.dice.filter((_, i) => !this.hidden[i]).map((d) => {
      d.mesh.updateMatrixWorld();
      const g = (d.mesh as THREE.Mesh).geometry;
      if (g) { if (!g.boundingBox) g.computeBoundingBox(); box.copy(g.boundingBox!); } else box.setFromObject(d.mesh);
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let k = 0; k < 8; k++) {
        v.set(k & 1 ? box.max.x : box.min.x, k & 2 ? box.max.y : box.min.y, k & 4 ? box.max.z : box.min.z);
        if (g) v.applyMatrix4(d.mesh.matrixWorld);
        v.project(this.camera);
        const px = (v.x + 1) / 2 * w, py = (1 - v.y) / 2 * h;
        x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py);
      }
      return { x: Math.round(x0), y: Math.round(y0), w: Math.round(x1 - x0), h: Math.round(y1 - y0) };
    });
  }

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
    const count = Math.max(1, Math.min(8, this.opts.diceCount ?? 3));
    this.kept = Array(count).fill(false);
    this.hidden = Array(count).fill(false);
    for (let i = 0; i < count; i++) {
      const mats = FACE_VALUES.map(() => new THREE.MeshPhysicalMaterial({
        roughness: 0.32, metalness: 0, normalScale: new THREE.Vector2(1, 1),
        clearcoat: 0.55, clearcoatRoughness: 0.2, envMapIntensity: 0.55, sheen: 0,
      }));
      this.disposables.push(...mats);
      const fx = mats.map((m) => installDiceFx(m, this.fxTime));
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
      this.dice.push({ mesh, mats, ring, contact, fx, pose: { p: [0, 0.5, 0], q: [0, 0, 0, 1] }, offset: new THREE.Quaternion() });
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

  /** Traînée de lancer (identifiant de l'effet de collection), ou aucune (null). */
  setTrail(id: string | null) {
    if (id === this.trailId) return;
    this.trailId = id;
    if (id && !this.trails) {
      this.trails = new Trails(this.quality === 'normale');
      this.trails.setScale(this.renderer.domElement.height);
      this.scene.add(this.trails.group);
    }
    this.trails?.set(id);
    // Shaders de la traînée compilés tout de suite : pas d'à-coup au premier lancer.
    if (this.trails && id) { const g = this.trails.group, v = g.visible; g.visible = true; this.renderer.compile(this.scene, this.camera); g.visible = v; }
  }

  /**
   * Célébration du 4-2-1 / des trois as (effet de collection, ou célébration par défaut si null),
   * autour des dés. Dure 3 s, se nettoie seule ; un nouveau lancer l'arrête.
   */
  celebrate(id: string | null) {
    if (!this.party) {
      this.party = new Celebrations({
        scene: this.scene,
        half: [this.shape.halfX - 0.3, this.shape.halfZ - 0.3],
        lite: () => this.quality === 'normale',
        flash: (k, color) => this.flash(k, color),
        onSound: (kind, s) => this.opts.onFx?.(kind, s),
      });
    }
    const c = new THREE.Vector3();
    const shown = this.dice.filter((_, i) => !this.hidden[i]);
    for (const d of shown) c.add(d.mesh.position);
    c.divideScalar(Math.max(1, shown.length)).setY(0);
    // Le tapis peut changer de forme : on recale les limites.
    this.party.ctx.half = [this.shape.halfX - 0.3, this.shape.halfZ - 0.3];
    this.party.start(id, c);
    this.invalidate();
  }

  /** Flash de lumière (éclair, explosion) : lumière ponctuelle ajoutée, et ciel un peu plus clair. */
  private flash(k: number, color: THREE.Color) {
    if (!this.flashLight) {
      if (k <= 0) return;
      this.flashLight = new THREE.PointLight(0xffffff, 0, 40, 1.2);
      this.flashLight.position.set(0, 9, 0);
      this.scene.add(this.flashLight);
    }
    this.flashLight.color.copy(color);
    this.flashLight.intensity = this.quality === 'haute' ? k * 260 : 0;
    this.hemi.intensity = 0.14 + k * 0.18;
    this.flashLight.visible = k > 0.001;
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
    // Dés de collection : textures plus fines en qualité haute.
    const size = this.quality === 'haute' && !this.opts.thumbnail ? 512 : 256;
    const ck = `${st.id}|${st.rarity ? size : 256}`;
    let faces = this.faceCache.get(ck);
    if (!faces) {
      faces = FACE_VALUES.map((v) => dieFace(v, { ...st, id: st.id }, size));
      this.faceCache.set(ck, faces);
      // Pas plus de 6 modèles de dés gardés (une table a au plus 6 joueurs).
      if (this.faceCache.size > 6) {
        const [oldKey, old] = this.faceCache.entries().next().value!;
        this.faceCache.delete(oldKey);
        for (const fc of old) disposeFace(fc);
      }
    }
    const look: LookFinish | null = st.rarity ? lookFinish({ ...st, id: st.id }) : null;
    // Lueur peinte des dés de collection (nébuleuses, aurore…) : allumée même sans points lumineux.
    if (!st.glow && faces[0].emissive) this.glowBase = 0.75;
    const fin = look ?? diceFinish(st);
    this.diceAnimated = !!look && finishAnimated(look);
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
        m.metalness = look ? look.metalness : st.metalness;
        m.anisotropy = look && this.quality === 'haute' ? look.anisotropy : 0;
        m.clearcoat = fin.clearcoat;
        m.clearcoatRoughness = fin.clearcoatRoughness;
        m.specularIntensity = fin.specular;
        m.sheen = this.quality === 'haute' ? fin.sheen : 0;
        m.sheenRoughness = 0.6;
        m.sheenColor.set(fin.sheenColor);
        m.iridescence = look ? look.iridescence : st.iridescence ?? 0;
        m.iridescenceIOR = 1.6;
        m.iridescenceThicknessRange = [180, 620];
        m.emissiveMap = f.emissive;
        m.emissiveIntensity = 1;
        m.envMapIntensity = fin.env;
        setDiceFx(d.fx[j], f.fx, look, this.quality === 'haute');
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
    if (q !== this.quality) { this.quality = q; this.diceKey = ''; this.styleDice(); this.trails?.setLite(q === 'normale'); if (this.trailId) { const t = this.trailId; this.trailId = null; this.setTrail(t); } }
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
  private orientTall = false;
  private orientKnown = false;

  private resize() {
    const w = this.thumbSize?.[0] ?? (this.container.clientWidth || 1);
    const h = this.thumbSize?.[1] ?? (this.container.clientHeight || 1);
    this.renderer.setSize(w, h, false);
    this.trails?.setScale(this.renderer.domElement.height);
    this.camera.aspect = w / h;
    const { top, right, bottom, left } = this.insets;
    const freeW = Math.max(100, w - left - right);
    const freeH = Math.max(100, h - top - bottom);
    let tanV = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * (freeH / h);
    const tanH = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * (w / h) * (freeW / w);
    // En portrait, la caméra tourne de 90° : le grand côté du bac suit la hauteur de l'écran.
    // Distance de caméra qui fait tenir tout le bac (murs compris) dans la zone libre, pour chaque
    // orientation : plus elle est courte, plus les dés sont grands.
    const thumb = !!this.thumbSize;
    const fit = (p: boolean) => {
      // Bac en largeur sur un écran en hauteur (petit téléphone) : même inclinaison qu'en portrait, faces du dessus plus lisibles.
      const elev = THREE.MathUtils.degToRad(this.elevOverride ?? (p || (!thumb && w < h) ? 62 : 57));
      // Marge autour des murs : réduite en jeu (le socle dépasse de 0,2), gardée pour les vignettes.
      const longHalf = this.shape.halfX + TRAY.wall + (thumb ? 0.6 : 0.25);
      const shortHalf = this.shape.halfZ + TRAY.wall + (thumb ? 0.4 : 0.22);
      const acrossHalf = p ? shortHalf : longHalf; // demi-largeur à l'écran
      const depthHalf = p ? longHalf : shortHalf;
      const alongHalf = depthHalf * Math.sin(elev) + TRAY.wallHeight * Math.cos(elev); // demi-hauteur
      // Le bord du bac le plus proche de la caméra paraît plus large (perspective) : en jeu, la largeur se
      // vérifie à sa profondeur, pour ne jamais couper les coins avant du bac.
      const near = thumb ? 0 : depthHalf * Math.cos(elev) + TRAY.wallHeight * Math.sin(elev);
      return { elev, dist: Math.max(acrossHalf / tanH + near, alongHalf / tanV) * (thumb ? this.thumbFit : 1.01) };
    };
    const P = fit(true), L = fit(false);
    // Orientation choisie sur la zone libre la plus petite attendue (barre d'action de son propre tour) :
    // le bac ne pivote pas au premier tour du joueur.
    const ob = this.insets.orientBottom ?? 0;
    const choice = !thumb && ob > bottom ? (() => {
      const fh = Math.max(100, h - top - ob), save = tanV;
      tanV = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * (fh / h);
      const r = { P: fit(true), L: fit(false) };
      tanV = save;
      return r;
    })() : { P, L };
    // Orientation : celle qui donne les plus grands dés dans la zone libre (petit téléphone en partie :
    // souvent le bac en largeur). Décidée à nouveau quand l'écran tourne ou quand les panneaux sont
    // connus pour la première fois ; ensuite, elle ne bascule que si l'autre est nettement meilleure
    // (15 %) : un bandeau qui apparaît en partie ne fait pas pivoter le bac.
    const tall = w < h, known = top + right + bottom + left > 0;
    if (thumb) this.portrait = freeW < freeH * 0.95; // vignettes : chaque image a son cadre
    else if (this.portrait === null || tall !== this.orientTall || (known && !this.orientKnown)) this.portrait = choice.P.dist <= choice.L.dist;
    else if (this.portrait && choice.L.dist < choice.P.dist * 0.85) this.portrait = false;
    else if (!this.portrait && choice.P.dist < choice.L.dist * 0.85) this.portrait = true;
    this.orientTall = tall;
    this.orientKnown = known;
    const portrait = this.portrait;
    const { elev, dist } = portrait ? P : L;
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
    this.party?.stop();
    this.flash(0, new THREE.Color());
    // Les dés gardés partent du bord du bac : position calculée pareil chez tous les joueurs.
    // Dés retirés : immobiles, loin sous le bac (ils ne gênent pas le lancer).
    const hid = this.hidden;
    const home = this.home.map((p, i) => (hid[i] ? { p: [0, -40 - i * 2, 0] as DiePose['p'], q: p.q } : p));
    const start = parkPoses(home, keep.map((k, i) => k && !hid[i]), this.shape.id).map((p, i) => (hid[i] ? home[i] : p));
    keep = keep.map((k, i) => k || hid[i]);
    this.kept = [...keep];
    const wait = this.moveTo(start.map((p, i) => (hid[i] ? this.dice[i].pose : p)));
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
    for (let i = 0; i < this.dice.length; i++) {
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
    this.dice.forEach((d, i) => { d.mesh.visible = !this.hidden[i]; d.contact.visible = !this.hidden[i]; });
  }

  private finishPlayback() {
    const pb = this.playback!;
    this.stopCup();
    if (pb.dramatic) {
      // On reste un instant sur le gros plan, puis la caméra revient.
      if (this.zoomTimer) clearTimeout(this.zoomTimer);
      this.zoomTimer = setTimeout(() => { this.zoomTarget = 0; this.invalidate(); }, 1600);
    }
    // Les dés retirés gardent leur dernière place (ils y reviennent à la main pleine).
    const fin = pb.sim.finalPoses.map((p, i) => (this.hidden[i] ? this.dice[i].pose : p));
    fin.forEach((p, i) => (this.dice[i].pose = p));
    this.home = fin;
    this.syncFromPoses();
    this.playback = null;
    this.invalidate();
    pb.resolve();
  }

  setKept(mask: boolean[]) {
    this.kept = [...mask];
    // Un dé gardé glisse au bord du bac ; s'il n'est plus gardé, il revient à sa place.
    if (!this.playback) {
      const parked = parkPoses(this.home, mask.map((k, i) => k && !this.hidden[i]), this.shape.id);
      this.moveTo(parked.map((p, i) => (this.hidden[i] ? this.dice[i].pose : p)));
    }
    this.invalidate();
  }

  /**
   * Retire des dés du bac (Dix mille : dés mis de côté) ou les y remet. Un dé remis reprend
   * sa place de repos ; il sera relancé au prochain lancer.
   */
  setHidden(mask: boolean[]) {
    // Un dé qui apparaît ou disparaît n'emporte pas son anneau de dé gardé.
    // Un dé qui revient repart de là où il était posé.
    this.dice.forEach((d, i) => {
      if (this.hidden[i] === !!mask[i]) return;
      (d.ring.material as THREE.MeshBasicMaterial).opacity = 0;
      if (!mask[i] && this.home[i]) { this.home = [...this.home]; this.home[i] = d.pose; }
    });
    this.hidden = this.dice.map((_, i) => !!mask[i]);
    this.dice.forEach((d, i) => { d.mesh.visible = !this.hidden[i]; d.contact.visible = !this.hidden[i]; if (this.hidden[i]) d.ring.visible = false; });
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
      this.dice.forEach((d, i) => { d.mesh.visible = this.kept[i] && !this.hidden[i]; d.contact.visible = this.kept[i] && !this.hidden[i]; });
    } else if (this.playback) {
      this.dice.forEach((d, i) => { d.mesh.visible = !this.hidden[i]; d.contact.visible = !this.hidden[i]; });
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
        const n = pb.sim.finalPoses.length;
        for (const p of pb.sim.finalPoses) this.zoomFocus.add(new THREE.Vector3(p.p[0] / n, 0, p.p[2] / n));
      }
      // Temps réel écoulé (plafonné à 1 s) : si l'appareil ralentit, le lancer rattrape son retard.
      pb.frame += Math.min(1, Math.max(0, rawDt)) * FPS * scale;
      const frame = pb.frame;
      for (let i = 0; i < this.dice.length; i++) {
        if (this.hidden[i]) continue;
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

    this.fxTime.value += dt;
    if (this.trails) {
      if (this.diePos.length !== this.dice.length) this.diePos = this.dice.map((d) => d.mesh.position);
      if (this.trails.step(dt, this.diePos, !!this.playback && !this.playback.hold)) animating = true;
    }
    if (this.party?.step(dt)) animating = true;
    else if (this.flashLight?.visible) this.flash(0, new THREE.Color());

    // Anneaux dorés sous les dés conservés, halo au survol.
    this.dice.forEach((d, i) => {
      const ringMat = d.ring.material as THREE.MeshBasicMaterial;
      const target = this.kept[i] && !this.playback ? 0.85 : this.kept[i] ? 0.55 : 0;
      const diff = target - ringMat.opacity;
      if (Math.abs(diff) > 0.005) { ringMat.opacity += diff * Math.min(1, dt * 10); animating = true; }
      else ringMat.opacity = target;
      d.ring.visible = ringMat.opacity > 0.01 && !this.hidden[i];
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
    // Dés aux effets animés : au repos, rendu à 30 images/s en qualité haute (rien en qualité normale).
    if (!animating && !this.dirty && this.diceAnimated && this.quality === 'haute' && now - this.lastIdleFx > 33) { this.lastIdleFx = now; this.dirty = true; }
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
    const hit = this.raycaster.intersectObjects(this.dice.filter((_, i) => !this.hidden[i]).map((d) => d.mesh))[0];
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
    for (const faces of this.faceCache.values()) for (const f of faces) disposeFace(f);
    this.trails?.dispose();
    this.party?.stop();
    if (this.flashLight) { this.flashLight.dispose(); this.flashLight.removeFromParent(); }
    this.renderer.dispose();
    // Rend tout de suite le contexte WebGL au navigateur (sinon il attend le ramasse-miettes : en passant
    // d'un menu à l'autre, les vitrines 3D s'accumulent et le navigateur finit par en perdre).
    try { this.renderer.forceContextLoss(); } catch { /* contexte déjà perdu */ }
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
