/**
 * Ordinateurs du Poker menteur. Trois niveaux :
 * - Débutant (« Débutant ») : estime mal, crie « Menteur ! » un peu au hasard, garde simplement ses
 *   dés qui comptent, ment toujours d'un tout petit cran et bluffe sans finesse ;
 * - Habitué : calcule la probabilité que la main annoncée soit sous le gobelet (ce qu'on sait : l'annonce
 *   précédente et le nombre de dés relancés), relance au mieux, ment d'un cran ;
 * - Fine fouine : pareil, avec moins d'erreurs, et choisit l'annonce la plus CRÉDIBLE (celle que le
 *   suivant aura le plus de mal à contester), avec un bluff dosé.
 *
 * Calculs exacts par tables (faites une fois) : pour chaque groupe de dés gardés, probabilité
 * d'atteindre au moins chaque main en relançant les autres.
 */
import { mulberry32, type Rng } from '../rng';
import { HAND_COUNT, PM_DICE, PM_FACES, canon, coreDice, countsKey, countsOf, handAt, rankOf } from './hands';
import { canBelieve, lastClaim, type PmAction, type PmLevel, type PmState } from './engine';

// ---------------------------------------------------------------------------------------------
// Tables : P(main finale ≥ h | dés gardés K, les autres relancés)

interface Tables {
  /** ge.get(clé de K)[h] = P(rang final ≥ h), h de 0 à 252. */
  ge: Map<number, Float64Array>;
  /** Meilleure chance d'atteindre au moins h en relançant au mieux depuis la main de rang r (calculé à la demande). */
  best: (Float64Array | undefined)[];
}
const TABLES: (Tables | null)[] = [null, null];

/** Multiensembles de taille n, avec leur probabilité (n dés lancés). */
function rolls(n: number): { faces: number[]; p: number }[] {
  const out = new Map<string, { faces: number[]; p: number }>();
  const total = PM_FACES ** n;
  for (let m = 0; m < total; m++) {
    const f: number[] = [];
    let x = m;
    for (let i = 0; i < n; i++) { f.push(x % PM_FACES); x = Math.floor(x / PM_FACES); }
    f.sort();
    const k = f.join('');
    const e = out.get(k);
    if (e) e.p += 1 / total; else out.set(k, { faces: f, p: 1 / total });
  }
  return [...out.values()];
}
function multisets(n: number): number[][] {
  const out: number[][] = [];
  const rec = (start: number, acc: number[]) => {
    if (acc.length === n) { out.push([...acc]); return; }
    for (let v = start; v < PM_FACES; v++) { acc.push(v); rec(v, acc); acc.pop(); }
  };
  rec(0, []);
  return out;
}

function tables(ns: boolean): Tables {
  const i = ns ? 1 : 0;
  if (TABLES[i]) return TABLES[i]!;
  const ge = new Map<number, Float64Array>();
  const rollsBy = Array.from({ length: PM_DICE + 1 }, (_, n) => rolls(n));
  for (let k = 0; k <= PM_DICE; k++) {
    for (const kept of multisets(k)) {
      const dist = new Float64Array(HAND_COUNT + 1);
      for (const r of rollsBy[PM_DICE - k]) dist[rankOf([...kept, ...r.faces], ns)] += r.p;
      // Cumul : ≥ h.
      for (let h = HAND_COUNT - 1; h >= 0; h--) dist[h] += dist[h + 1];
      ge.set(countsKey(countsOf(kept)), dist);
    }
  }
  const t: Tables = { ge, best: [] };
  TABLES[i] = t;
  return t;
}

/** P(main finale ≥ rang h) en gardant `kept` et en relançant les autres. */
export function chanceAtLeast(kept: readonly number[], h: number, ns = false): number {
  if (h <= 0) return 1;
  if (h >= HAND_COUNT) return 0;
  return tables(ns).ge.get(countsKey(countsOf(kept)))![h];
}

/** Sous-ensembles (positions) des 5 dés, sans doublon de valeurs gardées. */
function keepChoices(dice: readonly number[]): { keep: number[]; kept: number[] }[] {
  const seen = new Set<number>();
  const out: { keep: number[]; kept: number[] }[] = [];
  // Du plus grand au plus petit nombre de dés gardés (à chance égale : moins de dés relancés).
  const masks = Array.from({ length: 32 }, (_, m) => m).sort((a, b) => popcount(b) - popcount(a));
  for (const m of masks) {
    const keep = [0, 1, 2, 3, 4].filter((i) => m & (1 << i));
    const kept = keep.map((i) => dice[i]);
    const key = countsKey(countsOf(kept));
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ keep, kept });
  }
  return out;
}
const popcount = (m: number) => { let n = 0; while (m) { n += m & 1; m >>= 1; } return n; };

