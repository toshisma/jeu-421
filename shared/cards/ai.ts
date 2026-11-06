/**
 * « Coups Fourrés » : ordinateurs à trois niveaux.
 *
 * L'IA ne reçoit QUE la vue partielle du joueur (`viewFor`) et la liste de ses actions légales :
 * elle ne connaît ni la main adverse, ni les pièges adverses (sauf ceux qu'elle a vus avec la Fouine),
 * ni l'ordre des decks, ni les futurs dés.
 *
 *  - Débutant : garde 4, 2, 1 et les as, joue des cartes un peu au hasard.
 *  - Habitué : calcule ses lancers sur un coup d'avance, estime la valeur des cartes, un peu de bruit.
 *  - Fine fouine : programmation dynamique exacte sur les lancers restants avec les probabilités du 421,
 *    valeur de chaque carte calculée sur la situation (dés, combinaison adverse, jetons), lecture de
 *    l'information visible (Tournées, pièges posés, familles, défausses), garde des Tournées pour ses
 *    Ripostes, bluffe avec des Leurres, se méfie du Retournement de veste et du Faux 4-2-1.
 *
 * Toutes les valeurs sont exprimées en « jetons » (gagner 1 = donner un jeton de plus à l'adversaire).
 */
import { evaluate, singleThrowCdf } from '../combos';
import type { Rng } from '../rng';
import { CARD_BY_ID, type CardDef } from './catalog';
import { actionKey, beauFrere, petiteSoeurOk, type CfAction, type CfPlayerView, type CfView } from './engine';

export type CfLevel = 'debutant' | 'habitue' | 'fine-fouine';
export const CF_LEVEL_LABEL: Record<CfLevel, string> = { debutant: 'Débutant', habitue: 'Habitué', 'fine-fouine': 'Fine fouine' };

const def = (id: string): CardDef => CARD_BY_ID[id];

// ---------------------------------------------------------------------------------------------
// Tables de dés (56 tirages triés, transitions par dés gardés)

const DV = { v421: 8, v111: 7, suite: 2, autre: 1, nenetteMin: 2 };
const TRIPLES: number[][] = [];
const TIDX = new Map<number, number>();
for (let a = 6; a >= 1; a--) for (let b = a; b >= 1; b--) for (let c = b; c >= 1; c--) { TIDX.set(a * 100 + b * 10 + c, TRIPLES.length); TRIPLES.push([a, b, c]); }
const tidx = (d: number[]) => { const s = [...d].sort((x, y) => y - x); return TIDX.get(s[0] * 100 + s[1] * 10 + s[2])!; };
const T_RANK = TRIPLES.map((t) => evaluate(t, DV).rank);
const T_KIND = TRIPLES.map((t) => evaluate(t, DV).kind);
const SUBS: number[][] = [[], [0], [1], [2], [0, 1], [0, 2], [1, 2]];
/** TRANS[i][sub] : indices des tirages possibles (avec répétitions, équiprobables). */
const TRANS: number[][][] = TRIPLES.map((t) => SUBS.map((sub) => {
  const kept = sub.map((j) => t[j]);
  const n = 3 - kept.length;
  const out: number[] = [];
  const rec = (acc: number[]) => {
    if (acc.length === n) { out.push(tidx([...kept, ...acc])); return; }
    for (let f = 1; f <= 6; f++) rec([...acc, f]);
  };
  rec([]);
  return out;
}));
const FRESH = TRANS[0][0];

// Distribution d'un lancer : P(rang < r), et valeur moyenne des combinaisons au-dessus d'un rang.
const ALL216: { rank: number; value: number }[] = [];
for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) for (let c = 1; c <= 6; c++) { const e = evaluate([a, b, c], DV); ALL216.push({ rank: e.rank, value: e.value }); }
const cdfCache = new Map<number, number>();
const cdfBelow = (r: number) => { let v = cdfCache.get(r); if (v === undefined) { v = singleThrowCdf(r); cdfCache.set(r, v); } return v; };
const aboveCache = new Map<number, number>();
function avgAbove(r: number): number {
  let v = aboveCache.get(r);
  if (v === undefined) {
    const xs = ALL216.filter((x) => x.rank > r);
    v = xs.length ? xs.reduce((a, x) => a + x.value, 0) / xs.length : 0;
    aboveCache.set(r, v);
  }
  return v;
}
/**
 * Probabilité qu'un adversaire qui joue au mieux pour battre le rang `r` y parvienne en `k` lancers
 * (une égalité compte pour moitié). Programmation dynamique exacte, mise en cache.
 */
const beatCache = new Map<string, number>();
export function pBeat(r: number, k: number): number {
  const key = `${r}|${k}`;
  let v = beatCache.get(key);
  if (v !== undefined) return v;
  const stopV: number[] = T_RANK.map((x) => (x > r ? 1 : x === r ? 0.5 : 0));
  let W = stopV;
  for (let left = 1; left < k; left++) {
    const prev = W;
    W = TRIPLES.map((_, i) => {
      let b = stopV[i];
      for (let s = 0; s < 7; s++) { const outs = TRANS[i][s]; let sum = 0; for (const j of outs) sum += prev[j]; b = Math.max(b, sum / outs.length); }
      return b;
    });
  }
  let sum = 0; for (const j of FRESH) sum += W[j];
  v = sum / FRESH.length;
  beatCache.set(key, v);
  return v;
}

/** Force d'un tirage pour un adversaire : centile d'un lancer (0 à 1). */
const pct = (rank: number) => cdfBelow(rank + 0.5);

// ---------------------------------------------------------------------------------------------
// Contexte de décision

interface Mods { doubles: number; note: number; pari: number; marcel: boolean; faux: boolean; piliers: number; /** Le Fanfaron : +1 s'il gagne. */ fanfaron: boolean; /** On efface tout : s'il perd, il ne reçoit qu'un jeton. */ efface: boolean }

interface DiceCtx {
  view: CfView;
  me: CfPlayerView;
  mine: Mods;
  opps: { p: CfPlayerView; mods: Mods; done: boolean; rank: number; value: number; penalty: number }[];
  leader: boolean;
  level: CfLevel;
  /** Probabilités estimées de pièges adverses (Fine fouine). */
  qRetournement: number;
  qFaux: number;
}

