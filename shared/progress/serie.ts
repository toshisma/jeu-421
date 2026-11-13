/**
 * Série de jours joués (commune aux quatre jeux) : un jour compte dès qu'une partie est terminée
 * (jour de Bruxelles, `today()` ; pour un compte, c'est le serveur qui le décide, voir server/serie.ts).
 *
 * Barème volontairement bas (Sam a réduit les gains trois fois) :
 *  - jours 1 à 6 : 2, 2, 3, 3, 4, 4 pièces ; puis plateau à 4 pièces par jour ;
 *  - chaque 7e jour de série (7, 14, 21…) : un sac de dés à la place des pièces, une fois par
 *    semaine au plus (7 jours depuis le dernier sac de série) ;
 *  - pas d'XP : le pass du mois n'avance pas plus vite.
 * Soit 18 pièces + 1 sac la première semaine, puis 24 pièces + 1 sac par semaine.
 *
 * Joker : un joker gagné à chaque 7e jour de série (2 en réserve au plus). Un jour manqué est
 * protégé tout seul par un joker. S'il en manque, la série se met « en pause » (jamais de
 * reproche) : le record est gardé, les jokers aussi, et on repart au jour 1 à la partie suivante.
 *
 * Logique pure, sans date « maintenant » : le jour est toujours passé par l'appelant.
 */

export const SERIE_JOKER_EVERY = 7;
export const SERIE_JOKERS_MAX = 2;
export const SERIE_BAG_EVERY = 7;
/** Jours gardés en mémoire pour le calendrier (joués et protégés). */
export const SERIE_KEEP = 14;
/** Reprise d'un profil d'invité à l'inscription : série plafonnée à une semaine, sans joker. */
export const SERIE_IMPORT_MAX = 7;

export interface SerieState {
  /** Dernier jour compté (joué, ou protégé par un joker). */
  last: string;
  /** Jours joués dans la série en cours. */
  count: number;
  /** Plus longue série. */
  best: number;
  /** Jokers en réserve (0 à 2). */
  jokers: number;
  /** Derniers jours joués (AAAA-MM-JJ). */
  days: string[];
  /** Derniers jours protégés par un joker. */
  saved: string[];
  /** Jour du dernier sac de dés de série. */
  bagDay?: string;
  /** Dernière récompense donnée (affichage). */
  got?: SerieGot;
}
export interface SerieGot { day: string; n: number; coins: number; bag: number; joker: boolean }
export interface SerieReward { coins: number; bag: number }

