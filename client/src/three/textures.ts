/** Textures procédurales (aucun fichier image à charger) : faces des dés, feutrine, bois, cuir. */
import * as THREE from 'three';
import { mulberry32 } from '../../../shared/rng';
import type { DicePattern } from '../../../shared/progress/dice-collection';
import { paintFace, type Layer } from './dieArt';

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!] as const;
}

export interface DieStyle { body: string; body2: string; pip: string; accent?: string; pattern?: DicePattern; glow?: boolean; id?: string }
const IVORY: DieStyle = { body: '#fbf9f3', body2: '#ebe5d8', pip: '#111111' };

/** Face de dé : couleur, relief des points, points lumineux éventuels, zones métalliques. */
export function dieFace(value: number, style: DieStyle = IVORY): { map: THREE.Texture; bump: THREE.Texture; emissive: THREE.Texture | null; metal: THREE.Texture } {
  const S = 256;
  const art = { ...style, seed: style.id };
  const layer = (l: Layer) => { const [c, g] = canvas(S, S); paintFace(g, S, value, art, l); return c; };
  const map = new THREE.CanvasTexture(layer('color'));
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  const bump = new THREE.CanvasTexture(layer('bump'));
  const metal = new THREE.CanvasTexture(layer('metal'));
  let emissive: THREE.Texture | null = null;
  if (style.glow) { emissive = new THREE.CanvasTexture(layer('emissive')); emissive.colorSpace = THREE.SRGBColorSpace; }
  return { map, bump, emissive, metal };
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
  // Fibres
  for (let k = 0; k < 5000; k++) {
    const x = rng() * S, y = rng() * S, a = rng() * Math.PI * 2, l = 3 + rng() * 9;
    const light = rng() < 0.5;
    g.strokeStyle = light ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.09)';
    bg.strokeStyle = light ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.25)';
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