function modsOf(p: CfPlayerView): Mods {
  return {
    doubles: p.r.doubles, note: p.r.noteSalee, pari: p.r.pari,
    marcel: p.habitues.some((h) => h.id === 'vieux-marcel'), faux: p.r.faux421,
    piliers: p.habitues.filter((h) => h.id === 'pilier').length,
    fanfaron: p.habitues.some((h) => h.id === 'fanfaron'),
    efface: (p.r.efface ?? 0) > 0,
  };
}
const valueOf = (i: number, m: Mods) => {
  const k = T_KIND[i];
  if (k === 'suite') return m.marcel ? 4 : 2;
  if (k === '421') return m.faux ? 2 : 8;
  return evaluate(TRIPLES[i], DV).value;
};
const VAL_CACHE = new Map<string, number>();
function valueOfC(i: number, m: Mods): number {
  const key = `${i}${m.marcel ? 1 : 0}${m.faux ? 1 : 0}`;
  let v = VAL_CACHE.get(key);
  if (v === undefined) { v = valueOf(i, m); VAL_CACHE.set(key, v); }
  return v;
}
/** Jetons donnés par le gagnant au perdant. */
function amount(winValue: number, w: Mods, l: Mods, loserNenette: boolean): number {
  if (l.efface) return 1;
  let a = winValue * 2 ** w.doubles + w.note + 2 * (w.pari + l.pari) + (w.fanfaron ? 1 : 0);
  if (l.piliers && a > 1) a = Math.max(1, a - 2);
  if (loserNenette && a < 2) a = 2;
  return a;
}

function trapRisk(view: CfView, me: CfPlayerView): { qR: number; qF: number } {
  let qR = 0, qF = 0;
  for (const t of view.traps) {
    if (t.target !== me.id || t.owner === me.id) continue;
    const o = view.players.find((p) => p.id === t.owner)!;
    if (t.id) { if (t.id === 'retournement-veste') qR = 1; if (t.id === 'faux-421') qF = 1; continue; }
    if (!o.families.includes('pieges')) continue;
    const seenR = o.discard.some((k) => k.id === 'retournement-veste');
    if (!seenR) qR = 1 - (1 - qR) * (1 - 0.12);
    const seenF = o.discard.filter((k) => k.id === 'faux-421').length;
    if (seenF < 2) qF = 1 - (1 - qF) * (1 - 0.15);
  }
  return { qR, qF };
}

function buildCtx(view: CfView, level: CfLevel): DiceCtx {
  const me = view.players.find((p) => p.id === view.you)!;
  const opps = view.order.filter((id) => id !== me.id).map((id) => {
    const p = view.players.find((x) => x.id === id)!;
    const mods = modsOf(p);
    let rank = 0, value = 0;
    if (p.r.done) {
      if (p.r.forcedNenette) { rank = 0; value = 1; } else { const i = tidx(p.r.dice); rank = T_RANK[i]; value = valueOfC(i, mods); }
    }
    return { p, mods, done: p.r.done, rank, value, penalty: p.r.throwPenalty };
  });
  const { qR, qF } = level === 'fine-fouine' && CF_AI_TUNING.risk ? trapRisk(view, me) : { qR: 0, qF: 0 };
  return { view, me, mine: modsOf(me), opps, leader: view.order[0] === me.id, level, qRetournement: qR, qFaux: qF };
}

/** Utilité d'une combinaison finale (en jetons), `used` = lancers utilisés (fixe la limite des suivants si l'on mène). */
function utility(ctx: DiceCtx, i: number, used: number, rankOverride?: number): number {
  const rank = rankOverride ?? T_RANK[i];
  const myVal = rankOverride === 0 ? 1 : valueOfC(i, ctx.mine);
  const iAmNenette = rankOverride === 0 || T_KIND[i] === 'nenette';
  const myTok = ctx.me.tokens;
  const duel = ctx.opps.length === 1;
  let pBest = 1, pWorst = 1, lossSum = 0, lossW = 0, gainSum = 0;
  for (const o of ctx.opps) {
    let pBelow: number, lossIfBeat: number;
    if (o.done) {
      pBelow = rank > o.rank ? 1 : rank === o.rank ? 0.5 : 0;
      lossIfBeat = amount(o.value, o.mods, ctx.mine, iAmNenette);
      if (rank === o.rank && duel) { pBelow = 0; lossIfBeat = 0; }
    } else {
      const k = Math.max(1, (ctx.leader ? Math.min(3, used) : 3) - o.penalty);
      pBelow = ctx.level === 'fine-fouine' && CF_AI_TUNING.exactBeat ? 1 - pBeat(rank, k) : Math.pow(cdfBelow(rank), k * 1.35);
      lossIfBeat = amount(Math.max(1, avgAbove(rank)), o.mods, ctx.mine, iAmNenette);
    }
    pBest *= pBelow;
    const pAbove = o.done ? (rank < o.rank ? 1 : 0) : 1 - pBelow;
    pWorst *= pAbove;
    if (pAbove > 0) { lossSum += pAbove * lossIfBeat; lossW += pAbove; }
    const oTie = o.done && duel && rank === o.rank;
    if (oTie) { pWorst = 0; }
    gainSum += amount(myVal, ctx.mine, o.mods, false);
  }
  let gain = gainSum / ctx.opps.length;
  const loss = lossW > 0 ? lossSum / lossW : 0;
  if (ctx.level === 'fine-fouine') {
    if (T_KIND[i] === '421' && !ctx.mine.faux && rankOverride === undefined) {
      const g2 = amount(2, ctx.mine, ctx.opps[0].mods, false);
      gain = (1 - ctx.qFaux) * gain + ctx.qFaux * g2;
    }
    if (gain >= 5) gain *= 1 - ctx.qRetournement; // le Retournement : je ne donne plus rien
  }
  // Fin de partie : donner tous ses jetons fait gagner ; en recevoir quand l'autre est à sec le fait gagner.
  const endB = ctx.level === 'fine-fouine' ? CF_AI_TUNING.endBonus : 0;
  if (gain >= myTok) gain += endB;
  const minOpp = Math.min(...ctx.opps.map((o) => o.p.tokens));
  let lossEff = loss;
  if (duel && loss >= minOpp) lossEff += endB;
  // Prudence en fin de partie : recevoir beaucoup coûte plus quand on est presque à zéro.
  return pBest * gain - pWorst * lossEff;
}

