/**
 * Intelligence artificielle du 421.
 *
 * L'IA ne voit que des informations publiques : ses propres dés et les résultats déjà
 * joués par les autres pendant la manche. Elle ne connaît pas les futurs tirages.
 *
 * Utilité d'une combinaison finale :
 *   P(ne pas être le perdant de la manche)   — estimée à partir des résultats connus et
 *                                               d'une loi approchée pour les joueurs restants
 * + « gourmandise » × valeur de la combinaison — un gros coup fait prendre/donner plus de jetons ;
 *                                               elle augmente quand l'IA a beaucoup de jetons.
 *
 * Difficile : programmation dynamique exacte sur tous les lancers restants.
 * Normal    : anticipation d'un seul lancer + léger bruit.
 * Facile    : heuristique simple (garder 4, 2, 1 et les as) avec des erreurs fréquentes.
 */
import { compareTurn, evaluate, singleThrowCdf } from './combos';
import { currentPlayerId, getPlayer, type GameState, type TurnResult } from './engine';
import type { Rng } from './rng';

export type Difficulty = 'facile' | 'normal' | 'difficile';
export interface AiDecision { kind: 'roll' | 'stop'; keep: boolean[] }
/** caution > 0 : s'arrête plus volontiers ; < 0 : plus joueur. */
export interface AiStyle { caution: number }

const KEEP_SUBSETS: number[][] = [[], [0], [1], [2], [0, 1], [0, 2], [1, 2]];

/**
 * Puissance entière par multiplications successives : résultat identique sur tous les moteurs
 * JavaScript (Math.pow n'est pas forcément arrondi pareil partout), indispensable pour que le serveur
 * rejoue exactement les décisions prises sur le téléphone (shared/rejeu).
 */
export function powi(x: number, k: number): number {
  let r = 1;
  for (let i = 0; i < k; i++) r *= x;
  return r;
}

// Tables des 56 tirages triés (du plus fort au plus faible) et des transitions « garder ces dés,
// relancer les autres » : calculées une fois, elles rendent la décision des ordinateurs ~50 fois
// plus rapide (rejeu des parties solo par le serveur) sans changer leur jeu.
interface Tables { dice: number[][]; idx: Map<number, number>; trans: { to: Int16Array; p: Float64Array }[][] }
let TABLES: Tables | null = null;
const keyOf = (d: number[]) => d[0] * 100 + d[1] * 10 + d[2];
function tables(): Tables {
  if (TABLES) return TABLES;
  const dice: number[][] = [];
  const idx = new Map<number, number>();
  for (let a = 6; a >= 1; a--) for (let b = a; b >= 1; b--) for (let c = b; c >= 1; c--) { idx.set(a * 100 + b * 10 + c, dice.length); dice.push([a, b, c]); }
  const trans = dice.map((d) => KEEP_SUBSETS.map((sub) => {
    const kept = sub.map((i) => d[i]);
    const n = 3 - kept.length;
    const counts = new Map<number, number>();
    let total = 0;
    const rec = (acc: number[]) => {
      if (acc.length === n) {
        const t = idx.get(keyOf([...kept, ...acc].sort((x, y) => y - x)))!;
        counts.set(t, (counts.get(t) ?? 0) + 1);
        total++;
        return;
      }
      for (let f = 1; f <= 6; f++) rec([...acc, f]);
    };
    rec([]);
    const to = new Int16Array(counts.size), p = new Float64Array(counts.size);
    let k = 0;
    for (const [t, c] of [...counts.entries()].sort((x, y) => x[0] - y[0])) { to[k] = t; p[k] = c / total; k++; }
    return { to, p };
  }));
  TABLES = { dice, idx, trans };
  return TABLES;
}

function makeUtility(s: GameState, me: string) {
  const cfg = s.config;
  if (s.phase === 'manche') return (d: number[]) => { const c = evaluate(d, cfg.values); return c.value + c.rank / 1e5; };

  const others = s.roundOrder.filter((id) => id !== me);
  const known: TurnResult[] = others.filter((id) => s.results[id]).map((id) => s.results[id]);
  const remaining = others.length - known.length;
  const isLeader = s.turnIdx === 0 && !s.isRolloff && cfg.leaderSetsThrows;
  const othersLimit = s.isRolloff ? 1 : Math.min(
    s.phase === 'charge' ? cfg.chargeThrows : cfg.maxThrows,
    s.roundThrowLimit ?? Infinity,
  );
  const myTokens = getPlayer(s, me).tokens;
  const maxTok = Math.max(1, ...s.players.map((p) => p.tokens));
  const greed = s.phase === 'charge' ? 0.012 : 0.01 + 0.04 * (myTokens / maxTok);

  return (dice: number[], used: number) => {
    const combo = evaluate(dice, cfg.values);
    const mine = { combo, throws: used };
    let beat = false;
    let tie = false;
    for (const r of known) {
      const c = compareTurn(mine, r, cfg);
      if (c > 0) beat = true; else if (c === 0) tie = true;
    }
    let pSafe = 1;
    if (!beat) {
      // Si je suis le premier joueur, mes adversaires n'auront que `used` lancers.
      const k = Math.max(1, isLeader ? used : othersLimit);
      const q = powi(singleThrowCdf(combo.rank), k); // P(un adversaire finit sous moi) — approx.
      const pAllAbove = powi(1 - q, remaining);
      pSafe = 1 - pAllAbove * (tie ? 0.5 : 1);
    }
    return pSafe + greed * combo.value;
  };
}

