/**
 * Ordinateurs du Dix mille. Trois niveaux :
 * - Débutant : prend tous les dés qui rapportent et tente trop sa chance (imprudent) ;
 * - Habitué : prend tous les dés qui rapportent, encaisse selon un barème raisonnable ;
 * - Fine fouine : calcule l'espérance de son tour (probabilité de rater selon le nombre de dés,
 *   points en jeu), ne garde que les dés utiles, et tient compte de l'écart au score.
 */
import { mulberry32, type Rng } from '../rng';
import { DM_DICE, currentPlayer, diceAfter, inPlay, validSelections, type DmAction, type DmLevel, type DmState } from './engine';

/** Probabilité de rater (aucun dé qui rapporte) selon le nombre de dés lancés. */
export const MISS_CHANCE = [1, 2 / 3, 4 / 9, 0.2778, 0.1574, 0.0772, 0.0231];

// ---------------------------------------------------------------------------------------------
// Espérance d'un tour (programmation dynamique, calculée une fois, à la demande)

const STEP = 50;
const CAP = 4000; // au-delà, on encaisse toujours
type Outcome = { p: number; sels: { points: number; used: number }[] };
let outcomes: Outcome[][] | null = null;
let cont: Float64Array[] | null = null; // cont[n][T/STEP] : espérance si on relance n dés avec T points en jeu

function buildOutcomes(): Outcome[][] {
  const out: Outcome[][] = [[]];
  for (let n = 1; n <= DM_DICE; n++) {
    const groups = new Map<string, { vals: number[]; k: number }>();
    const total = 6 ** n;
    for (let m = 0; m < total; m++) {
      const vals: number[] = [];
      let x = m;
      for (let i = 0; i < n; i++) { vals.push(1 + (x % 6)); x = Math.floor(x / 6); }
      vals.sort();
      const key = vals.join('');
      const g = groups.get(key);
      if (g) g.k++; else groups.set(key, { vals, k: 1 });
    }
    out.push([...groups.values()].map((g) => ({ p: g.k / total, sels: validSelections(g.vals).map((s) => ({ points: s.points, used: s.idx.length })) })));
  }
  return out;
}

function table() {
  if (cont) return cont;
  outcomes = buildOutcomes();
  const steps = CAP / STEP + 1;
  const C = Array.from({ length: DM_DICE + 1 }, () => new Float64Array(steps));
  const V = (T: number, n: number) => (T >= CAP ? T : Math.max(T, C[n][T / STEP]));
  for (let t = steps - 1; t >= 0; t--) {
    const T = t * STEP;
    for (let n = 1; n <= DM_DICE; n++) {
      let e = 0;
      for (const o of outcomes[n]) {
        let best = 0;
        for (const s of o.sels) {
          const left = n - s.used;
          const v = V(T + s.points, left === 0 ? DM_DICE : left);
          if (v > best) best = v;
        }
        e += o.p * best;
      }
      C[n][t] = e;
    }
  }
  cont = C;
  return C;
}

/** Espérance si l'on relance `n` dés avec `T` points en jeu (en jouant au mieux ensuite). */
export function continueValue(T: number, n: number): number {
  if (T >= CAP) return T * (1 - MISS_CHANCE[n]);
  return table()[n][Math.round(T / STEP)];
}

// ---------------------------------------------------------------------------------------------
// Décision

/** Barèmes « encaisser à partir de » selon les dés qui restent (indice = nombre de dés). */
const BANK_AT: Record<Exclude<DmLevel, 'fouine'>, number[]> = {
  habitue: [0, 300, 300, 400, 1000, 2000, Infinity],
  debutant: [0, 450, 650, 1000, 2000, 4000, Infinity],
};

export function decide(s: DmState, level: DmLevel, rng: Rng = mulberry32(s.seed + s.draws * 31 + s.throws)): DmAction {
  if (s.phase === 'debut') return { type: 'lancer' };
  const live = inPlay(s);
  const sels = validSelections(live.map((i) => s.dice[i])).map((x) => ({ pick: x.idx.map((k) => live[k]), points: x.points }));
  const me = currentPlayer(s);
  const need = s.target - me.score;
  // Encaisser fait gagner : on encaisse (avec le plus de points possible).
  const win = sels.find((x) => s.turnPoints + x.points >= need);
  if (win) return { type: 'encaisser', pick: win.pick };

  if (level !== 'fouine') {
    // Prend tous les dés qui rapportent (la sélection la plus payante).
    const x = sels[0];
    const T = s.turnPoints + x.points;
    const n = diceAfter(s, x.pick);
    let at = BANK_AT[level][n];
    // Le débutant est imprévisible : parfois il pousse encore plus loin.
    if (level === 'debutant') at *= 0.8 + rng() * 0.9;
    return { type: T >= at ? 'encaisser' : 'relancer', pick: x.pick };
  }

  // Fine fouine : la meilleure sélection selon l'espérance, ajustée à la situation.
  const opp = Math.max(...s.players.filter((p) => p.id !== me.id).map((p) => p.score));
  const oppNeed = s.target - opp;
  // Un adversaire est tout près du but et on est derrière : il faut prendre plus de risques.
  const urgency = oppNeed <= 350 ? 0.75 : oppNeed <= 700 ? 0.35 : oppNeed <= 1000 ? 0.15 : 0;
  let best: { a: DmAction; v: number } | null = null;
  for (const x of sels) {
    const T = s.turnPoints + x.points;
    const n = diceAfter(s, x.pick);
    const c = continueValue(T, n);
    // Avec de l'urgence, les points encaissés valent moins que la chance d'aller plus loin.
    const bankV = T * (1 - urgency);
    const a: DmAction = c > bankV ? { type: 'relancer', pick: x.pick } : { type: 'encaisser', pick: x.pick };
    const v = Math.max(c, bankV);
    if (!best || v > best.v) best = { a, v };
  }
  return best!.a;
}
