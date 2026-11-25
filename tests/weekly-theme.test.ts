/**
 * Thème de la semaine (shared/weekly-theme.ts, bonus au classement solo) et arrivage du mois
 * (shared/progress/arrivals.ts, boutique) : rotation, bonus seulement sur les victoires concernées,
 * plafond du jour, mois de vente, refus du serveur hors du mois, lisibilité des dés, traductions.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Store } from '../server/db';
import { createSoloWeek } from '../server/solo-week';
import { startServer } from '../server/app';
import { SW_DAILY_CAP, swPoints } from '../shared/soloweek';
import { THEMES_START, WEEKLY_THEMES, themeBonus, weeklyTheme, weeklyThemeHeadline } from '../shared/weekly-theme';
import { ARRIVALS, arrivalDaysLeft, arrivalHeadline, arrivalOpen, arrivalsOf, monthEnd } from '../shared/progress/arrivals';
import { ITEMS, getItem } from '../shared/progress/catalog';
import { contrast } from '../shared/progress/dice-collection';
import { buy, canBuy, equip, newProfile } from '../shared/progress/profile';
import { today } from '../shared/progress/quests';
import { DICTS } from '../shared/i18n';
import { thmFr } from '../shared/i18n/zones/theme.fr';

const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T12:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);

describe('thème de la semaine : rotation', () => {
  it('rien avant le lancement, puis un thème par semaine, tous couverts, sans fin', () => {
    expect(weeklyTheme('2026-11-29')).toBeNull();
    expect(weeklyThemeHeadline('2026-11-25')).toBeNull();
    expect(weeklyTheme(THEMES_START)?.id).toBe(WEEKLY_THEMES[0].id);
    expect(WEEKLY_THEMES.length).toBeGreaterThanOrEqual(6);
    expect(WEEKLY_THEMES.length).toBeLessThanOrEqual(8);
    const ids = Array.from({ length: WEEKLY_THEMES.length }, (_, w) => weeklyTheme(addDays(THEMES_START, 7 * w))!.id);
    expect(new Set(ids).size).toBe(WEEKLY_THEMES.length);
    // Même thème du lundi au dimanche, autre thème le lundi suivant ; déterministe et cyclique.
    for (let d = 0; d < 7; d++) expect(weeklyTheme(addDays('2027-03-01', d))!.id).toBe(weeklyTheme('2027-03-01')!.id);
    expect(weeklyTheme('2027-03-08')!.id).not.toBe(weeklyTheme('2027-03-07')!.id);
    expect(weeklyTheme(addDays('2027-03-03', 7 * WEEKLY_THEMES.length))!.id).toBe(weeklyTheme('2027-03-03')!.id);
    expect(weeklyTheme('2031-06-18')).not.toBeNull();
  });
  it('ligne du fil d’actualité : clé traduite, identifiant de la semaine', () => {
    const h = weeklyThemeHeadline('2026-12-02')!;
    expect(h).toMatchObject({ id: 'theme-2026-11-30', icon: WEEKLY_THEMES[0].icon, key: `thm.head.${WEEKLY_THEMES[0].id}` });
    for (const t of WEEKLY_THEMES) for (const k of [`thm.t.${t.id}`, `thm.r.${t.id}`, `thm.head.${t.id}`]) expect(Object.keys(thmFr), k).toContain(k);
  });
});

describe('thème de la semaine : bonus', () => {
  /** Un jour de la semaine du thème `id`. */
  const dayOf = (id: string) => { for (let w = 0; ; w++) { const d = addDays(THEMES_START, 7 * w + 2); if (weeklyTheme(d)!.id === id) return d; } };
  it('chaque thème ne récompense que les victoires qui le concernent', () => {
    expect(themeBonus(dayOf('courtisan'), { game: 'courtisan', level: 'habitue', opponents: 2 })).toEqual({ id: 'courtisan', bonus: swPoints('habitue', 2) });
    expect(themeBonus(dayOf('courtisan'), { game: 'poker', level: 'habitue', opponents: 2 })).toBeNull();
    expect(themeBonus(dayOf('poker'), { game: 'poker', level: 'fouine', opponents: 1 })).toEqual({ id: 'poker', bonus: 4 });
    expect(themeBonus(dayOf('cf'), { game: 'cf', level: 'debutant', opponents: 1 })).toEqual({ id: 'cf', bonus: 1 });
    expect(themeBonus(dayOf('cf'), { game: '421', level: 'difficile', opponents: 1 })).toBeNull();
    expect(themeBonus(dayOf('421'), { game: '421', level: 'normal', opponents: 3 })).toEqual({ id: '421', bonus: 4 });
    expect(themeBonus(dayOf('as'), { game: '421', level: 'facile', opponents: 1, big: true })).toEqual({ id: 'as', bonus: 2 });
    expect(themeBonus(dayOf('as'), { game: '421', level: 'facile', opponents: 1, big: false })).toBeNull();
    expect(themeBonus(dayOf('as'), { game: 'courtisan', level: 'facile', opponents: 1, big: true })).toBeNull();
    expect(themeBonus(dayOf('tablees'), { game: 'poker', level: 'debutant', opponents: 4 })).toEqual({ id: 'tablees', bonus: 3 });
    expect(themeBonus(dayOf('tablees'), { game: 'poker', level: 'debutant', opponents: 9 })).toEqual({ id: 'tablees', bonus: 4 });
    expect(themeBonus(dayOf('tablees'), { game: 'cf', level: 'fine-fouine', opponents: 1 })).toBeNull();
    expect(themeBonus(dayOf('coriaces'), { game: 'cf', level: 'fine-fouine', opponents: 1 })).toEqual({ id: 'coriaces', bonus: 2 });
    expect(themeBonus(dayOf('coriaces'), { game: 'cf', level: 'habitue', opponents: 1 })).toBeNull();
    expect(themeBonus(dayOf('habitues'), { game: 'courtisan', level: 'habitue', opponents: 1 })).toEqual({ id: 'habitues', bonus: 1 });
    expect(themeBonus(dayOf('habitues'), { game: 'courtisan', level: 'fouine', opponents: 1 })).toBeNull();
    expect(themeBonus('2026-11-25', { game: 'courtisan', level: 'fouine', opponents: 3 })).toBeNull();
  });

  const setup = (iso: string) => {
    const store = new Store(':memory:');
    let clock = Date.parse(iso);
    const sw = createSoloWeek({ store, now: () => clock, push: () => {}, rollEveryMs: 0 });
    const users = ['Ana', 'Bert'].map((n, i) => store.createUser({ id: `u${i}`, username: n, passHash: 'x', recoveryHash: 'x' }));
    return { sw, users, at: (s: string) => { clock = Date.parse(s); } };
  };
  it('serveur : bonus annoncé, puis plafond du jour appliqué APRÈS le bonus', () => {
    const iso = `${dayOf('courtisan')}T10:00:00Z`;
    const { sw, users } = setup(iso);
    const [a, b] = users;
    expect(sw.board(a).theme).toBe('courtisan');
    // Hors thème : points normaux, aucune mention.
    expect(sw.record(b.id, { game: 'poker', won: true, level: 'habitue', opponents: 1 })).toEqual({ gained: 2, points: 2 });
    expect(sw.record(b.id, { game: 'courtisan', won: false, level: 'fouine', opponents: 3 })).toBeNull();
    // Dans le thème : ×2, puis le plafond borne la journée.
    expect(sw.record(a.id, { game: 'courtisan', won: true, level: 'fouine', opponents: 5 })).toEqual({ gained: 16, points: 16, theme: 'courtisan' });
    expect(sw.record(a.id, { game: 'courtisan', won: true, level: 'fouine', opponents: 5 })).toEqual({ gained: SW_DAILY_CAP - 16, points: SW_DAILY_CAP, theme: 'courtisan' });
    expect(sw.record(a.id, { game: 'courtisan', won: true, level: 'fouine', opponents: 5 })).toEqual({ gained: 0, points: SW_DAILY_CAP });
    expect(sw.board(a).me).toMatchObject({ points: SW_DAILY_CAP, today: SW_DAILY_CAP, wins: 3 });
  });
  it('serveur : plafond qui ne laisse rien du bonus → pas de mention', () => {
    const { sw, users } = setup(`${dayOf('courtisan')}T10:00:00Z`);
    const [a] = users;
    let pts = 0;
    while (pts < SW_DAILY_CAP - 2) pts = sw.record(a.id, { game: 'poker', won: true, level: 'debutant', opponents: 1 })!.points;
    expect(sw.record(a.id, { game: 'courtisan', won: true, level: 'habitue', opponents: 1 })).toEqual({ gained: 2, points: SW_DAILY_CAP });
  });
  it('serveur : semaine des as, seul le fait calculé par le rejeu (big) compte', () => {
    const { sw, users } = setup(`${dayOf('as')}T10:00:00Z`);
    const [a] = users;
    expect(sw.record(a.id, { game: '421', won: true, level: 'facile', opponents: 1 })).toEqual({ gained: 1, points: 1 });
    expect(sw.record(a.id, { game: '421', won: true, level: 'facile', opponents: 1, big: true })).toEqual({ gained: 3, points: 4, theme: 'as' });
    expect(sw.record(a.id, { game: 'cf', won: true, level: 'debutant', opponents: 1, big: true })).toEqual({ gained: 1, points: 5 });
  });
  it('avant le lancement : pas de thème au classement', () => {
    const { sw, users } = setup('2026-11-25T10:00:00Z');
    expect(sw.board(users[0]).theme).toBeNull();
    expect(sw.record(users[0].id, { game: 'courtisan', won: true, level: 'fouine', opponents: 1 })).toEqual({ gained: 4, points: 4 });
  });
});