interface Solved { V: number[][]; best: number[][]; limit: number }

function solve(ctx: DiceCtx, limit: number, fromUsed: number, depth: number): Solved {
  const V: number[][] = [];
  const best: number[][] = [];
  for (let used = limit; used >= Math.max(1, fromUsed); used--) {
    const row: number[] = new Array(TRIPLES.length);
    const brow: number[] = new Array(TRIPLES.length);
    for (let i = 0; i < TRIPLES.length; i++) {
      let b = utility(ctx, i, used);
      let bs = -1;
      const canRoll = used < limit && (limit - used <= depth || used === fromUsed);
      if (canRoll) {
        const next = V[used + 1];
        for (let s = 0; s < 7; s++) {
          const outs = TRANS[i][s];
          let sum = 0;
          if (next) for (const j of outs) sum += next[j];
          else for (const j of outs) sum += utility(ctx, j, used + 1);
          const e = sum / outs.length;
          if (e > b + 1e-9) { b = e; bs = s; }
        }
      }
      row[i] = b; brow[i] = bs;
    }
    V[used] = row; best[used] = brow;
  }
  return { V, best, limit };
}

/** Valeur de la situation (dés actuels, lancers utilisés) avec une limite donnée. */
const SOLVED = new WeakMap<DiceCtx, Map<string, Solved>>();
function solveC(ctx: DiceCtx, limit: number, fromUsed: number, depth: number): Solved {
  let m = SOLVED.get(ctx);
  if (!m) { m = new Map(); SOLVED.set(ctx, m); }
  const key = `${limit}|${fromUsed}|${depth}`;
  let sol = m.get(key);
  if (!sol) { sol = solve(ctx, limit, fromUsed, depth); m.set(key, sol); }
  return sol;
}

function valueNow(ctx: DiceCtx, dice: number[], used: number, limit: number, depth = 9): number {
  if (used === 0) {
    const sol = solveC(ctx, limit, 1, depth);
    let sum = 0; for (const j of FRESH) sum += sol.V[1][j];
    return sum / FRESH.length;
  }
  if (used >= limit) return utility(ctx, tidx(dice), used);
  const sol = solveC(ctx, limit, used, depth);
  return sol.V[used][tidx(dice)];
}

// ---------------------------------------------------------------------------------------------
// Valeur des ressources

/** Réglages de l'IA (modifiables par les scripts d'équilibrage). */
export const CF_AI_TUNING = { verreLater: 0.45, hbSkip: 0.6, hbDiceNoise: 0.4, hbOverflow: false, hbStingy: 1.5, hbNoise: 0.6, ffNoise: 0, ffBias: 0, exactBeat: true, ffDepth: 9, hold: 1, tv: 0.4, cv: 0.55, ffMargin: 0.45, hbMargin: 0.15, reservePenalty: 0.5, risk: true, riposteRisk: true, endBonus: 6 };
let TV = CF_AI_TUNING.tv;
let CV = CF_AI_TUNING.cv;

const STATIC: Record<string, number> = {
  patron: 2.0, josiane: 1.6, 'vieux-marcel': 0.9 + 0.55, pilier: 1.2, videur: 1.0, 'beau-frere': 1.1, mouchard: 0.9,
  leurre: 0.35, 'gueule-bois': 0.9, 'croche-patte': 0.8, 'main-sac': 1.0, 'ardoise-piegee': 0.7,
  'faux-421': 1.1, 'coup-nenette': 1.1, 'retournement-veste': 1.6,
  fanfaron: 1.0, complice: 0.6, 'verre-de-trop': 0.7, 'courant-air': 0.8, engrenage: 0.9,
};

/** Valeur « en main » d'une carte (mulligan, défausse, Calcul mental). */
function keepValue(id: string, me: CfPlayerView): number {
  const d = def(id);
  let v = 1.0;
  if (d.type === 'habitue') v = 1.2 + (STATIC[id] ?? 0) * 0.4;
  if (d.type === 'riposte') v = 1.3;
  if (d.type === 'piege') v = 0.9 + (STATIC[id] ?? 0) * 0.3;
  if (d.type === 'dernier-mot') v = 0.8;
  if (['bon-numero', 'double-tournee', 'cul-sec', 'coup-pouce', 'tete-tourne'].includes(id)) v = 1.3;
  if (id === 'coup-coude' || id === 'tournee-patron' || id === 'petite-soeur' || id === 'efface-tout') v = 1.0;
  if (id === 'trinquer' || id === 'verre-offert') v = 1.1;
  if (d.cost > me.tournees + 2) v -= 0.3;
  if (d.rarity === 'legendaire') v += 0.3;
  return v;
}

// ---------------------------------------------------------------------------------------------
// Décision

type Play = Extract<CfAction, { type: 'play' }>;

/** Cartes jouées au plus par l'ordinateur pendant son tour, dans une manche. */
const MAX_PLAYS = 8;

export function cfDecide(view: CfView, legal: CfAction[], level: CfLevel, rng: Rng): CfAction {
  // Une Tournée vaut d'autant plus qu'elles sont rares.
  TV = CF_AI_TUNING.tv * (2 / Math.max(1, view.rules.tourneesPerRound)); CV = CF_AI_TUNING.cv;
  if (!legal.length) throw new Error("L'ordinateur n'a aucune action possible");
  if (legal.length === 1) return legal[0];
  const me = view.players.find((p) => p.id === view.you)!;
  const handId = (uid: string) => me.hand!.find((k) => k.uid === uid)?.id ?? '';
  // Garde-fou (0.40) : pendant son tour, pas plus de MAX_PLAYS cartes par manche. Certaines suites (Mise en
  // bouche, Tant qu'on y est, pioches) peuvent tourner en rond quand le deck est presque vide.
  if (view.decision === 'turn' && me.r.played >= MAX_PLAYS) {
    const rest = legal.filter((a) => a.type !== 'play');
    if (rest.length) legal = rest;
    if (legal.length === 1) return legal[0];
  }
  switch (view.decision) {
    case 'mulligan': return mulligan(view, legal, level, rng);
    case 'discard': {
      const worst = [...me.hand!].sort((a, b) => keepValue(a.id, me) - keepValue(b.id, me) + (level === 'debutant' ? rng() - 0.5 : 0))[0];
      return legal.find((a) => a.type === 'discard' && a.card === worst.uid) ?? legal[0];
    }
    case 'choice': return choose(view, legal, level, rng);
    case 'respond': return respond(view, legal, level, rng, handId);
    case 'lastword': return lastword(view, legal, level, rng, handId);
    case 'turn': return turn(view, legal, level, rng, handId);
  }
  return legal[0];
}

