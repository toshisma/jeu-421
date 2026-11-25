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
import { LIGHT_IDS, LIGHT_MOMENTS, galetteOf, lightIcon, lightOf, type LightId } from './calendar';

/** Les deux grands événements de décembre. */
export type BigFeteId = 'saint-nicolas' | 'fetes';
/** Toutes les « fêtes » : décembre + les moments légers du calendrier de l'année (shared/progress/calendar.ts). */
export type FeteId = BigFeteId | LightId;
export const FETE_IDS: readonly FeteId[] = ['saint-nicolas', 'fetes', ...LIGHT_IDS];
const isFete = (id: string | undefined): id is FeteId => !!id && (FETE_IDS as readonly string[]).includes(id);

const DAY_MS = 86400_000;
const t = (day: string) => Date.parse(`${day}T12:00:00Z`);
/** Jours entre deux dates AAAA-MM-JJ (b − a). */
export const daysBetween = (a: string, b: string) => Math.round((t(b) - t(a)) / DAY_MS);

// ---------------------------------------------------------------------------------------------
// L'événement en cours (une « édition » par année)

export interface FeteInstance { id: FeteId; key: string; start: string; end: string }

/**
 * Édition en cours ce jour-là : Saint-Nicolas ou les fêtes (qui débordent sur janvier), sinon un
 * moment léger du calendrier de l'année (Chandeleur, Pâques…).
 */
export function feteOf(day: string): FeteInstance | null {
  const e = activeEvent(day);
  const y = Number(day.slice(0, 4));
  if (!e || (e.id !== 'saint-nicolas' && e.id !== 'fetes')) {
    const l = lightOf(day);
    return l ? { id: l.id, key: `${l.id}:${y}`, start: l.start, end: l.end } : null;
  }
  const startYear = e.id === 'fetes' && day.slice(5) <= '06-30' ? y - 1 : y;
  const [start, end] = e.range(startYear);
  return { id: e.id, key: `${e.id}:${startYear}`, start, end: e.id === 'fetes' ? `${startYear + 1}-01-02` : end };
}

/** Début de l'édition d'un événement pour l'année (celle de son début). */
const startOf = (id: BigFeteId, year: number) => EVENTS.find((e) => e.id === id)!.range(year)[0];

/** Ce qu'on annonce ce jour-là (bandeau, push). `n` : nombre de jours restants. */
export type FeteMoment =
  | { kind: 'sn-soon' | 'sn-countdown' | 'fe-soon' | 'xmas-countdown' | 'ny-countdown'; n: number }
  | { kind: 'sn-day' | 'xmas-eve' | 'xmas' | 'ny-eve' | 'ny' | 'advent' }
  /** Moment léger du calendrier de l'année (le jour même seulement : pas d'annonce dans le bandeau). */
  | { kind: 'cal'; id: LightId };
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
  if (f) return { kind: 'cal', id: f.id as LightId };
  const sn = daysBetween(day, startOf('saint-nicolas', y));
  if (sn >= 1 && sn <= ANNOUNCE_DAYS) return { kind: 'sn-soon', n: sn };
  const fe = daysBetween(day, startOf('fetes', y));
  if (fe >= 1 && fe <= ANNOUNCE_DAYS) return { kind: 'fe-soon', n: fe };
  if (adventDay(day)) return { kind: 'advent' };
  return null;
}

/** Décor de saison du bac 3D et de l'accueil (pendant l'événement seulement) ; « galette » du 3 au 15 janvier. */
export type SeasonDecorKind = FeteId | 'galette';
export function seasonDecor(day: string): SeasonDecorKind | null {
  return feteOf(day)?.id ?? (galetteOf(day) ? 'galette' : null);
}
/** Petit emblème de chaque fête (fins de partie, menu du 421). */
export const FETE_ICON: Record<FeteId, string> = {
  'saint-nicolas': '🍊', fetes: '🎄',
  ...Object.fromEntries(LIGHT_MOMENTS.map((m) => [m.id, m.icon])) as Record<LightId, string>,
};

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
  /** Pièces de la première victoire de l'édition. */
  coins: number;
}
export const FETE_BOSS_COINS = 25;
/** Adversaires des moments légers : un peu moins (gains bas). */
export const LIGHT_BOSS_COINS = 15;

