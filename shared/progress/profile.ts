/**
 * Progression du joueur : expérience (XP), niveaux, pièces, objets possédés et équipés.
 *
 * Règles (modifiables ici, en un seul endroit) :
 *  - Une partie gagnée rapporte XP et pièces, davantage selon la difficulté, le nombre
 *    d'adversaires et la longueur de la partie (pour éviter de « farmer » des parties express).
 *  - Une partie terminée sans gagner rapporte une petite récompense de participation.
 *  - Chaque 4-2-1 obtenu rapporte un bonus (plafonné).
 *  - Chaque niveau gagné rapporte un bonus de pièces.
 *  - Les pièces ne s'achètent pas et ne se convertissent pas en argent : aucun pari, aucun lot.
 */
import type { GameState } from '../engine';
import type { Difficulty } from '../ai';
import { DEFAULT_APPEARANCE, ITEMS, getItem, type Appearance, type Item } from './catalog';
import { applySummary, canClaim, questsFor, today, type GameSummary, type QuestDef, type QuestState } from './quests';
import type { ComboKind } from '../combos';
import { ACHIEVEMENTS, EMPTY_STATS, newlyUnlocked, type AchievementDef, type Stats } from './achievements';
import { activeEvent, coinBoost } from './events';
import { passItems } from './catalog';
import { COLLECTION, CRAFT_COST, FX, FX_SHARE, RARITIES, RARITY_ODDS, SERIES, SHARDS_FOR_DUPLICATE, SHINY_ODDS, SHINY_SUFFIX, baseIdOf, collectionDie, fxDef, isInviteDie, isSeasonDie, isShiny, type FxKind, type Rarity } from './dice-collection';
import { happyHour } from './events';
import { DIVISIONS } from '../season';
import { randomFloat } from '../random';
import { BOSSES, BOSS_COINS, bossOfWeek, weekKey } from './boss';
import { cleanDmStats, type DmStats } from '../dixmille/stats';
import { applyFetesGame, cleanAdvent, cleanFete, feteTitle, type AdventState, type FeteState } from './fetes';

export interface Profile {
  version: 1;
  xp: number; // XP totale cumulée
  coins: number;
  owned: string[];
  equipped: Appearance;
  stats: Stats;
  quests?: QuestState;
  /** Succès débloqués : identifiant → date (ms). */
  achievements: Record<string, number>;
  /** Série de connexions : dernier jour récupéré et longueur de la série. */
  daily?: { last: string; count: number };
  /** Pass de saison du mois : points gagnés (= XP du mois) et paliers récupérés. */
  season?: { id: string; points: number; claimed: number[] };
  /** Titre affiché sous le pseudo, et titres gagnés hors succès (pass, ligues). */
  title?: string;
  titles?: string[];
  /** Première partie guidée terminée. */
  tutorial?: number;
  /** Album des combinaisons : combinaisons déjà réussies et pages complétées. */
  album?: string[];
  albumPages?: string[];
  /** Récap du mois en cours et du mois précédent. */
  month?: MonthRecap;
  prevMonth?: MonthRecap;
  /** Niveau de prestige (remise à zéro du niveau à partir du niveau 30). */
  prestige?: number;
  /** Patron de la semaine : semaine de la dernière victoire. */
  bossWeek?: string;
  /** Dés de collection : sacs à ouvrir, éclats (doublons), parties depuis le dernier sac, vitrine (3 dés). */
  bags?: number;
  shards?: number;
  pity?: number;
  showcase?: string[];
  /** Effets de lancer équipés (traînée, célébration du 4-2-1). */
  fx?: Partial<Record<FxKind, string>>;
  /** Sacs de dés déjà gagnés grâce au parrainage (au plus REFERRAL_BAGS_MAX). */
  referralBags?: number;
  /** Filleul : parties déjà jouées à l'inscription (seules les parties jouées avec le compte comptent). */
  refBase?: number;
  /** Dernière visite d'un compte (sac de retour après RETURN_DAYS jours d'absence). */
  lastVisit?: number;
  /** Moment de la dernière ouverture du coffre (le suivant s'ouvre 24 h après). */
  chestAt?: number;
  /** Scores contre les habitués de l'ordinateur : nom → victoires / défaites. */
  vsAi?: Record<string, { w: number; l: number }>;
  /** Le Courtisan : parties, victoires, meilleur tour, plus gros pot emporté. */
  dm?: DmStats;
  /** Saint-Nicolas / fêtes : défis de l'édition en cours (voir fetes.ts). */
  fete?: FeteState;
  /** Calendrier de l'avent : cases ouvertes cette année. */
  advent?: AdventState;
}

export interface MonthRecap {
  id: string; // AAAA-MM
  played: number;
  won: number;
  c421: number;
  best: { label: string; rank: number } | null;
  /** Adversaires affrontés (nom → nombre de parties). */
  opp: Record<string, number>;
  /** Parties par heure de la journée (0 à 23). */
  hours: number[];
}

/**
 * Gains d'une partie. Les pièces dépendent de trois choses :
 * - le nombre de joueurs : plus la table est grande, plus il y a à gagner
 *   (2 joueurs : 6 pièces au plus ; 4 joueurs : 12 ; 6 joueurs : 18) ;
 * - la place finale : le premier prend tout, le dernier rien, les autres entre les deux ;
 * - la durée réelle : une partie de 15 minutes ou plus compte pleinement, en dessous c'est
 *   proportionnel (au moins un cinquième).
 * Puis la difficulté de l'IA (solo) ou le bonus en ligne.
 */
export const REWARDS = {
  /** Pièces au plus pour le premier : base + parJoueur × (joueurs − 1). */
  coinsBase: 3,
  coinsPerPlayer: 3,
  /** XP : une part pour avoir joué, une part selon la place. */
  playXp: 15,
  placeXp: 45,
  bonus421Coins: 1,
  bonus421Max: 3,
  difficulty: { facile: 0.5, normal: 1, difficile: 1.4 } as Record<Difficulty, number>,
  online: 1.25,
  /** Durée (minutes) pour une récompense complète, et part minimale. */
  fullMinutes: 15,
  minDurationFactor: 0.2,
  /** Repli si la durée n'est pas connue : 10 manches = partie complète. */
  fullLengthRounds: 10,
  levelBonus: (level: number) => 5 + 2 * level,
};

/**
 * Partie en ligne où jouent des ordinateurs : comptée « en ligne » seulement s'il y a au moins un
 * autre humain à la table (sinon c'est une partie contre l'ordinateur), avec le barème du solo au
 * niveau du plus facile des ordinateurs. Sans ordinateur : rien ne change.
 */
export function botTableRules(humans: number, botLevels: Difficulty[]): { mode: 'solo' | 'online'; botLevel?: Difficulty } {
  if (!botLevels.length) return { mode: 'online' };
  const order: Difficulty[] = ['facile', 'normal', 'difficile'];
  const botLevel = order.find((d) => botLevels.includes(d)) ?? 'normal';
  return { mode: humans >= 2 ? 'online' : 'solo', botLevel };
}

