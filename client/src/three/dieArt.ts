/**
 * Dessin d'une face de dé sur un canvas 2D : sert aux textures 3D du bac et aux aperçus de
 * l'interface (collection, vitrine), pour que les deux soient identiques.
 *
 * Lisibilité avant tout : points larges, posés sur un « lit » uni de la couleur du dé (le motif
 * ne passe jamais sous un point), liseré contrasté quand c'est nécessaire, et points jamais
 * métalliques (voir `faceSurface`).
 *
 * Points gravés : chaque point est un creux en forme de coupelle (profil `pitHeight`). En 3D, le
 * relief vient d'une carte de normales : la lumière de la scène assombrit la paroi tournée vers
 * elle et allume le bord opposé, quelle que soit l'orientation du dé. Pour les aperçus 2D
 * (collection, boutique), le même éclairage est « cuit » dans l'image (lumière en haut à gauche).
 */
import { mulberry32 } from '../../../shared/rng';
import { contrast, type DicePattern } from '../../../shared/progress/dice-collection';

export interface DieArt {
  body: string;
  body2: string;
  pip: string;
  accent?: string;
  pattern?: DicePattern;
  glow?: boolean;
  /** Graine du motif (identifiant du dé) : le motif est le même partout. */
  seed?: string;
}
export type Layer = 'color' | 'emissive';

export const PIPS: Record<number, [number, number][]> = {
  1: [[0.5, 0.5]],
  2: [[0.27, 0.27], [0.73, 0.73]],
  3: [[0.25, 0.25], [0.5, 0.5], [0.75, 0.75]],
  4: [[0.27, 0.27], [0.73, 0.27], [0.27, 0.73], [0.73, 0.73]],
  5: [[0.26, 0.26], [0.74, 0.26], [0.5, 0.5], [0.26, 0.74], [0.74, 0.74]],
  6: [[0.27, 0.23], [0.73, 0.23], [0.27, 0.5], [0.73, 0.5], [0.27, 0.77], [0.73, 0.77]],
};
export const pipRadius = (value: number, S: number) => (value === 1 ? S * 0.14 : S * 0.106);

const hashSeed = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
const lum = (hex: string) => { const n = parseInt(hex.slice(1), 16); return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };

/** Dés unis du catalogue dont la matière mérite un fil ou des veines discrets (même rendu partout). */
const MATTER: Record<string, DicePattern> = { 'dice-bois': 'bois', 'dice-marbre': 'marbre' };

