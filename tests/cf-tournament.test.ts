/**
 * Coups Fourrés : tournoi du samedi (calendrier, tableau, passages sans adversaire, forfaits,
 * avancement, récompenses, annulation, annonces Discord simulées) et statistiques réelles des
 * cartes (suivi des cartes jouées, agrégats, route d'administration).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import { startServer } from '../server/app';
import { mulberry32 } from '../shared/rng';
import { cfDecide } from '../shared/cards/ai';
import { advanceBots, playMine, startBotMatch } from '../shared/cards/botmatch';
import { apply, legalActions, newGame, viewFor, waitingFor } from '../shared/cards/engine';
import {
  CF_TOUR_LOBBY_MS, cfAdvance, cfBracketDone, cfDrawBracket, cfFinal, cfNextTour, cfPlaces, cfReadyMatches, cfReport, cfRoundName,
  cfTourBoostersFor, cfTourPrizes, type CfTourView,
} from '../shared/cards/tournament';
import { CfPlayTracker, cfCardReport, deckCounts, type CfStatGame, type CfStatRow } from '../shared/cards/stats';
import { CAPSULES, CARDS } from '../shared/cards/catalog';
import type { CfStateMsg } from '../shared/cards/protocol';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(fn: () => boolean, ms = 8000, what = 'condition') {
  const t = Date.now();
  while (!fn()) { if (Date.now() - t > ms) throw new Error(`délai dépassé : ${what}`); await wait(10); }
}
function apiOf(base: string) {
  return async (path: string, body?: object, token?: string) => {
    const r = await fetch(`${base}/api${path}`, { method: body ? 'POST' : 'GET', body: body ? JSON.stringify(body) : undefined,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
    return { code: r.status, ...(await r.json()) };
  };
}

// --- Logique pure -----------------------------------------------------------------------------------
describe('tournoi du samedi : calendrier et tableau', () => {
  it('samedi à 20 h 30 (Bruxelles), salon de 10 minutes, avant le 421 classique de 21 h', () => {
    const thu = Date.parse('2026-11-05T10:00:00Z');
    const t = cfNextTour(thu);
    expect(t.id).toBe('cf-2026-11-07');
    expect(new Date(t.startsAt).toISOString()).toBe('2026-11-07T19:30:00.000Z'); // 20 h 30 à Bruxelles (heure d'hiver)
    expect(t.beginsAt - t.startsAt).toBe(CF_TOUR_LOBBY_MS);
    expect(t.beginsAt).toBeLessThanOrEqual(Date.parse('2026-11-07T20:00:00Z')); // départ avant 21 h
    expect(cfNextTour(t.startsAt + 5 * 60_000).id).toBe('cf-2026-11-07'); // salon ouvert
    expect(cfNextTour(t.beginsAt).id).toBe('cf-2026-11-14');
    // Heure d'été : toujours 20 h 30 à Bruxelles.
    expect(new Date(cfNextTour(Date.parse('2026-06-01T10:00:00Z')).startsAt).toISOString()).toBe('2026-06-06T18:30:00.000Z');
  });

  it('tirage : chaque joueur une fois, au plus un passage sans adversaire par match', () => {
    for (const n of [4, 5, 6, 7, 8, 9, 13, 16, 17, 31, 32]) {
      const ids = Array.from({ length: n }, (_, i) => `p${i}`);
      const b = cfDrawBracket(ids, mulberry32(n), 1000);
      let size = 2; while (size < n) size *= 2;
      expect(b.size).toBe(size);
      expect(b.rounds).toHaveLength(Math.log2(size));
      const first = b.rounds[0];
      expect(first.flatMap((m) => [m.a, m.b]).filter(Boolean).sort()).toEqual(ids.slice().sort());
      expect(first.every((m) => m.a !== null)).toBe(true);
      const byes = first.filter((m) => m.b === null);
      expect(byes).toHaveLength(size - n);
      expect(byes.every((m) => m.status === 'fini' && m.reason === 'bye' && m.winner === m.a)).toBe(true);
      expect(cfReadyMatches(b, 1000).filter((r) => r.round === 0)).toHaveLength(n - size / 2);
    }
  });

  it('avancement, pause, places, double forfait, noms des tours', () => {
    const b = cfDrawBracket(['a', 'b', 'c', 'd', 'e'], mulberry32(3), 0);
    // 5 joueurs : 8 places, 3 passages, 1 match au premier tour.
    let ready = cfReadyMatches(b, 0).filter((r) => r.round === 0);
    expect(ready).toHaveLength(1);
    const m = ready[0];
    // Deux joueurs passés sans adversaire peuvent se retrouver tout de suite au tour suivant.
    const early = cfReadyMatches(b, 0).filter((r) => r.round === 1);
    cfReport(b, m.round, m.index, m.match.a, 'victoire', 100);
    cfAdvance(b, 100, 50);
    // Le match qui attendait ce résultat a une pause de 50.
    expect(cfReadyMatches(b, 100).filter((r) => r.round === 1)).toHaveLength(early.length);
    expect(cfReadyMatches(b, 150)).toHaveLength(2);
    for (const r of cfReadyMatches(b, 150)) cfReport(b, r.round, r.index, r.match.b, 'victoire', 200);
    cfAdvance(b, 200, 50);
    const f = cfReadyMatches(b, 250);
    expect(f).toHaveLength(1);
    expect(cfRoundName(f[0].round, b.rounds.length)).toBe('Finale');
    expect(cfRoundName(0, 3)).toBe('Quarts de finale');
    cfReport(b, f[0].round, f[0].index, f[0].match.a, 'abandon', 300);
    expect(cfBracketDone(b)).toBe(true);
    const places = cfPlaces(b);
    expect(places.get(cfFinal(b).winner!)).toBe(1);
    expect([...places.values()].sort()).toEqual([1, 2, 3, 3, 5]);

    // Double forfait en demi-finale : le finaliste d'en face gagne sans jouer.
    const d = cfDrawBracket(['a', 'b', 'c', 'd'], mulberry32(1), 0);
    const [m1, m2] = cfReadyMatches(d, 0);
    cfReport(d, m1.round, m1.index, null, 'double-forfait', 10);
    cfReport(d, m2.round, m2.index, m2.match.a, 'forfait', 10);
    cfAdvance(d, 10, 0);
    expect(cfFinal(d)).toMatchObject({ status: 'fini', reason: 'bye', winner: m2.match.a });
    expect(cfPlaces(d).get(m2.match.a!)).toBe(1);
  });

  it('récompenses modestes selon le nombre de joueurs ; moins de 4 : rien', () => {
    expect(cfTourPrizes(3)).toEqual([]);
    expect(cfTourPrizes(4)).toEqual([2, 1]);
    expect(cfTourPrizes(8)).toEqual([3, 2, 1]);
    expect(cfTourPrizes(32)).toEqual([4, 2, 1]);
    expect(cfTourBoostersFor(3, 6)).toBe(0);
    expect(cfTourBoostersFor(3, 9)).toBe(1);
    expect(cfTourBoostersFor(5, 20)).toBe(0);
  });
});

// --- Statistiques des cartes (pur) -------------------------------------------------------------------
describe('statistiques des cartes', () => {
  it('le suivi retrouve les cartes jouées, même un piège posé face cachée, et le premier meneur', () => {
    const deck = (id: string) => Array<string>(20).fill(id);
    let s = newGame({}, [{ id: 'A', deck: deck('leurre') }, { id: 'B', deck: deck('tournee-patron') }], 4);
    const t = new CfPlayTracker();
    const rng = mulberry32(2);
    for (let i = 0; i < 20000 && s.phase !== 'over'; i++) {
      const id = waitingFor(s)[0];
      const a = cfDecide(viewFor(s, id), legalActions(s, id), 'habitue', rng);
      const r = apply(s, id, a);
      t.action(s, id, a);
      t.events(r.events);
      s = r.state;
    }
    expect(['A', 'B']).toContain(t.firstLeader);
    expect(Object.keys(t.playsOf('A'))).toEqual(['leurre']);
    expect(t.playsOf('A').leurre).toBeGreaterThan(0);
    expect(Object.keys(t.playsOf('B'))).toEqual(['tournee-patron']);
  });

  it('agrégats : présence, jeu, victoires jouée / pas jouée, écart, petits échantillons à la fin', () => {
    const games: CfStatGame[] = [];
    const rows: CfStatRow[] = [];
    for (let i = 0; i < 100; i++) {
      games.push({ id: i, mode: 'classee', level: null, players: 2, rounds: 6, durationMs: 600_000, firstLeaderWon: i % 4 !== 0 });
      // « fouine » dans tous les decks, jouée une partie sur deux et alors toujours gagnante ; « patron » dans 10 decks seulement.
      const played = i % 2 === 0;
      rows.push({ gameId: i, mode: 'classee', won: played, deck: { fouine: 2, leurre: 1, ...(i < 10 ? { patron: 1 } : {}) }, plays: played ? { fouine: 2 } : { leurre: 1 } });
    }
    const r = cfCardReport(games, rows);
    expect(r.games).toBe(100);
    expect(r.base).toBe(0.5);
    expect(r.firstLeader).toMatchObject({ games: 100, won: 75, rate: 0.75 });
    expect(r.avgDurationMs).toBe(600_000);
    const fouine = r.cards.find((c) => c.id === 'fouine')!;
    expect(fouine).toMatchObject({ decks: 100, presence: 1, played: 50, playRate: 0.5, playsPerGame: 1, winPlayed: 1, winUnplayed: 0, verdict: 'forte', small: false });
    expect(fouine.delta).toBeCloseTo(0.5);
    const leurre = r.cards.find((c) => c.id === 'leurre')!;
    expect(leurre).toMatchObject({ winPlayed: 0, verdict: 'faible' });
    expect(r.cards[0].id).toMatch(/fouine|leurre/); // les plus gros écarts d'abord
    const patron = r.cards.find((c) => c.id === 'patron')!;
    expect(patron.small).toBe(true);
    expect(patron.verdict).toBeNull();
    expect(r.cards.findIndex((c) => c.id === 'patron')).toBeGreaterThan(r.cards.findIndex((c) => c.id === 'leurre'));
    const pieges = r.families.find((f) => f.family === 'pieges')!;
    expect(pieges).toMatchObject({ decks: 100, copies: 3, winPresent: 0.5 });
    expect(deckCounts(['a', 'b', 'a'])).toEqual({ a: 2, b: 1 });
  });
});

// --- Serveur : tournoi complet par de vrais sockets ------------------------------------------------------
interface Cl { s: Socket; name: string; byGame: Map<string, CfStateMsg>; acted: Set<string>; busy: boolean }

describe('tournoi du samedi en ligne', () => {
  let srv: Awaited<ReturnType<typeof startServer>>;
  let url = '';
  let api: ReturnType<typeof apiOf>;
  let clock = Date.parse('2026-11-05T13:00:00Z'); // jeudi (après le tournoi classique de 11 h)
  const discord: { title: string; description?: string }[] = [];
  const clients: Cl[] = [];
  beforeAll(async () => {
    srv = await startServer({
      port: 0, dbPath: ':memory:', now: () => clock, schedTickMs: 0, accounts: { authAttempts: 1000, now: () => clock }, stats: { adminUsers: ['Patron'] },
      discordHooks: { env: { DISCORD_WEBHOOK_TOURNOIS: 'https://discord.com/api/webhooks/1/x' }, send: async (_u, body) => { discord.push((body as { embeds: { title: string }[] }).embeds[0]); }, newsDelayMs: 0 },
      cf: { windowMs: 30, keepWindowMs: 20, decisionMs: 1500, reserveMs: 500, disconnectMs: 400, matchTickMs: 40, autoplayMs: 10 },
      cfTour: { tickMs: 0, pauseMs: 60_000, config: { startTokens: 3 } },
    });
    url = `http://localhost:${srv.port}`;
    api = apiOf(url);
  });
  afterAll(async () => { for (const c of clients) c.s.disconnect(); await srv.close(); });

  const reg = async (u: string, discover = true) => {
    const r = await api('/register', { username: u, password: 'motdepasse1' });
    if (discover) await api('/cf/discover', {}, r.token);
    return { token: r.token as string, id: r.user.id as string, name: u };
  };
  function pump(c: Cl, m: CfStateMsg) {
    if (c.busy || !m.you || m.snap.finished || !m.snap.legal.length) return;
    const key = `${m.id}:${m.snap.view.version}`;
    if (c.acted.has(key)) return;
    c.acted.add(key);
    c.busy = true;
    const action = cfDecide(m.snap.view, m.snap.legal, 'habitue', mulberry32(m.snap.view.version + c.acted.size));
    setTimeout(() => c.s.emit('cf:act', { id: m.id, action }, () => { c.busy = false; const last = c.byGame.get(m.id); if (last) pump(c, last); }), 20);
  }
  function client(acc: { token: string; name: string }): Promise<Cl> {
    return new Promise((resolve, reject) => {
      const c: Cl = { s: connect(`${url}/cf`, { transports: ['websocket'], forceNew: true, auth: { token: acc.token } }), name: acc.name, byGame: new Map(), acted: new Set(), busy: false };
      clients.push(c);
      c.s.on('cf:state', (m: CfStateMsg) => { c.byGame.set(m.id, m); pump(c, m); });
      c.s.on('cf:hello', () => resolve(c));
      c.s.on('connect_error', reject);
    });
  }
  const tourOf = async (token?: string): Promise<CfTourView> => (await api('/cf/tournoi', undefined, token)).tour;
  const tick = () => srv.cfTour.tick();

  it('inscriptions, salon, départ, tableau, matchs, récompenses, annonces Discord ; statistiques « tournoi »', async () => {
    const players = await Promise.all(['Alix', 'Basile', 'Coco', 'Doudou', 'Eole'].map((n) => reg(n)));
    const novice = await reg('Novice', false);
    // Sans compte / mode pas découvert.
    expect((await tourOf()).cannot).toMatch(/compte/);
    expect((await api('/cf/tournoi/inscription', {})).code).toBe(401);
    const nv = await api('/cf/tournoi/inscription', {}, novice.token);
    expect(nv.code).toBe(400);
    expect(nv.error).toMatch(/Découvrez/);
    // Inscription dans la semaine, désinscription, réinscription.
    for (const p of players) expect((await api('/cf/tournoi/inscription', {}, p.token)).ok).toBe(true);
    const t0 = await tourOf(players[0].token);
    expect(t0).toMatchObject({ id: 'cf-2026-11-07', status: 'a-venir', count: 5, registered: true, prizes: [2, 1] });
    expect((await api('/cf/tournoi/desinscription', {}, players[4].token)).tour.registered).toBe(false);
    expect((await api('/cf/tournoi/inscription', {}, players[4].token)).ok).toBe(true);
    expect((await api('/cf/tournoi/salon', { in: true }, players[0].token)).error).toMatch(/pas encore ouvert/);

    // 1 h avant : annonce Discord ; 10 min avant l'ouverture : rappel (notification).
    const slot = cfNextTour(clock);
    clock = slot.startsAt - 60 * 60_000 + 1000; tick();
    expect(discord.map((x) => x.title)).toEqual(['🃏 Tournoi Coups Fourrés ce soir à 20 h 30']);
    clock = slot.startsAt - 9 * 60_000; tick();
    // Ouverture du salon (20 h 30) : annonce, puis 4 joueurs entrent (le 5e ne vient pas).
    clock = slot.startsAt + 1000; tick();
    expect(discord.map((x) => x.title)).toContain('🔔 Le salon du tournoi Coups Fourrés est ouvert');
    expect((await tourOf()).status).toBe('salon');
    const cls = await Promise.all(players.slice(0, 4).map(client));
    const noSock = await api('/cf/tournoi/salon', { in: true }, players[4].token);
    expect(noSock.error).toMatch(/Ouvrez Coups Fourrés/);
    for (const p of players.slice(0, 4)) expect((await api('/cf/tournoi/salon', { in: true }, p.token)).tour.here).toBe(true);
    // Dans le salon : pas d'autre partie en ligne.
    const busy = await new Promise<{ ok: boolean; error?: string }>((r) => cls[0].s.emit('cf:queue:join', {}, r));
    expect(busy.error).toMatch(/salon du tournoi/);

    // Départ (20 h 40) : 4 joueurs, Eole absent.
    clock = slot.beginsAt + 500; tick();
    const t1 = await tourOf(players[0].token);
    expect(t1).toMatchObject({ status: 'en-cours', starters: 4, count: 4 });
    expect(t1.rounds!.map((r) => r.name)).toEqual(['Demi-finales', 'Finale']);
    expect(t1.rounds![0].matches.every((m) => m.status === 'en-cours' && m.game)).toBe(true);
    expect((await tourOf(players[4].token)).me?.state).toBe('absent');
    // N'importe quel compte peut regarder un match du tournoi.
    const watcher = await client(novice);
    const w = await new Promise<{ ok: boolean; error?: string }>((r) => watcher.s.emit('cf:watch', { code: t1.rounds![0].matches[0].game }, r));
    expect(w.ok).toBe(true);
    await new Promise((r) => watcher.s.emit('cf:unwatch', {}, r));

    // Demi-finales jouées jusqu'au bout (IA), puis pause : la finale attend.
    await until(() => srv.cfTour.active!.bracket.rounds[0].every((m) => m.status === 'fini'), 60_000, 'demi-finales');
    const semis = (await tourOf()).rounds!;
    expect(semis[1].matches[0].status).toBe('pret');
    expect(semis[0].matches.every((m) => m.reason === 'victoire')).toBe(true);
    // Le finaliste B quitte le mode pendant la pause : forfait au départ de la finale.
    const finalists = srv.cfTour.active!.bracket.rounds[1][0];
    const absentId = finalists.b!;
    const absentCl = cls[players.findIndex((p) => p.id === absentId)];
    absentCl.s.disconnect();
    await wait(50);
    clock += 61_000; tick();
    const tf = await tourOf();
    expect(tf.rounds![1].matches[0].status).toBe('en-cours');
    await until(() => !srv.cfTour.active, 10_000, 'fin du tournoi');
    const done = await tourOf(players[0].token);
    expect(done.status).toBe('termine');
    expect(done.rounds![1].matches[0]).toMatchObject({ status: 'fini', reason: 'forfait', winner: 'a' });
    const champId = finalists.a!;
    expect(done.champion?.name).toBe(players.find((p) => p.id === champId)!.name);
    // Récompenses : 4 joueurs → vainqueur 2 boosters, finaliste 1 (pas de pièces).
    const boosters = async (id: string) => (await api('/cf/me', undefined, players.find((p) => p.id === id)!.token)).state.boosters;
    const welcome = CAPSULES.welcomeBoosters;
    expect(await boosters(champId)).toBeGreaterThanOrEqual(welcome + 2);
    expect(await boosters(champId)).toBeLessThanOrEqual(welcome + 3); // + éventuelle première victoire du jour
    expect((await tourOf(players.find((p) => p.id === champId)!.token)).me).toMatchObject({ state: 'vainqueur', place: 1, boosters: 2 });
    expect((await tourOf(players.find((p) => p.id === absentId)!.token)).me).toMatchObject({ state: 'elimine', place: 2, boosters: 1 });
    const semiLoser = players.find((p) => ![champId, absentId].includes(p.id) && p.id !== players[4].id)!;
    expect((await tourOf(semiLoser.token)).me).toMatchObject({ place: 3, boosters: 0 });
    expect(discord.map((x) => x.title)).toContain(`🥇 ${done.champion!.name} remporte le tournoi Coups Fourrés !`);
    expect(done.next?.id).toBe('cf-2026-11-14');

    // Statistiques des cartes (réservées aux administrateurs) : les 2 demi-finales sont notées en mode « tournoi » ;
    // la finale perdue par forfait pendant la première manche n'apprend rien sur les cartes.
    expect((await api('/admin/cf/cards?days=0&mode=tournoi', undefined, players[0].token)).code).toBe(403);
    const admin = await reg('Patron', false);
    const st = await api('/admin/cf/cards?days=0&mode=tournoi', undefined, admin.token);
    expect(st.ok).toBe(true);
    expect(st.games).toBe(2);
    expect(st.playerGames).toBe(4);
    expect(st.byMode.tournoi).toBe(2);
    expect(st.cards).toHaveLength(CARDS.length);
    expect(st.cards.some((c: { played: number }) => c.played > 0)).toBe(true);
    expect((await api('/admin/cf/cards?days=7&mode=classee', undefined, admin.token)).games).toBe(0);
  }, 120_000);

  it('moins de 4 présents : annulé (annonce Discord) ; redémarrage pendant le tournoi : annulé', async () => {
    discord.length = 0;
    const slot = cfNextTour(clock);
    expect(slot.id).toBe('cf-2026-11-14');
    const ps = await Promise.all(['Fifi', 'Gaby', 'Hugo'].map((n) => reg(n)));
    for (const p of ps) await api('/cf/tournoi/inscription', {}, p.token);
    clock = slot.startsAt + 1000; tick();
    await Promise.all(ps.map(client));
    for (const p of ps) await api('/cf/tournoi/salon', { in: true }, p.token);
    clock = slot.beginsAt + 1000; tick();
    const t = await tourOf(ps[0].token);
    expect(t.status).toBe('annule');
    expect(t.reason).toMatch(/3 joueurs au départ, il en faut au moins 4/);
    expect(discord.map((x) => x.title)).toContain('Tournoi Coups Fourrés annulé');
    // Après le départ, plus d'inscription pour ce samedi : c'est déjà le suivant.
    expect((await api('/cf/tournoi/inscription', {}, ps[0].token)).ok).toBe(true);
    expect((await tourOf(ps[0].token)).next?.id).toBe('cf-2026-11-21');
    // Tournoi interrompu par un redémarrage.
    srv.store.sqlite.prepare("INSERT INTO cf_tours (id, starts_at, status, starters) VALUES ('cf-2026-10-31', ?, 'en-cours', 6)").run(clock - 7 * 86_400_000);
    srv.cfTour.recover();
    const row = srv.store.sqlite.prepare("SELECT status, reason FROM cf_tours WHERE id = 'cf-2026-10-31'").get() as { status: string; reason: string };
    expect(row.status).toBe('annule');
    expect(row.reason).toMatch(/interrompu/);
  }, 30_000);

  it('partie contre l’ordinateur vérifiée : notée avec le niveau, le deck et les cartes jouées', async () => {
    const a = await reg('Statisticienne');
    const s = await api('/cf/bot/start', { level: 'debutant' }, a.token);
    const { match } = startBotMatch({ seed: s.seed, me: s.me, bots: s.bots });
    const rng = mulberry32(7);
    for (let i = 0; i < 5000 && match.state.phase !== 'over'; i++) {
      playMine(match, cfDecide(viewFor(match.state, s.me.id), legalActions(match.state, s.me.id), 'habitue', rng));
      advanceBots(match);
    }
    clock += 30 * 60_000;
    expect((await api('/cf/bot/end', { gameId: s.gameId, actions: match.mine }, a.token)).ok).toBe(true);
    const admin = (await api('/login', { username: 'Patron', password: 'motdepasse1' })).token;
    const st = await api('/admin/cf/cards?days=7&mode=bot', undefined, admin);
    expect(st.games).toBe(1);
    expect(st.byLevel.debutant).toEqual({ games: 1, wins: match.state.winner === 'joueur' ? 1 : 0 });
    const inDeck = new Set<string>(s.me.deck);
    expect(st.cards.filter((c: { decks: number }) => c.decks === 1).map((c: { id: string }) => c.id).sort()).toEqual([...inDeck].sort());
    const row = srv.store.sqlite.prepare("SELECT p.plays FROM cf_stat_players p JOIN cf_stat_games g ON g.id = p.game_id WHERE g.mode = 'bot'").get() as { plays: string };
    const plays = JSON.parse(row.plays) as Record<string, number>;
    for (const id of Object.keys(plays)) expect(inDeck.has(id)).toBe(true);
    expect(st.firstLeader.games).toBe(1);
  }, 60_000);
});