/**
 * Joueur dont la partie est finie alors que les autres jouent encore : il est sorti, sa place
 * est définitive (les suivants ne peuvent que finir derrière lui). Renvoie cette place (1 = premier),
 * ou null s'il joue encore, si la partie est terminée ou dans la variante aux points.
 */
export function settledPlace(state: GameState, meId: string): number | null {
  if (state.phase === 'fini' || state.config.variant === 'manches') return null;
  const me = state.players.find((p) => p.id === meId);
  return me?.out && me.finishPos != null ? me.finishPos : null;
}

/** Place finale d'un joueur (1 = premier ; ex æquo aux points : même place). Aussi pour un joueur déjà sorti. */
export function finalPlace(state: GameState, meId: string): number {
  const early = settledPlace(state, meId);
  if (early != null) return early;
  const i = state.ranking.indexOf(meId);
  if (i < 0) return state.players.length;
  // Vrais ex æquo : même place (la meilleure du groupe).
  const group = state.tieGroups?.find((g) => g.includes(meId));
  return (group ? Math.min(...group.map((id) => state.ranking.indexOf(id))) : i) + 1;
}
/**
 * XP nécessaire pour passer du niveau L au niveau L+1 : de plus en plus long.
 * Niveau 2 : 120 XP · niveau 5 : ~1 650 XP cumulés · niveau 10 : ~9 200 · niveau 20 : ~48 000.
 */
export const xpToNext = (level: number) => Math.round((120 * level ** 1.3) / 10) * 10;

export function levelInfo(totalXp: number): { level: number; into: number; need: number } {
  let level = 1;
  let rest = Math.max(0, Math.floor(totalXp));
  while (rest >= xpToNext(level)) { rest -= xpToNext(level); level++; }
  return { level, into: rest, need: xpToNext(level) };
}

const FREE = ITEMS.filter((i) => i.price === 0 && !i.pass && !i.event).map((i) => i.id);

export function newProfile(): Profile {
  return { version: 1, xp: 0, coins: 0, owned: [...FREE], equipped: { ...DEFAULT_APPEARANCE }, stats: { ...EMPTY_STATS }, achievements: {} };
}

/** Répare un profil chargé (champs manquants, objets inconnus, objet équipé non possédé). */
export function sanitizeProfile(raw: unknown): Profile {
  const p = newProfile();
  if (!raw || typeof raw !== 'object') return p;
  const r = raw as Partial<Profile>;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
  p.xp = num(r.xp);
  p.coins = num(r.coins);
  const owned = Array.isArray(r.owned) ? r.owned.filter((id) => typeof id === 'string' && (getItem(id) || fxDef(id))) : [];
  p.owned = [...new Set([...FREE, ...owned])];
  for (const k of Object.keys(DEFAULT_APPEARANCE) as (keyof Appearance)[]) {
    const id = r.equipped?.[k];
    const it = typeof id === 'string' ? getItem(id) : undefined;
    if (it && it.category === k && p.owned.includes(id!)) p.equipped[k] = id!;
  }
  if (r.stats && typeof r.stats === 'object') {
    for (const k of Object.keys(EMPTY_STATS) as (keyof Stats)[]) p.stats[k] = num((r.stats as Partial<Stats>)[k]);
  }
  if (r.achievements && typeof r.achievements === 'object') {
    for (const a of ACHIEVEMENTS) { const t = (r.achievements as Record<string, unknown>)[a.id]; if (typeof t === 'number' && t > 0) p.achievements[a.id] = t; }
  }
  const isDay = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
  if (r.daily && isDay(r.daily.last)) p.daily = { last: r.daily.last, count: Math.max(1, num(r.daily.count)) };
  if (r.season && typeof r.season.id === 'string' && /^\d{4}-\d{2}$/.test(r.season.id)) {
    p.season = { id: r.season.id, points: num(r.season.points), claimed: Array.isArray(r.season.claimed) ? [...new Set(r.season.claimed.map(num).filter((n) => n >= 1 && n <= PASS_TIERS))] : [] };
  }
  if (Array.isArray(r.titles)) p.titles = [...new Set(r.titles.filter((t): t is string => typeof t === 'string' && /^(pass|ligue|patron|album|serie|saison|fete):[\w-]{1,20}$/.test(t)))];
  if (Array.isArray(r.album)) p.album = [...new Set(r.album.filter((k): k is string => typeof k === 'string' && ALBUM_KEYS.includes(k)))];
  if (Array.isArray(r.albumPages)) p.albumPages = [...new Set(r.albumPages.filter((k): k is string => typeof k === 'string' && ALBUM.some((a) => a.id === k)))];
  for (const k of ['month', 'prevMonth'] as const) {
    const m = r[k];
    if (m && typeof m === 'object' && typeof m.id === 'string' && /^\d{4}-\d{2}$/.test(m.id)) {
      const opp: Record<string, number> = {};
      for (const [n, v] of Object.entries(m.opp ?? {}).slice(0, 60)) if (typeof n === 'string' && n.length <= 30) opp[n] = num(v);
      p[k] = {
        id: m.id, played: num(m.played), won: num(m.won), c421: num(m.c421),
        best: m.best && typeof m.best.label === 'string' ? { label: m.best.label.slice(0, 30), rank: num(m.best.rank) } : null,
        opp, hours: Array.from({ length: 24 }, (_, i) => num(Array.isArray(m.hours) ? m.hours[i] : 0)),
      };
    }
  }
  if (num(r.prestige)) p.prestige = Math.min(99, num(r.prestige));
  if (typeof r.bossWeek === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.bossWeek)) p.bossWeek = r.bossWeek;
  if (typeof r.title === 'string' && availableTitles(p).includes(r.title)) p.title = r.title;
  if (num(r.tutorial)) p.tutorial = 1;
  if (num(r.bags)) p.bags = Math.min(BAGS_MAX, num(r.bags));
  if (num(r.refBase)) p.refBase = num(r.refBase);
  if (num(r.lastVisit)) p.lastVisit = num(r.lastVisit);
  if (num(r.chestAt)) p.chestAt = num(r.chestAt);
  if (num(r.referralBags)) p.referralBags = Math.min(REFERRAL_BAGS_MAX, num(r.referralBags));
  if (num(r.shards)) p.shards = num(r.shards);
  if (num(r.pity)) p.pity = Math.min(BAG_PITY, num(r.pity));
  if (r.fx && typeof r.fx === 'object') {
    const fx: Partial<Record<FxKind, string>> = {};
    for (const k of ['trainee', 'fete'] as FxKind[]) { const id = (r.fx as Record<string, unknown>)[k]; if (typeof id === 'string' && fxDef(id)?.kind === k && p.owned.includes(id)) fx[k] = id; }
    if (Object.keys(fx).length) p.fx = fx;
  }
  if (r.vsAi && typeof r.vsAi === 'object') {
    const v: Record<string, { w: number; l: number }> = {};
    for (const [n, x] of Object.entries(r.vsAi).slice(0, 30)) if (n.length <= 20 && x && typeof x === 'object') v[n] = { w: num((x as { w: unknown }).w), l: num((x as { l: unknown }).l) };
    p.vsAi = v;
  }
  const fete = cleanFete(r.fete);
  if (fete) p.fete = fete;
  const advent = cleanAdvent(r.advent);
  if (advent) p.advent = advent;
  const dm = cleanDmStats(r.dm);
  if (dm) p.dm = dm;
  if (Array.isArray(r.showcase)) {
    const sc = [...new Set(r.showcase.filter((id): id is string => typeof id === 'string' && !!collectionDie(id) && p.owned.includes(id)))].slice(0, 3);
    if (sc.length) p.showcase = sc;
  }
  const q = r.quests;
  if (q && typeof q === 'object' && typeof q.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(q.day)) {
    const progress: Record<string, number> = {};
    for (const [k, v] of Object.entries(q.progress ?? {})) progress[k] = num(v);
    p.quests = { day: q.day, progress, claimed: Array.isArray(q.claimed) ? q.claimed.filter((x) => typeof x === 'string') : [] };
  }
  return p;
}

