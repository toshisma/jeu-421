/**
 * Saint-Nicolas et fêtes de fin d'année : ce qui rend décembre marquant.
 *  - un adversaire spécial par événement (dans l'esprit du Patron de la semaine), battu une fois
 *    par événement : pièces modestes, un titre et un accessoire ;
 *  - 4 défis d'événement (sur toute sa durée, les 3 jeux comptent), réussis = pièces, et tous
 *    réussis = un dé de saison ;
 *  - le calendrier de l'avent : une case par jour du 1er au 24 décembre, seulement le jour même
 *    (jour de Bruxelles du serveur pour les comptes), jamais rattrapable ;
 *  - le bandeau d'annonce (« Saint-Nicolas passe dans 3 jours ») et la notification du jour J.
 * Logique pure : utilisée par le serveur (comptes) et par le jeu (invités, profil local).
 * Les dates de l'événement viennent de events.ts (`saint-nicolas` : 28/11–6/12, `fetes` : 20/12–2/1).
 */
import type { Profile } from './profile';
import type { ComboKind } from '../combos';
import type { BossDef } from './boss';
import { activeEvent, EVENTS } from './events';

export type FeteId = 'saint-nicolas' | 'fetes';
export const FETE_IDS: readonly FeteId[] = ['saint-nicolas', 'fetes'];
const isFete = (id: string | undefined): id is FeteId => !!id && (FETE_IDS as readonly string[]).includes(id);

const DAY_MS = 86400_000;
const t = (day: string) => Date.parse(`${day}T12:00:00Z`);
/** Jours entre deux dates AAAA-MM-JJ (b − a). */
export const daysBetween = (a: string, b: string) => Math.round((t(b) - t(a)) / DAY_MS);

// ---------------------------------------------------------------------------------------------
// L'événement en cours (une « édition » par année)

export interface FeteInstance { id: FeteId; key: string; start: string; end: string }

/** Édition de Saint-Nicolas ou des fêtes en cours ce jour-là (les fêtes débordent sur janvier). */
export function feteOf(day: string): FeteInstance | null {
  const e = activeEvent(day);
  if (!e || !isFete(e.id)) return null;
  const y = Number(day.slice(0, 4));
  const startYear = e.id === 'fetes' && day.slice(5) <= '06-30' ? y - 1 : y;
  const [start, end] = e.range(startYear);
  return { id: e.id, key: `${e.id}:${startYear}`, start, end: e.id === 'fetes' ? `${startYear + 1}-01-02` : end };
}

/** Début de l'édition d'un événement pour l'année (celle de son début). */
const startOf = (id: FeteId, year: number) => EVENTS.find((e) => e.id === id)!.range(year)[0];

/** Ce qu'on annonce ce jour-là (bandeau, push). `n` : nombre de jours restants. */
export type FeteMoment =
  | { kind: 'sn-soon' | 'sn-countdown' | 'fe-soon' | 'xmas-countdown' | 'ny-countdown'; n: number }
  | { kind: 'sn-day' | 'xmas-eve' | 'xmas' | 'ny-eve' | 'ny' | 'advent' };
/** Annonce : jusqu'à ANNOUNCE_DAYS jours avant le début d'un événement. */
export const ANNOUNCE_DAYS = 5;

export function feteMoment(day: string): FeteMoment | null {
  const y = Number(day.slice(0, 4));
  const md = day.slice(5);
  const f = feteOf(day);
  if (f?.id === 'saint-nicolas') {
    const n = daysBetween(day, `${y}-12-06`);
    return n === 0 ? { kind: 'sn-day' } : { kind: 'sn-countdown', n };
  }
  if (f?.id === 'fetes') {
    if (md <= '01-02') return { kind: 'ny' };
    if (md === '12-24') return { kind: 'xmas-eve' };
    if (md === '12-25') return { kind: 'xmas' };
    if (md === '12-31') return { kind: 'ny-eve' };
    if (md < '12-24') return { kind: 'xmas-countdown', n: daysBetween(day, `${y}-12-25`) };
    return { kind: 'ny-countdown', n: daysBetween(day, `${y + 1}-01-01`) };
  }
  const sn = daysBetween(day, startOf('saint-nicolas', y));
  if (sn >= 1 && sn <= ANNOUNCE_DAYS) return { kind: 'sn-soon', n: sn };
  const fe = daysBetween(day, startOf('fetes', y));
  if (fe >= 1 && fe <= ANNOUNCE_DAYS) return { kind: 'fe-soon', n: fe };
  if (adventDay(day)) return { kind: 'advent' };
  return null;
}