function mulligan(view: CfView, legal: CfAction[], level: CfLevel, rng: Rng): CfAction {
  const me = view.players.find((p) => p.id === view.you)!;
  if (level === 'debutant') return legal[Math.floor(rng() * Math.min(legal.length, 3))];
  const scored = me.hand!.map((k) => ({ k, v: keepValue(k.id, me) + (level === 'habitue' ? (rng() - 0.5) * 0.3 : 0) })).sort((a, b) => a.v - b.v);
  const back = scored.filter((x) => x.v < 0.95).slice(0, 2).map((x) => x.k.uid).sort();
  const key = actionKey({ type: 'mulligan', cards: back });
  return legal.find((a) => actionKey(a) === key) ?? legal[0];
}

function choose(view: CfView, legal: CfAction[], level: CfLevel, rng: Rng): CfAction {
  const me = view.players.find((p) => p.id === view.you)!;
  const ch = view.choice!;
  if (level === 'debutant') return legal[Math.floor(rng() * legal.length)];
  if (ch.kind === 'calcul' && 'cards' in ch) {
    let bi = 0, bv = -1;
    ch.cards.forEach((k, i) => { const v = keepValue(k.id, me); if (v > bv) { bv = v; bi = i; } });
    return { type: 'choose', index: bi };
  }
  if (ch.kind === 'fouine' && 'cardId' in ch) {
    const worth = ch.cardId !== 'leurre' && (STATIC[ch.cardId] ?? 0.5) > TV;
    return legal.find((a) => a.type === 'choose' && a.index === (worth ? 1 : 0)) ?? legal[0];
  }
  // Tournée générale : relancer un dé ?
  const ctx = buildCtx(view, level);
  const used = me.r.throwsUsed;
  const limit = me.throwLimit ?? used;
  const base = valueNow(ctx, me.r.dice, used, limit);
  let best: CfAction = { type: 'choose', index: -1 }, bv = base;
  for (let i = 0; i < 3; i++) {
    let sum = 0;
    for (let f = 1; f <= 6; f++) { const d = [...me.r.dice]; d[i] = f; sum += valueNow(ctx, d, used, limit); }
    if (sum / 6 > bv + 0.02) { bv = sum / 6; best = { type: 'choose', index: i }; }
  }
  return best;
}

// --- Évaluation d'une carte jouée pendant son tour --------------------------------------------

interface Eval { action: CfAction; score: number }

function turn(view: CfView, legal: CfAction[], level: CfLevel, rng: Rng, handId: (u: string) => string): CfAction {
  const me = view.players.find((p) => p.id === view.you)!;
  if (level === 'debutant') return turnDebutant(view, legal, rng, handId);
  const ctx = buildCtx(view, level);
  const used = me.r.throwsUsed;
  const limit = me.throwLimit ?? 3;
  const depth = level === 'fine-fouine' ? CF_AI_TUNING.ffDepth : 1;
  const noise = () => (level === 'habitue' ? (rng() - 0.5) * CF_AI_TUNING.hbNoise : (rng() - 0.5) * CF_AI_TUNING.ffNoise + CF_AI_TUNING.ffBias);

  // 1. Dés : lancer / garder / s'arrêter
  let diceBest: CfAction | null = null;
  let diceVal = -Infinity;
  if (used === 0) {
    diceBest = legal.find((a) => a.type === 'roll') ?? null;
    diceVal = valueNow(ctx, me.r.dice, 0, limit, depth);
  } else {
    const sol = solveC(ctx, limit, used, depth);
    const idx = [0, 1, 2].sort((a, b) => me.r.dice[b] - me.r.dice[a]);
    const ti = tidx(me.r.dice);
    const stopV = utility(ctx, ti, used);
    diceVal = sol.V[used][ti];
    let bs = sol.best[used][ti];
    if (level === 'habitue' && used < limit && CF_AI_TUNING.hbDiceNoise > 0) {
      // L'Habitué joue « au feeling » : ses estimations sont approximatives.
      const amp = CF_AI_TUNING.hbDiceNoise;
      let bv = stopV + (rng() - 0.5) * amp;
      bs = -1;
      for (let k = 0; k < 7; k++) {
        const outs = TRANS[ti][k];
        let sum = 0;
        for (const j of outs) sum += sol.V[used + 1] ? sol.V[used + 1][j] : utility(ctx, j, used + 1);
        const e = sum / outs.length + (rng() - 0.5) * amp;
        if (e > bv) { bv = e; bs = k; }
      }
    }
    if (bs < 0 || used >= limit) diceBest = legal.find((a) => a.type === 'stop') ?? null;
    else {
      const keep = [false, false, false];
      for (const j of SUBS[bs]) keep[idx[j]] = true;
      diceBest = legal.find((a) => a.type === 'roll' && a.keep.every((k, i) => k === keep[i])) ?? legal.find((a) => a.type === 'stop') ?? null;
    }
  }

  // 2. Cartes, Josiane, ardoise
  const evals: Eval[] = [];
  const oppRiposteRisk = level === 'fine-fouine' && CF_AI_TUNING.riposteRisk ? riposteRisk(view, me) : 0;
  const reserve = level === 'fine-fouine' ? riposteReserve(me) : 0;
  for (const a of legal) {
    if (a.type === 'josiane') {
      let sum = 0;
      for (let f = 1; f <= 6; f++) { const d = [...me.r.dice]; d[a.die] = f; sum += valueNow(ctx, d, used, limit, depth); }
      evals.push({ action: a, score: sum / 6 - diceVal - 0.05 + noise() });
    } else if (a.type === 'play') {
      const id = handId(a.card);
      const d = def(id);
      const cost = costNow(me, id);
      // Les Tournées qui déborderaient de la réserve à la prochaine distribution ne valent rien.
      const income = me.ardoiseSkip ? 0 : view.rules.tourneesPerRound;
      const overflow = level === 'habitue' && !CF_AI_TUNING.hbOverflow ? 0 : Math.max(0, me.tournees + income - view.rules.tourneesMax);
      const paid = Math.max(0, cost - overflow) * (level === 'habitue' ? CF_AI_TUNING.hbStingy : 1);
      let g = cardGain(view, ctx, me, id, a, used, limit, diceVal, depth, level);
      if (g === null) continue;
      if (d.cost >= 2 && d.type !== 'piege') g *= 1 - oppRiposteRisk;
      let score = g - paid * TV - (d.type === 'coup' || d.type === 'piege' ? 0.12 : 0.05) + noise();
      if (level === 'fine-fouine') score -= holdValue(view, me, id);
      if (reserve > 0 && me.tournees - cost < reserve && (id !== 'mise-bouche')) score -= CF_AI_TUNING.reservePenalty;
      evals.push({ action: a, score });
    }
  }
  if (level === 'fine-fouine' && !me.ardoiseUsed && legal.some((a) => a.type === 'ardoise')) {
    // L'ardoise : seulement si elle permet tout de suite un gros coup inabordable.
    const big = me.hand!.some((k) => { const c = costNow(me, k.id); return c > me.tournees && c <= me.tournees + 3 && ['bon-numero', 'retournement-veste', 'patron', 'double-tournee', 'tournee-generale', 'videur'].includes(k.id); });
    if (big && me.tournees <= 2) evals.push({ action: { type: 'ardoise' }, score: 0.3 });
  }
  evals.sort((x, y) => y.score - x.score);
  // L'Habitué laisse parfois passer une occasion.
  if (level === 'habitue' && evals.length && rng() < CF_AI_TUNING.hbSkip) evals.length = 0;
  if (evals.length && evals[0].score > 0.05) return evals[0].action;
  return diceBest ?? legal[0];
}

