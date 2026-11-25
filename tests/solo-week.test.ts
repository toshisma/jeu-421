/**
 * Classement solo de la semaine : barème, plafond du jour, classement et amis, clôture du lundi (podium payé
 * une seule fois, seuil de joueurs), et de vraies parties de Poker menteur rejouées par le serveur.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Store } from '../server/db';
import { createSoloWeek, weekEndsAt } from '../server/solo-week';
import { startServer } from '../server/app';
import { SW_DAILY_CAP, SW_PRIZES, swPoints, swSort, swTier } from '../shared/soloweek';
import { act, type PmAction, type PmState } from '../shared/pokermenteur/engine';
import { decide } from '../shared/pokermenteur/ai';
import { encodePm, newGamePm, pmBotDecideFor, type SetupPm } from '../shared/rejeu/poker';
import { mulberry32 } from '../shared/rng';
import { PM_PERSONAS } from '../shared/pokermenteur/personas';
import { today } from '../shared/progress/quests';
import { translateServerText } from '../shared/i18n/server-texts';
import { themeBonus } from '../shared/weekly-theme';

describe('barème', () => {
  it('difficulté des quatre jeux et adversaires en plus', () => {
    expect(['facile', 'debutant'].map(swTier)).toEqual([0, 0]);
    expect(['normal', 'habitue'].map(swTier)).toEqual([1, 1]);
    expect(['difficile', 'fouine', 'fine-fouine'].map(swTier)).toEqual([2, 2, 2]);
    expect(swPoints('debutant', 1)).toBe(1);
    expect(swPoints('habitue', 1)).toBe(2);
    expect(swPoints('fouine', 3)).toBe(6);
    expect(swPoints('difficile', 9)).toBe(8); // 4 adversaires en plus au maximum
    expect(swPoints(undefined, 0)).toBe(1);
  });
  it('ordre : points, victoires, puis le premier arrivé', () => {
    const r = swSort([
      { id: 'a', points: 10, wins: 3, lastAt: 5 }, { id: 'b', points: 10, wins: 4, lastAt: 9 },
      { id: 'c', points: 12, wins: 1, lastAt: 9 }, { id: 'd', points: 10, wins: 4, lastAt: 2 },
    ]);
    expect(r.map((x) => x.id)).toEqual(['c', 'd', 'b', 'a']);
  });
  it('fin de semaine : lundi 0 h à Bruxelles, hiver comme été', () => {
    const winter = weekEndsAt('2026-11-16');
    expect(new Date(winter).toISOString()).toBe('2026-11-22T23:00:00.000Z');
    expect(today(new Date(winter))).toBe('2026-11-23');
    expect(today(new Date(winter - 1))).toBe('2026-11-22');
    expect(new Date(weekEndsAt('2026-06-15')).toISOString()).toBe('2026-06-21T22:00:00.000Z');
  });
});

describe('serveur (module)', () => {
  const setup = () => {
    const store = new Store(':memory:');
    let clock = Date.parse('2026-11-18T10:00:00Z'); // mercredi
    const pushes: { userId: string; title: string; body: string }[] = [];
    const sw = createSoloWeek({ store, now: () => clock, push: (userId, title, body) => pushes.push({ userId, title, body }), rollEveryMs: 0 });
    const users = ['Ana', 'Bert', 'Cleo', 'Dede'].map((n, i) => store.createUser({ id: `u${i}`, username: n, passHash: 'x', recoveryHash: 'x' }));
    return { store, sw, users, pushes, at: (iso: string) => { clock = Date.parse(iso); } };
  };
  it('défaites ignorées ; points selon la difficulté ; plafond du jour', () => {
    const { sw, users, at } = setup();
    const [a] = users;
    expect(sw.record(a.id, { game: 'poker', won: false, level: 'fouine', opponents: 3 })).toBeNull();
    expect(sw.record(a.id, { game: 'poker', won: true, level: 'fouine', opponents: 3 })).toEqual({ gained: 6, points: 6 });
    let total = 6;
    while (total < SW_DAILY_CAP) total = sw.record(a.id, { game: '421', won: true, level: 'difficile', opponents: 5 })!.points;
    expect(total).toBe(SW_DAILY_CAP);
    // Au-delà du plafond : victoire comptée, sans point.
    expect(sw.record(a.id, { game: 'cf', won: true, level: 'fine-fouine', opponents: 1 })).toEqual({ gained: 0, points: SW_DAILY_CAP });
    expect(sw.board(a).me).toMatchObject({ rank: 1, points: SW_DAILY_CAP, today: SW_DAILY_CAP });
    // Le lendemain : de nouveau des points, même semaine.
    at('2026-11-19T09:00:00Z');
    expect(sw.record(a.id, { game: 'courtisan', won: true, level: 'debutant', opponents: 1 })).toEqual({ gained: 1, points: SW_DAILY_CAP + 1 });
    expect(sw.board(a).me).toMatchObject({ today: 1 });
  });
  it('classement général, amis, invité', () => {
    const { store, sw, users } = setup();
    const [a, b, c] = users;
    sw.record(a.id, { game: 'poker', won: true, level: 'debutant', opponents: 1 });
    sw.record(b.id, { game: 'poker', won: true, level: 'fouine', opponents: 1 });
    sw.record(c.id, { game: 'poker', won: true, level: 'habitue', opponents: 1 });
    store.addFriend(a.id, c.id);
    const board = sw.board(a);
    expect(board.top.map((r) => [r.rank, r.username, r.points])).toEqual([[1, 'Bert', 4], [2, 'Cleo', 2], [3, 'Ana', 1]]);
    expect(board.me).toMatchObject({ rank: 3, points: 1 });
    expect(board.friends.map((r) => r.username)).toEqual(['Cleo', 'Ana']);
    expect(board.top.find((r) => r.username === 'Cleo')?.friend).toBe(true);
    const guest = sw.board(undefined);
    expect(guest.me).toBeNull();
    expect(guest.friends).toEqual([]);
    expect(guest.top).toHaveLength(3);
  });
  it('lundi : podium payé une seule fois, notification traduite ; semaine nouvelle à zéro', () => {
    const { store, sw, users, pushes, at } = setup();
    const [a, b, c, d] = users;
    sw.record(a.id, { game: '421', won: true, level: 'difficile', opponents: 1 }); // 4
    sw.record(b.id, { game: '421', won: true, level: 'normal', opponents: 1 }); // 2
    sw.record(c.id, { game: '421', won: true, level: 'facile', opponents: 1 }); // 1
    sw.record(d.id, { game: '421', won: true, level: 'facile', opponents: 1 }); // 1, arrivé après Cleo
    const coins = (id: string) => store.profileOf(store.userById(id)!).coins;
    const before = users.map((u) => coins(u.id));
    at('2026-11-23T08:00:00Z'); // lundi suivant
    const done = sw.rollWeeks();
    expect(done.map((x) => [x.userId, x.rank, x.coins])).toEqual([[a.id, 1, SW_PRIZES[0]], [b.id, 2, SW_PRIZES[1]], [c.id, 3, SW_PRIZES[2]]]);
    expect(users.map((u) => coins(u.id) - before[users.indexOf(u)])).toEqual([SW_PRIZES[0], SW_PRIZES[1], SW_PRIZES[2], 0]);
    expect(pushes.map((p) => p.body)).toEqual([
      `Podium : 1re place avec 4 points, ${SW_PRIZES[0]} pièces pour vous.`,
      `Podium : 2e place avec 2 points, ${SW_PRIZES[1]} pièces pour vous.`,
      `Podium : 3e place avec 1 point, ${SW_PRIZES[2]} pièces pour vous.`,
    ]);
    expect(translateServerText('en', pushes[0].body)).toBe(`Podium: #1 with 4 points, ${SW_PRIZES[0]} coins for you.`);
    expect(translateServerText('de', pushes[0].title)).toBe('Solo-Rangliste der Woche');
    // Une seconde clôture (redémarrage) : rien de plus.
    store.setMeta('solo_week_rolled', '');
    expect(sw.rollWeeks()).toEqual([]);
    expect(coins(a.id) - before[0]).toBe(SW_PRIZES[0]);
    const board = sw.board(a);
    expect(board.top).toEqual([]);
    expect(board.me).toMatchObject({ rank: null, points: 0 });
    expect(board.last.map((r) => [r.rank, r.username, r.coins])).toEqual([[1, 'Ana', SW_PRIZES[0]], [2, 'Bert', SW_PRIZES[1]], [3, 'Cleo', SW_PRIZES[2]]]);
  });
  it('compte suspendu : hors classement et hors podium', () => {
    const { store, sw, users } = setup();
    const [a, b] = users;
    sw.record(a.id, { game: 'poker', won: true, level: 'fouine', opponents: 1 });
    sw.record(b.id, { game: 'poker', won: true, level: 'debutant', opponents: 1 });
    store.sqlite.exec('CREATE TABLE IF NOT EXISTS admin_bans (user_id TEXT PRIMARY KEY, until INTEGER)');
    store.sqlite.prepare('INSERT INTO admin_bans (user_id, until) VALUES (?, NULL)').run(a.id);
    expect(sw.board(b).top.map((r) => r.username)).toEqual(['Bert']);
    expect(sw.board(a).me?.rank).toBeNull();
  });
  it('moins de 3 joueurs classés : podium annoncé sans pièces', () => {
    const { store, sw, users, pushes, at } = setup();
    const [a, b] = users;
    sw.record(a.id, { game: 'poker', won: true, level: 'debutant', opponents: 1 });
    sw.record(b.id, { game: 'poker', won: true, level: 'debutant', opponents: 1 });
    const before = store.profileOf(store.userById(a.id)!).coins;
    at('2026-11-24T08:00:00Z');
    expect(sw.rollWeeks().map((x) => x.coins)).toEqual([0, 0]);
    expect(store.profileOf(store.userById(a.id)!).coins).toBe(before);
    expect(pushes[0].body).toBe('Podium : 1re place avec 1 point.');
    expect(translateServerText('nl', pushes[0].body)).toBe('Podium: plaats 1 met 1 punten.');
  });
});

/** Partie libre de Poker menteur jouée « comme le téléphone » (joueur = Fine fouine). */
function play(setup: SetupPm, seed: number, humanSeed: number): { moves: string; state: PmState } {
  let s = newGamePm(setup, seed);
  const hr = mulberry32(humanSeed);
  const moves: string[] = [];
  while (s.phase !== 'fini') {
    const mine = s.players[s.current].id === 'moi';
    const a: PmAction = mine ? decide(s, 'fouine', hr) : pmBotDecideFor(setup, s);
    const r = act(s, a);
    if ('error' in r) throw new Error(r.error);
    if (mine) moves.push(encodePm(a));
    s = r.state;
  }
  return { moves: moves.join('.'), state: s };
}