/** Motif du corps du dé (sous les points). */
function paintPattern(g: CanvasRenderingContext2D, S: number, a: DieArt, value: number) {
  const rnd = mulberry32(hashSeed(`${a.seed ?? a.body}:${value}`));
  const acc = a.accent ?? a.body2;
  g.save();
  switch (a.pattern) {
    case 'marbre': {
      g.strokeStyle = acc; g.lineCap = 'round';
      for (let k = 0; k < 6; k++) {
        g.globalAlpha = 0.25 + rnd() * 0.35; g.lineWidth = 1 + rnd() * 3.5;
        g.beginPath();
        let x = rnd() * S, y = 0;
        g.moveTo(x, y);
        while (y < S) { x += (rnd() - 0.5) * S * 0.25; y += S * (0.06 + rnd() * 0.08); g.lineTo(x, y); }
        g.stroke();
      }
      break;
    }
    case 'paillettes': {
      for (let k = 0; k < 140; k++) {
        g.globalAlpha = 0.35 + rnd() * 0.65; g.fillStyle = rnd() < 0.7 ? acc : '#ffffff';
        const r = 0.6 + rnd() * 1.8; g.beginPath(); g.arc(rnd() * S, rnd() * S, r, 0, Math.PI * 2); g.fill();
      }
      break;
    }
    case 'bois': {
      g.strokeStyle = acc;
      const cx = -S * 0.4 + rnd() * S * 0.2, cy = S * (0.3 + rnd() * 0.4);
      for (let r = S * 0.2; r < S * 1.8; r += S * (0.035 + rnd() * 0.04)) {
        g.globalAlpha = 0.18 + rnd() * 0.3; g.lineWidth = 1 + rnd() * 2.5;
        g.beginPath(); g.ellipse(cx, cy, r, r * 0.35, 0.08, 0, Math.PI * 2); g.stroke();
      }
      break;
    }
    case 'rayures': {
      g.fillStyle = acc; g.globalAlpha = 0.9;
      for (let x = S * 0.06; x < S; x += S * 0.22) g.fillRect(x, 0, S * 0.09, S);
      break;
    }
    case 'ecaille': {
      g.strokeStyle = acc; g.lineWidth = 2;
      const r = S * 0.11;
      for (let row = 0, y = -r; y < S + r; row++, y += r * 0.8)
        for (let x = (row % 2) * r - r; x < S + r; x += r * 2) {
          g.globalAlpha = 0.35 + rnd() * 0.35; g.beginPath(); g.arc(x, y, r, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
        }
      break;
    }
    case 'galaxie': {
      for (let k = 0; k < 3; k++) {
        const x = rnd() * S, y = rnd() * S, r = S * (0.25 + rnd() * 0.35);
        const gr = g.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, acc); gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.globalAlpha = 0.28; g.fillStyle = gr; g.fillRect(0, 0, S, S);
      }
      g.fillStyle = '#ffffff';
      for (let k = 0; k < 90; k++) { g.globalAlpha = 0.3 + rnd() * 0.7; g.beginPath(); g.arc(rnd() * S, rnd() * S, 0.5 + rnd() * 1.4, 0, Math.PI * 2); g.fill(); }
      break;
    }
    case 'craquele': {
      g.strokeStyle = acc; g.lineCap = 'round'; g.lineJoin = 'round';
      for (let k = 0; k < 9; k++) {
        g.globalAlpha = 0.6 + rnd() * 0.4; g.lineWidth = 1.5 + rnd() * 2.5;
        let x = rnd() * S, y = rnd() * S; g.beginPath(); g.moveTo(x, y);
        for (let j = 0; j < 5; j++) { x += (rnd() - 0.5) * S * 0.3; y += (rnd() - 0.5) * S * 0.3; g.lineTo(x, y); }
        g.stroke();
      }
      break;
    }
    case 'nacre': {
      for (let k = 0; k < 5; k++) {
        const x = rnd() * S, y = rnd() * S, r = S * (0.3 + rnd() * 0.4);
        const gr = g.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, k % 2 ? acc : '#ffe9f4'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.globalAlpha = 0.45; g.fillStyle = gr; g.fillRect(0, 0, S, S);
      }
      break;
    }
    case 'degrade': {
      const gr = g.createLinearGradient(0, 0, S, S);
      gr.addColorStop(0, a.body); gr.addColorStop(1, acc);
      g.globalAlpha = 1; g.fillStyle = gr; g.fillRect(0, 0, S, S);
      break;
    }
    case 'filigrane': {
      g.strokeStyle = acc; g.lineWidth = 1.6;
      const m = S * 0.07;
      g.globalAlpha = 0.7; g.strokeRect(m, m, S - 2 * m, S - 2 * m);
      g.globalAlpha = 0.45; g.strokeRect(m * 1.6, m * 1.6, S - 3.2 * m, S - 3.2 * m);
      for (const [x, y] of [[m, m], [S - m, m], [m, S - m], [S - m, S - m]]) {
        g.globalAlpha = 0.8; g.beginPath(); g.arc(x, y, m * 0.6, 0, Math.PI * 2); g.stroke();
      }
      for (let k = 0; k < 40; k++) { g.globalAlpha = 0.25 + rnd() * 0.5; g.fillStyle = '#ffffff'; g.beginPath(); g.arc(rnd() * S, rnd() * S, 0.6 + rnd(), 0, Math.PI * 2); g.fill(); }
      break;
    }
    default: break;
  }
  g.restore();
}

/** Rayon extérieur du creux (bord de la coupelle) ; la peinture du point s'arrête un peu avant. */
const pitOuter = (value: number, S: number) => pipRadius(value, S) * 1.1;
const PAINT = 0.88; // part du rayon du creux couverte par la couleur du point

