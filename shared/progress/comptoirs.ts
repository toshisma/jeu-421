/**
 * Tournée des comptoirs : la carrière solo du 421. Une suite de bistrots à battre, rangés en quartiers.
 * Chaque bistrot = une configuration du moteur (ses « règles maison ») + des adversaires + trois étoiles :
 *  - 1re étoile : gagner la partie ;
 *  - 2e et 3e : gagner en remplissant une condition lisible, bâtie seulement sur des valeurs que le
 *    serveur borne (durée mesurée par le serveur, manches perdues ≤ manches jouées, 4-2-1 / trois as /
 *    brelans plafonnés par le nombre de manches).
 * Réputation = somme des étoiles ; elle débloque les quartiers (avec le quartier précédent terminé).
 * Les étoiles d'un compte sont écrites par le serveur (server/accounts.ts, /solo/end) ; un invité garde
 * les siennes dans son profil local, reprises en partie à l'inscription (capTdcImport).
 * Textes : clés `tdc.` (shared/i18n/zones/comptoirs.*.ts) ; noms des titres : comptoirs-server.ts.
 */
import { DEFAULT_CONFIG, sanitizeConfig, type GameConfig } from '../config';
import type { Difficulty } from '../ai';
import type { Profile } from './profile';

export type TdcStar =
  | { k: 'lost'; n: number } // gagner en perdant au plus n manches
  | { k: 'c421' } // gagner en sortant au moins un 4-2-1
  | { k: 'c111' } // gagner en sortant trois as
  | { k: 'brelan' } // gagner en sortant un brelan
  | { k: 'fast'; min: number }; // gagner en moins de `min` minutes (horloge du serveur)

export interface TdcPatron {
  id: string; name: string; avatar: string; color: string;
  /** Temps de réflexion moyen (ms) et prudence (voir shared/ai.ts). */
  tempo: number; caution: number;
  /** Ses dés (de collection), vus quand il lance. */
  dice: string;
}

export interface TdcBistro {
  id: string;
  quarter: string;
  /** Patron du bistrot (toujours le premier adversaire). */
  patron: string;
  /** Adversaires : le patron d'abord, puis des habitués (personas du 421 ou autres patrons). */
  opponents: { persona: string; difficulty: Difficulty }[];
  /** Règles maison : écart aux règles par défaut. */
  config: Partial<Omit<GameConfig, 'values'>> & { values?: Partial<GameConfig['values']> };
  /** Étoiles 2 et 3. */
  stars: [TdcStar, TdcStar];
  /** Ambiance de la table (objets du catalogue, prêtés le temps de la partie). */
  look: { decor: string; felt: string; rim: string };
}

export interface TdcQuarter {
  id: string;
  /** Réputation (étoiles) nécessaire, en plus du quartier précédent terminé. */
  need: number;
  /** Récompense du quartier terminé (tous ses bistrots gagnés) : un titre et/ou un tapis. */
  title?: string;
  felt?: string;
  /** Couleur de la carte. */
  color: string;
}

export const TDC_PATRONS: TdcPatron[] = [
  { id: 'jeannine', name: 'Jeannine', avatar: '👩‍🦳', color: '#b5653a', tempo: 1300, caution: 0.04, dice: 'dc-brique' },
  { id: 'raymond', name: 'Raymond', avatar: '⚽', color: '#2f7a4a', tempo: 1000, caution: 0.02, dice: 'dc-chene' },
  { id: 'momo', name: 'Momo', avatar: '🍻', color: '#c9902a', tempo: 900, caution: -0.04, dice: 'dc-moutarde' },
  { id: 'yvonne', name: 'Yvonne', avatar: '🐟', color: '#2f6f9a', tempo: 1200, caution: 0.03, dice: 'dc-lavande' },
  { id: 'fernand', name: 'Fernand', avatar: '⚓', color: '#24506e', tempo: 1100, caution: 0.01, dice: 'dc-tortue' },
  { id: 'mimile', name: 'Mimile', avatar: '💪', color: '#a8452f', tempo: 800, caution: -0.06, dice: 'dc-grenat' },
  { id: 'odette', name: 'Odette', avatar: '🕰️', color: '#7a4f8f', tempo: 900, caution: 0.02, dice: 'dc-lavande' },
  { id: 'gaston', name: 'Gaston', avatar: '🚂', color: '#4a4a52', tempo: 1100, caution: 0.01, dice: 'dc-chene' },
  { id: 'lucienne', name: 'Lucienne', avatar: '🍸', color: '#b03a6a', tempo: 1000, caution: -0.02, dice: 'dc-corail' },
  { id: 'armand', name: 'Armand', avatar: '🧐', color: '#8a6d2a', tempo: 1200, caution: 0.01, dice: 'dc-nacre' },
  { id: 'edmond', name: 'Edmond', avatar: '🃏', color: '#1f3d5c', tempo: 1300, caution: 0, dice: 'dc-givre' },
  { id: 'solange', name: 'Solange', avatar: '💎', color: '#7b2350', tempo: 1200, caution: 0, dice: 'dc-galaxie' },
];

