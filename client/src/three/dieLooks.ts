/**
 * Matières des dés de collection : chaque dé a sa « recette » (motif, relief, rugosité, lueur,
 * scintillement), peinte une fois par dé sur une « planche » carrée raccordable, puis reportée
 * sur les six faces avec un décalage et une rotation propres à chaque face.
 *
 * Couches d'une planche (toutes à la résolution de la face) :
 * - couleur (sRGB) ;
 * - hauteur (relief du motif, de −1 à 1, transformé en carte de normales avec les points gravés) ;
 * - rugosité relative (150 = rugosité nominale du dé ; plus haut = plus mat) ;
 * - lueur (dés lumineux) ;
 * - effets : R = scintillement, G = phase (décalage dans le temps), B = zones qui pulsent ou
 *   reflet qui glisse. Lu par le shader des dés (voir `diceFx.ts`), jamais par l'interface 2D.
 *
 * Hiérarchie des raretés : les communs ont une matière et un relief sobres ; les rares un vrai
 * motif ; les épiques de la lueur ou du scintillement ; les légendaires tout cela, animé.
 * Les brillants ajoutent partout un éclat irisé et des étincelles.
 */
import { mulberry32 } from '../../../shared/rng';
import type { DicePattern, Rarity } from '../../../shared/progress/dice-collection';

export interface LookInput {
  id: string;
  body: string;
  body2: string;
  pip: string;
  accent?: string;
  pattern?: DicePattern;
  glow?: boolean;
  rarity?: Rarity;
  shiny?: boolean;
}

export interface Sheet {
  S: number;
  color: Uint8ClampedArray;
  height: Float32Array;
  rough: Uint8Array;
  emissive: Uint8ClampedArray | null;
  fx: Uint8ClampedArray | null;
  /** Motif orienté (cadre, écailles) : les faces ne le tournent pas. */
  fixed: boolean;
  /** Le motif reste centré (cadre gravé) : pas de décalage par face. */
  centered: boolean;
  /** Décalage horizontal seulement (ciel : l'horizon reste en place). */
  slide: boolean;
  /** Amplitude du relief du motif (en part de la profondeur d'un point). */
  relief: number;
}

type RGB = [number, number, number];
export const rgb = (hex: string): RGB => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const mixc = (a: RGB, b: RGB, k: number): RGB => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const scale = (a: RGB, k: number): RGB => [a[0] * k, a[1] * k, a[2] * k];
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (a: number, b: number, x: number) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const fract = (x: number) => x - Math.floor(x);
const hashSeed = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
/** Teinte décalée (pour enrichir un dégradé sans quitter la palette du dé). */
function hueShift(c: RGB, deg: number): RGB {
  const [r, g, b] = c.map((v) => v / 255);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  let h = 0, s = 0;
  if (mx !== mn) {
    const d = mx - mn;
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h /= 6;
  }
  h = fract(h + deg / 360);
  const f = (n: number) => { const k = (n + h * 12) % 12; const a = s * Math.min(l, 1 - l); return 255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))); };
  return [f(0), f(8), f(4)];
}

// ---------------------------------------------------------------------------------------------
// Bruits raccordables (la planche se répète sans couture).

const L = 256;
function lattice(seed: number) {
  const r = mulberry32(seed);
  const t = new Float32Array(L * L);
  for (let i = 0; i < t.length; i++) t[i] = r();
  return t;
}
/** Bruit de valeur périodique : x, y en unités de grille, période p (entier ≤ 256). */
function vnoise(t: Float32Array, x: number, y: number, p: number) {
  const xi = Math.floor(x), yi = Math.floor(y);
  let fx = x - xi, fy = y - yi;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const x0 = ((xi % p) + p) % p, y0 = ((yi % p) + p) % p, x1 = (x0 + 1) % p, y1 = (y0 + 1) % p;
  const a = t[y0 * L + x0], b = t[y0 * L + x1], c = t[y1 * L + x0], d = t[y1 * L + x1];
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

interface Vor { f1: number; f2: number; id: number; cx: number; cy: number }
/** Voronoï périodique sur une grille n×n (un germe par case). */
function voronoi(n: number, seed: number) {
  const r = mulberry32(seed);
  const jx = new Float32Array(n * n), jy = new Float32Array(n * n);
  for (let i = 0; i < n * n; i++) { jx[i] = 0.12 + r() * 0.76; jy[i] = 0.12 + r() * 0.76; }
  const out: Vor = { f1: 0, f2: 0, id: 0, cx: 0, cy: 0 };
  return (u: number, v: number): Vor => {
    const gx = Math.floor(u * n), gy = Math.floor(v * n);
    let f1 = 9, f2 = 9, id = 0, cx = 0, cy = 0;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const X = gx + dx, Y = gy + dy;
        const k = (((Y % n) + n) % n) * n + (((X % n) + n) % n);
        const px = (X + jx[k]) / n, py = (Y + jy[k]) / n;
        const d = Math.hypot(u - px, v - py) * n;
        if (d < f1) { f2 = f1; f1 = d; id = k; cx = px; cy = py; } else if (d < f2) f2 = d;
      }
    out.f1 = f1; out.f2 = f2; out.id = id; out.cx = cx; out.cy = cy;
    return out;
  };
}

// ---------------------------------------------------------------------------------------------
// Contexte de peinture d'une planche.