describe('serveur (vraies parties)', () => {
  let srv: Awaited<ReturnType<typeof startServer>>;
  let base = '';
  beforeAll(async () => {
    srv = await startServer({ port: 0, dbPath: ':memory:', accounts: { minSoloMs: 0, soloDailyCap: 1000, authAttempts: 100000, soloWeekRollMs: 0 } });
    base = `http://localhost:${srv.port}`;
  });
  afterAll(async () => { await srv.close(); });
  const call = async (path: string, body?: object, token?: string) => {
    const r = await fetch(`${base}/api${path}`, { method: body ? 'POST' : 'GET', body: body ? JSON.stringify(body) : undefined,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
    return { status: r.status, ...(await r.json()) } as any;
  };
  let n = 0;
  const account = async () => (await call('/register', { username: `Solitaire${++n}`, password: 'motdepasse1' })).token as string;
  const game = async (t: string, setup: SetupPm, want: boolean) => {
    for (let i = 0; i < 200; i++) {
      const start = await call('/poker/start', { setup }, t);
      const g = play(start.setup, start.seed, i + 7);
      if ((g.state.winner === 'moi') !== want) { await call('/poker/end', { gameToken: start.gameToken, moves: g.moves }, t); continue; }
      return call('/poker/end', { gameToken: start.gameToken, moves: g.moves }, t);
    }
    throw new Error('résultat voulu introuvable');
  };

  it('victoire rejouée : points au classement ; défaite et victoire annoncée : rien', async () => {
    const t = await account();
    const lost = await game(t, { level: 'debutant', lives: 3, noStraights: false, bots: [PM_PERSONAS[0].id], start: 0 }, false);
    expect(lost.verified).toBe(true);
    expect(lost.week).toBeUndefined();
    // En cherchant une défaite, des victoires faciles (1 point chacune) ont pu être jouées et comptées.
    const meBefore = (await call('/solo-week', undefined, t)).me;
    const before = meBefore.points;
    const won = await game(t, { level: 'fouine', lives: 3, noStraights: false, bots: [PM_PERSONAS[0].id, PM_PERSONAS[1].id], start: 0 }, true);
    expect(won.verified).toBe(true);
    // Thème de la semaine (jour réel) : bonus éventuel, plafond du jour compris (shared/weekly-theme.ts).
    const th = themeBonus(today(), { game: 'poker', level: 'fouine', opponents: 2 });
    const want = Math.min(swPoints('fouine', 2) + (th?.bonus ?? 0), SW_DAILY_CAP - meBefore.today);
    expect(want).toBeGreaterThan(0);
    expect(won.week).toEqual({ gained: want, points: before + want, ...(th && want > swPoints('fouine', 2) ? { theme: th.id } : {}) });
    // Ancien chemin sans décisions (victoire annoncée par le téléphone) : jamais au classement.
    const start = await call('/poker/start', {}, t);
    const fake = await call('/poker/end', { gameToken: start.gameToken, won: true, place: 1, opponents: 5, level: 'fouine' }, t);
    expect(fake.verified).toBe(false);
    expect(fake.week).toBeUndefined();
    const board = await call('/solo-week', undefined, t);
    expect(board.me).toMatchObject({ rank: 1, points: won.week.points });
    expect(board.top[0]).toMatchObject({ rank: 1, points: won.week.points, me: true });
    // Vu par un invité : même classement, sans « moi ».
    const anon = await call('/solo-week');
    expect(anon.ok).toBe(true);
    expect(anon.me).toBeNull();
    expect(anon.top[0].username).toBe(board.top[0].username);
  });
});
