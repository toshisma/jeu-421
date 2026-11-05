/** Textures procédurales (aucun fichier image à charger) : faces des dés, feutrine, bois, cuir. */
import * as THREE from 'three';
import { mulberry32 } from '../../../shared/rng';
import type { DicePattern } from '../../../shared/progress/dice-collection';
import { faceLook, faceSurface, paintFace, type Layer } from './dieArt';
import type { Rarity } from '../../../shared/progress/dice-collection';

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!] as const;
}

export interface DieStyle { body: string; body2: string; pip: string; accent?: string; pattern?: DicePattern; glow?: boolean; id?: string; rarity?: Rarity; shiny?: boolean }
const IVORY: DieStyle = { body: '#fbf9f3', body2: '#ebe5d8', pip: '#111111' };

export interface DieFaceMaps {
  map: THREE.Texture;
  emissive: THREE.Texture | null;
  /** Relief des points gravés (commun à tous les dés). */
  normal: THREE.Texture;
  /** R = occlusion, G = rugosité, B = métal (commun à tous les dés). */
  orm: THREE.Texture;
  /** R = vernis (absent au fond des points), G = rugosité du vernis, A = intensité des reflets (commun à tous les dés). */
  coat: THREE.Texture;
  /** Effets animés (dés de collection) : R = scintillement, G = phase, B = pulsation / reflet. */
  fx: THREE.Texture | null;
  /** Cartes de relief propres à ce dé (à libérer avec lui). */
  own: boolean;
}

const FACE = 256;
const imgTex = (img: ImageData, S: number) => { const [c, g] = canvas(S, S); g.putImageData(img, 0, 0); const t = new THREE.CanvasTexture(c); t.anisotropy = 4; t.premultiplyAlpha = false; return t; };
/** Cartes de relief : ne dépendent que de la valeur de la face, partagées par tous les dés. */
const surfaces = new Map<number, { normal: THREE.Texture; orm: THREE.Texture; coat: THREE.Texture }>();
function surface(value: number) {
  let s = surfaces.get(value);
  if (s) return s;
  s = surfaceMaps(...Object.values(faceSurface(value, FACE)) as [ImageData, ImageData], FACE);
  surfaces.set(value, s);
  return s;
}
function surfaceMaps(normal: ImageData, orm: ImageData, S: number) {
  const tex = (img: ImageData) => imgTex(img, S);
  const coat = new ImageData(S, S);
  for (let i = 0; i < orm.data.length; i += 4) {
    const pip = orm.data[i + 1] === 255; // fond peint du point
    const near = orm.data[i + 2] === 0;
    coat.data[i] = pip ? 0 : near ? 150 : 255;
    coat.data[i + 1] = pip ? 255 : near ? 200 : 150;
    coat.data[i + 2] = 0;
    coat.data[i + 3] = pip ? 90 : near ? 210 : 255; // alpha = intensité des reflets (peinture mate au fond)
  }
  return { normal: tex(normal), orm: tex(orm), coat: tex(coat) };
}

/** Face de dé : couleur, points lumineux éventuels, et cartes de relief communes. */
/**
 * Dés de collection : matière détaillée (motif, relief, rugosité, effets) à la résolution `size`
 * (512 en qualité haute, 256 en normale). Les autres dés gardent les cartes communes en 256.
 */
export function dieFace(value: number, style: DieStyle = IVORY, size = FACE): DieFaceMaps {
  const S = style.rarity ? size : FACE;
  const art = { ...style, seed: style.id };
  const look = style.rarity ? faceLook(value, art, S) : null;
  const layer = (l: Layer) => { const [c, g] = canvas(S, S); paintFace(g, S, value, art, l); return c; };
  const map = new THREE.CanvasTexture(layer('color'));
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  let emissive: THREE.Texture | null = null;
  if (style.glow || look?.emissive) { emissive = new THREE.CanvasTexture(layer('emissive')); emissive.colorSpace = THREE.SRGBColorSpace; }
  if (!look) return { map, emissive, fx: null, own: false, ...surface(value) };
  const { normal, orm } = faceSurface(value, S, look);
  const fx = imgTex(look.fx, S);
  return { map, emissive, fx, own: true, ...surfaceMaps(normal, orm, S) };
}
/** Libère les textures d'une face (les cartes communes restent partagées). */
export function disposeFace(f: DieFaceMaps) {
  f.map.dispose(); f.emissive?.dispose(); f.fx?.dispose();
  if (f.own) { f.normal.dispose(); f.orm.dispose(); f.coat.dispose(); }
}