/** Décor de saison du bac 3D et de l'accueil (pendant l'événement seulement). */
export function seasonDecor(day: string): FeteId | null {
  return feteOf(day)?.id ?? null;
}

// ---------------------------------------------------------------------------------------------
// L'adversaire spécial

export interface FeteBoss {
  fete: FeteId;
  def: BossDef;
  /** Personnages (client/src/fetes/personas.ts) : le principal, puis ses acolytes. */
  cast: string[];
  /** Titre gagné (identifiant de titre « fete:… »). */
  title: string;
  /** Accessoire de saison gagné. */
  accessory: string;
}
export const FETE_BOSS_COINS = 25;

export const FETE_BOSSES: Record<FeteId, FeteBoss> = {
  'saint-nicolas': {
    fete: 'saint-nicolas',
    def: { id: 'ev-saint-nicolas', persona: 'saint-nicolas', name: 'Saint-Nicolas', sidekicks: 1,
      twist: 'Il vient avec le Père Fouettard : décharge seule, 6 jetons chacun, comme le 6 décembre.',
      config: { variant: 'decharge', startTokens: 6 } },
    cast: ['saint-nicolas', 'fouettard'], title: 'fete:saint-nicolas', accessory: 'acc-speculoos',
  },
  fetes: {
    fete: 'fetes',
    def: { id: 'ev-noel', persona: 'pere-noel', name: 'Le Père Noël', sidekicks: 0,
      twist: 'Les douze coups de minuit : 12 jetons seulement dans le pot, la partie va vite.',
      config: { totalTokens: 12 } },
    cast: ['pere-noel'], title: 'fete:noel', accessory: 'acc-cloche',
  },
};

/** Adversaire spécial du jour (pendant l'événement seulement). */
export function feteBoss(day: string): FeteBoss | null {
  const f = feteOf(day);
  return f ? FETE_BOSSES[f.id] : null;
}
export const FETE_TITLES: Record<string, string> = { 'fete:saint-nicolas': 'Enfant sage', 'fete:noel': 'Lutin des fêtes' };
export const feteTitle = (id: string): string | null => FETE_TITLES[id] ?? null;

// ---------------------------------------------------------------------------------------------
// Défis d'événement (toute la durée de l'événement, les trois jeux comptent)

export type FeteGameKind = '421' | 'cf' | 'dm' | 'pm';
/** Une partie terminée, vue par les défis d'événement. */
export interface FeteGame {
  game: FeteGameKind;
  won: boolean;
  combos?: Partial<Record<ComboKind, number>>;
  /** Adversaire spécial affronté (fixé par le serveur au début de la partie pour les comptes). */
  boss?: string;
}
export interface FeteChallenge { id: string; text: string; target: number; coins: number; progress: (g: FeteGame) => number }

const games = (g: FeteGame) => (g.game === '421' ? g.combos ?? {} : {});
const PLAY = () => 1;
export const FETE_CHALLENGES: Record<FeteId, FeteChallenge[]> = {
  'saint-nicolas': [
    { id: 'sn-jouer', text: 'Terminer 8 parties', target: 8, coins: 15, progress: PLAY },
    { id: 'sn-gagner', text: 'Gagner 4 parties', target: 4, coins: 20, progress: (g) => (g.won ? 1 : 0) },
    { id: 'sn-jeux', text: 'Jouer à trois jeux différents', target: 3, coins: 15, progress: () => 0 },
    { id: 'sn-421', text: 'Faire un 4-2-1 au 421', target: 1, coins: 20, progress: (g) => games(g)['421'] ?? 0 },
  ],
  fetes: [
    { id: 'fe-jouer', text: 'Terminer 12 parties', target: 12, coins: 15, progress: PLAY },
    { id: 'fe-gagner', text: 'Gagner 6 parties', target: 6, coins: 20, progress: (g) => (g.won ? 1 : 0) },
    { id: 'fe-jeux', text: 'Jouer à trois jeux différents', target: 3, coins: 15, progress: () => 0 },
    { id: 'fe-brelans', text: 'Faire 3 brelans au 421', target: 3, coins: 20, progress: (g) => games(g).brelan ?? 0 },
  ],
};
/** Défi « jouer aux trois jeux » : sa progression est le nombre de jeux différents joués. */
const isGamesChallenge = (id: string) => id.endsWith('-jeux');
/** Dé de saison gagné en réussissant tous les défis de l'événement. */
export const FETE_DIE: Record<FeteId, string> = { 'saint-nicolas': 'dice-mandarine', fetes: 'dice-champagne' };

