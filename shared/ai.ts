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
      const q = Math.pow(singleThrowCdf(combo.rank), k); // P(un adversaire finit sous moi) — approx.
      const pAllAbove = Math.pow(1 - q, remaining);
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
  const memo = new Map<string, number>();

  const V = (d: number[], used: number, depth: number): number => {
    const stopVal = U(d, used);
    if (used >= limit || depth === 0) return stopVal;
    const key = `${d.join('')}|${used}|${depth}`;
    const m = memo.get(key);
    if (m !== undefined) return m;
    let best = stopVal;
    for (const sub of KEEP_SUBSETS) best = Math.max(best, expect(d, sub, used + 1, depth - 1));
    memo.set(key, best);
    return best;
  };
  const expect = (d: number[], sub: number[], used: number, depth: number): number => {
    const kept = sub.map((i) => d[i]);
    const n = 3 - kept.length;
    let sum = 0;
    let count = 0;
    const rec = (acc: number[]) => {
      if (acc.length === n) {
        sum += V([...kept, ...acc].sort((a, b) => b - a), used, depth);
        count++;
        return;
      }
      for (let f = 1; f <= 6; f++) rec([...acc, f]);
    };
    rec([]);
    return sum / count;
  };

  const idx = sortIdx(s.dice);
  const sorted = idx.map((i) => s.dice[i]);
  const depth = difficulty === 'difficile' ? limit - s.throwsUsed : 1;
  const noise = () => (difficulty === 'normal' ? (rng() - 0.5) * 0.06 : 0);

  let bestVal = U(sorted, s.throwsUsed) + style.caution + noise();
  let bestSub: number[] | null = null;
  for (const sub of KEEP_SUBSETS) {
    const e = expect(sorted, sub, s.throwsUsed + 1, depth - 1) + noise();
    if (e > bestVal) { bestVal = e; bestSub = sub; }
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
    const keep = [rng() < 0.4, rng() < 0.4, false].sort(() => rng() - 0.5);
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