/** Feutrine : fibres fines et irrégularités, avec une carte de relief assortie. */
export function felt(color: string, seed = 3, pattern?: 'losanges' | 'rayures' | 'tartan' | 'etoiles' | 'damier'): { map: THREE.Texture; bump: THREE.Texture } {
  const S = 512;
  const rng = mulberry32(seed);
  const [c, g] = canvas(S, S);
  const [bc, bg] = canvas(S, S);
  g.fillStyle = color;
  g.fillRect(0, 0, S, S);
  bg.fillStyle = '#808080';
  bg.fillRect(0, 0, S, S);
  // Bruit de base
  const img = g.getImageData(0, 0, S, S);
  const bimg = bg.getImageData(0, 0, S, S);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rng() - 0.5) * 22;
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
    const b = 128 + (rng() - 0.5) * 90;
    bimg.data[i] = bimg.data[i + 1] = bimg.data[i + 2] = b;
  }
  g.putImageData(img, 0, 0);
  bg.putImageData(bimg, 0, 0);
  // Nuances douces du drap (zones un peu plus claires ou plus foncées, comme un feutre brossé).
  // Dessinées aussi décalées d'un côté pour que la texture reste raccord quand elle se répète.
  for (let k = 0; k < 60; k++) {
    const x = rng() * S, y = rng() * S, r = 20 + rng() * 60, light = rng() < 0.5;
    for (const [ox, oy] of [[0, 0], [-S, 0], [S, 0], [0, -S], [0, S]]) {
      const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
      gr.addColorStop(0, light ? 'rgba(255,255,255,0.016)' : 'rgba(0,0,0,0.024)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
    }
  }
  // Fibres
  for (let k = 0; k < 9000; k++) {
    const x = rng() * S, y = rng() * S, a = rng() * Math.PI * 2, l = 2 + rng() * 8;
    const light = rng() < 0.5;
    g.strokeStyle = light ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.1)';
    bg.strokeStyle = light ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)';
    for (const ctx of [g, bg]) {
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
      ctx.stroke();
    }
  }
  if (pattern) drawPattern(g, S, pattern, rng);
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  const bump = new THREE.CanvasTexture(bc);
  for (const t of [map, bump]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 2); t.anisotropy = 8; }
  return { map, bump };
}

