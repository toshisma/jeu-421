/**
 * Coups Fourrés : « Partager son coup fourré ». Module réutilisable (pas encore branché sur le plateau,
 * qui est en refonte) :
 *
 *   const t = new MomentTracker(me);            // pendant la partie
 *   for (const e of events) { const m = t.feed(e, view); if (m) proposerPartage(m); }
 *   const blob = await makeShareImage(m);        // image PNG 1200×630 au style du jeu
 *   await shareImage(blob, m.text);              // Web Share (fichier) si possible, sinon téléchargement
 *
 * Moments forts : retournement de veste, 4-2-1, nénette forcée, riposte qui renverse une manche,
 * victoire. L'image ne montre que les pseudos de la partie (aucune autre donnée personnelle).
 */
import { createElement } from 'react';
import { CARD_BY_ID, FAMILY_LABEL, TYPE_LABEL, type CardDef } from '../../../shared/cards/catalog';
import type { CfEvent, CfView } from '../../../shared/cards/engine';
import { FAMILY_STYLE, PAPER, RARITY_COLOR } from './meta';
import { CardArt } from './art';

export type MomentKind = 'veste' | '421' | 'nenette' | 'riposte' | 'victoire';
export interface ShareMoment {
  kind: MomentKind;
  /** Carte illustrée (null : trois dés dessinés). */
  cardId: string | null;
  /** Phrase à la 1re personne, avec les pseudos de la partie. */
  text: string;
  dice?: number[];
  /** Ordre d'intérêt (le plus fort d'abord) pour choisir quoi proposer en fin de partie. */
  weight: number;
}

export const SHARE_W = 1200;
export const SHARE_H = 630;
export const SHARE_SITE = '421online.com';

const nameOf = (v: CfView, id: string | null | undefined) => v.players.find((p) => p.id === id)?.name ?? '?';
const plural = (n: number, w: string) => `${n} ${w}${n > 1 ? 's' : ''}`;
const isCard = (id: string | undefined): id is string => !!id && !!CARD_BY_ID[id];

/**
 * Suit les événements (déjà filtrés pour le joueur) et repère les moments forts.
 * `feed` renvoie un moment à la fin de la manche (comptes) ou de la partie.
 */
export class MomentTracker {
  private roundCards: string[] = [];
  private gameCards: string[] = [];
  private nenetteOn: string | null = null;
  private myTrapRevealed: string | null = null;
  private ripostes: { card: string; cancelled: boolean }[] = [];
  private lastMine: string | null = null;
  readonly moments: ShareMoment[] = [];
  constructor(readonly me: string) {}

  feed(e: CfEvent, v: CfView): ShareMoment | null {
    switch (e.kind) {
      case 'manche':
        this.roundCards = []; this.ripostes = []; this.nenetteOn = null; this.myTrapRevealed = null;
        return null;
      case 'carte':
        if (e.player === this.me && isCard(e.card)) {
          this.roundCards.push(e.card); this.gameCards.push(e.card); this.lastMine = e.card;
          if (CARD_BY_ID[e.card].type === 'riposte') this.ripostes.push({ card: e.card, cancelled: false });
        }
        return null;
      case 'annule': {
        const r = this.ripostes[this.ripostes.length - 1];
        if (r && e.player && e.player !== this.me) r.cancelled = true;
        return null;
      }
      case 'piege-revele':
        this.myTrapRevealed = e.player === this.me && isCard(e.card) ? e.card : null;
        return null;
      case 'coup-nenette':
        if (this.myTrapRevealed === 'coup-nenette' && e.player && e.player !== this.me) this.nenetteOn = e.player;
        return null;
      case 'comptes': return this.push(this.roundMoment(v));
      case 'fin':
        if (e.player !== this.me) return null;
        return this.push(this.victory(v));
    }
    return null;
  }

  /** Le plus beau moment de la partie (pour l'écran de fin). */
  best(): ShareMoment | null {
    return [...this.moments].sort((a, b) => b.weight - a.weight)[0] ?? null;
  }

  private push(m: ShareMoment | null) { if (m) this.moments.push(m); return m; }