export const FETE_BOSSES: Partial<Record<FeteId, FeteBoss>> = {
  'saint-nicolas': {
    fete: 'saint-nicolas',
    def: { id: 'ev-saint-nicolas', persona: 'saint-nicolas', name: 'Saint-Nicolas', sidekicks: 1,
      twist: 'Il vient avec le Père Fouettard : décharge seule, 6 jetons chacun, comme le 6 décembre.',
      config: { variant: 'decharge', startTokens: 6 } },
    cast: ['saint-nicolas', 'fouettard'], title: 'fete:saint-nicolas', accessory: 'acc-speculoos', coins: FETE_BOSS_COINS,
  },
  fetes: {
    fete: 'fetes',
    def: { id: 'ev-noel', persona: 'pere-noel', name: 'Le Père Noël', sidekicks: 0,
      twist: 'Les douze coups de minuit : 12 jetons seulement dans le pot, la partie va vite.',
      config: { totalTokens: 12 } },
    cast: ['pere-noel'], title: 'fete:noel', accessory: 'acc-cloche', coins: FETE_BOSS_COINS,
  },
  paques: {
    fete: 'paques',
    def: { id: 'ev-paques', persona: 'lapin', name: 'Le Lapin de Pâques', sidekicks: 0,
      twist: 'La chasse aux œufs : 15 jetons seulement dans le pot, la partie file.',
      config: { totalTokens: 15 } },
    cast: ['lapin'], title: 'fete:paques', accessory: 'acc-oeuf', coins: LIGHT_BOSS_COINS,
  },
  halloween: {
    fete: 'halloween',
    def: { id: 'ev-halloween', persona: 'fantome', name: 'Le Fantôme du comptoir', sidekicks: 0,
      twist: 'Partie de minuit : décharge seule, 5 jetons chacun.',
      config: { variant: 'decharge', startTokens: 5 } },
    cast: ['fantome'], title: 'fete:halloween', accessory: 'acc-fantome', coins: LIGHT_BOSS_COINS,
  },
};

/** Adversaire spécial du jour (pendant l'événement seulement). */
export function feteBoss(day: string): FeteBoss | null {
  const f = feteOf(day);
  return f ? FETE_BOSSES[f.id] ?? null : null;
}
export const FETE_TITLES: Record<string, string> = {
  'fete:saint-nicolas': 'Enfant sage', 'fete:noel': 'Lutin des fêtes',
  'fete:paques': 'Dénicheur d’œufs', 'fete:halloween': 'Sans peur au comptoir', 'fete:reveillon': 'Podium du Réveillon',
};
/** Titre de la galette des rois, avec son année (« fete:galette-2027 »). */
export const galetteTitleFr = (year: string | number) => `Roi ou reine du 421 ${year}`;
export function feteTitle(id: string): string | null {
  const g = /^fete:galette-(\d{4})$/.exec(id);
  return g ? galetteTitleFr(g[1]) : FETE_TITLES[id] ?? null;
}

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
  // Moments légers : un seul défi, quelques pièces.
  chandeleur: [{ id: 'ch-gagner', text: 'Gagner 2 parties', target: 2, coins: 10, progress: (g) => (g.won ? 1 : 0) }],
  paques: [{ id: 'pa-gagner', text: 'Gagner 3 parties', target: 3, coins: 15, progress: (g) => (g.won ? 1 : 0) }],
  poisson: [{ id: 'po-jouer', text: 'Terminer 3 parties', target: 3, coins: 10, progress: PLAY }],
  musique: [{ id: 'mu-jeux', text: 'Jouer à deux jeux différents', target: 2, coins: 10, progress: () => 0 }],
  halloween: [{ id: 'ha-gagner', text: 'Gagner 2 parties', target: 2, coins: 10, progress: (g) => (g.won ? 1 : 0) }],
};
const BOSS_ICON: Partial<Record<FeteId, string>> = { 'saint-nicolas': '📖', fetes: '🎅', paques: '🐰', halloween: '👻' };
/** Défi « jouer aux trois jeux » : sa progression est le nombre de jeux différents joués. */
const isGamesChallenge = (id: string) => id.endsWith('-jeux');
/** Dé de saison gagné en réussissant tous les défis de l'événement (Saint-Nicolas et fêtes seulement). */
export const FETE_DIE: Partial<Record<FeteId, string>> = { 'saint-nicolas': 'dice-mandarine', fetes: 'dice-champagne' };