// ---------------------------------------------------------------------------------------------
// Reprise d'un profil d'invité à la création d'un compte

/**
 * Plafonds de la progression d'invité reprise à l'inscription. Le profil d'un invité vit dans son
 * navigateur : n'importe qui peut le modifier. On reprend donc ce qu'un vrai joueur gagne normalement
 * en jouant sans compte, mais jamais plus.
 */
export const GUEST_IMPORT = {
  /** Pièces reprises au plus. */
  coins: 300,
  /** Niveau repris au plus (l'XP est ramenée au début de ce niveau). */
  level: 10,
  /** Sacs de dés gardés en invité repris au plus. */
  bags: 10,
  /** Statistiques : chaque compteur au plus. */
  stat: 3000,
  /** Objets de la boutique repris : valeur totale au plus (en pièces), du moins cher au plus cher. */
  shopBudget: 3000,
} as const;
/** Cadeau de bienvenue d'un nouveau compte : sacs de dés (en plus des sacs repris). */
export const WELCOME_BAGS = 3;

/** XP totale au début du niveau `level`. */
export const xpForLevel = (level: number) => { let xp = 0; for (let l = 1; l < level; l++) xp += xpToNext(l); return xp; };

/**
 * Profil d'invité (déjà passé par sanitizeProfile) ramené à des valeurs plausibles :
 * pièces, XP et statistiques plafonnées ; ni prestige, ni titres (pass, ligues, saisons, patrons),
 * ni pass du mois, ni série de connexions, ni défis du jour en cours ; objets limités aux objets de
 * la boutique achetables à ce niveau (pas d'objets d'événement ni du pass) ; succès gardés seulement
 * s'ils sont cohérents avec les statistiques reprises ; sacs plafonnés. Les dés de collection, éclats,
 * vitrine et effets ne viennent jamais d'un appareil (ils ne se créent que sur le serveur).
 */
export function capGuestImport(p: Profile): Profile {
  const xp = Math.min(p.xp, xpForLevel(GUEST_IMPORT.level));
  const level = levelInfo(xp).level;
  const cap = (n: number) => Math.min(GUEST_IMPORT.stat, n);
  const stats = { ...p.stats };
  for (const k of Object.keys(stats) as (keyof Stats)[]) stats[k] = cap(stats[k]);
  stats.won = Math.min(stats.won, stats.played);
  stats.onlineGames = Math.min(stats.onlineGames, stats.played);
  stats.onlineWins = Math.min(stats.onlineWins, stats.onlineGames, stats.won);
  // Objets : gratuits + objets de la boutique (hors événement et pass) de niveau atteint, dans un budget.
  let budget: number = GUEST_IMPORT.shopBudget;
  const shop = p.owned.map((id) => getItem(id)).filter((it): it is Item => !!it && it.price > 0 && !it.pass && !it.event && it.level <= level)
    .sort((a, b) => a.price - b.price);
  const kept: string[] = [];
  for (const it of shop) if (it.price <= budget) { budget -= it.price; kept.push(it.id); }
  const owned = [...new Set([...FREE, ...kept])];
  const equipped = { ...DEFAULT_APPEARANCE };
  for (const k of Object.keys(DEFAULT_APPEARANCE) as (keyof Appearance)[]) if (owned.includes(p.equipped[k])) equipped[k] = p.equipped[k];
  const base: Profile = {
    version: 1, xp, coins: Math.min(GUEST_IMPORT.coins, p.coins), owned, equipped, stats, achievements: {},
    tutorial: p.tutorial, album: p.album, albumPages: p.albumPages, bossWeek: p.bossWeek, chestAt: p.chestAt, pity: p.pity,
    bags: Math.min(GUEST_IMPORT.bags, p.bags ?? 0),
    // Calendrier de l'avent : les cases déjà ouvertes en invité ne se rouvrent pas avec le compte.
    ...(p.advent ? { advent: p.advent } : {}),
  };
  for (const k of ['month', 'prevMonth'] as const) {
    const m = p[k];
    if (m) base[k] = { ...m, played: cap(m.played), won: Math.min(cap(m.won), cap(m.played)), c421: cap(m.c421) };
  }
  if (p.vsAi) base.vsAi = Object.fromEntries(Object.entries(p.vsAi).map(([n, x]) => [n, { w: cap(x.w), l: cap(x.l) }]));
  // Courtisan : parties et meilleur tour ; pas de pot (les Groschen n'existent qu'avec un compte).
  if (p.dm) base.dm = { games: cap(p.dm.games), wins: Math.min(cap(p.dm.wins), cap(p.dm.games)), bestTurn: p.dm.bestTurn, bestPot: 0 };
  // Succès : seulement ceux que les statistiques reprises justifient.
  const input = { stats, level, purchases: purchases(base), owned };
  for (const a of ACHIEVEMENTS) if (p.achievements[a.id] && a.value(input) >= a.target) base.achievements[a.id] = p.achievements[a.id];
  if (p.title && availableTitles(base).includes(p.title)) base.title = p.title;
  return base;
}

// ---------------------------------------------------------------------------------------------
// Récompenses de fin de partie

export interface RewardContext {
  mode: 'solo' | 'online';
  /** Nombre d'adversaires (IA ou humains). */
  opponents: number;
  /** Difficulté des IA (solo). */
  difficulty?: Difficulty;
  /** Nombre de 4-2-1 obtenus par le joueur pendant la partie. */
  count421: number;
  /** Lancers du joueur par combinaison, et lancers faits d'un geste (pour les défis). */
  combos?: Partial<Record<ComboKind, number>>;
  gestureThrows?: number;
  /** Nombre de manches de la partie, manches perdues par le joueur, maximum de jetons détenus. */
  rounds?: number;
  roundsLost?: number;
  maxTokens?: number;
  /** Jour local du joueur (événements, pièces boostées). */
  day?: string;
  /** Mort subite : récompense divisée par dix, la partie ne compte pas pour la progression. */
  suddenDeath?: boolean;
  /** Combinaisons réussies pendant la partie (album), meilleur coup, adversaires, heure (récap). */
  comboKeys?: string[];
  best?: { label: string; rank: number };
  opponentNames?: string[];
  hour?: number;
  /** Partie contre le patron de la semaine. */
  boss?: string;
  /** Place finale (1 = premier). Par défaut : 1 si victoire, dernier sinon. */
  place?: number;
  /** Durée réelle de la partie en minutes. */
  minutes?: number;
  /** Heure de fin de partie (ms) : happy hour. */
  now?: number;
  /**
   * Partie en ligne avec des ordinateurs : barème du solo selon leur niveau (le plus facile de la
   * table), sans le bonus « en ligne ».
   */
  botLevel?: Difficulty;
}