describe('arrivage du mois', () => {
  it('12 objets, un par mois de décembre 2026 à novembre 2027, prix pas plus bas que les objets d’événement', () => {
    expect(ARRIVALS).toHaveLength(12);
    const months = ARRIVALS.map((i) => i.arrival).sort();
    expect(months).toEqual(['2026-12', '2027-01', '2027-02', '2027-03', '2027-04', '2027-05', '2027-06', '2027-07', '2027-08', '2027-09', '2027-10', '2027-11']);
    for (const it of ARRIVALS) {
      expect(['dice', 'felt']).toContain(it.category);
      expect(it.pass).toBeFalsy();
      expect(it.event).toBeFalsy();
      expect(it.price).toBeGreaterThanOrEqual(it.category === 'dice' ? 600 : 500); // Flocon / Saint-Nicolas 600, Sapin / Spéculoos 500
    }
  });
  it('en vente pendant son mois seulement, puis chaque année le même mois', () => {
    const givre = getItem('dice-givre')!;
    expect(arrivalOpen(givre, '2026-11-30')).toBe(false);
    expect(arrivalOpen(givre, '2026-12-01')).toBe(true);
    expect(arrivalOpen(givre, '2026-12-31')).toBe(true);
    expect(arrivalOpen(givre, '2027-01-01')).toBe(false);
    expect(arrivalOpen(givre, '2027-12-15')).toBe(true);
    expect(arrivalOpen(getItem('dice-chataigne')!, '2026-11-25')).toBe(false); // premier mois : novembre 2027
    expect(arrivalsOf('2026-11-25')).toEqual([]);
    expect(arrivalsOf('2027-11-03').map((i) => i.id)).toEqual(['dice-chataigne']);
    for (let m = 0; m < 12; m++) {
      const day = addDays('2026-12-10', Math.round(m * 30.5));
      expect(arrivalsOf(day).length, day).toBeGreaterThanOrEqual(1);
    }
    expect(monthEnd('2027-02-10')).toBe('2027-02-28');
    expect(arrivalDaysLeft('2026-12-25')).toBe(7);
    expect(arrivalDaysLeft('2026-12-31')).toBe(1);
  });
  it('lignes du fil d’actualité', () => {
    expect(arrivalHeadline('2026-11-25')).toBeNull();
    expect(arrivalHeadline('2026-12-04')).toMatchObject({ id: 'arrival-2026-12', key: 'thm.arr.head.dice-givre' });
    for (const it of ARRIVALS) for (const k of [`thm.arr.head.${it.id}`, `thm.item.${it.id}`, `thm.item.${it.id}.d`]) expect(Object.keys(thmFr), k).toContain(k);
  });
  it('achat : refusé hors du mois (prestige compris), accepté pendant, gardé à vie', () => {
    const p = { ...newProfile(), coins: 5000 };
    expect(canBuy(p, getItem('dice-givre'), '2026-11-25')).toEqual({ ok: false, reason: 'arrival' });
    expect(buy(p, 'dice-givre', '2027-01-02')).toBeNull();
    expect(canBuy({ ...p, prestige: 1 }, getItem('dice-givre'), '2026-11-25')).toEqual({ ok: false, reason: 'arrival' });
    const bought = buy(p, 'dice-givre', '2026-12-20')!;
    expect(bought.coins).toBe(5000 - getItem('dice-givre')!.price);
    expect(bought.owned).toContain('dice-givre');
    expect(equip(bought, 'dice-givre')!.equipped.dice).toBe('dice-givre'); // toujours installable ensuite
    expect(canBuy(bought, getItem('dice-givre'), '2027-12-02')).toEqual({ ok: false, reason: 'owned' });
  });
  it('dés lisibles : contraste points / dé ≥ 4', () => {
    for (const it of ITEMS) if (it.category === 'dice' && it.arrival) {
      expect(contrast(it.pip, it.body), it.id).toBeGreaterThanOrEqual(4);
      expect(contrast(it.pip, it.body2), it.id).toBeGreaterThanOrEqual(4);
    }
  });
  it('zone thm traduite en entier (mêmes trous {x})', () => {
    const holes = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const l of ['en', 'de', 'nl'] as const) for (const [k, v] of Object.entries(thmFr)) {
      const t = DICTS[l][k as keyof typeof thmFr];
      expect(t, `${l}:${k}`).toBeTruthy();
      expect(holes(t!), `${l}:${k}`).toEqual(holes(v));
    }
  });
});