export const TDC_QUARTERS: TdcQuarter[] = [
  { id: 'marche', need: 0, title: 'tdc:marche', color: '#c0583a' },
  { id: 'port', need: 3, felt: 'felt-tdc-port', color: '#2f6f9a' },
  { id: 'gare', need: 8, title: 'tdc:gare', color: '#7a4f8f' },
  { id: 'boulevards', need: 14, title: 'tdc:boulevards', felt: 'felt-tdc-palace', color: '#b8913c' },
];

/** Tapis gagnés à la fin d'un quartier (catalogue : jamais en vente). */
export const TDC_FELTS: { id: string; name: string; color: string; pattern: 'rayures' | 'losanges' }[] = [
  { id: 'felt-tdc-port', name: 'Filet du port', color: '#123a4a', pattern: 'rayures' },
  { id: 'felt-tdc-palace', name: 'Velours du Palace', color: '#3a0f2a', pattern: 'losanges' },
];

export const TDC_BISTROS: TdcBistro[] = [
  // --- Place du Marché : on apprend le métier ---
  { id: 'petit-zinc', quarter: 'marche', patron: 'jeannine', opponents: [{ persona: 'jeannine', difficulty: 'facile' }],
    config: { totalTokens: 11 }, stars: [{ k: 'lost', n: 3 }, { k: 'fast', min: 3 }],
    look: { decor: 'decor-zinc', felt: 'felt-vert', rim: 'rim-chene' } },
  { id: 'cafe-sports', quarter: 'marche', patron: 'raymond', opponents: [{ persona: 'raymond', difficulty: 'facile' }, { persona: 'gege', difficulty: 'facile' }],
    config: { totalTokens: 15 }, stars: [{ k: 'c421' }, { k: 'lost', n: 4 }],
    look: { decor: 'decor-pub', felt: 'felt-rayures', rim: 'rim-noyer' } },
  { id: 'chope-or', quarter: 'marche', patron: 'momo', opponents: [{ persona: 'momo', difficulty: 'normal' }, { persona: 'dede', difficulty: 'facile' }],
    config: { totalTokens: 15, maxThrows: 2, chargeThrows: 1 }, stars: [{ k: 'brelan' }, { k: 'fast', min: 5 }],
    look: { decor: 'decor-taverne', felt: 'felt-sable', rim: 'rim-cognac' } },
  // --- Le Port : règles de marins ---
  { id: 'phare', quarter: 'port', patron: 'yvonne', opponents: [{ persona: 'yvonne', difficulty: 'normal' }, { persona: 'josiane', difficulty: 'normal' }],
    config: { variant: 'decharge', startTokens: 5 }, stars: [{ k: 'lost', n: 3 }, { k: 'c421' }],
    look: { decor: 'decor-plage', felt: 'felt-bleu', rim: 'rim-bambou' } },
  { id: 'ancre', quarter: 'port', patron: 'fernand', opponents: [{ persona: 'fernand', difficulty: 'normal' }, { persona: 'marcel', difficulty: 'normal' }, { persona: 'lulu', difficulty: 'normal' }],
    config: { variant: 'manches', rounds: 7 }, stars: [{ k: 'brelan' }, { k: 'c421' }],
    look: { decor: 'decor-taverne', felt: 'felt-turquoise', rim: 'rim-noyer' } },
  { id: 'mimile', quarter: 'port', patron: 'mimile', opponents: [{ persona: 'mimile', difficulty: 'normal' }, { persona: 'dede', difficulty: 'normal' }],
    config: { values: { v421: 10, suite: 3 } }, stars: [{ k: 'c421' }, { k: 'lost', n: 5 }],
    look: { decor: 'decor-zinc', felt: 'felt-rouge', rim: 'rim-acier' } },
  // --- Quartier de la Gare : ça va vite ---
  { id: 'buffet-gare', quarter: 'gare', patron: 'odette', opponents: [{ persona: 'odette', difficulty: 'normal' }, { persona: 'simone', difficulty: 'normal' }],
    config: { totalTokens: 15, turnSeconds: 10 }, stars: [{ k: 'fast', min: 5 }, { k: 'lost', n: 4 }],
    look: { decor: 'decor-bistrot', felt: 'felt-bordeaux', rim: 'rim-cuir-noir' } },
  { id: 'terminus', quarter: 'gare', patron: 'gaston', opponents: [{ persona: 'gaston', difficulty: 'difficile' }, { persona: 'baron', difficulty: 'normal' }, { persona: 'gege', difficulty: 'normal' }],
    config: { fewerThrowsWins: true, direction: 'antihoraire' }, stars: [{ k: 'c421' }, { k: 'lost', n: 6 }],
    look: { decor: 'decor-chalet', felt: 'felt-tartan', rim: 'rim-cognac' } },
  { id: 'wagon-bar', quarter: 'gare', patron: 'lucienne', opponents: [{ persona: 'lucienne', difficulty: 'difficile' }, { persona: 'lulu', difficulty: 'normal' }],
    config: { totalTokens: 15, chargeThrows: 3, tieRule: 'premierPerd' }, stars: [{ k: 'brelan' }, { k: 'lost', n: 3 }],
    look: { decor: 'decor-nuit', felt: 'felt-violet', rim: 'rim-laque' } },
  // --- Les Grands Boulevards : la cour des grands ---
  { id: 'grand-cafe', quarter: 'boulevards', patron: 'armand', opponents: [{ persona: 'armand', difficulty: 'difficile' }, { persona: 'simone', difficulty: 'difficile' }, { persona: 'marcel', difficulty: 'normal' }],
    config: {}, stars: [{ k: 'c421' }, { k: 'lost', n: 6 }],
    look: { decor: 'decor-terrasse', felt: 'felt-losanges', rim: 'rim-marbre' } },
  { id: 'cercle', quarter: 'boulevards', patron: 'edmond', opponents: [{ persona: 'edmond', difficulty: 'difficile' }, { persona: 'baron', difficulty: 'difficile' }],
    config: { variant: 'decharge', startTokens: 6, values: { v421: 12, v111: 10 } }, stars: [{ k: 'c111' }, { k: 'lost', n: 3 }],
    look: { decor: 'decor-casino', felt: 'felt-noir', rim: 'rim-cuir-rouge' } },
  { id: 'palace', quarter: 'boulevards', patron: 'solange', opponents: [{ persona: 'solange', difficulty: 'difficile' }, { persona: 'baron', difficulty: 'difficile' }, { persona: 'josiane', difficulty: 'difficile' }],
    config: { turnSeconds: 15 }, stars: [{ k: 'lost', n: 5 }, { k: 'c111' }],
    look: { decor: 'decor-palace', felt: 'felt-etoiles', rim: 'rim-or' } },
];