export interface Reward {
  won: boolean;
  xp: number;
  coins: number;
  lines: { label: string; xp: number; coins: number }[];
}

/** Victoire d'un joueur dans une partie terminée (les vrais ex æquo en tête gagnent tous). */
export function didWin(state: GameState, meId: string): boolean {
  const me = state.players.find((p) => p.id === meId);
  if (!me) return false;
  if (state.phase !== 'fini') return settledPlace(state, meId) === 1; // sorti le premier : gagné, même si les autres jouent encore
  if (state.tiedWinners?.length) return state.tiedWinners.includes(meId);
  return state.ranking[0] === meId;
}

export function computeReward(state: GameState, meId: string, ctx: RewardContext): Reward {
  if (!state.players.some((p) => p.id === meId) || (state.phase !== 'fini' && settledPlace(state, meId) == null)) return { won: false, xp: 0, coins: 0, lines: [] };
  return rewardFor(didWin(state, meId), state.round, { ...ctx, place: ctx.place ?? finalPlace(state, meId) });
}

/** Calcul de la récompense à partir du résultat (utilisé aussi par le serveur pour les comptes). */
export const SUDDEN_DEATH_FACTOR = 0.1;

export function rewardFor(won: boolean, rounds: number, ctx: RewardContext): Reward {
  if (ctx.suddenDeath) {
    const full = rewardFor(won, REWARDS.fullLengthRounds, { ...ctx, minutes: undefined, suddenDeath: false, count421: 0, day: '2000-01-03' });
    const xp = Math.round(full.xp * SUDDEN_DEATH_FACTOR), coins = Math.round(full.coins * SUDDEN_DEATH_FACTOR);
    return { won, xp, coins, lines: [{ label: 'Mort subite (récompense réduite)', xp, coins }] };
  }
  const players = Math.max(2, Math.floor(ctx.opponents) + 1);
  const place = Math.min(players, Math.max(1, Math.floor(ctx.place ?? (won ? 1 : players))));
  const placeF = (players - place) / (players - 1); // 1 pour le premier, 0 pour le dernier
  const durationF = ctx.minutes !== undefined
    ? Math.min(1, Math.max(REWARDS.minDurationFactor, ctx.minutes / REWARDS.fullMinutes))
    : Math.min(1, Math.max(REWARDS.minDurationFactor, rounds / REWARDS.fullLengthRounds));
  const mult = ctx.botLevel ? REWARDS.difficulty[ctx.botLevel] : ctx.mode === 'online' ? REWARDS.online : REWARDS.difficulty[ctx.difficulty ?? 'normal'];
  const maxCoins = REWARDS.coinsBase + REWARDS.coinsPerPlayer * (players - 1);
  const coins = Math.round(maxCoins * placeF * durationF * mult);
  const xp = Math.round((REWARDS.playXp + REWARDS.placeXp * placeF) * durationF * mult * (1 + 0.15 * (players - 2)));
  const lines: Reward['lines'] = [{
    label: won ? 'Victoire' : `${place}${place === 1 ? 're' : 'e'} place sur ${players}`,
    xp, coins: won ? Math.max(1, coins) : coins,
  }];
  const n421 = Math.min(REWARDS.bonus421Max, Math.max(0, Math.floor(ctx.count421)));
  if (n421 > 0) lines.push({ label: `4-2-1 × ${n421}`, xp: 0, coins: n421 * REWARDS.bonus421Coins });
  // Événement, premier week-end du mois ou happy hour : pièces boostées (le meilleur des trois).
  const ev = coinBoost(ctx.day ?? today());
  const hh = ctx.now !== undefined && happyHour(ctx.now) ? { factor: 2, label: 'Happy hour : pièces doublées' } : null;
  const boost = hh && (!ev || ev.factor <= hh.factor) ? hh : ev;
  if (boost) {
    const base = lines.reduce((a, l) => a + l.coins, 0);
    const extra = Math.round(base * (boost.factor - 1));
    if (extra > 0) lines.push({ label: boost.label, xp: 0, coins: extra });
  }
  return {
    won,
    xp: lines.reduce((acc, l) => acc + l.xp, 0),
    coins: lines.reduce((acc, l) => acc + l.coins, 0),
    lines,
  };
}

/**
 * Récompense « simple » d'une partie des autres modes (Courtisan, Coups Fourrés) : pièces, XP (et
 * bonus de niveau), points du pass. Ni statistiques du 421, ni succès, ni album.
 */
export function applyPlainReward(p: Profile, r: Reward, day: string): { profile: Profile; levelBefore: number; levelAfter: number; levelBonusCoins: number } {
  const levelBefore = levelInfo(p.xp).level;
  const xp = p.xp + r.xp;
  const levelAfter = levelInfo(xp).level;
  let levelBonusCoins = 0;
  for (let l = levelBefore + 1; l <= levelAfter; l++) levelBonusCoins += REWARDS.levelBonus(l);
  const profile = addSeasonPoints({ ...p, xp, coins: p.coins + r.coins + levelBonusCoins }, r.xp, day);
  return { profile, levelBefore, levelAfter, levelBonusCoins };
}

export interface Applied {
  profile: Profile;
  levelBefore: number;
  levelAfter: number;
  levelBonusCoins: number;
  /** Défis du jour accomplis par cette partie. */
  questsDone?: { id: string; text: string }[];
  /** Succès débloqués par cette partie (pièces déjà ajoutées). */
  achievementsDone?: { id: string; icon: string; name: string; coins: number }[];
  /** Sacs de dés trouvés pendant cette partie. */
  bagsFound?: number;
}

/** Nombre d'objets achetés (hors objets gratuits). */
export const purchases = (p: Profile) => p.owned.filter((id) => (getItem(id)?.price ?? 0) > 0).length;

/** Débloque les succès atteints et verse leurs pièces. */
export function checkAchievements(p: Profile, now = Date.now()): { profile: Profile; unlocked: AchievementDef[] } {
  const unlocked = newlyUnlocked({ stats: p.stats, level: levelInfo(p.xp).level, purchases: purchases(p), owned: p.owned }, p.achievements);
  if (!unlocked.length) return { profile: p, unlocked };
  const achievements = { ...p.achievements };
  for (const a of unlocked) achievements[a.id] = now;
  return { profile: { ...p, achievements, coins: p.coins + unlocked.reduce((n, a) => n + a.coins, 0) }, unlocked };
}

/** Pièces gagnées ou dépensées hors partie (mise, cagnotte, gain de tournoi). Refuse un solde négatif. */
export function adjustCoins(p: Profile, delta: number): Profile | null {
  if (!Number.isFinite(delta) || p.coins + delta < 0) return null;
  return { ...p, coins: p.coins + Math.round(delta) };
}

