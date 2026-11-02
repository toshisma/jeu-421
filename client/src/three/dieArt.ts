/**
 * Dessin d'une face de dé sur un canvas 2D : sert aux textures 3D du bac et aux aperçus de
 * l'interface (collection, vitrine), pour que les deux soient identiques.
 *
 * Lisibilité avant tout : points larges, posés sur un « lit » uni de la couleur du dé (le motif
 * ne passe jamais sous un point), liseré contrasté quand c'est nécessaire, et points jamais
 * métalliques (voir la couche « metal »).
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
export type Layer = 'color' | 'bump' | 'emissive' | 'metal';

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

/** Peint une couche de la face `value` (1 à 6) sur un canvas carré de côté S. */
export function paintFace(g: CanvasRenderingContext2D, S: number, value: number, a: DieArt, layer: Layer = 'color') {
  const r = pipRadius(value, S);
  const pips = PIPS[value];
  if (layer === 'bump') {
    g.fillStyle = '#fff'; g.fillRect(0, 0, S, S);
    for (const [x, y] of pips) {
      const pg = g.createRadialGradient(x * S, y * S, 0, x * S, y * S, r * 1.05);
      pg.addColorStop(0, '#000'); pg.addColorStop(0.8, '#222'); pg.addColorStop(1, '#fff');
      g.fillStyle = pg; g.beginPath(); g.arc(x * S, y * S, r * 1.05, 0, Math.PI * 2); g.fill();
    }
    return;
  }
  if (layer === 'metal') {
    // Blanc = métal (selon le matériau), noir = jamais métallique : les points restent lisibles.
    g.fillStyle = '#fff'; g.fillRect(0, 0, S, S);
    g.fillStyle = '#000';
    for (const [x, y] of pips) { g.beginPath(); g.arc(x * S, y * S, r * 1.25, 0, Math.PI * 2); g.fill(); }
    return;
  }
  if (layer === 'emissive') {
    g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
    if (a.pattern === 'craquele' || a.pattern === 'galaxie') paintPattern(g, S, { ...a, body: '#000', body2: '#000' }, value);
    for (const [x, y] of pips) { g.fillStyle = a.pip; g.beginPath(); g.arc(x * S, y * S, r * 0.95, 0, Math.PI * 2); g.fill(); }
    return;
  }
  // Couleur : corps dégradé, motif, puis lit uni sous chaque point, liseré si besoin, point.
  const grad = g.createRadialGradient(S / 2, S / 2, S * 0.1, S / 2, S / 2, S * 0.72);
  grad.addColorStop(0, a.body); grad.addColorStop(1, a.body2);
  g.fillStyle = grad; g.fillRect(0, 0, S, S);
  if (a.pattern && a.pattern !== 'uni') paintPattern(g, S, a, value);
  // Arêtes légèrement ombrées : le dé se détache du tapis, même quand ils sont de la même couleur.
  const edge = g.createRadialGradient(S / 2, S / 2, S * 0.5, S / 2, S / 2, S * 0.74);
  edge.addColorStop(0, 'rgba(0,0,0,0)'); edge.addColorStop(1, lum(a.body) > 0.5 ? 'rgba(0,0,0,0.22)' : 'rgba(255,255,255,0.16)');
  g.fillStyle = edge; g.fillRect(0, 0, S, S);
  const lightPip = lum(a.pip) > 0.5;
  const needRing = Math.min(contrast(a.pip, a.body), contrast(a.pip, a.body2)) < 4.5 || (a.pattern && a.pattern !== 'uni' && a.pattern !== 'degrade');
  for (const [x, y] of pips) {
    if (a.pattern && a.pattern !== 'uni') {
      // Lit uni : le motif s'arrête autour du point.
      g.fillStyle = a.body2; g.beginPath(); g.arc(x * S, y * S, r * 1.35, 0, Math.PI * 2); g.fill();
    }
    if (needRing) {
      g.fillStyle = lightPip ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.7)';
      g.beginPath(); g.arc(x * S, y * S, r * 1.18, 0, Math.PI * 2); g.fill();
    }
    // Petit reflet en bas : effet de creux éclairé par le haut.
    g.beginPath(); g.arc(x * S, y * S + S * 0.01, r, 0, Math.PI * 2);
    g.fillStyle = lum(a.body) > 0.5 ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.15)'; g.fill();
    const pg = g.createRadialGradient(x * S - r * 0.25, y * S - r * 0.3, r * 0.1, x * S, y * S, r);
    pg.addColorStop(0, a.pip); pg.addColorStop(0.8, a.pip); pg.addColorStop(1, lightPip ? 'rgba(0,0,0,0.5)' : '#000');
    g.beginPath(); g.arc(x * S, y * S, r, 0, Math.PI * 2); g.fillStyle = pg; g.fill();
  }
}

/** Image (data URL) d'une face, pour l'interface. */
const cache = new Map<string, string>();
export function faceImage(value: number, a: DieArt, size = 128): string {
  const key = `${a.seed}|${a.body}|${a.pip}|${a.pattern}|${value}|${size}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  paintFace(c.getContext('2d')!, size, value, a);
  const url = c.toDataURL('image/png');
  cache.set(key, url);
  return url;
}
