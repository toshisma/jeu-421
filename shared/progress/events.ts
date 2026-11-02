/**
 * Événements de l'année (saveur liégeoise) : objets exclusifs en boutique pendant l'événement,
 * et pièces boostées. Le premier week-end de chaque mois, les pièces sont aussi doublées.
 * Tout se calcule à partir de la date du jour (AAAA-MM-JJ), côté navigateur comme côté serveur.
 */
export interface SeasonEvent {
  id: string;
  name: string;
  description: string;
  /** Période de l'année donnée (dates incluses). */
  range: (year: number) => [string, string];
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400_000);

/** Dimanche de Pâques (algorithme grégorien anonyme). */
function easter(y: number): Date {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return utc(y, month, day);
}
/** Troisième dimanche de septembre (Fêtes de Wallonie à Liège). */
function wallonieSunday(y: number): Date {
  const first = utc(y, 9, 1);
  const toSunday = (7 - first.getUTCDay()) % 7;
  return addDays(first, toSunday + 14);
}

export const EVENTS: SeasonEvent[] = [
  { id: 'carnaval', name: 'Carnaval', description: 'Confettis et masques sur le tapis.',
    range: (y) => { const e = easter(y); return [iso(addDays(e, -54)), iso(addDays(e, -47))]; } },
  { id: 'outremeuse', name: '15 août en Outremeuse', description: 'La fête de la République libre d’Outremeuse, péket compris.',
    range: (y) => [`${y}-08-10`, `${y}-08-17`] },
  { id: 'wallonie', name: 'Fêtes de Wallonie', description: 'Le coq hardi s’invite au comptoir.',
    range: (y) => { const s = wallonieSunday(y); return [iso(addDays(s, -3)), iso(addDays(s, 1))]; } },
  { id: 'halloween', name: 'Halloween au comptoir', description: 'Citrouilles et frissons, pour une semaine.',
    range: (y) => [`${y}-10-25`, `${y}-11-02`] },
  { id: 'saint-nicolas', name: 'Saint-Nicolas', description: 'Spéculoos et mandarines pour les joueurs sages.',
    range: (y) => [`${y}-11-28`, `${y}-12-06`] },
  { id: 'fetes', name: 'Fêtes de fin d’année', description: 'Sapin, neige et bulles jusqu’au Nouvel An.',
    range: (y) => [`${y}-12-20`, `${y}-12-31`] },
];

export function activeEvent(day: string): SeasonEvent | null {
  const y = Number(day.slice(0, 4));
  for (const e of EVENTS) {
    const [a, b] = e.range(y);
    if (day >= a && day <= b) return e;
  }
  // Le Nouvel An déborde sur janvier.
  if (day.slice(5) <= '01-02') return EVENTS.find((e) => e.id === 'fetes') ?? null;
  return null;
}
/** Dernier jour de l'événement en cours (affichage « jusqu'au … »). */
export function eventEnd(e: SeasonEvent, day: string): string {
  if (e.id === 'fetes' && day.slice(5) <= '01-02') return `${day.slice(0, 4)}-01-02`;
  if (e.id === 'fetes') return `${Number(day.slice(0, 4)) + 1}-01-02`;
  return e.range(Number(day.slice(0, 4)))[1];
}

const weekday = (day: string) => new Date(`${day}T12:00:00Z`).getUTCDay(); // 0 = dimanche
const isWeekend = (day: string) => [0, 6].includes(weekday(day));

/** Multiplicateur de pièces du jour, avec son explication. */
export function coinBoost(day: string): { factor: number; label: string } | null {
  const e = activeEvent(day);
  const firstWeekend = isWeekend(day) && Number(day.slice(8)) <= 7;
  if (e && isWeekend(day)) return { factor: 2, label: `${e.name} : pièces doublées le week-end` };
  if (firstWeekend) return { factor: 2, label: 'Premier week-end du mois : pièces doublées' };
  if (e) return { factor: 1.5, label: `${e.name} : pièces ×1,5` };
  return null;
}

/** Libellé court d'une date « 2026-11-02 » → « 2 nov. ». */
export function shortDate(day: string): string {
  const m = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'][Number(day.slice(5, 7)) - 1];
  return `${Number(day.slice(8))} ${m}`;
}

// ---------------------------------------------------------------------------------------------
// Happy hour : certains jours, une heure surprise où les pièces sont doublées (heure de Bruxelles).

const brussels = (t: number) => {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Brussels', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false });
  const parts = Object.fromEntries(f.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  return { day: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) % 24 };
};
const hashDay = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
/** Happy hour du jour (4 jours sur 7 environ), entre 12 h et 22 h, heure de Bruxelles. */
export function happyHourOfDay(day: string): { hour: number } | null {
  const h = hashDay(`hh:${day}`);
  if (h % 7 >= 4) return null;
  return { hour: 12 + ((h >>> 3) % 10) };
}
/** Happy hour en cours à cet instant : l'heure de début, sinon null. */
export function happyHour(t: number): { day: string; hour: number } | null {
  const b = brussels(t);
  const hh = happyHourOfDay(b.day);
  return hh && hh.hour === b.hour ? { day: b.day, hour: hh.hour } : null;
}