/** Cagnotte d'une table avec mise remportée. */
export function applyPot(p: Profile, amount: number): { profile: Profile; unlocked: AchievementDef[] } {
  return checkAchievements({ ...p, coins: p.coins + amount, stats: { ...p.stats, potsWon: p.stats.potsWon + 1 } });
}

/** Fin d'un tournoi pour un joueur : place (0 = vainqueur) et gain éventuel. */
export function applyTournament(p: Profile, place: number, prize: number): { profile: Profile; unlocked: AchievementDef[] } {
  const stats = { ...p.stats, tournaments: p.stats.tournaments + 1, tournamentWins: p.stats.tournamentWins + (place === 0 ? 1 : 0) };
  return checkAchievements({ ...p, coins: p.coins + Math.max(0, prize), stats });
}

/** Résumé de la partie pour les défis. */
export function summarize(reward: Reward, ctx: RewardContext): GameSummary {
  return {
    won: reward.won, mode: ctx.mode, difficulty: ctx.difficulty, opponents: ctx.opponents,
    combos: ctx.combos ?? {}, gestureThrows: ctx.gestureThrows ?? 0,
  };
}

/** Récompense + défis du jour, en une seule opération (jeu et serveur). */
export function applyGameEnd(p: Profile, reward: Reward, ctx: RewardContext, day = today(), rng: () => number = randomFloat): Applied {
  const a = applyReward(p, reward, ctx.count421);
  // Mort subite : quelques pièces et un peu d'XP, mais ni statistiques, ni défis, ni succès, ni pass.
  if (ctx.suddenDeath) return { ...a, profile: { ...a.profile, stats: p.stats }, questsDone: [], achievementsDone: [] };
  const { quests, completed } = applySummary(p.quests, summarize(reward, ctx), day);
  // Statistiques détaillées (pour les succès)
  const c = ctx.combos ?? {};
  const s0 = a.profile.stats;
  const streak = reward.won ? s0.streak + 1 : 0;
  const stats: Stats = {
    ...s0,
    onlineGames: s0.onlineGames + (ctx.mode === 'online' ? 1 : 0),
    onlineWins: s0.onlineWins + (ctx.mode === 'online' && reward.won ? 1 : 0),
    hardWins: s0.hardWins + (ctx.mode === 'solo' && ctx.difficulty === 'difficile' && reward.won ? 1 : 0),
    brelans: s0.brelans + (c.brelan ?? 0),
    aces: s0.aces + (c['11x'] ?? 0) + (c['111'] ?? 0),
    gestures: s0.gestures + (ctx.gestureThrows ?? 0),
    streak,
    bestStreak: Math.max(s0.bestStreak, streak),
    bigTableWins: s0.bigTableWins + (reward.won && ctx.opponents >= 3 ? 1 : 0),
    triAces: s0.triAces + (c['111'] ?? 0),
    perfectWins: s0.perfectWins + (reward.won && ctx.roundsLost === 0 && (ctx.rounds ?? 0) >= 5 ? 1 : 0),
    comebacks: s0.comebacks + (reward.won && (ctx.maxTokens ?? 0) >= 10 ? 1 : 0),
    triple421: (s0.triple421 ?? 0) + (ctx.count421 >= 3 ? 1 : 0),
    nenettes3: (s0.nenettes3 ?? 0) + ((c.nenette ?? 0) >= 3 ? 1 : 0),
    midnight: (s0.midnight ?? 0) + (ctx.hour === 0 ? 1 : 0),
    bigComebacks: (s0.bigComebacks ?? 0) + (reward.won && (ctx.maxTokens ?? 0) >= 15 ? 1 : 0),
  };
  // Patron de la semaine battu (une fois par semaine).
  let base: Profile = { ...a.profile, quests, stats };
  // Les habitués de l'ordinateur se souviennent des scores.
  if (ctx.mode === 'solo' && ctx.opponentNames?.length) {
    const v = { ...(base.vsAi ?? {}) };
    for (const n of ctx.opponentNames.slice(0, 5)) { const r = v[n] ?? { w: 0, l: 0 }; v[n] = reward.won ? { ...r, w: r.w + 1 } : { ...r, l: r.l + 1 }; }
    base = { ...base, vsAi: v };
  }
  const extra: { id: string; icon: string; name: string; coins: number }[] = [];
  let bossBag = 0;
  if (ctx.boss && reward.won) {
    const b = bossOfWeek(day);
    const wk = weekKey(day);
    if (b.id === ctx.boss && base.bossWeek !== wk) {
      base = { ...base, bossWeek: wk, coins: base.coins + BOSS_COINS, stats: { ...base.stats, bossWins: base.stats.bossWins + 1 },
        titles: [...new Set([...(base.titles ?? []), `patron:${b.id}`])] };
      extra.push({ id: `patron-${wk}`, icon: '🏆', name: `${b.name}, patron de la semaine, est battu`, coins: BOSS_COINS });
      bossBag = 1;
    }
  }
  // Sac de dés : chance à chaque partie terminée, garanti au bout de BAG_PITY parties sans sac.
  const pity = (base.pity ?? 0) + 1;
  const found = (pity >= BAG_PITY || rng() < bagChance(reward, ctx) ? 1 : 0) + bossBag;
  base = { ...base, pity: found - bossBag > 0 ? 0 : pity, bags: Math.min(BAGS_MAX, (base.bags ?? 0) + found) };
  // Saint-Nicolas / fêtes : défis d'événement et adversaire spécial.
  const fe = applyFetesGame(base, { game: '421', won: reward.won, combos: ctx.combos, boss: ctx.boss }, day);
  base = fe.profile;
  extra.push(...fe.done);
  const al = applyAlbum(base, ctx.comboKeys ?? []);
  extra.push(...al.done);
  const withRecap = recordMonth(al.profile, reward, ctx, day);
  const ach = checkAchievements(addSeasonPoints(withRecap, reward.xp, day));
  return {
    ...a,
    profile: ach.profile,
    questsDone: completed.map((q) => ({ id: q.id, text: q.text })),
    achievementsDone: [...extra, ...ach.unlocked.map((x) => ({ id: x.id, icon: x.icon, name: x.name, coins: x.coins }))],
    bagsFound: found,
  };
}

// ---------------------------------------------------------------------------------------------
// Dés de collection : sacs, ouverture, éclats, fabrication, vitrine

export const BAG_PITY = 10;
export const BAGS_MAX = 99;
/**
 * Chance de trouver un sac en fin de partie : 22 % en gagnant, 10 % sinon, un peu plus à une
 * grande table, moins pour une partie très courte. Au plus tard un sac toutes les 10 parties.
 */
export function bagChance(reward: Reward, ctx: RewardContext): number {
  const players = Math.max(2, Math.floor(ctx.opponents) + 1);
  const dur = ctx.minutes !== undefined ? Math.min(1, Math.max(0.3, ctx.minutes / 10)) : Math.min(1, Math.max(0.3, (ctx.rounds ?? 10) / 8));
  return Math.min(0.5, (reward.won ? 0.22 : 0.1) * (1 + 0.1 * (players - 2)) * dur);
}