/** Fine fouine : valeur de garder une carte de situation pour un meilleur moment. */
const HOLD: Record<string, number> = {
  'bon-numero': 1.0, 'coup-pouce': 0.45, 'tete-tourne': 0.4, 'cul-sec': 0.4, 'double-tournee': 0.9, 'pari-comptoir': 0.4,
  'de-sous-table': 0.6, 'tournee-generale': 0.9, 'grand-enchainement': 0.6,
};
function holdValue(view: CfView, me: CfPlayerView, id: string): number {
  const h = HOLD[id] ?? 0;
  if (!h) return 0;
  const minTok = Math.min(...view.players.filter((p) => !p.out).map((p) => p.tokens));
  return h * CF_AI_TUNING.hold * Math.min(1, minTok / 8) * (me.tournees >= def(id).cost + 2 ? 0.8 : 1);
}

function costNow(me: CfPlayerView, id: string): number {
  return Math.max(0, def(id).cost - beauFrere(me, id) - me.r.discount);
}

function riposteRisk(view: CfView, me: CfPlayerView): number {
  // Un adversaire qui a des Tournées, des cartes et la famille Chaînes ou Habitués peut annuler.
  let r = 0;
  for (const o of view.players) {
    if (o.id === me.id || o.out) continue;
    if (o.handCount === 0) continue;
    if (o.families.includes('chaines') && o.tournees >= 2) r = Math.max(r, 0.2);
    if (o.families.includes('habitues') && o.tournees >= 1) r = Math.max(r, 0.08);
  }
  return r;
}
function riposteReserve(me: CfPlayerView): number {
  let r = 0;
  for (const k of me.hand!) { const d = def(k.id); if (d.type === 'riposte') r = Math.max(r, d.cost); }
  return r;
}

function withMods(ctx: DiceCtx, patch: Partial<Mods>): DiceCtx {
  return { ...ctx, mine: { ...ctx.mine, ...patch } };
}