/** Meilleure relance pour atteindre au moins le rang h : positions à garder et chance. */
export function bestKeep(dice: readonly number[], h: number, ns = false): { keep: number[]; p: number } {
  let best = { keep: [0, 1, 2, 3, 4], p: -1 };
  for (const c of keepChoices(dice)) {
    const p = chanceAtLeast(c.kept, h, ns);
    if (p > best.p + 1e-12) best = { keep: c.keep, p };
  }
  return best;
}

/** Depuis la main de rang r : meilleure chance d'atteindre ≥ h (pour chaque h), en relançant au mieux. */
function bestFrom(r: number, ns: boolean): Float64Array {
  const t = tables(ns);
  const cached = t.best[r];
  if (cached) return cached;
  const dice = handAt(r, ns).dice;
  const out = new Float64Array(HAND_COUNT + 1);
  const choices = keepChoices(dice).map((c) => t.ge.get(countsKey(countsOf(c.kept)))!);
  for (let h = 0; h <= HAND_COUNT; h++) { let m = 0; for (const g of choices) if (g[h] > m) m = g[h]; out[h] = m; }
  t.best[r] = out;
  return out;
}

// ---------------------------------------------------------------------------------------------
// Ce qu'on peut croire du gobelet

/**
 * Dés que l'annonceur a probablement gardés : les plus importants de l'annonce qu'il a crue (ses dés
 * qui comptent d'abord). Aucun s'il a secoué le gobelet ou tout relancé.
 */
export function assumedKept(prevClaim: readonly number[] | null, rerolled: number, ns = false): number[] {
  if (!prevClaim || rerolled < 0 || rerolled >= PM_DICE) return [];
  const k = PM_DICE - rerolled;
  const core = coreDice(prevClaim, ns);
  const rest = [...prevClaim];
  for (const d of core) rest.splice(rest.indexOf(d), 1);
  return [...core, ...canon(rest)].slice(0, k);
}

/** Chance « brute » que la main annoncée soit sous le gobelet (sans juger l'annonceur). */
export function claimChance(s: PmState, claim = lastClaim(s)): number {
  if (!claim) return 1;
  const ns = s.options.noStraights;
  const i = s.claims.indexOf(claim);
  const prev = i > 0 ? s.claims[i - 1].hand : null;
  const kept = assumedKept(prev, claim.rerolled, ns);
  return chanceAtLeast(kept, rankOf(claim.hand, ns), ns);
}

/** Distribution du gobelet selon le même modèle (pour estimer ce qu'on peut en faire). */
function cupDist(kept: readonly number[], ns: boolean): Float64Array {
  const g = tables(ns).ge.get(countsKey(countsOf(kept)))!;
  const d = new Float64Array(HAND_COUNT);
  for (let h = 0; h < HAND_COUNT; h++) d[h] = g[h] - g[h + 1];
  return d;
}
/** Si je crois : chance d'avoir VRAIMENT mieux que l'annonce après ma relance. */
export function beatChance(s: PmState): number {
  const claim = lastClaim(s);
  if (!claim) return 1;
  const ns = s.options.noStraights;
  const i = s.claims.indexOf(claim);
  const prev = i > 0 ? s.claims[i - 1].hand : null;
  const dist = cupDist(assumedKept(prev, claim.rerolled, ns), ns);
  const target = rankOf(claim.hand, ns) + 1;
  let f = 0;
  for (let h = 0; h < HAND_COUNT; h++) if (dist[h] > 0) f += dist[h] * bestFrom(h, ns)[target];
  return f;
}

// ---------------------------------------------------------------------------------------------
// Profils

interface Profile {
  /** Confiance de base dans l'annonceur (une annonce est souvent vraie). */
  trust: number;
  /** Bruit sur les estimations. */
  noise: number;
  /** Probabilité que le suivant démasque un mensonge (pour juger « croire »). */
  caught: number;
  /** Envie de bluffer alors qu'on a une main vraie (annonce plus haute que sa main). */
  bluff: number;
  /** Relance optimale (sinon : garder ses dés qui comptent). */
  smartKeep: boolean;
  /** Choisit l'annonce la plus crédible pour le suivant. */
  credible: boolean;
}
const PROFILES: Record<PmLevel, Profile> = {
  debutant: { trust: 0.1, noise: 0.3, caught: 0.45, bluff: 0.18, smartKeep: false, credible: false },
  habitue: { trust: 0.2, noise: 0.1, caught: 0.55, bluff: 0.12, smartKeep: true, credible: false },
  fouine: { trust: 0.22, noise: 0.03, caught: 0.55, bluff: 0.1, smartKeep: true, credible: true },
};