/**
 * Profil du creux à la distance relative t du centre (0 = fond, 1 = bord) : coupelle sphérique
 * (fond légèrement bombé vers le bas, paroi qui se raidit vers le bord) et arête adoucie.
 * Renvoie une hauteur entre −1 (fond) et 0 (surface du dé).
 */
export function pitHeight(t: number): number {
  if (t >= 1.06) return 0;
  const k = 0.9, c = Math.sqrt(1 - k);
  const tt = Math.min(1, t);
  const bowl = -(Math.sqrt(1 - k * tt * tt) - c) / (1 - c);
  // Arête adoucie : la lèvre de la coupelle s'arrondit au lieu de casser net.
  const e = Math.min(1, Math.max(0, (t - 0.9) / 0.16));
  return bowl * (1 - e * e * (3 - 2 * e));
}

/** Hauteur (0 = surface, −1 = fond d'un point) en chaque pixel de la face, et occlusion ambiante. */
function heightField(value: number, S: number): Float32Array {
  const hf = new Float32Array(S * S);
  const R = pitOuter(value, S);
  for (const [px, py] of PIPS[value]) {
    const cx = px * S, cy = py * S, ext = R * 1.1;
    for (let y = Math.max(0, Math.floor(cy - ext)); y < Math.min(S, Math.ceil(cy + ext)); y++)
      for (let x = Math.max(0, Math.floor(cx - ext)); x < Math.min(S, Math.ceil(cx + ext)); x++) {
        const t = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / R;
        const h = pitHeight(t);
        if (h < hf[y * S + x]) hf[y * S + x] = h;
      }
  }
  return hf;
}

/** Pente (dérivées de la hauteur) en pixels, pour la carte de normales et l'éclairage cuit. */
const grad = (hf: Float32Array, S: number, x: number, y: number): [number, number] => {
  const at = (i: number, j: number) => hf[Math.min(S - 1, Math.max(0, j)) * S + Math.min(S - 1, Math.max(0, i))];
  return [(at(x + 1, y) - at(x - 1, y)) / 2, (at(x, y + 1) - at(x, y - 1)) / 2];
};

/** Profondeur des creux, en pixels de texture par unité de hauteur (pente des parois). */
const depthPx = (value: number, S: number) => pitOuter(value, S) * 0.8;

/**
 * Cartes de surface d'une face, communes à tous les dés (seule la position des points compte) :
 * - normales : relief des creux ;
 * - « orm » : rouge = occlusion ambiante (creux et bords de face plus sombres),
 *   vert = rugosité relative (fond des points nettement plus mat : 255 contre 150 sur le corps), bleu = métal (jamais sur les points).
 */
export function faceSurface(value: number, S: number): { normal: ImageData; orm: ImageData } {
  const hf = heightField(value, S);
  const normal = new ImageData(S, S), orm = new ImageData(S, S);
  const D = depthPx(value, S), R = pitOuter(value, S);
  const pips = PIPS[value];
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const i = y * S + x, o = i * 4;
      const [gx, gy] = grad(hf, S, x, y);
      // Normale (convention OpenGL : la texture est retournée, l'axe v monte quand y descend).
      let nx = -gx * D, ny = gy * D, nz = 1;
      const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
      normal.data[o] = (nx * 0.5 + 0.5) * 255; normal.data[o + 1] = (ny * 0.5 + 0.5) * 255; normal.data[o + 2] = (nz * 0.5 + 0.5) * 255; normal.data[o + 3] = 255;
      // Occlusion : bords de face (le dé s'assombrit vers ses arêtes), creux (plus sombre au pied de la paroi).
      const u = x / S, v = y / S;
      const edge = Math.min(u, v, 1 - u, 1 - v);
      let ao = 1 - 0.28 * Math.pow(Math.max(0, 1 - edge / 0.16), 2);
      let tMin = 9;
      for (const [px, py] of pips) tMin = Math.min(tMin, Math.hypot(x + 0.5 - px * S, y + 0.5 - py * S) / R);
      if (tMin < 1.05) {
        const h = -hf[i];
        const foot = Math.exp(-Math.pow((tMin - 0.82) / 0.14, 2)); // pied de paroi
        ao *= 1 - 0.38 * h - 0.25 * foot;
      }
      orm.data[o] = Math.max(0, Math.min(255, ao * 255));
      orm.data[o + 1] = tMin < PAINT ? 255 : 150;
      orm.data[o + 2] = tMin < 1.25 ? 0 : 255;
      orm.data[o + 3] = 255;
    }
  return { normal, orm };
}