const isDay = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T12:00:00Z`));
const at = (day: string) => Date.parse(`${day}T12:00:00Z`);
/** Jours entre deux dates (b − a). */
export const dayGap = (a: string, b: string) => Math.round((at(b) - at(a)) / 86400_000);
export const addDays = (day: string, n: number) => new Date(at(day) + n * 86400_000).toISOString().slice(0, 10);

/** Récompense du n-ième jour de série. `bagOk` : aucun sac de série depuis 7 jours. */
export function serieReward(n: number, bagOk = true): SerieReward {
  if (n >= 1 && n % SERIE_BAG_EVERY === 0 && bagOk) return { coins: 0, bag: 1 };
  return { coins: Math.min(4, 1 + Math.ceil(Math.max(1, n) / 2)), bag: 0 };
}
const bagOkOn = (s: SerieState | undefined, day: string) => !s?.bagDay || dayGap(s.bagDay, day) >= SERIE_BAG_EVERY;

export type SerieStatus = 'none' | 'today' | 'pending' | 'paused';

/**
 * Où en est la série ce jour-là, jokers appliqués aux jours manqués (sans rien enregistrer) :
 * - today : déjà jouée aujourd'hui ; pending : en cours, rien joué aujourd'hui ;
 * - paused : trop de jours manqués (count remis à 0 dans `state`, record et jokers gardés).
 * Un dernier jour dans le futur (horloge reculée, profil trafiqué) compte comme « déjà joué » : rien à gagner.
 */
export function serieSettle(s: SerieState | undefined, day: string): { state: SerieState | undefined; status: SerieStatus; used: string[] } {
  if (!s) return { state: undefined, status: 'none', used: [] };
  const gap = dayGap(s.last, day);
  if (gap <= 0) return { state: s, status: 'today', used: [] };
  if (gap === 1) return { state: s, status: s.count > 0 ? 'pending' : 'paused', used: [] };
  const missed = gap - 1;
  if (s.count > 0 && missed <= s.jokers) {
    const used = Array.from({ length: missed }, (_, i) => addDays(s.last, i + 1));
    return { state: { ...s, jokers: s.jokers - missed, last: addDays(day, -1), saved: [...s.saved, ...used].slice(-SERIE_KEEP) }, status: 'pending', used };
  }
  return { state: { ...s, count: 0 }, status: 'paused', used: [] };
}

/** Une partie terminée ce jour-là. null si le jour était déjà compté. */
export function serieRecord(s: SerieState | undefined, day: string): { state: SerieState; reward: SerieReward; joker: boolean; n: number } | null {
  const st = serieSettle(s, day);
  if (st.status === 'today') return null;
  const prev = st.state;
  const n = (st.status === 'pending' ? prev!.count : 0) + 1;
  const reward = serieReward(n, bagOkOn(prev, day));
  const jokersBefore = prev?.jokers ?? 0;
  const jokers = n % SERIE_JOKER_EVERY === 0 ? Math.min(SERIE_JOKERS_MAX, jokersBefore + 1) : jokersBefore;
  const joker = jokers > jokersBefore;
  const state: SerieState = {
    last: day, count: n, best: Math.max(prev?.best ?? 0, n), jokers,
    days: [...(prev?.days ?? []).filter((d) => d !== day), day].slice(-SERIE_KEEP),
    saved: prev?.saved ?? [],
    ...(reward.bag ? { bagDay: day } : prev?.bagDay ? { bagDay: prev.bagDay } : {}),
    got: { day, n, coins: reward.coins, bag: reward.bag, joker },
  };
  return { state, reward, joker, n };
}

export type SerieCell = 'joue' | 'joker' | 'vide' | 'aujourdhui';
export interface SerieView {
  status: SerieStatus;
  /** Jours de la série en cours (0 si en pause ou jamais jouée). */
  count: number;
  best: number;
  jokers: number;
  playedToday: boolean;
  /** Prochaine récompense : celle d'aujourd'hui si rien n'est joué, sinon celle de demain. */
  next: SerieReward & { n: number; tomorrow: boolean };
  /** Jours avant le prochain joker (gagné au jour multiple de 7). */
  toJoker: number;
  /** Les 7 derniers jours, du plus ancien à aujourd'hui. */
  week: { day: string; cell: SerieCell }[];
  /** Récompense donnée aujourd'hui (pour l'annoncer). */
  got: SerieGot | null;
}

export function serieView(s: SerieState | undefined, day: string): SerieView {
  const st = serieSettle(s, day);
  const cur = st.state;
  const playedToday = st.status === 'today';
  const count = st.status === 'today' || st.status === 'pending' ? cur!.count : 0;
  const nextN = count + 1;
  const tomorrow = playedToday;
  const nextBagOk = !cur?.bagDay || dayGap(cur.bagDay, tomorrow ? addDays(day, 1) : day) >= SERIE_BAG_EVERY;
  const played = new Set(cur?.days ?? []);
  const saved = new Set([...(cur?.saved ?? []), ...st.used]);
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(day, i - 6);
    const cell: SerieCell = played.has(d) ? 'joue' : saved.has(d) ? 'joker' : d === day ? 'aujourdhui' : 'vide';
    return { day: d, cell };
  });
  return {
    status: st.status, count, best: cur?.best ?? 0, jokers: cur?.jokers ?? 0, playedToday,
    next: { ...serieReward(nextN, nextBagOk), n: nextN, tomorrow },
    toJoker: SERIE_JOKER_EVERY - (count % SERIE_JOKER_EVERY),
    week, got: cur?.got?.day === day ? cur.got : null,
  };
}

/** Série lue d'un profil (réparée) ; undefined si absente ou invalide. */
export function cleanSerie(raw: unknown): SerieState | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Partial<SerieState>;
  if (!isDay(r.last)) return undefined;
  const int = (v: unknown, max: number) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.min(max, Math.floor(v)) : 0);
  const days = (v: unknown) => (Array.isArray(v) ? [...new Set(v.filter(isDay))].sort().slice(-SERIE_KEEP) : []);
  const count = int(r.count, 100_000);
  const s: SerieState = { last: r.last, count, best: Math.max(count, int(r.best, 100_000)), jokers: int(r.jokers, SERIE_JOKERS_MAX), days: days(r.days), saved: days(r.saved) };
  if (isDay(r.bagDay)) s.bagDay = r.bagDay;
  const g = r.got;
  if (g && typeof g === 'object' && isDay(g.day)) s.got = { day: g.day, n: int(g.n, 100_000), coins: int(g.coins, 10), bag: int(g.bag, 1), joker: !!g.joker };
  return s;
}

/**
 * Série d'un invité reprise à l'inscription : une semaine au plus, sans joker, rien dans le futur.
 * Le sac du 7e jour éventuellement déjà touché reste noté (pas de second sac la même semaine).
 */
export function capSerieImport(s: SerieState | undefined, day: string): SerieState | undefined {
  if (!s || dayGap(s.last, day) < 0) return undefined;
  const past = (l: string[]) => l.filter((d) => dayGap(d, day) >= 0 && dayGap(d, day) < 7);
  const count = Math.min(SERIE_IMPORT_MAX, s.count);
  return {
    last: s.last, count, best: Math.min(SERIE_IMPORT_MAX, Math.max(count, s.best)), jokers: 0, days: past(s.days), saved: past(s.saved),
    // Le sac hebdomadaire n'est jamais donné juste après une reprise (profil d'invité non vérifiable).
    bagDay: s.bagDay && dayGap(s.bagDay, day) >= 0 && dayGap(s.bagDay, s.last) <= 0 ? s.last : (s.bagDay && dayGap(s.bagDay, day) >= 0 ? s.bagDay : s.last),
  };
}