/** État des défis de l'édition en cours (dans le profil). */
export interface FeteState {
  /** Édition (« saint-nicolas:2026 ») : tout repart à zéro à l'édition suivante. */
  k: string;
  p: Record<string, number>;
  /** Défis réussis (déjà payés). */
  done: string[];
  /** Jeux joués pendant l'édition. */
  g: FeteGameKind[];
  /** Adversaire spécial battu pendant l'édition. */
  boss?: 1;
}
export interface FeteDone { id: string; icon: string; name: string; coins: number }

/** État de l'édition du jour (vide si le profil parle d'une autre édition). */
export function feteState(p: Pick<Profile, 'fete'>, day: string): FeteState | null {
  const f = feteOf(day);
  if (!f) return null;
  return p.fete?.k === f.key ? p.fete : { k: f.key, p: {}, done: [], g: [] };
}
/** Progression affichée d'un défi. */
export function challengeProgress(st: FeteState, c: FeteChallenge): number {
  return Math.min(c.target, isGamesChallenge(c.id) ? st.g.length : st.p[c.id] ?? 0);
}

/**
 * Fin d'une partie (421, Coups Fourrés, Courtisan) : défis d'événement et adversaire spécial.
 * Les pièces sont versées tout de suite (pas de bouton à toucher), le dé quand tout est réussi.
 */
export function applyFetesGame(p: Profile, g: FeteGame, day: string): { profile: Profile; done: FeteDone[] } {
  const f = feteOf(day);
  const st0 = feteState(p, day);
  if (!f || !st0) return { profile: p, done: [] };
  const st: FeteState = { ...st0, p: { ...st0.p }, done: [...st0.done], g: st0.g.includes(g.game) ? [...st0.g] : [...st0.g, g.game] };
  const done: FeteDone[] = [];
  let coins = 0;
  const owned = [...p.owned];
  const titles = [...(p.titles ?? [])];
  for (const c of FETE_CHALLENGES[f.id]) {
    if (!isGamesChallenge(c.id)) st.p[c.id] = Math.min(c.target, (st.p[c.id] ?? 0) + Math.max(0, Math.floor(c.progress(g))));
    if (!st.done.includes(c.id) && challengeProgress(st, c) >= c.target) {
      st.done.push(c.id);
      coins += c.coins;
      done.push({ id: `fet-${c.id}`, icon: f.id === 'saint-nicolas' ? '🍊' : '🎄', name: c.text, coins: c.coins });
    }
  }
  const die = FETE_DIE[f.id];
  if (st.done.length === FETE_CHALLENGES[f.id].length && !owned.includes(die)) {
    owned.push(die);
    done.push({ id: `fet-die-${f.id}`, icon: '🎲', name: 'Dé de saison gagné', coins: 0 });
  }
  const boss = FETE_BOSSES[f.id];
  if (g.game === '421' && g.won && g.boss === boss.def.id && !st.boss) {
    st.boss = 1;
    coins += FETE_BOSS_COINS;
    if (!titles.includes(boss.title)) titles.push(boss.title);
    if (!owned.includes(boss.accessory)) owned.push(boss.accessory);
    done.push({ id: `fet-boss-${f.id}`, icon: f.id === 'saint-nicolas' ? '📖' : '🎅', name: `${boss.def.name} est battu`, coins: FETE_BOSS_COINS });
  }
  return { profile: { ...p, coins: p.coins + coins, owned, titles, fete: st }, done };
}

// ---------------------------------------------------------------------------------------------
// Calendrier de l'avent