describe('arrivage du mois : serveur', () => {
  let srv: Awaited<ReturnType<typeof startServer>>;
  let base = '';
  beforeAll(async () => {
    srv = await startServer({ port: 0, dbPath: ':memory:', accounts: { authAttempts: 1000, soloWeekRollMs: 0 } });
    base = `http://localhost:${srv.port}`;
  });
  afterAll(async () => { await srv.close(); });
  const call = async (path: string, body?: object, token?: string) => {
    const r = await fetch(`${base}/api${path}`, { method: body ? 'POST' : 'GET', body: body ? JSON.stringify(body) : undefined,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
    return { status: r.status, ...(await r.json()) } as any;
  };
  it('le serveur refuse un objet d’arrivage hors de son mois (jour de Bruxelles du serveur)', async () => {
    const r = await call('/register', { username: 'Arrivage1', password: 'motdepasse1' });
    const u = srv.store.userByName('Arrivage1')!;
    srv.store.saveProfile(u.id, { ...srv.store.profileOf(u), coins: 5000 });
    const day = today();
    const closed = ARRIVALS.find((i) => !arrivalOpen(i, day))!;
    const res = await call('/shop/buy', { id: closed.id }, r.token);
    expect(res.status).toBe(400);
    expect(srv.store.profileOf(srv.store.userByName('Arrivage1')!).owned).not.toContain(closed.id);
    const open = arrivalsOf(day)[0];
    if (open) {
      const ok = await call('/shop/buy', { id: open.id }, r.token);
      expect(ok.status).toBe(200);
      expect(ok.profile.owned).toContain(open.id);
    }
  });
});