/** Croyance qu'a un joueur moyen dans une annonce (modèle + confiance de base). */
function belief(raw: number, trust: number) { return raw + (1 - raw) * trust; }

/** Décision de l'ordinateur dont c'est le tour. `rng` : tirage (rejouable dans les simulations). */
export function decide(s: PmState, level: PmLevel, rng: Rng = Math.random): PmAction {
  const P = PROFILES[level] ?? PROFILES.habitue;
  const ns = s.options.noStraights;
  const jitter = () => (rng() * 2 - 1) * P.noise;

  if (s.phase === 'decision') {
    if (!canBelieve(s)) return { type: 'menteur' };
    const q = Math.min(1, Math.max(0, belief(claimChance(s), P.trust) + jitter()));
    const f = beatChance(s);
    const loseIfBelieve = (1 - f) * P.caught;
    if (level === 'debutant' && rng() < 0.4) {
      // Juge souvent « au feeling » : crie quand l'annonce lui paraît trop belle.
      return q < 0.3 + rng() * 0.15 ? { type: 'menteur' } : { type: 'croire' };
    }
    return q < loseIfBelieve ? { type: 'menteur' } : { type: 'croire' };
  }

  if (s.phase === 'relance') {
    const dice = s.dice!;
    const last = lastClaim(s)!;
    const target = rankOf(last.hand, ns) + 1;
    if (!P.smartKeep) {
      // Garde les dés qui comptent de sa main ; s'il a déjà mieux, il ne touche à rien.
      if (rankOf(dice, ns) >= target) return { type: 'relancer', pick: [] };
      const core = coreDice(dice, ns);
      const keep: number[] = [];
      const pool = [...core];
      dice.forEach((d, i) => { const j = pool.indexOf(d); if (j >= 0) { pool.splice(j, 1); keep.push(i); } });
      return { type: 'relancer', pick: [0, 1, 2, 3, 4].filter((i) => !keep.includes(i)) };
    }
    const b = bestKeep(dice, target, ns);
    return { type: 'relancer', pick: [0, 1, 2, 3, 4].filter((i) => !b.keep.includes(i)) };
  }

  // Annonce.
  const dice = s.dice!;
  const actual = rankOf(dice, ns);
  const last = lastClaim(s);
  const min = last ? rankOf(last.hand, ns) + 1 : 0;
  const pick = (r: number): PmAction => ({ type: 'annoncer', hand: [...handAt(Math.min(HAND_COUNT - 1, Math.max(min, r)), ns).dice] });

  // Annonces possibles et crédibilité vue du suivant (même modèle que lui).
  const credibility = (r: number) => {
    const prev = last?.hand ?? null;
    const kept = assumedKept(prev, last ? s.rerolled : -1, ns);
    return chanceAtLeast(kept, r, ns);
  };

  if (actual >= min) {
    // Main vraie. Le plus souvent : on l'annonce. Parfois : on bluffe un peu plus haut pour gêner le suivant.
    if (rng() < P.bluff) {
      const span = level === 'debutant' ? 12 : 6;
      const r = actual + 1 + Math.floor(rng() * span);
      if (!P.credible || credibility(r) > 0.25) return pick(r);
    }
    // Sans annonce précédente, un habitué n'affiche pas toujours tout son jeu : la vérité, d'un cran plus bas parfois.
    return pick(actual);
  }

  // Il faut mentir.
  if (!P.credible) {
    const span = level === 'debutant' ? (rng() < 0.3 ? 8 : 1) : (rng() < 0.25 ? 3 : 1);
    return pick(min + Math.floor(rng() * span));
  }
  // Fine fouine : parmi les premières annonces possibles, la plus crédible (un peu de hasard pour ne pas être lisible).
  let best = min, bestV = -1;
  for (let r = min; r < Math.min(HAND_COUNT, min + 8); r++) {
    const v = credibility(r) * (1 - 0.02 * (r - min)) + rng() * 0.04;
    if (v > bestV) { bestV = v; best = r; }
  }
  return pick(best);
}

/** Tirage rejouable pour un ordinateur (simulations). */
export const aiRng = (seed: number): Rng => mulberry32(seed);