export const ADVENT_LAST = 24;
export interface AdventState { y: number; d: number[] }
/** Case du jour (1 à 24 en décembre), sinon 0. */
export function adventDay(day: string): number {
  if (day.slice(5, 7) !== '12') return 0;
  const d = Number(day.slice(8, 10));
  return d >= 1 && d <= ADVENT_LAST ? d : 0;
}
/** Récompense modeste de chaque case : quelques pièces ; un sac de dés le 6 (Saint-Nicolas) et le 24. */
export function adventReward(d: number): { coins: number; bag: number } {
  if (d === 6) return { coins: 10, bag: 1 };
  if (d === ADVENT_LAST) return { coins: 20, bag: 1 };
  return { coins: d % 5 === 0 ? 10 : 5, bag: 0 };
}
/** Cases déjà ouvertes cette année. */
export function adventOpened(p: Pick<Profile, 'advent'>, day: string): number[] {
  const y = Number(day.slice(0, 4));
  return p.advent?.y === y ? p.advent.d : [];
}
/** Statut d'une case : ouverte, à ouvrir aujourd'hui, manquée, ou pas encore. */
export function adventCell(p: Pick<Profile, 'advent'>, day: string, d: number): 'open' | 'today' | 'missed' | 'later' {
  if (adventOpened(p, day).includes(d)) return 'open';
  const today = adventDay(day);
  if (day.slice(5, 7) !== '12') return 'later';
  if (d === today) return 'today';
  return d < Number(day.slice(8, 10)) ? 'missed' : 'later';
}
/** Ouvre la case du jour : une seule fois, seulement le jour même (le jour vient du serveur pour les comptes). */
export function claimAdvent(p: Profile, day: string): { profile: Profile; d: number; coins: number; bag: number } | null {
  const d = adventDay(day);
  if (!d) return null;
  const opened = adventOpened(p, day);
  if (opened.includes(d)) return null;
  const r = adventReward(d);
  return {
    profile: { ...p, coins: p.coins + r.coins, bags: Math.min(99, (p.bags ?? 0) + r.bag), advent: { y: Number(day.slice(0, 4)), d: [...opened, d].sort((a, b) => a - b) } },
    d, ...r,
  };
}

// ---------------------------------------------------------------------------------------------
// Profil : nettoyage des champs (profil chargé, profil d'invité repris)

export function cleanFete(raw: unknown): FeteState | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Partial<FeteState>;
  if (typeof r.k !== 'string' || !/^(saint-nicolas|fetes):\d{4}$/.test(r.k)) return undefined;
  const ids = FETE_CHALLENGES[r.k.split(':')[0] as FeteId].map((c) => c.id);
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
  const p: Record<string, number> = {};
  for (const id of ids) if (r.p && typeof r.p[id] === 'number') p[id] = Math.min(99, num(r.p[id]));
  const done = Array.isArray(r.done) ? [...new Set(r.done.filter((x) => ids.includes(x)))] : [];
  const g = Array.isArray(r.g) ? [...new Set(r.g.filter((x): x is FeteGameKind => x === '421' || x === 'cf' || x === 'dm' || x === 'pm'))] : [];
  return { k: r.k, p, done, g, ...(r.boss ? { boss: 1 as const } : {}) };
}
export function cleanAdvent(raw: unknown): AdventState | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Partial<AdventState>;
  if (typeof r.y !== 'number' || !Number.isInteger(r.y) || r.y < 2020 || r.y > 2200 || !Array.isArray(r.d)) return undefined;
  return { y: r.y, d: [...new Set(r.d.filter((x) => Number.isInteger(x) && x >= 1 && x <= ADVENT_LAST))].sort((a, b) => a - b) };
}

// ---------------------------------------------------------------------------------------------
// Notification du jour J (comptes abonnés aux notifications)

export function fetePush(day: string): { title: string; body: string } | null {
  const md = day.slice(5);
  if (md === '12-06') return { title: 'Joyeuse Saint-Nicolas !', body: 'Saint-Nicolas et le Père Fouettard vous attendent au comptoir, et la case du jour du calendrier de l’avent cache un sac de dés.' };
  if (md === '12-24') return { title: 'Joyeux réveillon !', body: 'La dernière case du calendrier de l’avent cache un sac de dés. Le Père Noël vous attend au comptoir.' };
  if (md === '01-01') return { title: 'Bonne année !', body: 'Bonne année au comptoir ! Les défis des fêtes se terminent demain.' };
  return null;
}