/** Pièces par nouvelle étoile (gains volontairement bas). */
export const TDC_STAR_COINS = 5;
/** Étoiles au plus : 3 par bistrot. */
export const TDC_MAX_STARS = TDC_BISTROS.length * 3;

export const tdcBistro = (id: unknown): TdcBistro | undefined => (typeof id === 'string' ? TDC_BISTROS.find((b) => b.id === id) : undefined);
export const tdcPatron = (id: string): TdcPatron | undefined => TDC_PATRONS.find((p) => p.id === id);
export const tdcQuarter = (id: string): TdcQuarter => TDC_QUARTERS.find((q) => q.id === id)!;
export const bistrosOf = (quarter: string) => TDC_BISTROS.filter((b) => b.quarter === quarter);

/** Configuration complète (et bornée) d'un bistrot. */
export function tdcConfig(b: TdcBistro): GameConfig {
  return sanitizeConfig({ ...DEFAULT_CONFIG, ...b.config, values: { ...DEFAULT_CONFIG.values, ...(b.config.values ?? {}) } });
}

// ---------------------------------------------------------------------------------------------
// Progression : bistrot → étoiles (masque : bit 0 = 1re étoile, bit 1 = 2e, bit 2 = 3e)

export type TdcProgress = Record<string, number>;
export const starCount = (mask: number) => (mask & 1) + ((mask >> 1) & 1) + ((mask >> 2) & 1);
export const reputation = (p: TdcProgress | undefined) => Object.values(p ?? {}).reduce((n, m) => n + starCount(m), 0);
const won = (p: TdcProgress | undefined, id: string) => ((p?.[id] ?? 0) & 1) === 1;
export const quarterDone = (p: TdcProgress | undefined, quarter: string) => bistrosOf(quarter).every((b) => won(p, b.id));