  private roundMoment(v: CfView): ShareMoment | null {
    const lr = v.lastRound;
    if (!lr) return null;
    const opp = lr.winner === this.me ? lr.loser : lr.winner;
    if (lr.reversed && lr.loser === this.me && lr.winner) {
      return { kind: 'veste', cardId: 'retournement-veste', weight: 5, text: `J’ai retourné la veste de ${nameOf(v, lr.winner)} : +${plural(lr.amount, 'jeton')} pour lui !` };
    }
    if (this.nenetteOn) {
      return { kind: 'nenette', cardId: 'coup-nenette', weight: 4, dice: [2, 2, 1], text: `Le coup de la nénette ! La main de ${nameOf(v, this.nenetteOn)} finit en 2-2-1.` };
    }
    const mine = lr.combos[this.me];
    if (lr.winner === this.me && mine && mine.label === '421') {
      const card = [...this.roundCards].reverse().find((id) => CARD_BY_ID[id].type !== 'piege') ?? null;
      return { kind: '421', cardId: card, weight: 3, dice: [4, 2, 1], text: `4-2-1 au comptoir contre ${nameOf(v, opp)} : ${plural(lr.amount, 'jeton')} dans sa poche !` };
    }
    const rip = this.ripostes.find((r) => r.cancelled);
    if (rip && lr.winner === this.me) {
      return { kind: 'riposte', cardId: rip.card, weight: 2, text: `Ma ${CARD_BY_ID[rip.card].name} a renversé la manche contre ${nameOf(v, opp)} !` };
    }
    return null;
  }

  private victory(v: CfView): ShareMoment {
    const others = v.players.filter((p) => p.id !== this.me).map((p) => p.name);
    const vs = others.length > 1 ? `${others.slice(0, -1).join(', ')} et ${others[others.length - 1]}` : others[0] ?? '?';
    const card = [...this.gameCards].reverse().sort((a, b) => CARD_BY_ID[b].cost - CARD_BY_ID[a].cost)[0] ?? this.lastMine;
    return { kind: 'victoire', cardId: card ?? null, weight: 1, dice: card ? undefined : [4, 2, 1], text: `J’ai gagné à Coups Fourrés contre ${vs} en ${plural(v.round, 'manche')} !` };
  }
}

// ------------------------------------------------------------------------------------------------
// Dessin (contexte 2D standard : canvas du navigateur, ou faux contexte dans les tests)

/** Coupe un texte en lignes qui tiennent dans `max` pixels. */
export function wrapText(ctx: Pick<CanvasRenderingContext2D, 'measureText'>, text: string, max: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const w of text.split(/\s+/)) {
    const t = line ? `${line} ${w}` : w;
    if (line && ctx.measureText(t).width > max) { out.push(line); line = w; } else line = t;
  }
  if (line) out.push(line);
  return out;
}