/** Gain (en jetons) d'un Coup / Piège / Habitué pour l'IA, ou null si sans intérêt. */
function cardGain(view: CfView, ctx: DiceCtx, me: CfPlayerView, id: string, a: Play, used: number, limit: number, base: number, depth: number, level: CfLevel): number | null {
  const opps = view.players.filter((p) => p.id !== me.id && !p.out);
  const target = a.target ? view.players.find((p) => p.id === a.target) : undefined;
  const lateGame = Math.min(me.tokens, ...opps.map((o) => o.tokens)) <= 4;
  // Piocher plus que le deck n'en contient fait mélanger la défausse… et recevoir un jeton.
  // Piocher dans un deck vide : on remélange sa défausse et on reçoit 1 jeton ; la carte piochée ne
  // compte plus (sinon l'ordinateur peut rejouer en boucle Mise en bouche ou Coup de coude).
  const drawCost = (n: number) => (me.deckCount < n ? 1.2 + CV * (n - me.deckCount) : 0);
  switch (id) {
    case 'grand-enchainement':
      if (!me.r.lastCoup) return 2 * CV - drawCost(2);
      return cardGain(view, ctx, me, me.r.lastCoup, a, used, limit, base, depth, level);
    case 'tete-tourne': case 'coup-pouce': case 'bon-numero': {
      const d = [...me.r.dice];
      if (id === 'tete-tourne') d[a.die!] = 7 - d[a.die!];
      else if (id === 'coup-pouce') d[a.die!] += a.delta!;
      else d[a.die!] = a.face!;
      return valueNow(ctx, d, used, limit, depth) - base;
    }
    case 'cul-sec':
      // 0.40 : Cul sec pioche aussi une carte.
      if (used < limit && used > 0) return valueNow(ctx, me.r.dice, used, limit + 1, depth) - base - 0.15 + CV - drawCost(1);
      return valueNow(ctx, me.r.dice, used, limit + 1, depth) - base + CV - drawCost(1);
    case 'double-tournee':
      return valueNow(withMods(ctx, { doubles: ctx.mine.doubles + 1 }), me.r.dice, used, limit, depth) - base;
    case 'pari-comptoir':
      return valueNow(withMods(ctx, { pari: ctx.mine.pari + 1 }), me.r.dice, used, limit, depth) - base;
    case 'de-sous-table': {
      if (a.target === me.id) {
        // Pas d'adversaire fini : relancer un de ses dés (moyenne sur les 6 faces).
        let s2 = 0;
        for (let f = 1; f <= 6; f++) { const d = [...me.r.dice]; d[a.die!] = f; s2 += valueNow(ctx, d, used, limit, depth); }
        return s2 / 6 - base;
      }
      const o = ctx.opps.find((x) => x.p.id === a.target)!;
      let sum = 0;
      for (let f = 1; f <= 6; f++) {
        const od = [...o.p.r.dice]; od[a.die!] = f;
        const i = tidx(od);
        const o2 = { ...o, rank: T_RANK[i], value: valueOfC(i, o.mods) };
        sum += valueNow({ ...ctx, opps: ctx.opps.map((x) => (x === o ? o2 : x)) }, me.r.dice, used, limit, depth);
      }
      return sum / 6 - base;
    }
    case 'tournee-generale': {
      if (!a.target) {
        let s2 = 0;
        const sol = used >= limit ? null : solve(ctx, limit, used, depth);
        for (const k of FRESH) s2 += sol ? sol.V[used][k] : utility(ctx, k, used);
        return s2 / FRESH.length - base;
      }
      const o = ctx.opps.find((x) => x.p.id === a.target)!;
      let sum = 0; const N = level === 'fine-fouine' ? 24 : 8;
      for (let n = 0; n < N; n++) {
        const j = FRESH[(n * 97 + 13) % 216];
        const o2 = { ...o, rank: T_RANK[j], value: valueOfC(j, o.mods) };
        const c2 = { ...ctx, opps: ctx.opps.map((x) => (x === o ? o2 : x)) };
        if (used >= limit) { let s2 = 0; for (const k of FRESH) s2 += utility(c2, k, used); sum += s2 / 216 + 0.15; }
        else { const sol = solve(c2, limit, used, depth); let s2 = 0; for (const k of FRESH) s2 += sol.V[used][k]; sum += s2 / 216 + 0.1; }
      }
      return sum / N - base;
    }
    case 'tournee-patron': return Math.min(2, view.rules.tourneesMax - me.tournees) * TV + (me.tournees <= 1 ? 0.2 : 0) + CV - drawCost(1);
    case 'coup-coude': return CV + 0.1 - drawCost(1);
    // Le Pourboire : un jeton de moins tout de suite ; le dernier fait gagner la partie.
    case 'pourboire': return 1 + CV - drawCost(1) + (me.tokens <= 1 ? CF_AI_TUNING.endBonus : 0);
    case 'calcul-mental': return me.deckCount > 0 ? CV + 0.25 : null;
    case 'mise-bouche': {
      // La prochaine carte est gratuite : utile si une carte chère (hors Dernier mot et Riposte) attend en main.
      const saved = Math.max(0, ...me.hand!.filter((k) => k.id !== 'mise-bouche' && !['dernier-mot', 'riposte'].includes(def(k.id).type)).map((k) => def(k.id).cost));
      if (me.r.discount > 0) return null; // la réduction en cours serait perdue
      return CV - drawCost(1) + (saved >= 2 ? saved * TV * 0.8 : 0);
    }
    case 'domino': return target && target.tournees > 0 ? target.tournees * TV * 0.9 : null;
    case 'verre-offert': {
      const o = ctx.opps.find((x) => x.p.id === a.target);
      if (!o) return null;
      if (!o.done && view.order.indexOf(o.p.id) > view.order.indexOf(me.id)) {
        // Il jouera après moi cette manche : un seul lancer pour battre ma combinaison.
        const c2 = { ...ctx, opps: ctx.opps.map((x) => (x === o ? { ...o, penalty: 3 } : x)) };
        return valueNow(c2, me.r.dice, used, limit, depth) - base;
      }
      return o.p.penaltyNext > 0 ? null : CF_AI_TUNING.verreLater;
    }
    case 'vide-poches':
      return target && target.handCount > 0 ? CV + 0.15 + (target.handCount <= 2 ? 0.25 : 0) : null;
    case 'tant-qu-on-y-est': {
      // Une carte contre des Tournées : intéressant à partir de 2.
      const n = Math.min(me.r.played + 2, view.rules.tourneesMax - me.tournees);
      return n >= 2 ? n * TV - 0.1 : null;
    }
    case 'petite-soeur': {
      const top = [...me.discard].reverse().find(petiteSoeurOk);
      if (!top) return null;
      // On échange la petite sœur contre la carte reprise : seulement si celle-ci vaut plus.
      return CV * (keepValue(top.id, me) - keepValue('petite-soeur', me)) + def(top.id).cost * TV * 0.6;
    }
    case 'fermeture': {
      if (!a.habitue) return 2 * CV - drawCost(2);
      const h = opps.flatMap((o) => o.habitues).find((x) => x.uid === a.habitue);
      return h ? (STATIC[h.id] ?? 0.8) * 0.9 + 0.3 : null;
    }
    case 'fouine': {
      if (!a.trap) return CV - drawCost(1);
      const t = view.traps.find((x) => x.uid === a.trap);
      if (!t) return null;
      const draw1 = CV - drawCost(1);
      if (t.id) return draw1 + (t.id === 'leurre' ? -0.3 : (STATIC[t.id] ?? 0.6) + (t.target === me.id ? 0.2 : -0.3));
      const o = view.players.find((p) => p.id === t.owner)!;
      return draw1 + (o.families.includes('pieges') ? 1.0 : 0.7) + (t.target === me.id ? 0.2 : -0.3);
    }
    default: break;
  }
  const d = def(id);
  if (d.type === 'habitue') {
    let v = STATIC[id] ?? 0.5;
    if (id === 'beau-frere') v = 0.5 + 0.25 * Math.min(4, me.hand!.filter((k) => k.id !== 'beau-frere' && def(k.id).cost >= 1).length) + (me.tournees < view.rules.tourneesMax ? TV : 0);
    if (id === 'videur') v += opps.some((o) => o.families.includes('pieges')) ? 0.8 : -0.4;
    if (id === 'complice') {
      // Vaut d'autant plus que des pièges sont posés ou en main.
      const traps = view.traps.filter((t) => t.owner === me.id).length + me.hand!.filter((k) => def(k.id).type === 'piege').length;
      v = 0.3 + 0.35 * Math.min(4, traps);
    }
    if (id === 'patron' || id === 'josiane' || id === 'beau-frere') v *= lateGame ? 0.4 : 1;
    if (id === 'pilier' && lateGame) v *= 0.5;
    if (me.habitues.some((h) => h.id === id) && (id === 'vieux-marcel' || id === 'pilier')) v = 0;
    return v;
  }
  if (d.type === 'piege') {
    let v = STATIC[id] ?? 0.4;
    if (id === 'main-sac') v = (target ?? opps[0]).families.some((f) => f === 'ivresse' || f === 'chaines') ? 1.0 : 0.6;
    if (id === 'courant-air') {
      // Utile seulement contre un deck qui a des Habitués (surtout la famille des Habitués).
      const o = target ?? opps[0];
      v = o.families.includes('habitues') ? (o.habitues.length >= 3 ? 0.6 : 0.9) : 0.55;
    }
    if (me.habitues.some((h) => h.id === 'complice')) v += 0.3;
    if (id === 'retournement-veste' && lateGame) v *= 1.3;
    if (level === 'fine-fouine' && id === 'leurre') v = 0.45; // bluff : occupe la place et attire les Fouines
    // Multi : viser celui qui est le plus près de gagner.
    if (opps.length > 1 && target) { const minT = Math.min(...opps.map((o) => o.tokens)); if (target.tokens > minT) v -= 0.25; }
    return v;
  }
  return null;
}