/** Quartier ouvert : réputation suffisante et quartier précédent terminé. */
export function quarterUnlocked(p: TdcProgress | undefined, quarter: string): boolean {
  const i = TDC_QUARTERS.findIndex((q) => q.id === quarter);
  if (i < 0) return false;
  if (i === 0) return true;
  return reputation(p) >= TDC_QUARTERS[i].need && quarterDone(p, TDC_QUARTERS[i - 1].id);
}
/** Bistrot ouvert : son quartier est ouvert et le bistrot précédent du quartier est gagné. */
export function bistroUnlocked(p: TdcProgress | undefined, id: string): boolean {
  const b = tdcBistro(id);
  if (!b || !quarterUnlocked(p, b.quarter)) return false;
  const list = bistrosOf(b.quarter);
  const i = list.indexOf(b);
  return i === 0 || won(p, list[i - 1].id);
}

/** Nettoie la progression lue d'un profil (bistrots connus, masques 0 à 7). */
export function cleanTdc(raw: unknown): TdcProgress | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const out: TdcProgress = {};
  for (const b of TDC_BISTROS) {
    const v = (raw as Record<string, unknown>)[b.id];
    if (typeof v === 'number' && Number.isInteger(v) && v > 0 && v <= 7) out[b.id] = v & 1 ? v : 0;
    if (out[b.id] === 0) delete out[b.id]; // une étoile 2-3 suppose la victoire (étoile 1)
  }
  return Object.keys(out).length ? out : undefined;
}
/** Reprise à l'inscription d'un invité : seulement le premier quartier (progression faite sans compte, modifiable). */
export function capTdcImport(p: TdcProgress | undefined): TdcProgress | undefined {
  if (!p) return undefined;
  const first = new Set(bistrosOf(TDC_QUARTERS[0].id).map((b) => b.id));
  const out = Object.fromEntries(Object.entries(p).filter(([id]) => first.has(id)));
  return cleanTdc(out);
}

// ---------------------------------------------------------------------------------------------
// Fin de partie : étoiles gagnées

/** Faits d'une partie de la Tournée (annoncés par l'appareil, sauf la durée). */
export interface TdcFacts {
  won: boolean;
  place: number;
  rounds: number;
  /** Manches perdues (absent en variante aux points). */
  roundsLost?: number;
  count421: number;
  c111: number;
  brelan: number;
  /** Durée réelle (serveur pour un compte). */
  elapsedMs: number;
}

export function starMet(s: TdcStar, f: TdcFacts): boolean {
  switch (s.k) {
    case 'lost': return f.roundsLost !== undefined && f.roundsLost <= s.n;
    case 'c421': return f.count421 >= 1;
    case 'c111': return f.c111 >= 1;
    case 'brelan': return f.brelan >= 1;
    case 'fast': return f.elapsedMs < s.min * 60_000;
  }
}
/** Masque des étoiles d'une partie : rien sans victoire. */
export function starsOf(b: TdcBistro, f: TdcFacts): number {
  if (!f.won || f.place !== 1) return 0;
  let m = 1;
  b.stars.forEach((s, i) => { if (starMet(s, f)) m |= 2 << i; });
  return m;
}

/** Plus grande valeur d'un coup (jetons qui changent de main en une manche). */
function maxValue(c: GameConfig) {
  return Math.max(c.values.v421, c.values.v111, c.values.suite, c.values.autre, c.values.nenetteMin, 6);
}
/** Manches qu'il faut au moins jouer pour gagner ce bistrot. */
export function minRounds(b: TdcBistro): number {
  const c = tdcConfig(b);
  if (c.variant === 'manches') return c.rounds;
  return Math.max(1, Math.ceil((c.variant === 'classique' ? c.totalTokens : c.startTokens) / maxValue(c)));
}

/** Délai minimal par manche (ms) pour la vraisemblance ; les tests le réduisent. */
export const TDC_ROUND_MS = 2500;

/**
 * Faits vraisemblables ? Durée au moins égale aux manches minimales, manches annoncées entre ce minimum
 * et ce que la durée permet (une manche par seconde au plus, à l'échelle de TDC_ROUND_MS), manches perdues
 * ≤ manches, gros coups plafonnés comme pour le solo. Sinon : aucune étoile.
 */