/** Peint une couche de la face `value` (1 à 6) sur un canvas carré de côté S. */
export function paintFace(g: CanvasRenderingContext2D, S: number, value: number, a: DieArt, layer: Layer = 'color', bake = false) {
  const r = pipRadius(value, S);
  const R = pitOuter(value, S);
  const pips = PIPS[value];
  if (layer === 'emissive') {
    g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
    if (a.pattern === 'craquele' || a.pattern === 'galaxie') paintPattern(g, S, { ...a, body: '#000', body2: '#000' }, value);
    for (const [x, y] of pips) { g.fillStyle = a.pip; g.beginPath(); g.arc(x * S, y * S, R * PAINT, 0, Math.PI * 2); g.fill(); }
    return;
  }
  // Couleur : corps dégradé, motif, puis lit uni sous chaque point, liseré si besoin, point.
  const grd = g.createRadialGradient(S / 2, S / 2, S * 0.1, S / 2, S / 2, S * 0.72);
  grd.addColorStop(0, a.body); grd.addColorStop(1, a.body2);
  g.fillStyle = grd; g.fillRect(0, 0, S, S);
  if (a.pattern && a.pattern !== 'uni') paintPattern(g, S, a, value);
  else if (MATTER[a.seed ?? '']) {
    // Matière suggérée par le nom du dé (bois clair, marbre) : fil ou veines très discrets.
    g.save(); g.globalAlpha = 0.45;
    paintPattern(g, S, { ...a, pattern: MATTER[a.seed!], accent: a.accent ?? mix(a.body2, '#000000', 0.25) }, value);
    g.restore();
  }
  // Faces qui s'assombrissent vers les arêtes : le dé a du volume et se détache du tapis.
  const lightBody = lum(a.body) > 0.5;
  const edge = g.createRadialGradient(S / 2, S / 2, S * 0.42, S / 2, S / 2, S * 0.74);
  edge.addColorStop(0, 'rgba(0,0,0,0)'); edge.addColorStop(1, lightBody ? 'rgba(70,48,24,0.28)' : 'rgba(0,0,0,0.3)');
  g.fillStyle = edge; g.fillRect(0, 0, S, S);
  if (!lightBody) {
    // Sur les dés sombres, un fin liseré clair le long des arêtes (reflet de la lampe).
    const rim = g.createRadialGradient(S / 2, S / 2, S * 0.6, S / 2, S / 2, S * 0.74);
    rim.addColorStop(0, 'rgba(255,255,255,0)'); rim.addColorStop(1, 'rgba(255,255,255,0.08)');
    g.fillStyle = rim; g.fillRect(0, 0, S, S);
  }
  const lightPip = lum(a.pip) > 0.5;
  const needRing = Math.min(contrast(a.pip, a.body), contrast(a.pip, a.body2)) < 4.5 || (a.pattern && a.pattern !== 'uni' && a.pattern !== 'degrade');
  for (const [x, y] of pips) {
    const cx = x * S, cy = y * S;
    if (a.pattern && a.pattern !== 'uni') {
      // Lit uni : le motif s'arrête autour du point.
      g.fillStyle = a.body2; g.beginPath(); g.arc(cx, cy, r * 1.4, 0, Math.PI * 2); g.fill();
    }
    if (needRing) {
      g.fillStyle = lightPip ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.6)';
      g.beginPath(); g.arc(cx, cy, R * 1.06, 0, Math.PI * 2); g.fill();
    }
    // Paroi du creux : couleur du dé, un peu ombrée vers le fond.
    const wall = g.createRadialGradient(cx, cy, R * PAINT * 0.98, cx, cy, R);
    wall.addColorStop(0, lightBody ? 'rgba(40,25,10,0.35)' : 'rgba(0,0,0,0.5)'); wall.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = wall; g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill();
    // Fond du point : couleur du point, plus profonde au centre (peinture accumulée dans la coupelle).
    const pg = g.createRadialGradient(cx, cy, 0, cx, cy, R * PAINT);
    pg.addColorStop(0, a.pip); pg.addColorStop(0.7, a.pip); pg.addColorStop(1, mix(a.pip, '#000000', lightPip ? 0.25 : 0.4));
    g.beginPath(); g.arc(cx, cy, R * PAINT, 0, Math.PI * 2); g.fillStyle = pg; g.fill();
  }
  if (bake) bakeLight(g, S, value, lightPip);
}