/** Pâques : œufs cachés. Chaque victoire a 1 chance sur 6 de cacher un sac de dés, un seul par Pâques. */
export const EGG_CHANCE = 1 / 6;

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
  /** Pâques : œuf (sac de dés) déjà trouvé. */
  egg?: 1;
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
export function applyFetesGame(p: Profile, g: FeteGame, day: string, rng: () => number = Math.random): { profile: Profile; done: FeteDone[] } {
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
      done.push({ id: `fet-${c.id}`, icon: FETE_ICON[f.id], name: c.text, coins: c.coins });
    }
  }
  const die = FETE_DIE[f.id];
  if (die && st.done.length === FETE_CHALLENGES[f.id].length && !owned.includes(die)) {
    owned.push(die);
    done.push({ id: `fet-die-${f.id}`, icon: '🎲', name: 'Dé de saison gagné', coins: 0 });
  }
  const boss = FETE_BOSSES[f.id];
  if (boss && g.game === '421' && g.won && g.boss === boss.def.id && !st.boss) {
    st.boss = 1;
    coins += boss.coins;
    if (!titles.includes(boss.title)) titles.push(boss.title);
    if (!owned.includes(boss.accessory)) owned.push(boss.accessory);
    done.push({ id: `fet-boss-${f.id}`, icon: BOSS_ICON[f.id] ?? FETE_ICON[f.id], name: `${boss.def.name} est battu`, coins: boss.coins });
  }
  // Pâques : un œuf caché derrière une victoire (n'importe quel jeu), un seul par Pâques.
  let bags = p.bags ?? 0;
  if (f.id === 'paques' && g.won && !st.egg && rng() < EGG_CHANCE) {
    st.egg = 1;
    bags = Math.min(99, bags + 1);
    done.push({ id: 'fet-egg-paques', icon: '🥚', name: 'Œuf de Pâques trouvé : un sac de dés', coins: 0 });
  }
  return { profile: { ...p, coins: p.coins + coins, owned, titles, fete: st, ...(bags !== (p.bags ?? 0) ? { bags } : {}) }, done };
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
  if (typeof r.k !== 'string' || !/^[a-z-]+:\d{4}$/.test(r.k) || !isFete(r.k.split(':')[0])) return undefined;
  const ids = FETE_CHALLENGES[r.k.split(':')[0] as FeteId].map((c) => c.id);
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
  const p: Record<string, number> = {};
  for (const id of ids) if (r.p && typeof r.p[id] === 'number') p[id] = Math.min(99, num(r.p[id]));
  const done = Array.isArray(r.done) ? [...new Set(r.done.filter((x) => ids.includes(x)))] : [];
  const g = Array.isArray(r.g) ? [...new Set(r.g.filter((x): x is FeteGameKind => x === '421' || x === 'cf' || x === 'dm' || x === 'pm'))] : [];
  return { k: r.k, p, done, g, ...(r.boss ? { boss: 1 as const } : {}), ...(r.egg ? { egg: 1 as const } : {}) };
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


// ---------------------------------------------------------------------------------------------
// Calendrier de l'année : notification du jour (textes i18n, clés `cal.`) et ligne d'annonce

/** Notification d'un moment du calendrier de l'année (clés i18n : traduite pour chaque appareil). */
export function calendarPush(day: string): { id: string; key: string; bodyKey: string } | null {
  const md = day.slice(5);
  const k = (id: string) => ({ id, key: `cal.push.${id}.t`, bodyKey: `cal.push.${id}.b` });
  if (md === '12-31') return k('reveillon');
  if (md === '01-06') return k('galette');
  const l = lightOf(day);
  if (!l) return null;
  if (l.id === 'paques') return day === easterSundayOf(day) ? k('paques') : null;
  return day === l.start ? k(l.id) : null;
}
const easterSundayOf = (day: string) => { const l = LIGHT_MOMENTS.find((m) => m.id === 'paques')!.range(Number(day.slice(0, 4))); return addDaysIso(l[0], 2); };
const addDaysIso = (day: string, n: number) => new Date(t(day) + n * DAY_MS).toISOString().slice(0, 10);

/** Ligne courte pour l'accueil (annonce tournante) : moment en cours, sinon à venir dans ANNOUNCE_DAYS jours. */
export interface CalendarHeadline { id: string; icon: string; key: string; params?: Record<string, string | number> }

const momentIconOf = (m: FeteMoment): string =>
  m.kind === 'cal' ? lightIcon(m.id) : m.kind.startsWith('sn') ? '🍊' : m.kind === 'advent' ? '🎁' : m.kind.startsWith('ny') ? '🥂' : m.kind === 'fe-soon' ? '❄️' : '🎄';

/**
 * Le moment du calendrier à annoncer ce jour-là (null s'il n'y a rien) : Tournoi du Réveillon le 31/12,
 * Saint-Nicolas / avent / fêtes (mêmes textes que le bandeau des fêtes, clés `fet.m.`), galette des rois,
 * moments légers (le jour même, ou « dans n jours » jusqu'à ANNOUNCE_DAYS jours avant).
 */
export function calendarHeadline(day: string): CalendarHeadline | null {
  if (day.slice(5) === '12-31') return { id: 'reveillon', icon: '🥂', key: 'cal.reveillon.on' };
  const m = feteMoment(day);
  if (m && m.kind !== 'cal') {
    return 'n' in m
      ? { id: m.kind, icon: momentIconOf(m), key: `fet.m.${m.kind}.${m.n === 1 ? 'one' : 'many'}`, params: { n: m.n } }
      : { id: m.kind, icon: momentIconOf(m), key: `fet.m.${m.kind}` };
  }
  if (galetteOf(day)) return { id: 'galette', icon: '👑', key: 'cal.galette.on' };
  if (m?.kind === 'cal') return { id: m.id, icon: lightIcon(m.id), key: `cal.${m.id}.on` };
  for (let n = 1; n <= ANNOUNCE_DAYS; n++) {
    const l = lightOf(addDaysIso(day, n));
    if (l && l.start === addDaysIso(day, n)) return { id: l.id, icon: lightIcon(l.id), key: `cal.${l.id}.soon.${n === 1 ? 'one' : 'many'}`, params: { n } };
  }
  return null;
}
