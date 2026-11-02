/**
 * Défi du jour : les mêmes dés pour tout le monde. 5 coups ; à chaque coup, jusqu'à 3 lancers en
 * gardant les dés de son choix. Chaque combinaison rapporte ses points (4-2-1 = 8, trois as = 7,
 * brelan = sa valeur, deux as + x = x, suite = 2, autre = 1). À égalité, le moins de lancers gagne.
 *
 * Les dés sont tirés d'une suite pseudo-aléatoire fixée par la date : seul le choix des dés à
 * garder fait la différence. Le serveur rejoue les décisions pour calculer le score officiel.
 */
import { DEFAULT_CONFIG } from './config';
import { evaluate, type Combo } from './combos';

export const CHALLENGE_TURNS = 5;
export const CHALLENGE_THROWS = 3;

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Dés du jour : pour chaque coup et chaque lancer, trois valeurs (utilisées dans l'ordre par les dés relancés). */
export function challengeDice(day: string): number[][][] {
  const rnd = mulberry32(hash(`421-defi-${day}`));
  return Array.from({ length: CHALLENGE_TURNS }, () =>
    Array.from({ length: CHALLENGE_THROWS }, () => Array.from({ length: 3 }, () => 1 + Math.floor(rnd() * 6))));
}

export interface ChallengeTurn { dice: number[]; throws: number; combo: Combo }
export interface ChallengeResult { turns: ChallengeTurn[]; points: number; throws: number }

/** Dés obtenus après un lancer : les dés gardés restent, les autres prennent les valeurs suivantes. */
export function nextDice(day: string, turn: number, throwIndex: number, prev: number[], keep: boolean[]): number[] {
  const vals = challengeDice(day)[turn][throwIndex];
  let k = 0;
  return [0, 1, 2].map((i) => (throwIndex > 0 && keep[i] ? prev[i] : vals[k++]));
}

/**
 * Rejoue une partie : `decisions[t]` liste les masques des relances du coup t (0 à 2 masques ;
 * un masque qui garde les trois dés est refusé). Renvoie null si les décisions sont invalides.
 */
export function playChallenge(day: string, decisions: unknown): ChallengeResult | null {
  if (!Array.isArray(decisions) || decisions.length !== CHALLENGE_TURNS) return null;
  const turns: ChallengeTurn[] = [];
  for (let t = 0; t < CHALLENGE_TURNS; t++) {
    const masks = decisions[t];
    if (!Array.isArray(masks) || masks.length > CHALLENGE_THROWS - 1) return null;
    let dice = nextDice(day, t, 0, [0, 0, 0], [false, false, false]);
    for (let k = 0; k < masks.length; k++) {
      const m = masks[k];
      if (!Array.isArray(m) || m.length !== 3 || m.some((x) => typeof x !== 'boolean') || m.every(Boolean)) return null;
      dice = nextDice(day, t, k + 1, dice, m as boolean[]);
    }
    turns.push({ dice, throws: masks.length + 1, combo: evaluate(dice, DEFAULT_CONFIG.values) });
  }
  return { turns, points: turns.reduce((a, x) => a + x.combo.value, 0), throws: turns.reduce((a, x) => a + x.throws, 0) };
}

/** Récompense du défi (une fois par jour) : pièces selon le score, un peu d'XP. */
export const challengeReward = (points: number) => ({ coins: 10 + points, xp: 20 });