// --- Ripostes ---------------------------------------------------------------------------------

function threatOf(view: CfView, me: CfPlayerView): number {
  const top = view.stack[view.stack.length - 1];
  if (!top) return 0;
  const owner = view.players.find((p) => p.id === top.owner)!;
  if (top.kind === 'keep') return 0;
  if (top.cardId === null) return 0.8; // piège inconnu
  const id = top.cardId;
  const d = def(id);
  if (top.owner === me.id) return 0;
  // Une Riposte contre ma carte : la valeur de ma carte en dessous.
  if (d.type === 'riposte') {
    const below = view.stack[view.stack.length - 2];
    if (below && below.kind === 'card' && below.owner === me.id) return 1.2 + (below.cardId ? def(below.cardId).cost * TV : 0);
    if (below && below.kind === 'keep' && below.owner === me.id) return 0.6;
    return 0.2;
  }
  switch (id) {
    case 'bon-numero': case 'coup-pouce': case 'tete-tourne': case 'recompter': {
      const before = owner.r.dice;
      const after = [...before];
      const prm = top.params;
      if (id === 'tete-tourne') after[prm.die!] = 7 - after[prm.die!];
      else if (id === 'bon-numero') after[prm.die!] = prm.face!;
      else after[prm.die!] += prm.delta!;
      const rb = T_RANK[tidx(before)], ra = T_RANK[tidx(after)];
      if (id === 'recompter' || owner.r.done) {
        const myRank = me.r.done ? (me.r.forcedNenette ? 0 : T_RANK[tidx(me.r.dice)]) : null;
        if (myRank !== null && rb < myRank && ra > myRank) return 2.2 + evaluate(after, DV).value * 0.5;
        if (myRank !== null && ra > myRank) return 0.6 + (evaluate(after, DV).value - evaluate(before, DV).value) * 0.5;
        return 0.1;
      }
      return Math.max(0, pct(ra) - pct(rb)) * 4 + (ra === 1000 ? 1.5 : 0);
    }
    case 'double-tournee': return 2.0;
    case 'de-sous-table': return 1.2;
    case 'tournee-generale': return 2.0;
    case 'pari-comptoir': return 0.8;
    case 'note-salee': return 0.9;
    case 'cul-sec': return owner.r.throwsUsed >= (owner.throwLimit ?? 3) ? 1.0 : 0.5;
    case 'fermeture': { const h = me.habitues.find((x) => x.uid === top.params.habitue); return h ? (STATIC[h.id] ?? 0.8) + 0.4 : 0.1; }
    case 'fouine': return view.traps.some((t) => t.uid === top.params.trap && t.owner === me.id && t.id !== 'leurre') ? 1.0 : 0.1;
    case 'domino': return me.tournees * TV;
    case 'tournee-patron': return 2 * TV + CV;
    case 'pourboire': return owner.tokens <= 1 ? 6 : 1.0;
    case 'coup-etrier': return owner.r.done && me.r.done && T_RANK[tidx(owner.r.dice)] < T_RANK[tidx(me.r.dice)] ? 1.2 : 0.3;
    case 'coup-coude': return CV * 0.8;
    case 'calcul-mental': return CV;
    case 'mise-bouche': return 0.6;
    case 'grand-enchainement': return 1.6;
    case 'verre-offert': return top.params.target === me.id && !me.r.done && view.order.indexOf(me.id) > view.order.indexOf(owner.id) ? 1.3 : 0.5;
    case 'vide-poches': return top.params.target === me.id ? CV * 0.9 : 0;
    case 'tant-qu-on-y-est': return Math.min(owner.r.played + 1, view.rules.tourneesMax - owner.tournees) * TV;
    case 'petite-soeur': return 0.8;
    case 'efface-tout': case 'trinquer': {
      // Ce que je perds si la carte passe (comptes en duel, vue de ma combinaison contre la sienne).
      const outcome = (myD: number[], oD: number[], oEfface: boolean) => {
        const mr = T_RANK[tidx(myD)], orr = T_RANK[tidx(oD)];
        if (mr > orr) return oEfface ? 1 : evaluate(myD, DV).value;
        if (mr < orr) return -evaluate(oD, DV).value;
        return 0;
      };
      const before = outcome(me.r.dice, owner.r.dice, false);
      if (id === 'efface-tout') return Math.max(0, before - outcome(me.r.dice, owner.r.dice, true)) + 0.2;
      if (top.params.target !== me.id) return 0.3;
      let lost = 0;
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
        const myD = [...me.r.dice]; const oD = [...owner.r.dice];
        myD[j] = owner.r.dice[i]; oD[i] = me.r.dice[j];
        lost += before - outcome(myD, oD, false);
      }
      return Math.max(0, lost / 9) + 0.2;
    }
    default: break;
  }
  if (d.type === 'habitue') return (STATIC[id] ?? 0.8) * 0.9;
  return 0.5;
}