function sortIdx(dice: number[]): number[] {
  return [0, 1, 2].sort((a, b) => dice[b] - dice[a]);
}

export function decide(s: GameState, me: string, difficulty: Difficulty, rng: Rng, style: AiStyle = { caution: 0 }): AiDecision {
  if (currentPlayerId(s) !== me) throw new Error("L'IA ne peut pas jouer hors de son tour");
  if (s.throwsUsed === 0) return { kind: 'roll', keep: [false, false, false] };
  if (s.throwsUsed >= s.throwLimit) return { kind: 'stop', keep: [false, false, false] };

  if (difficulty === 'facile') return easy(s, me, rng);

  const U = makeUtility(s, me);
  const limit = s.throwLimit;
  const T = tables();
  const uMemo = new Map<number, number>();
  const Uc = (i: number, used: number) => {
    const k = i * 8 + used;
    let v = uMemo.get(k);
    if (v === undefined) { v = U(T.dice[i], used); uMemo.set(k, v); }
    return v;
  };
  const memo = new Map<number, number>();
  const V = (i: number, used: number, depth: number): number => {
    const stopVal = Uc(i, used);
    if (used >= limit || depth === 0) return stopVal;
    const key = (i * 8 + used) * 8 + depth;
    const m = memo.get(key);
    if (m !== undefined) return m;
    let best = stopVal;
    for (let sub = 0; sub < KEEP_SUBSETS.length; sub++) best = Math.max(best, expect(i, sub, used + 1, depth - 1));
    memo.set(key, best);
    return best;
  };
  const expect = (i: number, sub: number, used: number, depth: number): number => {
    const t = T.trans[i][sub];
    let sum = 0;
    for (let k = 0; k < t.to.length; k++) sum += t.p[k] * V(t.to[k], used, depth);
    return sum;
  };

  const idx = sortIdx(s.dice);
  const sorted = idx.map((i) => s.dice[i]);
  const si = T.idx.get(keyOf(sorted))!;
  const depth = difficulty === 'difficile' ? limit - s.throwsUsed : 1;
  const noise = () => (difficulty === 'normal' ? (rng() - 0.5) * 0.06 : 0);

  let bestVal = U(sorted, s.throwsUsed) + style.caution + noise();
  let bestSub: number[] | null = null;
  for (let sub = 0; sub < KEEP_SUBSETS.length; sub++) {
    const e = expect(si, sub, s.throwsUsed + 1, depth - 1) + noise();
    if (e > bestVal) { bestVal = e; bestSub = KEEP_SUBSETS[sub]; }
  }
  if (!bestSub) return { kind: 'stop', keep: [false, false, false] };
  const keep = [false, false, false];
  for (const j of bestSub) keep[idx[j]] = true;
  return { kind: 'roll', keep };
}

/** IA « facile » : heuristique de comptoir, avec des erreurs. */
function easy(s: GameState, me: string, rng: Rng): AiDecision {
  const combo = evaluate(s.dice, s.config.values);
  if (rng() < 0.3) {
    if (rng() < 0.35) return { kind: 'stop', keep: [false, false, false] };
    // Mélange de Fisher-Yates (un tri au comparateur aléatoire dépend du moteur JavaScript : pas rejouable).
    const keep = [rng() < 0.4, rng() < 0.4, false];
    for (let i = keep.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [keep[i], keep[j]] = [keep[j], keep[i]]; }
    return { kind: 'roll', keep };
  }
  const known = s.roundOrder.filter((id) => id !== me && s.results[id]).map((id) => s.results[id]);
  const beatsSomeone = known.some((r) => r.combo.rank < combo.rank);
  if (combo.value >= 2 || (beatsSomeone && rng() < 0.7)) return { kind: 'stop', keep: [false, false, false] };
  let has4 = false, has2 = false;
  const keep = s.dice.map((d) => {
    if (d === 1) return true;
    if (d === 4 && !has4) return (has4 = true);
    if (d === 2 && !has2) return (has2 = true);
    return false;
  });
  if (keep.every(Boolean)) return { kind: 'stop', keep: [false, false, false] };
  return { kind: 'roll', keep };
}