export function tdcPlausible(b: TdcBistro, f: TdcFacts, roundMs = TDC_ROUND_MS): boolean {
  const min = minRounds(b);
  if (f.elapsedMs < min * roundMs) return false;
  if (f.rounds < min || f.rounds > Math.floor(f.elapsedMs / (roundMs / 2.5)) + 10) return false;
  if (f.roundsLost !== undefined && (f.roundsLost < 0 || f.roundsLost > f.rounds)) return false;
  if (f.count421 > 3 + Math.floor(f.rounds / 5) || f.c111 > 2 + Math.floor(f.rounds / 10) || f.brelan > f.rounds * 2) return false;
  return true;
}

export interface TdcResult {
  bistro: string;
  before: number;
  after: number;
  /** Étoiles nouvellement gagnées (1, 2, 3). */
  newStars: number[];
  coins: number;
  /** Quartier terminé à l'instant (récompense donnée). */
  quarter?: string;
  title?: string;
  felt?: string;
  /** Déclaration refusée (invraisemblable) : aucune étoile. */
  refused?: boolean;
}

/** Récompense d'un quartier terminé et pas encore reçue (titre / tapis) : ajoutée au profil. */
function grantQuarter(p: Profile, q: TdcQuarter): { profile: Profile; title?: string; felt?: string } {
  let profile = p;
  let title: string | undefined, felt: string | undefined;
  if (q.title && !(p.titles ?? []).includes(q.title)) { title = q.title; profile = { ...profile, titles: [...(profile.titles ?? []), q.title] }; }
  if (q.felt && !p.owned.includes(q.felt)) { felt = q.felt; profile = { ...profile, owned: [...profile.owned, q.felt] }; }
  return { profile, title, felt };
}

/**
 * Applique une partie de la Tournée au profil : nouvelles étoiles seulement (jamais deux fois la même),
 * TDC_STAR_COINS pièces par nouvelle étoile, récompense de quartier si le quartier est terminé.
 * `bistroUnlocked` doit avoir été vérifié au début de la partie.
 */
export function applyTdc(p: Profile, bistroId: string, f: TdcFacts, roundMs = TDC_ROUND_MS): { profile: Profile; result: TdcResult } {
  const b = tdcBistro(bistroId)!;
  const before = p.tdc?.[b.id] ?? 0;
  const empty: TdcResult = { bistro: b.id, before, after: before, newStars: [], coins: 0 };
  if (!tdcPlausible(b, f, roundMs)) return { profile: p, result: { ...empty, refused: true } };
  const mask = starsOf(b, f);
  const after = before | mask;
  const fresh = after & ~before;
  const newStars = [1, 2, 3].filter((s) => fresh & (1 << (s - 1)));
  const coins = newStars.length * TDC_STAR_COINS;
  let profile: Profile = { ...p, coins: p.coins + coins, tdc: { ...(p.tdc ?? {}), ...(after ? { [b.id]: after } : {}) } };
  const result: TdcResult = { ...empty, after, newStars, coins };
  // Quartier terminé (y compris un quartier repris d'un profil d'invité) : titre / tapis s'ils manquent.
  if (quarterDone(profile.tdc, b.quarter)) {
    const g = grantQuarter(profile, tdcQuarter(b.quarter));
    profile = g.profile;
    if (g.title || g.felt) Object.assign(result, { quarter: b.quarter, title: g.title, felt: g.felt });
  }
  return { profile, result };
}

/** Faits d'une partie à partir de ce que l'écran de jeu transmet (RewardContext). */
export function tdcFactsFrom(o: { won: boolean; place?: number; rounds: number; roundsLost?: number; count421: number; combos?: Partial<Record<string, number>>; elapsedMs: number }): TdcFacts {
  return {
    won: o.won, place: o.won ? 1 : Math.max(2, o.place ?? 2), rounds: o.rounds, roundsLost: o.roundsLost,
    count421: o.count421, c111: o.combos?.['111'] ?? 0, brelan: o.combos?.brelan ?? 0, elapsedMs: o.elapsedMs,
  };
}

/** Titres de quartier (français : traduits par shared/i18n/zones/comptoirs-server.ts). */
export const TDC_TITLES_FR: Record<string, string> = { marche: 'Habitué du Marché', gare: 'Voyageur des comptoirs', boulevards: 'Roi des comptoirs' };
export const tdcTitleFr = (quarter: string): string | null => TDC_TITLES_FR[quarter] ?? null;