function respond(view: CfView, legal: CfAction[], level: CfLevel, rng: Rng, handId: (u: string) => string): CfAction {
  const me = view.players.find((p) => p.id === view.you)!;
  const pass = legal.find((a) => a.type === 'pass')!;
  const plays = legal.filter((a): a is Play => a.type === 'play');
  if (!plays.length) return pass;
  if (level === 'debutant') return rng() < 0.3 ? plays[Math.floor(rng() * plays.length)] : pass;
  const top = view.stack[view.stack.length - 1];
  let best: CfAction = pass, bv = 0;
  for (const a of plays) {
    const id = handId(a.card);
    const cost = costNow(me, id);
    let threat: number;
    if (id === 'yeux-piquent' && top.kind === 'keep') {
      const owner = view.players.find((p) => p.id === top.owner)!;
      const d = owner.r.dice;
      const k1 = top.keep;
      const strength = (keep: boolean[]) => { let s = 0; const ks = [0, 1, 2].filter((i) => keep[i]); const sub = SUBS.findIndex((x) => x.length === ks.length && x.every((j, n) => [0, 1, 2].sort((p, q) => d[q] - d[p])[j] === ks[n])); const ti = tidx(d); const outs = sub >= 0 ? TRANS[ti][sub] : FRESH; for (const j of outs) s += pct(T_RANK[j]); return s / outs.length; };
      const k2 = [false, false, false];
      threat = (strength(k1) - strength(k2)) * 5;
    } else threat = threatOf(view, me);
    const margin = level === 'fine-fouine' ? CF_AI_TUNING.ffMargin : CF_AI_TUNING.hbMargin;
    const score = threat - cost * TV - CV - margin + (level === 'habitue' ? (rng() - 0.5) * 0.3 : 0);
    if (score > bv) { bv = score; best = a; }
  }
  return best;
}

// --- Dernier mot ------------------------------------------------------------------------------

function lastword(view: CfView, legal: CfAction[], level: CfLevel, rng: Rng, handId: (u: string) => string): CfAction {
  const me = view.players.find((p) => p.id === view.you)!;
  const pass = legal.find((a) => a.type === 'pass')!;
  const plays = legal.filter((a): a is Play => a.type === 'play');
  if (!plays.length) return pass;
  if (level === 'debutant') return rng() < 0.5 ? plays[Math.floor(rng() * plays.length)] : pass;
  const ctx = buildCtx(view, level);
  const ti = tidx(me.r.dice);
  const now = utility(ctx, ti, 3, me.r.forcedNenette ? 0 : undefined);
  let best: CfAction = pass, bv = 0.05;
  for (const a of plays) {
    const id = handId(a.card);
    let g: number;
    if (id === 'note-salee') g = utility(withMods(ctx, { note: ctx.mine.note + 1 }), ti, 3, me.r.forcedNenette ? 0 : undefined) - now;
    else if (id === 'efface-tout') g = utility(withMods(ctx, { efface: true }), ti, 3, me.r.forcedNenette ? 0 : undefined) - now;
    else if (id === 'coup-etrier') {
      // Relance d'un dé : moyenne sur les 6 faces.
      let sum = 0;
      for (let f = 1; f <= 6; f++) { const d = [...me.r.dice]; d[a.die!] = f; sum += utility(ctx, tidx(d), 3); }
      g = sum / 6 - now;
    }
    else if (id === 'trinquer') {
      const o = ctx.opps.find((x) => x.p.id === a.target);
      if (!o) continue;
      // Moyenne sur les 9 échanges possibles (un dé de chaque côté, au hasard).
      let sum = 0;
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
        const d = [...me.r.dice]; const od = [...o.p.r.dice];
        od[j] = me.r.dice[i]; d[i] = o.p.r.dice[j];
        const oi = tidx(od);
        const o2 = { ...o, rank: T_RANK[oi], value: valueOfC(oi, o.mods) };
        sum += utility({ ...ctx, opps: ctx.opps.map((x) => (x === o ? o2 : x)) }, tidx(d), 3);
      }
      g = sum / 9 - now;
    } else { const d = [...me.r.dice]; d[a.die!] += a.delta!; g = utility(ctx, tidx(d), 3) - now; }
    const score = g - costNow(me, id) * TV - 0.1 + (level === 'habitue' ? (rng() - 0.5) * 0.2 : 0);
    if (score > bv) { bv = score; best = a; }
  }
  return best;
}

// --- Débutant ---------------------------------------------------------------------------------

function turnDebutant(view: CfView, legal: CfAction[], rng: Rng, handId: (u: string) => string): CfAction {
  const me = view.players.find((p) => p.id === view.you)!;
  const plays = legal.filter((a) => a.type === 'play' || a.type === 'josiane');
  if (plays.length && rng() < 0.3) {
    const a = plays[Math.floor(rng() * plays.length)];
    if (a.type !== 'play' || def(handId(a.card)).type !== 'coup' || me.r.throwsUsed > 0 || rng() < 0.5) return a;
  }
  if (me.r.throwsUsed === 0) return legal.find((a) => a.type === 'roll')!;
  const stop = legal.find((a) => a.type === 'stop')!;
  const rolls = legal.filter((a) => a.type === 'roll');
  if (!rolls.length) return stop;
  const combo = evaluate(me.r.dice, DV);
  const known = view.order.filter((id) => id !== me.id).map((id) => view.players.find((p) => p.id === id)!).filter((p) => p.r.done);
  const beats = known.length > 0 && known.every((p) => evaluate(p.r.dice, DV).rank < combo.rank);
  if (combo.value >= 2 || (beats && rng() < 0.7) || rng() < 0.12) return stop;
  let has4 = false, has2 = false;
  const keep = me.r.dice.map((d) => {
    if (d === 1) return true;
    if (d === 4 && !has4) return (has4 = true);
    if (d === 2 && !has2) return (has2 = true);
    return false;
  });
  if (keep.every(Boolean)) return stop;
  return rolls.find((a) => a.type === 'roll' && a.keep.every((k, i) => k === keep[i])) ?? rolls[0];
}