/** Mélange deux couleurs #rrggbb (k = part de la seconde). */
function mix(a: string, b: string, k: number): string {
  const p = parseInt(a.slice(1), 16), q = parseInt(b.slice(1), 16);
  const c = (s: number) => Math.round(((p >> s) & 255) * (1 - k) + ((q >> s) & 255) * k);
  return `rgb(${c(16)},${c(8)},${c(0)})`;
}

/**
 * Éclairage cuit pour les images 2D : lumière venant d'en haut à gauche. La paroi côté lumière
 * est dans l'ombre (ombre interne), le bord opposé reçoit un liseré clair.
 */
function bakeLight(g: CanvasRenderingContext2D, S: number, value: number, lightPip: boolean) {
  const hf = heightField(value, S);
  const D = depthPx(value, S), R = pitOuter(value, S);
  const L = [-0.45, -0.55, 0.7]; // vers la lumière (x écran, y écran vers le bas, hors de la face)
  const ll = Math.hypot(...L); const lx = L[0] / ll, ly = L[1] / ll, lz = L[2] / ll;
  const flat = lz;
  for (const [px, py] of PIPS[value]) {
    const x0 = Math.max(0, Math.floor(px * S - R * 1.15)), y0 = Math.max(0, Math.floor(py * S - R * 1.15));
    const w = Math.min(S, Math.ceil(px * S + R * 1.15)) - x0, h = Math.min(S, Math.ceil(py * S + R * 1.15)) - y0;
    const img = g.getImageData(x0, y0, w, h);
    for (let j = 0; j < h; j++)
      for (let i = 0; i < w; i++) {
        const x = x0 + i, y = y0 + j;
        if (hf[y * S + x] === 0) continue;
        const [gx, gy] = grad(hf, S, x, y);
        let nx = -gx * D, ny = -gy * D, nz = 1;
        const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
        const diff = Math.max(0, nx * lx + ny * ly + nz * lz);
        // Ombre portée par le bord côté lumière : le fond du creux près de ce bord reste sombre.
        const dx = x + 0.5 - px * S, dy = y + 0.5 - py * S;
        const toward = -(dx * lx + dy * ly) / R; // > 0 : côté lumière
        const cast = Math.max(0, Math.min(1, (toward - 0.15) / 0.6)) * Math.min(1, -hf[y * S + x] * 1.6);
        let k = diff / flat;
        k = k * (1 - 0.45 * cast);
        const o = (j * w + i) * 4;
        const spec = Math.pow(Math.max(0, diff), 24) * (lightPip ? 30 : 80) * (k > 1 ? 1 : 0);
        for (let c = 0; c < 3; c++) img.data[o + c] = Math.max(0, Math.min(255, img.data[o + c] * (0.25 + 0.75 * k) + spec + (k > 1 ? (k - 1) * 160 : 0)));
      }
    g.putImageData(img, x0, y0);
  }
}

/** Image (data URL) d'une face, pour l'interface (éclairage cuit). */
const cache = new Map<string, string>();
export function faceImage(value: number, a: DieArt, size = 128): string {
  const key = `${a.seed}|${a.body}|${a.pip}|${a.pattern}|${value}|${size}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  paintFace(c.getContext('2d')!, size, value, a, 'color', true);
  const url = c.toDataURL('image/png');
  cache.set(key, url);
  return url;
}