export interface BagResult { id: string; kind: 'de' | 'effet'; rarity: Rarity; shiny: boolean; duplicate: boolean; shards: number; series?: string }
/**
 * Ouvre un sac : un dé (3 fois sur 4) ou un effet de lancer, tiré selon les raretés.
 * Un doublon est converti en éclats. Une série complétée donne son titre et son tapis.
 */
export function openBag(p: Profile, rng: () => number = randomFloat): { profile: Profile; result: BagResult } | null {
  if (!p.bags || p.bags < 1) return null;
  const isFx = rng() < FX_SHARE;
  let x = rng(), rarity: Rarity = 'commun';
  for (const r of RARITIES) { if (x < RARITY_ODDS[r]) { rarity = r; break; } x -= RARITY_ODDS[r]; }
  const pool: { id: string }[] = isFx ? FX.filter((f) => f.rarity === rarity) : COLLECTION.filter((c) => c.rarity === rarity);
  const pick = pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
  const shiny = !isFx && rng() < SHINY_ODDS;
  const id = shiny ? pick.id + SHINY_SUFFIX : pick.id;
  const duplicate = p.owned.includes(id);
  const shards = duplicate ? SHARDS_FOR_DUPLICATE[rarity] * (shiny ? 2 : 1) : 0;
  const s = applySeries({ ...p, bags: p.bags - 1, shards: (p.shards ?? 0) + shards, owned: duplicate ? p.owned : [...p.owned, id] });
  return { profile: s.profile, result: { id, kind: isFx ? 'effet' : 'de', rarity, shiny, duplicate, shards, series: s.done[0] } };
}
/** Fabrique un dé ou un effet de collection avec des éclats (brillants et dés de saison exclus). */
export function craftDie(p: Profile, id: string): Profile | null {
  const rarity = collectionDie(id)?.rarity ?? fxDef(id)?.rarity;
  if (!rarity || isShiny(id) || isSeasonDie(id) || isInviteDie(id) || p.owned.includes(id)) return null;
  const cost = CRAFT_COST[rarity];
  if ((p.shards ?? 0) < cost) return null;
  return applySeries({ ...p, shards: (p.shards ?? 0) - cost, owned: [...p.owned, id] }).profile;
}
/** Séries complétées (version normale ou brillante de chaque dé) : titre et tapis exclusif. */
export function applySeries(p: Profile): { profile: Profile; done: string[] } {
  const own = new Set(p.owned);
  const done = SERIES.filter((s) => !(p.titles ?? []).includes(`serie:${s.id}`) && s.dice.every((d) => own.has(d) || own.has(d + SHINY_SUFFIX)));
  if (!done.length) return { profile: p, done: [] };
  return {
    profile: { ...p, titles: [...new Set([...(p.titles ?? []), ...done.map((s) => `serie:${s.id}`)])], owned: [...new Set([...p.owned, ...done.map((s) => s.felt)])] },
    done: done.map((s) => s.id),
  };
}
/** Équipe un effet de lancer possédé (ou le retire : id null). */
export function equipFx(p: Profile, kind: FxKind, id: string | null): Profile | null {
  if (id === null) { const fx = { ...(p.fx ?? {}) }; delete fx[kind]; return { ...p, fx }; }
  if (fxDef(id)?.kind !== kind || !p.owned.includes(id)) return null;
  return { ...p, fx: { ...(p.fx ?? {}), [kind]: id } };
}
/** Vitrine : jusqu'à 3 dés de collection possédés, visibles sur le profil. */
export function setShowcase(p: Profile, ids: string[]): Profile | null {
  if (!Array.isArray(ids) || ids.length > 3) return null;
  const clean = [...new Set(ids)];
  if (clean.some((id) => typeof id !== 'string' || !collectionDie(id) || !p.owned.includes(id))) return null;
  return { ...p, showcase: clean };
}
/** Nombre de dés de collection différents possédés (brillants à part). */
export function collectionCount(p: Profile): { owned: number; total: number; shiny: number; fx: number; fxTotal: number } {
  const own = new Set(p.owned);
  return { owned: COLLECTION.filter((c) => own.has(c.id)).length, total: COLLECTION.length, shiny: COLLECTION.filter((c) => own.has(c.id + SHINY_SUFFIX)).length,
    fx: FX.filter((f) => own.has(f.id)).length, fxTotal: FX.length };
}
export { baseIdOf };

/** Récupérer un défi accompli : pièces + XP (avec bonus de niveau éventuel). */
export function claimQuest(p: Profile, id: string, day = today()): { profile: Profile; quest: QuestDef; levelAfter: number } | null {
  const def = canClaim(p.quests, id, day);
  if (!def) return null;
  const cur = questsFor(p.quests, day);
  const before = levelInfo(p.xp).level;
  const xp = p.xp + def.xp;
  const after = levelInfo(xp).level;
  let bonus = 0;
  for (let l = before + 1; l <= after; l++) bonus += REWARDS.levelBonus(l);
  return {
    profile: checkAchievements(addSeasonPoints({ ...p, xp, coins: p.coins + def.coins + bonus, quests: { ...cur, claimed: [...cur.claimed, id] }, stats: { ...p.stats, questsClaimed: p.stats.questsClaimed + 1 } }, def.xp, day)).profile,
    quest: def,
    levelAfter: after,
  };
}

export function applyReward(p: Profile, r: Reward, count421: number): Applied {
  const levelBefore = levelInfo(p.xp).level;
  const xp = p.xp + r.xp;
  const levelAfter = levelInfo(xp).level;
  let levelBonusCoins = 0;
  for (let l = levelBefore + 1; l <= levelAfter; l++) levelBonusCoins += REWARDS.levelBonus(l);
  return {
    profile: {
      ...p,
      xp,
      coins: p.coins + r.coins + levelBonusCoins,
      stats: { ...p.stats, played: p.stats.played + 1, won: p.stats.won + (r.won ? 1 : 0), total421: p.stats.total421 + count421 },
    },
    levelBefore,
    levelAfter,
    levelBonusCoins,
  };
}

// ---------------------------------------------------------------------------------------------
// Boutique

export type BuyCheck = { ok: true } | { ok: false; reason: 'owned' | 'level' | 'coins' | 'unknown' | 'event' | 'pass' };

export function canBuy(p: Profile, item: Item | undefined, day = today()): BuyCheck {
  // Après un prestige, les niveaux requis ne s'appliquent plus.
  if (item && (p.prestige ?? 0) > 0 && !p.owned.includes(item.id) && !item.pass && !(item.event && activeEvent(day)?.id !== item.event)) {
    return p.coins < item.price ? { ok: false, reason: 'coins' } : { ok: true };
  }
  if (!item) return { ok: false, reason: 'unknown' };
  if (p.owned.includes(item.id)) return { ok: false, reason: 'owned' };
  if (item.pass) return { ok: false, reason: 'pass' };
  if (item.event && activeEvent(day)?.id !== item.event) return { ok: false, reason: 'event' };
  if (levelInfo(p.xp).level < item.level) return { ok: false, reason: 'level' };
  if (p.coins < item.price) return { ok: false, reason: 'coins' };
  return { ok: true };
}