class Painter {
  readonly color: Uint8ClampedArray;
  readonly height: Float32Array;
  readonly rough: Uint8Array;
  emissive: Uint8ClampedArray | null = null;
  fx: Uint8ClampedArray | null = null;
  readonly rnd: () => number;
  private tabs: Float32Array[] = [];
  constructor(readonly S: number, readonly seed: number) {
    this.color = new Uint8ClampedArray(S * S * 4);
    this.height = new Float32Array(S * S);
    this.rough = new Uint8Array(S * S).fill(150);
    this.rnd = mulberry32(seed);
  }
  private tab(k: number) { return (this.tabs[k] ??= lattice(this.seed * 31 + k * 977)); }
  /** Bruit fractal raccordable dans [0, 1] environ : `base` = nombre de cellules par côté. */
  fbm(u: number, v: number, base: number, oct = 4, k = 0, gain = 0.5) {
    let s = 0, a = 1, n = 0, p = base;
    const t = this.tab(k);
    for (let o = 0; o < oct; o++) { s += a * vnoise(t, u * p + o * 17, v * p + o * 29, p); n += a; a *= gain; p *= 2; }
    return s / n;
  }
  noise(u: number, v: number, base: number, k = 0) { return vnoise(this.tab(k), u * base, v * base, base); }
  /** Parcourt chaque pixel (u, v dans [0, 1)). */
  each(f: (u: number, v: number, i: number) => void) {
    const S = this.S;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) f((x + 0.5) / S, (y + 0.5) / S, y * S + x);
  }
  set(i: number, c: RGB) { const o = i * 4; this.color[o] = c[0]; this.color[o + 1] = c[1]; this.color[o + 2] = c[2]; this.color[o + 3] = 255; }
  get(i: number): RGB { const o = i * 4; return [this.color[o], this.color[o + 1], this.color[o + 2]]; }
  glow(i: number, c: RGB) {
    this.emissive ??= blank(this.S);
    const o = i * 4, e = this.emissive;
    e[o] = Math.max(e[o], c[0]); e[o + 1] = Math.max(e[o + 1], c[1]); e[o + 2] = Math.max(e[o + 2], c[2]);
  }
  /** Masque d'effets : scintillement (0-1), phase (0-1), pulsation / reflet (0-1). */
  fxAt(i: number, spark: number, phase: number, pulse: number) {
    this.fx ??= blank(this.S);
    const o = i * 4, f = this.fx;
    if (spark * 255 > f[o]) { f[o] = spark * 255; f[o + 1] = phase * 255; }
    f[o + 2] = Math.max(f[o + 2], pulse * 255);
    if (!f[o + 1] && !spark) f[o + 1] = phase * 255;
  }
  /** Dessin vectoriel (traits nets) sur la couleur : `draw` reçoit un contexte 2D de la planche. */
  vector(draw: (g: CanvasRenderingContext2D, S: number) => void, into: 'color' | 'height' | 'emissive' = 'color') {
    const S = this.S;
    const c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d', { willReadFrequently: true })!;
    if (into === 'color') g.putImageData(new ImageData(this.color.slice(), S, S), 0, 0);
    else { g.fillStyle = '#000'; g.fillRect(0, 0, S, S); }
    // Dessin répété autour de la planche pour qu'elle reste raccordable.
    for (const [ox, oy] of [[0, 0], [-S, 0], [S, 0], [0, -S], [0, S], [-S, -S], [S, S], [-S, S], [S, -S]]) {
      g.save(); g.translate(ox, oy); draw(g, S); g.restore();
    }
    const d = g.getImageData(0, 0, S, S).data;
    if (into === 'color') this.color.set(d);
    else if (into === 'emissive') { for (let i = 0; i < S * S; i++) if (d[i * 4] | d[i * 4 + 1] | d[i * 4 + 2]) this.glow(i, [d[i * 4], d[i * 4 + 1], d[i * 4 + 2]]); }
    else {
      // Hauteur : gris 0 = rien ; le rouge creuse, le vert relève (adouci d'un léger flou).
      const S2 = S;
      const tmp = new Float32Array(S2 * S2);
      for (let i = 0; i < S2 * S2; i++) tmp[i] = (d[i * 4 + 1] - d[i * 4]) / 255;
      for (let y = 0; y < S2; y++) for (let x = 0; x < S2; x++) {
        let s = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += tmp[((y + dy + S2) % S2) * S2 + ((x + dx + S2) % S2)] * (dx || dy ? (dx && dy ? 0.0625 : 0.125) : 0.25);
        this.height[y * S2 + x] += s;
      }
    }
  }
  /** Points scintillants (paillettes, étoiles) : couleur + effet, en vectoriel net. */
  stars(n: number, opt: { color: RGB[]; min: number; max: number; flare?: number; spark?: number; seedK?: number; mask?: (u: number, v: number) => boolean }) {
    const S = this.S, r = mulberry32(this.seed + (opt.seedK ?? 7));
    const list: [number, number, number, RGB, number][] = [];
    for (let k = 0; k < n; k++) {
      const u = r(), v = r(), big = r();
      if (opt.mask && !opt.mask(u, v)) continue;
      const rad = (opt.min + (opt.max - opt.min) * big * big * big) * S / 256;
      list.push([u * S, v * S, rad, opt.color[Math.floor(r() * opt.color.length)], r()]);
    }
    this.vector((g) => {
      for (const [x, y, rad, c, ph] of list) {
        const col = `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
        const gr = g.createRadialGradient(x, y, 0, x, y, rad * 2.2);
        gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.25, col); gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.globalAlpha = 0.55 + ph * 0.45; g.fillStyle = gr; g.beginPath(); g.arc(x, y, rad * 2.2, 0, Math.PI * 2); g.fill();
        if (opt.flare && rad > opt.max * 0.45 * S / 256) {
          g.strokeStyle = col; g.lineWidth = Math.max(0.6, rad * 0.25); g.globalAlpha = 0.7;
          const f = rad * opt.flare;
          g.beginPath(); g.moveTo(x - f, y); g.lineTo(x + f, y); g.moveTo(x, y - f); g.lineTo(x, y + f); g.stroke();
        }
      }
    });
    if (opt.spark) for (const [x, y, rad, , ph] of list) {
      if (rad < opt.max * 0.3 * S / 256) continue;
      const R = Math.max(1, Math.round(rad * 1.3));
      for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
        const d = Math.hypot(dx, dy) / R; if (d > 1) continue;
        const X = ((Math.round(x) + dx) % S + S) % S, Y = ((Math.round(y) + dy) % S + S) % S;
        this.fxAt(Y * S + X, opt.spark * (1 - d * d), ph, 0);
      }
    }
  }
}
const blank = (S: number) => { const a = new Uint8ClampedArray(S * S * 4); for (let i = 3; i < a.length; i += 4) a[i] = 255; return a; };

// ---------------------------------------------------------------------------------------------
// Recettes.

interface Colors { body: RGB; body2: RGB; acc: RGB; pip: RGB }
type Recipe = (p: Painter, c: Colors, a: LookInput) => { fixed?: boolean; centered?: boolean; slide?: boolean; relief?: number } | void;

/** Fond commun : dégradé doux du corps, légèrement nuagé (jamais un aplat). */
function base(p: Painter, c: Colors, amount = 0.35, base = 3) {
  p.each((u, v, i) => { const n = p.fbm(u, v, base, 4, 9); p.set(i, mixc(c.body, c.body2, clamp01((n - 0.5) * 2 * amount + 0.25))); });
}
/** Grain fin (relief et couleur) : poudre, pierre, terre cuite. */
function grain(p: Painter, k: number, h: number, col = 0) {
  const r = mulberry32(p.seed + 99);
  p.each((_u, _v, i) => {
    const g = r() - 0.5;
    p.height[i] += g * h;
    if (col) { const c = p.get(i); p.set(i, scale(c, 1 + g * col)); }
    p.rough[i] = Math.min(255, p.rough[i] + Math.abs(g) * k);
  });
}

const RECIPES: Record<string, Recipe> = {
  // --- Communs : une matière sobre, un relief discret ---
  'dc-craie': (p, c) => {
    // Craie : poudre mate, grain serré, quelques traces de doigts plus lisses.
    p.each((u, v, i) => {
      const n = p.fbm(u, v, 4, 5, 1), sm = p.fbm(u * 0.6 + v * 0.3, v, 2, 3, 2);
      // Traces de doigts : la poudre est un peu tassée et grisée.
      const smear = smooth(0.6, 0.78, sm);
      p.set(i, mixc(mixc(c.body, c.body2, clamp01(0.2 + (n - 0.5) * 1.6)), [196, 200, 210], smear * 0.35));
      p.height[i] = (n - 0.5) * 0.6 - smear * 0.2;
      p.rough[i] = 210 - smear * 60;
    });
    // Éclats de poudre et petits grumeaux en relief.
    const r = mulberry32(p.seed + 4);
    const lumps = Array.from({ length: 160 }, () => [r(), r(), 0.5 + r() * r() * 2] as const);
    p.vector((g, S) => { for (const [u, v, s] of lumps) { g.fillStyle = 'rgba(255,255,255,0.7)'; g.beginPath(); g.arc(u * S, v * S, s * S / 256, 0, Math.PI * 2); g.fill(); } });
    p.vector((g, S) => { for (const [u, v, s] of lumps) { g.fillStyle = 'rgb(0,200,0)'; g.beginPath(); g.arc(u * S, v * S, s * S / 256, 0, Math.PI * 2); g.fill(); } }, 'height');
    grain(p, 60, 0.4, 0.08);
    return { relief: 0.5 };
  },
  'dc-ardoise': (p, c) => {
    // Ardoise : feuilletage horizontal, reflets satinés et un reste de craie effacée.
    p.each((u, v, i) => {
      const w = v + (p.fbm(u, v, 3, 3, 1) - 0.5) * 0.08;
      const layer = p.fbm(u * 0.25, w, 8, 4, 2);
      const step = Math.floor(layer * 6) / 6;
      let col = mixc(c.body, c.body2, clamp01(0.2 + (layer - 0.5) * 1.4));
      const chalk = smooth(0.66, 0.8, p.fbm(u, v, 2, 4, 3)) * 0.12;
      col = mixc(col, [235, 232, 222], chalk);
      p.set(i, col);
      p.height[i] = (step - 0.5) * 0.9 + (layer - 0.5) * 0.3;
      p.rough[i] = 175 + (layer - 0.5) * 50;
    });
    grain(p, 25, 0.12);
    return { relief: 0.7 };
  },
  'dc-brique': (p, c) => {
    // Terre cuite : taches de cuisson, grains de sable incrustés, petits pores.
    p.each((u, v, i) => {
      const n = p.fbm(u, v, 3, 5, 1);
      p.set(i, mixc(c.body, c.body2, clamp01((n - 0.35) * 1.3)));
      p.height[i] = (n - 0.5) * 0.4;
      p.rough[i] = 205;
    });
    const r = mulberry32(p.seed + 5);
    const sand: [number, number, number, boolean][] = Array.from({ length: 260 }, () => [r(), r(), 0.4 + r() * 1.3, r() < 0.55]);
    p.vector((g, S) => { for (const [u, v, s, light] of sand) { g.fillStyle = light ? 'rgba(255,228,190,0.55)' : 'rgba(60,20,10,0.5)'; g.beginPath(); g.arc(u * S, v * S, s * S / 256, 0, Math.PI * 2); g.fill(); } });
    p.vector((g, S) => { for (const [u, v, s, light] of sand) { g.fillStyle = light ? 'rgb(0,200,0)' : 'rgb(255,0,0)'; g.beginPath(); g.arc(u * S, v * S, s * S / 256, 0, Math.PI * 2); g.fill(); } }, 'height');
    grain(p, 30, 0.2, 0.06);
    return { relief: 0.8 };
  },
  'dc-menthe': (p, c) => {
    // Sirop de menthe figé dans la résine : volutes claires et petites bulles prises dedans.
    p.each((u, v, i) => {
      const w = p.fbm(u, v, 2, 4, 1);
      const sw = Math.sin((u + v * 0.6 + w * 1.4) * Math.PI * 4);
      p.set(i, mixc(mixc(c.body, c.body2, clamp01(0.3 + (w - 0.5) * 1.2)), [236, 255, 246], smooth(0.75, 1, sw) * 0.35));
      p.height[i] = 0;
      p.rough[i] = 120;
    });
    const r = mulberry32(p.seed + 3);
    const bub = Array.from({ length: 34 }, () => [r(), r(), 1 + r() * r() * 4] as const);
    p.vector((g, S) => {
      for (const [u, v, s] of bub) {
        const x = u * S, y = v * S, R = s * S / 256;
        g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = Math.max(0.5, R * 0.25);
        g.beginPath(); g.arc(x, y, R, 0, Math.PI * 2); g.stroke();
        g.fillStyle = 'rgba(255,255,255,0.8)'; g.beginPath(); g.arc(x - R * 0.35, y - R * 0.35, R * 0.28, 0, Math.PI * 2); g.fill();
      }
    });
    return { relief: 0.2 };
  },
  'dc-moutarde': (p, c) => {
    // Faïence émaillée : glaçure qui s'accumule en bord de face et fin craquelé (tressaillage).
    const vor = voronoi(9, p.seed + 1);
    p.each((u, v, i) => {
      const n = p.fbm(u, v, 3, 4, 1);
      const V = vor(u + (p.noise(u, v, 8, 2) - 0.5) * 0.02, v);
      const crack = 1 - smooth(0.0, 0.05, V.f2 - V.f1);
      let col = mixc(c.body, c.body2, clamp01(0.2 + (n - 0.5) * 0.9));
      col = mixc(col, scale(c.body2, 0.75), crack * 0.55);
      p.set(i, col);
      p.height[i] = -crack * 0.6;
      p.rough[i] = 95 + crack * 60;
    });
    return { relief: 0.4 };
  },
  'dc-lavande': (p, c) => {
    // Toucher velours, semé de petits boutons de lavande.
    base(p, c, 0.4, 3);
    p.each((_u, _v, i) => { p.rough[i] = 200; });
    const r = mulberry32(p.seed + 3);
    const buds = Array.from({ length: 70 }, () => [r(), r(), r() * Math.PI, 0.8 + r() * 1.4] as const);
    const draw = (g: CanvasRenderingContext2D, S: number, col: string) => {
      for (const [u, v, a, s] of buds) { g.save(); g.translate(u * S, v * S); g.rotate(a); g.fillStyle = col; g.beginPath(); g.ellipse(0, 0, s * 2.2 * S / 256, s * S / 256, 0, 0, Math.PI * 2); g.fill(); g.restore(); }
    };
    p.vector((g, S) => draw(g, S, `rgba(${c.body2.map((x) => (x * 0.62) | 0).join(',')},0.75)`));
    p.vector((g, S) => draw(g, S, 'rgb(0,170,0)'), 'height');
    grain(p, 20, 0.08);
    return { relief: 0.5 };
  },
  'dc-pistache': (p, c) => {
    // Céramique coquille d'œuf, mouchetée de vert sombre et de brun.
    base(p, c, 0.35, 3);
    const r = mulberry32(p.seed + 3);
    const dots = Array.from({ length: 240 }, () => [r(), r(), 0.4 + r() * r() * 2.2, r() < 0.7] as const);
    p.vector((g, S) => { for (const [u, v, s, green] of dots) { g.fillStyle = green ? 'rgba(52,70,18,0.55)' : 'rgba(96,58,22,0.5)'; g.beginPath(); g.arc(u * S, v * S, s * S / 256, 0, Math.PI * 2); g.fill(); } });
    p.each((u, v, i) => { p.height[i] = (p.fbm(u, v, 6, 3, 4) - 0.5) * 0.35; p.rough[i] = 150; });
    return { relief: 0.5 };
  },
  'dc-corail': (p, c) => {
    // Corail : surface poreuse, petits polypes en creux plus clairs au bord.
    const vor = voronoi(14, p.seed + 1);
    p.each((u, v, i) => {
      const n = p.fbm(u, v, 3, 4, 1);
      const V = vor(u, v);
      const pit = 1 - smooth(0.15, 0.32, V.f1);
      const ringL = smooth(0.25, 0.32, V.f1) * (1 - smooth(0.32, 0.42, V.f1));
      let col = mixc(c.body, c.body2, clamp01(0.25 + (n - 0.5)));
      col = mixc(col, scale(c.body2, 0.8), pit * 0.7);
      col = mixc(col, [255, 214, 196], ringL * 0.35);
      p.set(i, col);
      p.height[i] = -pit * 0.9 + ringL * 0.2;
      p.rough[i] = 175 + pit * 40;
    });
    return { relief: 0.6 };
  },
  'dc-sable': (p, c) => {
    // Grès : strates ondulées et grains de sable.
    p.each((u, v, i) => {
      const w = v + Math.sin(u * Math.PI * 2 * 2 + p.fbm(u, v, 2, 3, 1) * 4) * 0.03;
      const st = p.fbm(u * 0.3, w, 10, 3, 2);
      p.set(i, mixc(c.body, c.body2, clamp01(0.15 + (st - 0.5) * 1.6)));
      p.height[i] = (st - 0.5) * 0.6;
      p.rough[i] = 215;
    });
    grain(p, 30, 0.45, 0.1);
    return { relief: 0.6 };
  },
  'dc-cerise': (p, c) => {
    // Laque cerise en couches : profondeur sombre et voile plus clair qui ondule.
    p.each((u, v, i) => {
      const w = p.fbm(u, v, 2, 4, 1);
      const band = smooth(0.45, 0.6, p.fbm(u + w * 0.3, v, 3, 3, 2));
      p.set(i, mixc(mixc(c.body2, c.body, clamp01(0.3 + w)), [196, 52, 88], band * 0.28));
      p.rough[i] = 90;
    });
    return { relief: 0.1 };
  },

  // --- Rares ---
  'dc-tortue': (p, c) => {
    // Écaille de tortue (lunettes) : taches ambrées, brunes et presque noires, profondeur vernie.
    p.each((u, v, i) => {
      const wx = p.fbm(u, v, 3, 3, 1), wy = p.fbm(u, v, 3, 3, 2);
      const n = p.fbm(u + (wx - 0.5) * 0.35, v + (wy - 0.5) * 0.35, 3, 5, 3);
      const n2 = p.fbm(u, v, 9, 3, 4);
      const amber = mixc(c.acc, [236, 176, 92], 0.25);
      let col = n > 0.56 ? mixc(amber, c.acc, smooth(0.56, 0.7, n)) : n > 0.44 ? mixc(c.body, amber, smooth(0.44, 0.56, n)) : mixc(c.body2, c.body, smooth(0.3, 0.44, n));
      col = scale(col, 0.92 + n2 * 0.16);
      p.set(i, col);
      p.rough[i] = 100;
    });
    return { relief: 0.1 };
  },
  'dc-grenat': (p, c) => {
    // Grenat taillé : facettes planes (chacune renvoie la lumière à sa façon) et éclats de feu.
    const vor = voronoi(5, p.seed + 1);
    const r = mulberry32(p.seed + 2);
    const tilt = Array.from({ length: 25 }, () => [r() - 0.5, r() - 0.5, 0.7 + r() * 0.6] as const);
    p.each((u, v, i) => {
      const V = vor(u, v);
      const t = tilt[V.id];
      const edge = smooth(0.0, 0.06, V.f2 - V.f1);
      let col = scale(mixc(c.body2, c.body, clamp01(t[2] - 0.4)), 0.85 + t[2] * 0.25);
      col = mixc([255, 180, 170], col, 0.35 + 0.65 * edge);
      p.set(i, col);
      let du = u - V.cx, dv = v - V.cy; du -= Math.round(du); dv -= Math.round(dv);
      p.height[i] = (du * t[0] + dv * t[1]) * 9;
      p.rough[i] = 70;
      p.fxAt(i, (1 - edge) * 0.35, (V.id * 0.37) % 1, 0);
    });
    return { relief: 0.9 };
  },

  // --- Épiques ---
  'dc-lave': (p, c, a) => lavaLike(p, c, a, false),
  'dc-givre': (p, c) => {
    // Givre : glace claire, plaques givrées mates et fougères de cristaux en relief.
    p.each((u, v, i) => {
      const n = p.fbm(u, v, 3, 5, 1);
      const frosty = smooth(0.45, 0.7, n);
      p.set(i, mixc(mixc(c.body, c.body2, clamp01(0.5 - (n - 0.5) * 1.5)), [252, 254, 255], frosty * 0.55));
      p.rough[i] = 80 + frosty * 140;
      p.height[i] = frosty * 0.25;
    });
    frostFerns(p, 7, c.acc);
    p.stars(26, { color: [[255, 255, 255], [200, 235, 255]], min: 0.5, max: 1.6, spark: 0.8, seedK: 41 });
    return { relief: 0.8 };
  },
  'dc-malachite': (p, c) => {
    // Malachite : bandes concentriques serrées, claires et sombres, autour de quelques cœurs.
    const r = mulberry32(p.seed + 2);
    const seeds = Array.from({ length: 4 }, () => [r(), r()] as const);
    p.each((u, v, i) => {
      const wu = u + (p.fbm(u, v, 3, 3, 1) - 0.5) * 0.18, wv = v + (p.fbm(u, v, 3, 3, 2) - 0.5) * 0.18;
      let d = 9;
      for (const [sx, sy] of seeds) { let dx = wu - sx, dy = wv - sy; dx -= Math.round(dx); dy -= Math.round(dy); d = Math.min(d, Math.hypot(dx, dy * 1.2)); }
      const t = fract(d * 15 + p.fbm(u, v, 6, 3, 3) * 0.6);
      const band = t < 0.5 ? smooth(0.05, 0.25, t) : 1 - smooth(0.6, 0.95, t);
      const fine = 0.5 + 0.5 * Math.sin(d * 140);
      let col = mixc(c.body2, c.body, band);
      col = mixc(col, c.acc, smooth(0.75, 1, band) * 0.55 * fine);
      p.set(i, col);
      p.height[i] = (band - 0.5) * 0.12;
      p.rough[i] = 75;
    });
    return { relief: 0.25 };
  },

  // --- Légendaires ---
  'dc-aurore': (p, c) => {
    // Aurore boréale : ciel nocturne, rideaux de lumière qui ondulent, étoiles.
    const violet = mixc(hueShift(c.acc, 120), [157, 107, 255], 0.5);
    p.each((u, v, i) => {
      let col = mixc(c.body2, c.body, clamp01(1 - v * 0.9));
      let glow: RGB = [0, 0, 0];
      let pulse = 0;
      for (let k = 0; k < 2; k++) {
        const y0 = 0.35 + k * 0.32 + Math.sin(u * Math.PI * 2 * (1 + k) + k * 2) * 0.08 + (p.fbm(u, v * 0.2, 3, 3, 1 + k) - 0.5) * 0.25;
        const dy = v - y0;
        const curtain = dy > 0 ? Math.exp(-dy * dy / 0.0018) : Math.exp(-dy * dy / 0.022);
        const rays = 0.55 + 0.45 * p.noise(u, 0.5, 64, 5 + k) * p.fbm(u, v * 0.1, 32, 2, 7);
        const I = curtain * rays * (k ? 0.75 : 1);
        const tint = mixc(c.acc, violet, clamp01(-dy * 6 + 0.2));
        col = mixc(col, tint, clamp01(I * 0.95));
        glow = [Math.max(glow[0], tint[0] * I), Math.max(glow[1], tint[1] * I), Math.max(glow[2], tint[2] * I)];
        pulse = Math.max(pulse, I);
      }
      p.set(i, col);
      p.glow(i, scale(glow, 0.8));
      p.fxAt(i, 0, fract(u * 1.5), clamp01(pulse));
      p.rough[i] = 70;
    });
    p.stars(150, { color: [[255, 255, 255], [210, 255, 240]], min: 0.35, max: 1.7, flare: 3, spark: 1, seedK: 11, mask: () => true });
    return { relief: 0.05, fixed: true, slide: true };
  },
  'dl-loup-nord': (p, c, a) => lavaLike(p, c, a, true),
};

/** Coulée de lave (ou glace craquelée du loup) : plaques en relief, fissures lumineuses qui pulsent. */
function lavaLike(p: Painter, c: Colors, a: LookInput, ice: boolean) {
  const vor = voronoi(ice ? 5 : 6, p.seed + 1);
  const hot = rgb(a.pip);
  p.each((u, v, i) => {
    const wu = u + (p.fbm(u, v, 4, 3, 1) - 0.5) * 0.06, wv = v + (p.fbm(u, v, 4, 3, 2) - 0.5) * 0.06;
    const V = vor(wu, wv);
    const e = V.f2 - V.f1;
    const crack = 1 - smooth(0.0, ice ? 0.09 : 0.12, e);
    const core = 1 - smooth(0.0, 0.035, e);
    const crust = p.fbm(u, v, 8, 4, 3);
    let col = mixc(c.body2, c.body, crust);
    if (ice) col = mixc(col, [214, 230, 240], smooth(0.62, 0.8, p.fbm(u, v, 3, 4, 4)) * 0.35); // neige poudrée
    const glowC = mixc(c.acc, ice ? [235, 250, 255] : hot, core);
    col = mixc(col, glowC, crack);
    p.set(i, col);
    if (a.glow || !ice) p.glow(i, scale(glowC, crack * (ice ? 0.85 : 1)));
    p.fxAt(i, ice ? core * 0.4 : 0, fract(V.id * 0.618), crack);
    p.height[i] = (crust - 0.5) * 0.5 - crack * 1.1 + smooth(0.05, 0.2, e) * 0.3;
    p.rough[i] = 230 - crack * 130;
  });
  return { relief: 0.9 };
}

/** Fougères de givre (cristaux ramifiés), en couleur et en relief. */
function frostFerns(p: Painter, n: number, col: RGB) {
  const r = mulberry32(p.seed + 17);
  const segs: [number, number, number, number, number][] = [];
  const grow = (x: number, y: number, a: number, len: number, w: number, depth: number) => {
    const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len;
    segs.push([x, y, x2, y2, w]);
    if (depth <= 0) return;
    const steps = 3 + Math.floor(r() * 3);
    for (let k = 1; k <= steps; k++) {
      const t = k / (steps + 1), bx = x + (x2 - x) * t, by = y + (y2 - y) * t;
      const sub = len * (0.45 - t * 0.25);
      grow(bx, by, a + 1.05, sub, w * 0.6, depth - 1);
      grow(bx, by, a - 1.05, sub, w * 0.6, depth - 1);
    }
  };
  for (let k = 0; k < n; k++) grow(r(), r(), r() * Math.PI * 2, 0.12 + r() * 0.14, 1.6, 2);
  const draw = (g: CanvasRenderingContext2D, S: number, style: string, wk: number) => {
    g.strokeStyle = style; g.lineCap = 'round';
    for (const [x, y, x2, y2, w] of segs) { g.lineWidth = Math.max(0.5, w * wk * S / 256); g.beginPath(); g.moveTo(x * S, y * S); g.lineTo(x2 * S, y2 * S); g.stroke(); }
  };
  p.vector((g, S) => draw(g, S, `rgba(${col.map((x) => x | 0).join(',')},0.85)`, 1));
  p.vector((g, S) => draw(g, S, 'rgb(0,255,0)', 1.4), 'height');
}

/** Recettes par motif (dés de saison, dés sans recette propre). */
const BY_PATTERN: Record<DicePattern, Recipe> = {
  uni: (p, c) => { base(p, c, 0.45, 2); p.each((u, v, i) => { p.height[i] = (p.fbm(u, v, 5, 3, 3) - 0.5) * 0.15; }); return { relief: 0.3 }; },
  marbre: (p, c, a) => {
    // Marbre : nuages, veines principales sinueuses et veinules fines (légèrement en creux).
    const fine = a.rarity === 'epique' || a.rarity === 'legendaire';
    p.each((u, v, i) => {
      const cl = p.fbm(u, v, 3, 5, 1);
      const w = p.fbm(u, v, 2, 5, 2) * 5.5;
      const vein = Math.pow(1 - Math.abs(Math.sin((u * 2 + v * 1 + w) * Math.PI)), 14);
      const w2 = p.fbm(u, v, 4, 4, 3) * 8;
      const vein2 = Math.pow(1 - Math.abs(Math.sin((u * 3 - v * 5 + w2) * Math.PI)), 28) * (fine ? 0.7 : 0.45);
      let col = mixc(c.body2, c.body, clamp01(0.2 + cl));
      col = mixc(col, c.acc, clamp01(vein * 0.9 + vein2));
      p.set(i, col);
      p.height[i] = -(vein * 0.5 + vein2 * 0.3);
      p.rough[i] = 80 + vein * 30;
    });
    return { relief: 0.25 };
  },
  paillettes: (p, c, a) => {
    // Résine pailletée : profondeur nuageuse et paillettes hexagonales qui scintillent.
    p.each((u, v, i) => { const n = p.fbm(u, v, 3, 4, 1); p.set(i, mixc(c.body2, c.body, clamp01(0.25 + n * 0.9))); p.rough[i] = 100; });
    const r = mulberry32(p.seed + 3);
    const S = p.S;
    const flakes = Array.from({ length: 300 }, () => ({ u: r(), v: r(), s: 0.7 + r() * r() * 2.6, a: r() * Math.PI, b: r(), white: r() < 0.3, ph: r() }));
    p.vector((g) => {
      for (const f of flakes) {
        const x = f.u * S, y = f.v * S, R = f.s * S / 256;
        const col = f.white ? [255, 255, 255] : mixc(c.acc, [255, 255, 255], f.b * 0.4);
        g.fillStyle = `rgba(${col.map((x) => x | 0).join(',')},${0.35 + f.b * 0.65})`;
        g.beginPath();
        for (let k = 0; k < 6; k++) { const an = f.a + (k * Math.PI) / 3; g.lineTo(x + Math.cos(an) * R, y + Math.sin(an) * R); }
        g.fill();
      }
    });
    for (const f of flakes) if (f.b > 0.55) {
      const X = Math.floor(f.u * S), Y = Math.floor(f.v * S);
      const R = Math.max(1, Math.round(f.s * S / 256));
      for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) p.fxAt(((Y + dy + S) % S) * S + ((X + dx + S) % S), (f.b - 0.5) * 2 * (a.rarity === 'commun' ? 0.5 : 1), f.ph, 0);
    }
    return { relief: 0.15 };
  },
  bois: (p, c) => {
    // Chêne : cernes, maillures (rayons plus clairs) et pores alignés sur le fil.
    p.each((u, v, i) => {
      const w = p.fbm(u, v, 2, 4, 1);
      const ring = fract((v + w * 0.35 + Math.sin(u * Math.PI * 2) * 0.03) * 9);
      const late = smooth(0.55, 0.8, ring) * (1 - smooth(0.9, 1, ring));
      const ray = smooth(0.82, 0.95, p.fbm(u * 0.5, v, 16, 2, 2)) * 0.5;
      let col = mixc(c.body, c.body2, 0.25 + (w - 0.5) * 0.8);
      col = mixc(col, c.acc, late * 0.75);
      col = mixc(col, [240, 214, 170], ray * 0.4);
      p.set(i, col);
      p.height[i] = -late * 0.35 + ray * 0.15;
      p.rough[i] = 210 - ray * 60;
    });
    const r = mulberry32(p.seed + 3);
    const pores = Array.from({ length: 700 }, () => [r(), r(), 2 + r() * 7] as const);
    p.vector((g, S) => { g.fillStyle = `rgba(${c.acc.map((x) => (x * 0.6) | 0).join(',')},0.45)`; for (const [u, v, l] of pores) g.fillRect(u * S, v * S, l * S / 256, Math.max(0.6, 0.8 * S / 256)); });
    p.vector((g, S) => { g.fillStyle = 'rgb(255,0,0)'; for (const [u, v, l] of pores) g.fillRect(u * S, v * S, l * S / 256, Math.max(0.6, 0.8 * S / 256)); }, 'height');
    return { relief: 0.6, fixed: true };
  },
  rayures: (p, c) => {
    // Toile de transat : rayures tissées (trame en relief), fils légèrement irréguliers.
    p.each((u, v, i) => {
      const x = fract(u * 4);
      const stripe = smooth(0.06, 0.1, x) * (1 - smooth(0.46, 0.5, x));
      const weave = (Math.sin(u * Math.PI * 2 * 90) * Math.sin(v * Math.PI * 2 * 90));
      const thread = p.noise(u, v, 128, 2);
      let col = mixc(c.body, c.acc, stripe);
      col = scale(col, 0.94 + weave * 0.04 + thread * 0.06);
      p.set(i, col);
      p.height[i] = weave * 0.35 + (thread - 0.5) * 0.2;
      p.rough[i] = 225;
    });
    return { relief: 0.35, fixed: true };
  },
  ecaille: (p, c, a) => scales(p, c, a),
  galaxie: (p, c, a) => {
    // Galaxie : nébuleuses colorées en couches, poussière d'étoiles et étoiles à aigrettes.
    const tint2 = hueShift(c.acc, 55);
    p.each((u, v, i) => {
      const n = p.fbm(u, v, 2, 6, 1, 0.55);
      const m = p.fbm(u + 0.3, v, 3, 5, 2, 0.55);
      const dust = p.fbm(u, v, 6, 4, 3);
      let col = mixc(c.body2, c.body, clamp01(n * 1.2));
      const neb = smooth(0.45, 0.8, n), neb2 = smooth(0.5, 0.78, m);
      col = mixc(col, c.acc, neb * 0.55);
      col = mixc(col, tint2, neb2 * 0.4);
      col = scale(col, 0.75 + dust * 0.4);
      p.set(i, col);
      p.glow(i, scale(mixc(c.acc, tint2, neb2), (neb * 0.18 + neb2 * 0.12) * (a.glow ? 2 : 1)));
      p.fxAt(i, 0, fract(u + v), neb * 0.5);
      p.rough[i] = 70;
    });
    p.stars(520, { color: [[255, 255, 255], [220, 228, 255]], min: 0.25, max: 0.7, seedK: 5 });
    p.stars(70, { color: [[255, 255, 255], c.acc, [255, 236, 210]], min: 0.6, max: 2, flare: 3.2, spark: 1, seedK: 13 });
    return { relief: 0.05 };
  },
  craquele: (p, c, a) => {
    if (a.glow) return lavaLike(p, c, a, false);
    // Craquelé sans lueur : émail craquelé, fissures en creux teintées de la couleur du motif.
    const vor = voronoi(6, p.seed + 1);
    p.each((u, v, i) => {
      const V = vor(u + (p.fbm(u, v, 4, 3, 1) - 0.5) * 0.05, v);
      const crack = 1 - smooth(0, 0.06, V.f2 - V.f1);
      const n = p.fbm(u, v, 3, 4, 2);
      p.set(i, mixc(mixc(c.body, c.body2, n * 0.8), c.acc, crack * 0.85));
      p.height[i] = -crack * 0.8;
      p.rough[i] = 90 + crack * 80;
    });
    return { relief: 0.6 };
  },
  nacre: (p, c) => {
    // Nacre : couches ondulées aux reflets pastel (rose, vert d'eau, bleu, lilas), fines ondulations.
    const pastel: RGB[] = [[255, 226, 240], c.acc, [222, 255, 236], [228, 222, 255], [255, 244, 222]];
    p.each((u, v, i) => {
      const w = p.fbm(u, v, 2, 5, 1);
      const t = fract((u * 0.8 + v * 0.45) * 3 + w * 2.2);
      const k = t * pastel.length, j = Math.floor(k), f = smooth(0, 1, k - j);
      let col = mixc(pastel[j % pastel.length], pastel[(j + 1) % pastel.length], f);
      col = mixc(mixc(c.body, c.body2, w * 0.6), col, 0.55);
      const rip = Math.sin((t + p.fbm(u, v, 6, 2, 2) * 0.2) * Math.PI * 2 * 6);
      col = scale(col, 0.97 + rip * 0.03);
      p.set(i, col);
      p.height[i] = rip * 0.15;
      p.rough[i] = 70;
      p.fxAt(i, 0, t, 0.35 + 0.35 * rip);
    });
    return { relief: 0.25 };
  },
  degrade: (p, c) => {
    // Crépuscule : ciel en dégradé, soleil bas et voiles de nuages.
    const sun = mixc(c.body, [255, 214, 140], 0.6);
    p.each((u, v, i) => {
      const t = clamp01(u * 0.45 + v * 0.75 - 0.1);
      let col = mixc(c.body, c.acc, smooth(0, 1, t));
      const d = Math.hypot(u - 0.28, v - 0.3);
      col = mixc(col, sun, Math.exp(-d * d / 0.03) * 0.75);
      const cloud = smooth(0.55, 0.75, p.fbm(u * 0.35, v, 6, 4, 1)) * 0.35;
      col = mixc(col, scale(c.acc, 0.7), cloud);
      p.set(i, col);
      p.height[i] = cloud * 0.2;
      p.rough[i] = 100;
    });
    return { relief: 0.15, fixed: true, centered: true };
  },
  filigrane: (p, c) => filigree(p, c),
};

/** Écailles imbriquées (dragon) : chaque écaille bombée, liseré de la couleur du motif, braise dessous. */
function scales(p: Painter, c: Colors, a: LookInput) {
  const N = a.rarity === 'legendaire' ? 7 : 6; // écailles par côté
  const ROWS = 2 * N; // nombre pair : la planche reste raccordable
  const ice = luminanceOf(c.body) > 0.5;
  const ember = a.glow ? mixc(c.acc, rgb(a.pip), 0.35) : null;
  p.each((u, v, i) => {
    // Rangées décalées ; on cherche l'écaille « du dessus » (rangée la plus basse qui couvre le pixel).
    const rowH = 1 / ROWS, R = 0.6 / N;
    let best = -1, bt = 0, bdx = 0, bdy = 0, bid = 0;
    const r0 = Math.floor(v / rowH);
    for (let rr = r0 + 2; rr >= r0 - 1; rr--) {
      const cy = (rr + 0.5) * rowH, off = (rr & 1) * 0.5;
      const cxi = Math.round(u * N - off);
      for (let k = cxi - 1; k <= cxi + 1; k++) {
        const cx = (k + off) / N;
        let dx = u - cx, dy = v - cy;
        dx -= Math.round(dx); dy -= Math.round(dy);
        const d = Math.hypot(dx, dy) / R;
        if (d < 1) { best = rr; bt = d; bdx = dx / R; bdy = dy / R; bid = (((rr % 97) + 97) % 97) * 131 + (((k % 97) + 97) % 97); break; }
      }
      if (best >= 0) break;
    }
    const n = p.fbm(u, v, 6, 3, 2);
    if (best < 0) { p.set(i, c.body2); p.height[i] = -1; if (ember) p.glow(i, ember); return; }
    const dome = Math.sqrt(Math.max(0, 1 - bt * bt));
    const rim = smooth(0.8, 0.97, bt) * smooth(-0.2, 0.4, bdy);
    const ridge = Math.exp(-bdx * bdx / 0.008) * smooth(0, 0.8, bdy) * 0.6;
    let col = mixc(c.body2, c.body, clamp01(0.1 + bdy * 0.8 + n * 0.3));
    col = mixc(col, c.acc, rim * 0.95);
    col = mixc(col, ice ? [255, 255, 255] : mixc(c.acc, [255, 230, 170], 0.4), ridge * 0.4);
    const gap = smooth(0.94, 1, bt);
    col = scale(col, 1 - gap * 0.55);
    p.set(i, col);
    p.height[i] = dome * 0.9 + ridge * 0.4 - gap * 0.6;
    p.rough[i] = 110 - rim * 40;
    if (ember) p.glow(i, scale(ember, gap * 0.9 + (1 - dome) * 0.15));
    const hash = fract(Math.sin(bid * 12.9898) * 43758.5453);
    p.fxAt(i, rim * smooth(0.3, 1, bdy) * 0.35, hash, rim * 0.8 + (ember ? gap : 0));
  });
  return { relief: 1, fixed: true };
}
const luminanceOf = (c: RGB) => (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255;

/** Or massif : métal brossé, cadre gravé, rinceaux dans les angles. */
function filigree(p: Painter, c: Colors) {
  p.each((u, v, i) => {
    const brush = p.fbm(u * 0.02, v, 120, 2, 1);
    const n = p.fbm(u, v, 3, 3, 2);
    p.set(i, scale(mixc(c.body, c.body2, clamp01(0.15 + n * 0.5)), 0.9 + brush * 0.2));
    p.height[i] = (brush - 0.5) * 0.12;
    p.rough[i] = 130 + (brush - 0.5) * 80;
  });
  const S = p.S;
  const motif = (g: CanvasRenderingContext2D, S: number, line: string, w: number) => {
    const m = S * 0.075;
    g.strokeStyle = line; g.fillStyle = line; g.lineCap = 'round'; g.lineJoin = 'round';
    g.lineWidth = w * 1.4; g.strokeRect(m, m, S - 2 * m, S - 2 * m);
    g.lineWidth = w * 0.8; g.strokeRect(m * 1.45, m * 1.45, S - 2.9 * m, S - 2.9 * m);
    // Perles le long du cadre.
    for (let k = 0; k <= 16; k++) {
      const t = m * 2.2 + (k / 16) * (S - 4.4 * m);
      for (const [x, y] of [[t, m * 1.22], [t, S - m * 1.22], [m * 1.22, t], [S - m * 1.22, t]]) { g.beginPath(); g.arc(x, y, w * 0.55, 0, Math.PI * 2); g.fill(); }
    }
    // Rinceaux dans les angles : spirales qui s'enroulent vers le coin.
    for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const cx = sx > 0 ? m * 1.45 : S - m * 1.45, cy = sy > 0 ? m * 1.45 : S - m * 1.45;
      g.save(); g.translate(cx, cy); g.scale(sx, sy);
      for (const flip of [0, 1]) {
        g.save(); if (flip) { g.rotate(Math.PI / 2); g.scale(1, -1); }
        g.beginPath(); g.lineWidth = w;
        for (let t = 0; t <= 1; t += 0.02) {
          const an = t * Math.PI * 2.6, r = S * 0.11 * (1 - t * 0.8);
          const x = S * 0.03 + r * Math.cos(an) * 0.9 + t * S * 0.02, y = S * 0.12 - r * Math.sin(an) * 0.9;
          if (t === 0) g.moveTo(S * 0.0, S * 0.0); else g.lineTo(x, y);
        }
        g.stroke(); g.restore();
      }
      g.beginPath(); g.arc(S * 0.045, S * 0.045, w * 1.3, 0, Math.PI * 2); g.fill();
      g.restore();
    }
  };
  // Gravure : creux sombres (patine), arête claire de la couleur du motif.
  p.vector((g) => { g.save(); g.translate(0.8 * S / 256, 0.8 * S / 256); motif(g, S, `rgba(${c.acc.map((x) => x | 0).join(',')},0.85)`, S / 140); g.restore(); motif(g, S, 'rgba(92,58,8,0.7)', S / 170); });
  p.vector((g) => motif(g, S, 'rgb(255,0,0)', S / 150), 'height');
  // Le cadre accroche un reflet qui glisse (légendaire).
  const tmp = document.createElement('canvas'); tmp.width = tmp.height = S;
  const tg = tmp.getContext('2d', { willReadFrequently: true })!;
  motif(tg, S, '#fff', S / 110);
  const d = tg.getImageData(0, 0, S, S).data;
  for (let i = 0; i < S * S; i++) if (d[i * 4 + 3] > 40) p.fxAt(i, (d[i * 4 + 3] / 255) * 0.25, fract((i % S) / S * 0.7 + Math.floor(i / S) / S * 0.3), d[i * 4 + 3] / 255);
  p.stars(22, { color: [[255, 250, 220]], min: 0.6, max: 1.6, flare: 3, spark: 1, seedK: 23 });
  return { relief: 0.9, fixed: true, centered: true };
}

/** Éclat des brillants : étincelles en plus et masque d'effets complet (reflet irisé dans le shader). */
function shinyOverlay(p: Painter) {
  p.stars(60, { color: [[255, 255, 255], [220, 240, 255], [255, 236, 250]], min: 0.6, max: 1.9, flare: 3.4, spark: 1, seedK: 77 });
}

const sheets = new Map<string, Sheet>();
/** Planche (motif, relief, lueur, effets) d'un dé de collection, à la résolution S. */
export function lookSheet(a: LookInput, S: number): Sheet {
  const key = `${a.id}|${S}`;
  const hit = sheets.get(key);
  if (hit) return hit;
  const baseId = a.id.replace(/-brillant$/, '');
  const p = new Painter(S, hashSeed(baseId));
  const c: Colors = { body: rgb(a.body), body2: rgb(a.body2), acc: rgb(a.accent ?? a.body2), pip: rgb(a.pip) };
  const recipe = RECIPES[baseId] ?? BY_PATTERN[a.pattern ?? 'uni'] ?? BY_PATTERN.uni;
  const o = recipe(p, c, a) || {};
  if (a.shiny) shinyOverlay(p);
  const sh: Sheet = { S, color: p.color, height: p.height, rough: p.rough, emissive: p.emissive, fx: p.fx, fixed: !!o.fixed, centered: !!o.centered, slide: !!o.slide, relief: o.relief ?? 0.4 };
  // Cache borné : les aperçus de la collection créent beaucoup de planches.
  if (sheets.size > 160) sheets.delete(sheets.keys().next().value!);
  sheets.set(key, sh);
  return sh;
}

/** Placement de la planche sur chaque face : rotation (quarts de tour) et décalage. */
export function faceTransform(sh: Sheet, value: number, seed: string): { rot: number; ox: number; oy: number } {
  const r = mulberry32(hashSeed(`${seed}:${value}`));
  const rot = sh.fixed ? 0 : [0, 1, 2, 3, 1, 2][value - 1];
  const ox = sh.centered ? 0 : Math.floor(r() * sh.S), oy = sh.centered || sh.slide ? 0 : Math.floor(r() * sh.S);
  return { rot, ox, oy };
}
/** Indice dans la planche du pixel (x, y) de la face. */
export function sheetIndex(S: number, x: number, y: number, t: { rot: number; ox: number; oy: number }): number {
  let X = x, Y = y;
  if (t.rot === 1) { X = y; Y = S - 1 - x; } else if (t.rot === 2) { X = S - 1 - x; Y = S - 1 - y; } else if (t.rot === 3) { X = S - 1 - y; Y = x; }
  X = (X + t.ox) % S; Y = (Y + t.oy) % S;
  return Y * S + X;
}

/**
 * Fini (matériau 3D) d'un dé de collection. Les effets animés sont réservés aux raretés hautes ;
 * les brillants ont tous le reflet irisé et les étincelles.
 */
export interface LookFinish {
  roughness: number; clearcoat: number; clearcoatRoughness: number; specular: number;
  sheen: number; sheenColor: string; env: number; relief: number;
  metalness: number; iridescence: number; anisotropy: number;
  /** Faux effet de translucidité : bord éclairé de l'intérieur (couleur, intensité). */
  rim: [string, number];
  spark: [string, number];
  pulse: [string, number, number];
  glint: [string, number];
  holo: number;
}
export function lookFinish(a: LookInput & { roughness: number; metalness: number; clearcoat: number; iridescence?: number }): LookFinish {
  const id = a.id.replace(/-brillant$/, '');
  const leg = a.rarity === 'legendaire', epi = a.rarity === 'epique';
  const acc = a.accent ?? a.body2;
  const f: LookFinish = {
    roughness: Math.min(1, a.roughness / 0.59), clearcoat: a.clearcoat, clearcoatRoughness: 0.08 + a.roughness * 0.3, specular: 0.7,
    sheen: 0, sheenColor: '#000000', env: 0.6, relief: 1, metalness: a.metalness, iridescence: a.iridescence ?? 0, anisotropy: 0,
    rim: ['#000000', 0], spark: ['#ffffff', 0], pulse: ['#000000', 0, 2], glint: ['#ffffff', 0], holo: 0,
  };
  const p = a.pattern;
  // Matières particulières.
  if (['dc-craie', 'dc-brique', 'dc-sable', 'dc-ardoise'].includes(id)) Object.assign(f, { clearcoat: Math.min(f.clearcoat, 0.15), specular: 0.4, env: 0.35, sheen: 0.2, sheenColor: '#ffffff' });
  if (id === 'dc-lavande') Object.assign(f, { clearcoat: 0.1, sheen: 0.6, sheenColor: '#efe4ff', env: 0.4 });
  if (id === 'dc-menthe') Object.assign(f, { clearcoat: 1, clearcoatRoughness: 0.04, rim: ['#c8ffe8', 0.35] });
  if (id === 'dc-cerise') Object.assign(f, { clearcoat: 1, clearcoatRoughness: 0.03, rim: ['#ff4f7a', 0.3], env: 0.9 });
  if (id === 'dc-tortue') Object.assign(f, { rim: ['#ffb45a', 0.3], clearcoatRoughness: 0.04 });
  if (id === 'dc-grenat') Object.assign(f, { env: 1.1, rim: ['#ff3355', 0.25], spark: ['#ffd0d0', 0.6], specular: 1 });
  if (p === 'bois') Object.assign(f, { clearcoat: Math.min(0.25, a.clearcoat), clearcoatRoughness: 0.45, specular: 0.5, sheen: 0.35, sheenColor: '#ffd9a8', env: 0.35, relief: 1.2 });
  if (p === 'rayures' && id === 'dc-transat') Object.assign(f, { clearcoat: 0, specular: 0.35, sheen: 0.7, sheenColor: '#ffffff', env: 0.3 });
  if (p === 'marbre' || id === 'dc-malachite') Object.assign(f, { clearcoat: 1, clearcoatRoughness: 0.05, env: 0.85 });
  if (p === 'paillettes') Object.assign(f, { rim: [acc, 0.2], spark: ['#ffffff', a.rarity === 'commun' ? 0.6 : 1.1], clearcoatRoughness: 0.03 });
  if (p === 'galaxie') Object.assign(f, { rim: [acc, 0.35], spark: ['#ffffff', 1.4], pulse: [acc, 0.25, 1.3] });
  if (id === 'dc-aurore') Object.assign(f, { rim: [acc, 0.3], spark: ['#ffffff', 1.4], pulse: [acc, 0.9, 1.6] });
  if (id === 'dc-givre' || id === 'dl-dragon-givre') Object.assign(f, { rim: ['#e6f6ff', 0.4], spark: ['#ffffff', 1.1] });
  if (p === 'nacre') Object.assign(f, { sheen: 0.4, sheenColor: '#ffe8f6', iridescence: Math.max(f.iridescence, 1), pulse: [acc, 0.08, 0.9] });
  if (p === 'craquele' && a.glow) Object.assign(f, { pulse: [acc, 1.1, 2.4], spark: ['#ffffff', id === 'dl-loup-nord' ? 0.8 : 0] });
  if (id === 'dc-lave') Object.assign(f, { pulse: [acc, 1.3, 2.2] });
  if (p === 'filigrane') Object.assign(f, { anisotropy: 0.55, env: 1.4, spark: ['#fff6d0', 1.2], glint: ['#fff1c0', leg ? 1.1 : 0.5], relief: 1.3 });
  if (p === 'ecaille' && id !== 'dc-tortue') Object.assign(f, { relief: 1.25, spark: ['#ffe6a0', leg ? 0.9 : 0.4], glint: [acc, leg ? 0.7 : 0], pulse: [acc, a.glow ? 1 : 0, 1.8] });
  if (id === 'dl-dragon-givre') Object.assign(f, { glint: ['#ffffff', 0.8], pulse: ['#000000', 0, 1] });
  // Rareté : les effets animés restent réservés aux épiques et légendaires.
  if (!leg && !epi) { f.pulse[1] = 0; f.glint[1] = 0; if (p !== 'paillettes' && id !== 'dc-grenat') f.spark[1] = 0; }
  if (a.shiny) { f.holo = 1; f.spark = [f.spark[1] > 0 ? f.spark[0] : '#ffffff', Math.max(1.2, f.spark[1])]; f.iridescence = Math.max(a.iridescence ?? 0, luminanceOf(rgb(a.body)) > 0.5 ? 0.8 : 0.45); f.clearcoat = 1; }
  return f;
}
/** Le dé a-t-il des effets qui bougent (pour animer le rendu au repos) ? */
export const finishAnimated = (f: LookFinish) => f.spark[1] > 0 || f.pulse[1] > 0 || f.glint[1] > 0 || f.holo > 0;