const SLAB = "'Alfa Slab One', Rockwell, Georgia, serif";
const SANS = "Barlow, 'Helvetica Neue', Arial, sans-serif";

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const PIPS: Record<number, [number, number][]> = {
  1: [[0.5, 0.5]], 2: [[0.27, 0.27], [0.73, 0.73]], 3: [[0.27, 0.27], [0.5, 0.5], [0.73, 0.73]],
  4: [[0.27, 0.27], [0.73, 0.27], [0.27, 0.73], [0.73, 0.73]], 5: [[0.27, 0.27], [0.73, 0.27], [0.5, 0.5], [0.27, 0.73], [0.73, 0.73]],
  6: [[0.27, 0.25], [0.73, 0.25], [0.27, 0.5], [0.73, 0.5], [0.27, 0.75], [0.73, 0.75]],
};
function drawDie(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, v: number, rot: number) {
  ctx.save();
  ctx.translate(x + s / 2, y + s / 2);
  ctx.rotate(rot);
  ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 8;
  rr(ctx, -s / 2, -s / 2, s, s, s * 0.2);
  ctx.fillStyle = '#fbf6e9'; ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = v === 1 || v === 4 ? '#c0262d' : '#2a1d12';
  for (const [a, b] of PIPS[v] ?? []) { ctx.beginPath(); ctx.arc(-s / 2 + a * s, -s / 2 + b * s, s * 0.095, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
}

/** Dessine la carte (cadre de sa famille, coût, nom, illustration, type, texte) à la position donnée. */
function drawCard(ctx: CanvasRenderingContext2D, d: CardDef, art: CanvasImageSource | null, x: number, y: number, w: number) {
  const k = w / 230;
  const h = 322 * k;
  const st = FAMILY_STYLE[d.family];
  ctx.save();
  ctx.shadowColor = d.rarity === 'legendaire' ? 'rgba(255,179,71,0.7)' : 'rgba(0,0,0,0.55)'; ctx.shadowBlur = 40 * k; ctx.shadowOffsetY = 14 * k;
  rr(ctx, x, y, w, h, 16 * k);
  const g = ctx.createLinearGradient(x, y, x, y + h); g.addColorStop(0, st.c1); g.addColorStop(1, st.c2);
  ctx.fillStyle = g; ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.lineWidth = 3 * k; ctx.strokeStyle = d.rarity === 'legendaire' ? '#f1cc7d' : st.edge; ctx.stroke();
  // Coût
  const cx = x + 25 * k, cy = y + 25 * k;
  ctx.beginPath(); ctx.arc(cx, cy, 16 * k, 0, Math.PI * 2);
  const cg = ctx.createRadialGradient(cx - 5 * k, cy - 5 * k, 2 * k, cx, cy, 17 * k); cg.addColorStop(0, '#ffe9a8'); cg.addColorStop(0.6, '#d4ad2f'); cg.addColorStop(1, '#8a6418');
  ctx.fillStyle = cg; ctx.fill();
  ctx.fillStyle = '#2a1a05'; ctx.font = `800 ${20 * k}px ${SANS}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(String(d.cost), cx, cy + 1 * k);
  // Nom
  ctx.textAlign = 'left'; ctx.fillStyle = '#fbf6e9';
  let fs = 17 * k;
  ctx.font = `400 ${fs}px ${SLAB}`;
  while (ctx.measureText(d.name).width > 172 * k && fs > 11 * k) { fs -= 0.5 * k; ctx.font = `400 ${fs}px ${SLAB}`; }
  ctx.fillText(d.name, x + 48 * k, cy + 1 * k);
  // Illustration
  const ax = x + 8 * k, ay = y + 46 * k, aw = 214 * k, ah = 122 * k;
  ctx.save(); rr(ctx, ax, ay, aw, ah, 8 * k); ctx.clip();
  if (art) ctx.drawImage(art, ax, ay, aw, ah); else { ctx.fillStyle = '#1c1030'; ctx.fillRect(ax, ay, aw, ah); }
  ctx.restore();
  // Type et rareté
  ctx.fillStyle = 'rgba(251,246,233,0.9)'; ctx.font = `700 ${10.5 * k}px ${SANS}`; ctx.textBaseline = 'middle';
  ctx.fillText(TYPE_LABEL[d.type].toUpperCase(), x + 12 * k, y + 181 * k);
  ctx.fillStyle = RARITY_COLOR[d.rarity];
  ctx.save(); ctx.translate(x + 214 * k, y + 181 * k); ctx.rotate(Math.PI / 4); ctx.fillRect(-4.5 * k, -4.5 * k, 9 * k, 9 * k); ctx.restore();
  // Texte sur papier crème
  const px = x + 8 * k, py = y + 192 * k, pw = 214 * k, ph = 112 * k;
  rr(ctx, px, py, pw, ph, 8 * k);
  const pg = ctx.createLinearGradient(px, py, px, py + ph); pg.addColorStop(0, PAPER.top); pg.addColorStop(1, PAPER.bottom);
  ctx.fillStyle = pg; ctx.fill();
  ctx.fillStyle = PAPER.text; ctx.textBaseline = 'top';
  ctx.font = `500 ${12.4 * k}px ${SANS}`;
  let ty = py + 8 * k;
  for (const l of wrapText(ctx, d.text, pw - 18 * k)) { ctx.fillText(l, px + 9 * k, ty); ty += 16 * k; }
  ctx.fillStyle = PAPER.flavor; ctx.font = `italic 500 ${10.6 * k}px ${SANS}`;
  ty += 3 * k;
  for (const l of wrapText(ctx, d.flavor, pw - 18 * k)) { if (ty > py + ph - 14 * k) break; ctx.fillText(l, px + 9 * k, ty); ty += 13.5 * k; }
  // Famille
  ctx.fillStyle = 'rgba(251,246,233,0.75)'; ctx.font = `700 ${9.5 * k}px ${SANS}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(FAMILY_LABEL[d.family].toUpperCase(), x + w / 2, y + 313 * k);
  ctx.restore();
}

/**
 * Dessine l'image de partage complète (1200×630) : fond violet nuit, la carte en jeu (ou trois dés),
 * la phrase, la plaque « 421 » et l'adresse du site.
 */
export function drawShareImage(ctx: CanvasRenderingContext2D, m: ShareMoment, art: CanvasImageSource | null) {
  const W = SHARE_W, H = SHARE_H;
  ctx.save();
  const bg = ctx.createRadialGradient(W * 0.3, H * 0.2, 40, W * 0.5, H * 0.5, W * 0.8);
  bg.addColorStop(0, '#5a3b85'); bg.addColorStop(0.5, '#2a1848'); bg.addColorStop(1, '#120a20');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  // Petites étoiles du menu du mode
  ctx.fillStyle = 'rgba(214,166,255,0.35)';
  for (let i = 0; i < 40; i++) { const sx = (i * 397) % W, sy = (i * 211) % H; ctx.beginPath(); ctx.arc(sx, sy, (i % 3) + 1, 0, Math.PI * 2); ctx.fill(); }
  // Halo derrière la carte
  const halo = ctx.createRadialGradient(270, 315, 20, 270, 315, 300);
  halo.addColorStop(0, m.kind === 'veste' || m.kind === 'nenette' ? 'rgba(214,166,255,0.55)' : 'rgba(255,211,107,0.5)'); halo.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = halo; ctx.fillRect(0, 0, 560, H);

  const d = m.cardId ? CARD_BY_ID[m.cardId] : undefined;
  if (d) {
    ctx.save(); ctx.translate(270, 315); ctx.rotate(-0.05); ctx.translate(-170, -238);
    drawCard(ctx, d, art, 0, 0, 340);
    ctx.restore();
  } else {
    const dice = m.dice ?? [4, 2, 1];
    dice.forEach((v, i) => drawDie(ctx, 95 + i * 125, 250 + (i === 1 ? -30 : 0), 110, v, (i - 1) * 0.18));
  }

  // Titre du mode
  const tx = 560, tw = W - tx - 70;
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#d6a6ff'; ctx.font = `800 26px ${SANS}`;
  ctx.fillText('COUPS FOURRÉS', tx, 120);
  // La phrase
  ctx.fillStyle = '#fff6e0';
  let fs = 54;
  let lines: string[];
  for (;;) {
    ctx.font = `400 ${fs}px ${SLAB}`;
    lines = wrapText(ctx, m.text, tw);
    if (lines.length * fs * 1.18 <= 300 || fs <= 30) break;
    fs -= 2;
  }
  let y = 120 + 30 + fs;
  ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowOffsetY = 4; ctx.shadowBlur = 0;
  for (const l of lines) { ctx.fillText(l, tx, y); y += fs * 1.18; }
  ctx.shadowColor = 'transparent';

  // Plaque « 421 » et adresse
  const py = H - 130;
  rr(ctx, tx, py, 150, 76, 14);
  const pg = ctx.createLinearGradient(tx, py, tx, py + 76); pg.addColorStop(0, '#f1cc7d'); pg.addColorStop(1, '#b8892c');
  ctx.fillStyle = pg; ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = '#5a3b0e'; ctx.stroke();
  ctx.fillStyle = '#2a1a05'; ctx.font = `400 48px ${SLAB}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('421', tx + 75, py + 40);
  ctx.textAlign = 'left'; ctx.fillStyle = '#fff'; ctx.font = `800 34px ${SANS}`;
  ctx.fillText(SHARE_SITE, tx + 175, py + 30);
  ctx.fillStyle = '#d6a6ff'; ctx.font = `600 22px ${SANS}`;
  ctx.fillText('Le 421 aux cartes : bluff, fouine et coups bas', tx + 175, py + 62);
  ctx.restore();
}

// ------------------------------------------------------------------------------------------------
// Navigateur : illustration SVG → image, puis canvas → PNG, puis partage

/** Code SVG autonome de l'illustration d'une carte (pour la charger comme image). */
export async function cardArtSvg(id: string): Promise<string> {
  const { renderToStaticMarkup } = await import('react-dom/server');
  const svg = renderToStaticMarkup(createElement(CardArt, { id }));
  return svg.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" width="428" height="244" ');
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => resolve(null); img.src = src; });
}

/** Génère l'image de partage (PNG 1200×630). */
export async function makeShareImage(m: ShareMoment): Promise<Blob> {
  await document.fonts?.ready.catch(() => undefined);
  let art: HTMLImageElement | null = null;
  if (m.cardId) {
    const svg = await cardArtSvg(m.cardId);
    art = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
  }
  const canvas = document.createElement('canvas');
  canvas.width = SHARE_W; canvas.height = SHARE_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Image impossible à créer sur cet appareil.');
  drawShareImage(ctx, m, art);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Image impossible à créer.'))), 'image/png'));
}

/** Partage l'image (Web Share avec fichier) ou, à défaut, la télécharge. Renvoie ce qui a été fait. */
export async function shareImage(blob: Blob, text: string): Promise<'partage' | 'telechargement' | 'annule'> {
  const file = new File([blob], 'coup-fourre-421.png', { type: 'image/png' });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try { await nav.share({ files: [file], text: `${text} · ${SHARE_SITE}`, title: 'Coups Fourrés' }); return 'partage'; }
    catch (e) { if ((e as Error)?.name === 'AbortError') return 'annule'; }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = file.name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return 'telechargement';
}