export function buy(p: Profile, id: string, day = today()): Profile | null {
  const item = getItem(id);
  if (!canBuy(p, item, day).ok) return null;
  return checkAchievements({ ...p, coins: p.coins - item!.price, owned: [...p.owned, id] }).profile;
}

export function equip(p: Profile, id: string): Profile | null {
  const item = getItem(id);
  if (!item || !p.owned.includes(id)) return null;
  return { ...p, equipped: { ...p.equipped, [item.category]: id } };
}

// ---------------------------------------------------------------------------------------------
// Série de connexions, pass de saison, titres

/** Récompenses de la série : jour 1 à 7, le 7e jour est un coffre. */
export const DAILY_REWARDS = [
  { coins: 3, xp: 0 }, { coins: 5, xp: 0 }, { coins: 7, xp: 5 }, { coins: 8, xp: 5 },
  { coins: 10, xp: 10 }, { coins: 12, xp: 10 }, { coins: 40, xp: 50 },
];
const prevDay = (day: string) => new Date(Date.parse(`${day}T12:00:00Z`) - 86400_000).toISOString().slice(0, 10);

/** État de la série pour aujourd'hui : position dans la semaine (1 à 7) et récupérable ? */
export function dailyStatus(p: Profile, day = today()): { count: number; cycleDay: number; canClaim: boolean } {
  const d = p.daily;
  if (d?.last === day) return { count: d.count, cycleDay: ((d.count - 1) % 7) + 1, canClaim: false };
  const count = d && d.last === prevDay(day) ? d.count + 1 : 1;
  return { count, cycleDay: ((count - 1) % 7) + 1, canClaim: true };
}
export function claimDaily(p: Profile, day = today()): { profile: Profile; coins: number; xp: number; cycleDay: number; bag: number } | null {
  const st = dailyStatus(p, day);
  if (!st.canClaim) return null;
  const r = DAILY_REWARDS[st.cycleDay - 1];
  const before = levelInfo(p.xp).level, after = levelInfo(p.xp + r.xp).level;
  let bonus = 0;
  for (let l = before + 1; l <= after; l++) bonus += REWARDS.levelBonus(l);
  const bag = st.cycleDay === 7 ? 1 : 0; // le coffre du 7e jour contient un sac de dés
  const profile = checkAchievements(addSeasonPoints({ ...p, xp: p.xp + r.xp, coins: p.coins + r.coins + bonus, daily: { last: day, count: st.count },
    bags: Math.min(BAGS_MAX, (p.bags ?? 0) + bag) }, r.xp, day)).profile;
  return { profile, coins: r.coins, xp: r.xp, cycleDay: st.cycleDay, bag };
}

/**
 * Pass de saison : un par mois, 20 paliers (1 point = 1 XP gagné dans le mois).
 * Paliers de plus en plus chers : 250 points pour le 1er, puis +30 à chaque palier (≈ 10 700 au total),
 * pour qu'un joueur assidu y passe le mois au lieu de deux jours.
 */
export const PASS_TIERS = 20;
/** Points cumulés nécessaires pour atteindre le palier `tier` (0 pour le palier 0). */
export const passThreshold = (tier: number) => (tier <= 0 ? 0 : 250 * tier + 15 * tier * (tier - 1));
/** Palier atteint avec ce nombre de points, et progression vers le suivant. */
export function passProgress(points: number): { tier: number; into: number; need: number } {
  let tier = 0;
  while (tier < PASS_TIERS && points >= passThreshold(tier + 1)) tier++;
  if (tier >= PASS_TIERS) return { tier, into: 1, need: 1 };
  return { tier, into: points - passThreshold(tier), need: passThreshold(tier + 1) - passThreshold(tier) };
}
export const seasonId = (day: string) => day.slice(0, 7);
export type PassReward = { coins: number; item?: string; title?: string };
export function passReward(tier: number, season: string): PassReward {
  const items = passItems(season);
  if (tier === 5) return { coins: 0, item: items.accessoire };
  if (tier === 10) return { coins: 50 };
  if (tier === 15) return { coins: 0, item: items.felt };
  if (tier === 20) return { coins: 30, item: items.dice, title: `pass:${season}` };
  return { coins: 5 + Math.floor(tier / 2) };
}
/** Saison en cours (remise à zéro au changement de mois). */
export function seasonOf(p: Profile, day = today()) {
  const id = seasonId(day);
  return p.season?.id === id ? p.season : { id, points: 0, claimed: [] as number[] };
}
export function addSeasonPoints(p: Profile, points: number, day = today()): Profile {
  if (points <= 0) return p;
  const s = seasonOf(p, day);
  return { ...p, season: { ...s, points: s.points + Math.floor(points) } };
}
export function claimPassTier(p: Profile, tier: number, day = today()): { profile: Profile; reward: PassReward } | null {
  const s = seasonOf(p, day);
  if (!Number.isInteger(tier) || tier < 1 || tier > PASS_TIERS || s.claimed.includes(tier) || s.points < passThreshold(tier)) return null;
  const r = passReward(tier, s.id);
  const owned = r.item && !p.owned.includes(r.item) ? [...p.owned, r.item] : p.owned;
  const titles = r.title ? [...new Set([...(p.titles ?? []), r.title])] : p.titles;
  return { profile: { ...p, coins: p.coins + r.coins, owned, titles, season: { ...s, claimed: [...s.claimed, tier] } }, reward: r };
}

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
export const monthName = (season: string) => `${MONTHS[Number(season.slice(5, 7)) - 1]} ${season.slice(0, 4)}`;
/** « de novembre 2026 », « d’octobre 2026 » (élision devant avril, août, octobre). */
export const ofMonth = (season: string) => (/^[aeo]/.test(monthName(season)) ? `d’${monthName(season)}` : `de ${monthName(season)}`);
export const LEAGUES = ['Bronze', 'Argent', 'Or', 'Saphir', 'Rubis', 'Diamant'];
/** Ligues : groupes de 20, les 3 premiers montent (et sont récompensés), les 3 derniers descendent. */
export const LEAGUE_SIZE = 20;
export const LEAGUE_PROMOTE = 3;
export const LEAGUE_DEMOTE = 3;
export const LEAGUE_PRIZES = [60, 40, 25];
/** Parrainage : bonus pour le parrain et le filleul après 3 parties du filleul. */
export const REFERRAL_BONUS = 75;
export const REFERRAL_GAMES = 10;
/** Parrainage : un sac de dés par filleul qui a joué REFERRAL_GAMES parties, au plus 3 sacs par compte. */
export const REFERRAL_BAGS_MAX = 3;
/** Un sac de dés offert au retour après ce nombre de jours d'absence. */
export const RETURN_DAYS = 3;
/** Clubs : 30 membres, création payante (contre le spam), coffre commun de la semaine. */
export const CLUB_MAX = 30;
export const CLUB_COST = 100;
export const CLUB_EMBLEMS = ['🍺', '🎲', '🦁', '🐓', '⚓', '🌹', '🎩', '🔥', '🍀', '👑', '🦊', '🐻'];
export const CLUB_CHEST = [{ wins: 15, coins: 15 }, { wins: 40, coins: 40 }, { wins: 80, coins: 80 }];