/** Bois : veines ondulées et nœuds discrets. */
export function wood(base: string, dark: string, seed = 11): THREE.Texture {
  const W = 1024, H = 256;
  const rng = mulberry32(seed);
  const [c, g] = canvas(W, H);
  g.fillStyle = base;
  g.fillRect(0, 0, W, H);
  // Bandes de croissance : larges variations de teinte le long du fil.
  for (let y = 0; y < H; y += 2 + rng() * 10) {
    const h = 3 + rng() * 14;
    g.globalAlpha = 0.04 + rng() * 0.1;
    g.fillStyle = rng() < 0.6 ? dark : '#ffe2b8';
    g.fillRect(0, y, W, h);
  }
  g.globalAlpha = 1;
  for (let k = 0; k < 140; k++) {
    const y0 = rng() * H;
    const amp = 2 + rng() * 6;
    const freq = 0.004 + rng() * 0.01;
    const ph = rng() * 10;
    g.strokeStyle = dark;
    g.globalAlpha = 0.05 + rng() * 0.18;
    g.lineWidth = 0.5 + rng() * 2.2;
    g.beginPath();
    for (let x = 0; x <= W; x += 8) {
      const y = y0 + Math.sin(x * freq + ph) * amp + Math.sin(x * freq * 3.1) * amp * 0.3;
      if (x === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.stroke();
  }
  for (let k = 0; k < 3; k++) {
    const x = rng() * W, y = rng() * H;
    for (let r = 14; r > 2; r -= 3) {
      g.globalAlpha = 0.12;
      g.beginPath();
      g.ellipse(x, y, r * 2.2, r, 0, 0, Math.PI * 2);
      g.stroke();
    }
  }
  // Pores : petits traits sombres alignés sur le fil.
  g.fillStyle = dark;
  for (let k = 0; k < 2600; k++) {
    g.globalAlpha = 0.08 + rng() * 0.16;
    g.fillRect(rng() * W, rng() * H, 2 + rng() * 7, 0.8);
  }
  // Reflet satiné : une veine sur deux accroche un peu la lumière.
  g.strokeStyle = '#fff3dc';
  for (let k = 0; k < 30; k++) {
    const y0 = rng() * H, amp = 2 + rng() * 5, ph = rng() * 10;
    g.globalAlpha = 0.03 + rng() * 0.05; g.lineWidth = 1 + rng() * 3;
    g.beginPath();
    for (let x = 0; x <= W; x += 8) { const y = y0 + Math.sin(x * 0.006 + ph) * amp; if (x === 0) g.moveTo(x, y); else g.lineTo(x, y); }
    g.stroke();
  }
  g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

/** Cuir : grain fin. */
export function leather(color: string, seed = 5): THREE.Texture {
  const S = 256;
  const rng = mulberry32(seed);
  const [c, g] = canvas(S, S);
  g.fillStyle = color;
  g.fillRect(0, 0, S, S);
  for (let k = 0; k < 2500; k++) {
    g.fillStyle = rng() < 0.5 ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.05)';
    g.beginPath();
    g.arc(rng() * S, rng() * S, 0.5 + rng() * 1.6, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(6, 1);
  return t;
}

/** Pierre / marbre / zinc : marbrures douces. */
export function stone(base: string, dark: string, seed = 13): THREE.Texture {
  const S = 512;
  const rng = mulberry32(seed);
  const [c, g] = canvas(S, S);
  g.fillStyle = base;
  g.fillRect(0, 0, S, S);
  for (let k = 0; k < 900; k++) {
    g.fillStyle = rng() < 0.5 ? dark : '#ffffff';
    g.globalAlpha = 0.015 + rng() * 0.03;
    g.beginPath();
    g.arc(rng() * S, rng() * S, 6 + rng() * 40, 0, Math.PI * 2);
    g.fill();
  }
  // veines
  g.strokeStyle = dark;
  for (let k = 0; k < 14; k++) {
    g.globalAlpha = 0.08 + rng() * 0.12;
    g.lineWidth = 0.6 + rng() * 1.6;
    g.beginPath();
    let x = rng() * S, y = rng() * S;
    g.moveTo(x, y);
    for (let j = 0; j < 30; j++) { x += (rng() - 0.3) * 22; y += (rng() - 0.5) * 22; g.lineTo(x, y); }
    g.stroke();
  }
  g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

/** Métal brossé : stries fines dans une seule direction. */
export function brushed(base: string, dark: string, seed = 17): THREE.Texture {
  const W = 512, H = 128;
  const rng = mulberry32(seed);
  const [c, g] = canvas(W, H);
  g.fillStyle = base;
  g.fillRect(0, 0, W, H);
  for (let k = 0; k < 900; k++) {
    g.strokeStyle = rng() < 0.5 ? dark : '#ffffff';
    g.globalAlpha = 0.05 + rng() * 0.08;
    g.lineWidth = 0.5;
    const y = rng() * H, x = rng() * W;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + 40 + rng() * 160, y);
    g.stroke();
  }
  g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Motifs imprimés sur la feutrine (dessinés par-dessus la couleur et les fibres). */
function drawPattern(g: CanvasRenderingContext2D, S: number, p: string, rng: () => number) {
  g.save();
  if (p === 'losanges') {
    const c = S / 8;
    g.strokeStyle = 'rgba(255,240,200,0.16)';
    g.lineWidth = 2;
    for (let i = -8; i <= 16; i++) {
      g.beginPath(); g.moveTo(i * c, 0); g.lineTo(i * c + S, S); g.stroke();
      g.beginPath(); g.moveTo(i * c, 0); g.lineTo(i * c - S, S); g.stroke();
    }
  } else if (p === 'rayures') {
    for (let x = 0; x < S; x += 64) {
      g.fillStyle = 'rgba(255,255,255,0.07)'; g.fillRect(x, 0, 24, S);
      g.fillStyle = 'rgba(214,170,80,0.18)'; g.fillRect(x + 30, 0, 3, S);
    }
  } else if (p === 'tartan') {
    const bands: [string, number, number][] = [['rgba(10,40,20,0.45)', 0, 40], ['rgba(10,20,50,0.35)', 96, 30], ['rgba(250,220,90,0.35)', 60, 4], ['rgba(255,255,255,0.18)', 140, 3]];
    for (const [col, o, w] of bands) for (let k = 0; k < S; k += 170) {
      g.fillStyle = col; g.fillRect(k + o, 0, w, S); g.fillRect(0, k + o, S, w);
    }
  } else if (p === 'etoiles') {
    for (let k = 0; k < 260; k++) {
      const x = rng() * S, y = rng() * S, r = rng() < 0.92 ? 0.6 + rng() * 1.1 : 1.8 + rng() * 1.4;
      g.fillStyle = `rgba(255,250,230,${0.35 + rng() * 0.55})`;
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
  } else if (p === 'damier') {
    const c = S / 8;
    g.fillStyle = 'rgba(0,0,0,0.32)';
    for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) if ((i + j) % 2) g.fillRect(i * c, j * c, c, c);
  }
  g.restore();
}