/** Titres disponibles : succès débloqués, pass de saison complétés, ligues atteintes. */
export function availableTitles(p: Profile): string[] {
  return [...Object.keys(p.achievements), ...(p.titles ?? [])];
}
export function titleLabel(id: string | undefined): string | null {
  if (!id) return null;
  if (id.startsWith('patron:')) return `Tombeur de ${BOSSES.find((b) => b.id === id.slice(7))?.name ?? 'patron'}`;
  if (id === 'album:complet') return 'Collectionneur de combinaisons';
  if (id.startsWith('fete:')) return feteTitle(id);
  if (id.startsWith('pass:')) return `Champion ${ofMonth(id.slice(5))}`;
  if (id.startsWith('ligue:')) return `Ligue ${id.slice(6)}`;
  if (id.startsWith('serie:')) return SERIES.find((x) => x.id === id.slice(6))?.title ?? null;
  if (id.startsWith('saison:')) { const [season, div] = id.slice(7).split('_'); return `${DIVISIONS.find((d) => d.id === div)?.name ?? 'Classé'} ${ofMonth(season)}`; }
  return ACHIEVEMENTS.find((a) => a.id === id)?.name ?? null;
}
export function setTitle(p: Profile, id: string | null): Profile | null {
  if (id === null || id === '') { const n = { ...p }; delete n.title; return n; }
  return availableTitles(p).includes(id) ? { ...p, title: id } : null;
}
// ---------------------------------------------------------------------------------------------
// Album des combinaisons

export const ALBUM = [
  { id: 'grands', name: 'Les grands coups', keys: ['421', '111'], coins: 30 },
  { id: 'as', name: 'Deux as', keys: ['611', '511', '411', '311', '211'], coins: 30 },
  { id: 'brelans', name: 'Les brelans', keys: ['666', '555', '444', '333', '222'], coins: 40 },
  { id: 'suites', name: 'Les suites', keys: ['654', '543', '432', '321'], coins: 30 },
  { id: 'nenette', name: 'La nénette', keys: ['221'], coins: 10 },
];
export const ALBUM_KEYS = ALBUM.flatMap((a) => a.keys);
export const ALBUM_FULL_COINS = 100;
/** Clé d'album d'une combinaison (dés triés), ou null si elle n'est pas dans l'album. */
export const albumKey = (dice: number[]) => { const k = [...dice].sort((a, b) => b - a).join(''); return ALBUM_KEYS.includes(k) ? k : null; };

export function applyAlbum(p: Profile, keys: string[]): { profile: Profile; done: { id: string; icon: string; name: string; coins: number }[] } {
  const add = keys.filter((k) => ALBUM_KEYS.includes(k) && !(p.album ?? []).includes(k));
  if (!add.length) return { profile: p, done: [] };
  const album = [...(p.album ?? []), ...new Set(add)];
  const pages = [...(p.albumPages ?? [])];
  const done: { id: string; icon: string; name: string; coins: number }[] = [];
  let coins = p.coins;
  for (const page of ALBUM) {
    if (pages.includes(page.id) || !page.keys.every((k) => album.includes(k))) continue;
    pages.push(page.id);
    coins += page.coins;
    done.push({ id: `album-${page.id}`, icon: '📒', name: `Album : page « ${page.name} » complète`, coins: page.coins });
  }
  let owned = p.owned, titles = p.titles;
  if (pages.length === ALBUM.length && !owned.includes('dice-album')) {
    owned = [...owned, 'dice-album'];
    titles = [...new Set([...(titles ?? []), 'album:complet'])];
    coins += ALBUM_FULL_COINS;
    done.push({ id: 'album-complet', icon: '🏅', name: 'Album complet : dés « Collectionneur » débloqués', coins: ALBUM_FULL_COINS });
  }
  return { profile: { ...p, album, albumPages: pages, coins, owned, titles }, done };
}

// ---------------------------------------------------------------------------------------------
// Récap du mois

const emptyMonth = (id: string): MonthRecap => ({ id, played: 0, won: 0, c421: 0, best: null, opp: {}, hours: Array(24).fill(0) });
export function recordMonth(p: Profile, reward: Reward, ctx: RewardContext, day: string): Profile {
  const id = day.slice(0, 7);
  let month = p.month, prevMonth = p.prevMonth;
  if (!month || month.id !== id) { if (month) prevMonth = month; month = emptyMonth(id); }
  const opp = { ...month.opp };
  for (const n of ctx.opponentNames ?? []) opp[n] = (opp[n] ?? 0) + 1;
  const hours = [...month.hours];
  const h = ctx.hour ?? new Date().getHours();
  if (h >= 0 && h < 24) hours[h]++;
  const best = ctx.best && (!month.best || ctx.best.rank > month.best.rank) ? ctx.best : month.best;
  return { ...p, prevMonth, month: { ...month, played: month.played + 1, won: month.won + (reward.won ? 1 : 0), c421: month.c421 + ctx.count421, best, opp, hours } };
}

// ---------------------------------------------------------------------------------------------
// Prestige

export const PRESTIGE_LEVEL = 30;
export const PRESTIGE_COINS = 60;
export function doPrestige(p: Profile): Profile | null {
  if (levelInfo(p.xp).level < PRESTIGE_LEVEL) return null;
  return { ...p, xp: 0, prestige: (p.prestige ?? 0) + 1, coins: p.coins + PRESTIGE_COINS };
}

export function completeTutorial(p: Profile): Profile | null {
  if (p.tutorial) return null;
  return { ...p, tutorial: 1, coins: p.coins + 50 };
}

// ---------------------------------------------------------------------------------------------
// Stockage (navigateur). Le profil est local à l'appareil : voir README.

const KEY = '421.profil';
export function loadProfile(): Profile {
  try { return sanitizeProfile(JSON.parse(localStorage.getItem(KEY) ?? 'null')); } catch { return newProfile(); }
}
export function saveProfile(p: Profile) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* stockage indisponible */ }
}

// --- Coffre du comptoir : un coffre gratuit, qui se recharge 24 h après chaque ouverture ---
export const CHEST_COOLDOWN = 24 * 3600_000;
export const CHEST_BAG_CHANCE = 0.1;
/** Temps restant avant le prochain coffre (0 : il est prêt). */
export function chestWait(p: Profile, t = Date.now()): number {
  return p.chestAt ? Math.max(0, p.chestAt + CHEST_COOLDOWN - t) : 0;
}
export function openChest(p: Profile, t = Date.now(), rnd = Math.random): { profile: Profile; coins: number; bag: boolean } | null {
  if (chestWait(p, t) > 0) return null;
  const coins = 15 + Math.floor(rnd() * 26);
  const bag = rnd() < CHEST_BAG_CHANCE;
  return { coins, bag, profile: { ...p, chestAt: t, coins: p.coins + coins, bags: bag ? Math.min(BAGS_MAX, (p.bags ?? 0) + 1) : p.bags } };
}
