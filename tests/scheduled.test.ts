/** Tournois programmés (11h et 21h, heure de Bruxelles) : horaires, inscriptions payantes, gains, redémarrage. */
import { WELCOME_BAGS } from '../shared/progress/profile';
import { afterAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { io as connect, type Socket } from 'socket.io-client';
import { startServer } from '../server/app';
import type { PublicTournament } from '../shared/tournament';
import { bagPrizes, brusselsTime, formatDelay, nextSlots, schedRounds, schedTables, SCHED_LOBBY_MS } from '../shared/scheduled';

describe('tournois programmés : logique', () => {
  it('11h et 21h à Bruxelles, en hiver comme en été', () => {
    // Hiver (UTC+1) et été (UTC+2).
    expect(new Date(brusselsTime(2026, 1, 15, 21)).toISOString()).toBe('2026-01-15T20:00:00.000Z');
    expect(new Date(brusselsTime(2026, 7, 15, 21)).toISOString()).toBe('2026-07-15T19:00:00.000Z');
    expect(new Date(brusselsTime(2026, 7, 15, 11)).toISOString()).toBe('2026-07-15T09:00:00.000Z');
    // Jours de changement d'heure (29 mars et 25 octobre 2026).
    expect(new Date(brusselsTime(2026, 3, 29, 11)).toISOString()).toBe('2026-03-29T09:00:00.000Z');
    expect(new Date(brusselsTime(2026, 10, 25, 11)).toISOString()).toBe('2026-10-25T10:00:00.000Z');
    expect(new Date(brusselsTime(2026, 3, 28, 21)).toISOString()).toBe('2026-03-28T20:00:00.000Z');
    expect(new Date(brusselsTime(2026, 10, 24, 21)).toISOString()).toBe('2026-10-24T19:00:00.000Z');
  });
  it('les deux prochains rendez-vous', () => {
    const at = (iso: string) => nextSlots(Date.parse(iso)).map((s) => new Date(s.startsAt).toISOString());
    // 4 novembre 2026, 10h00 à Bruxelles (09:00Z) : 11h aujourd'hui, puis 21h.
    expect(at('2026-11-04T09:00:00Z')).toEqual(['2026-11-04T10:00:00.000Z', '2026-11-04T20:00:00.000Z']);
    // 11h03 : le salon de 11h est encore ouvert (départ à 11h05).
    expect(at('2026-11-04T10:03:00Z')[0]).toBe('2026-11-04T10:00:00.000Z');
    // 11h06 : c'est parti, le prochain est 21h puis 11h demain.
    expect(at('2026-11-04T10:06:00Z')).toEqual(['2026-11-04T20:00:00.000Z', '2026-11-05T10:00:00.000Z']);
    // 23h : demain 11h et 21h.
    expect(at('2026-11-04T22:00:00Z')).toEqual(['2026-11-05T10:00:00.000Z', '2026-11-05T20:00:00.000Z']);
    // Veille du passage à l'heure d'été : 21h samedi (UTC+1), puis 11h dimanche (UTC+2).
    expect(at('2026-03-28T12:00:00Z')).toEqual(['2026-03-28T20:00:00.000Z', '2026-03-29T09:00:00.000Z']);
    expect(nextSlots(Date.parse('2026-11-04T09:00:00Z'))[1].id).toBe('2026-11-04-21h');
    expect(formatDelay(2 * 3600_000 + 14 * 60_000)).toBe('2 h 14');
  });
  it('barème des sacs de dés par palier', () => {
    expect(bagPrizes(3)).toEqual([]);
    expect(bagPrizes(4)).toEqual([1]);
    expect(bagPrizes(5)).toEqual([1]);
    expect(bagPrizes(6)).toEqual([2, 1]);
    expect(bagPrizes(9)).toEqual([2, 1]);
    expect(bagPrizes(10)).toEqual([3, 2, 1]);
    expect(bagPrizes(15)).toEqual([3, 2, 1]);
    expect(bagPrizes(16)).toEqual([5, 3, 2, 1]);
  });
  it('format : finale d’au moins 4 joueurs, tables jamais trop petites', () => {
    for (let n = 4; n <= 16; n++) {
      const { final } = schedRounds(n);
      expect(final).toBeGreaterThanOrEqual(4);
      expect(final).toBeLessThanOrEqual(6);
      expect(Math.min(...schedTables(Array.from({ length: n }, (_, i) => i)).map((t) => t.length))).toBeGreaterThanOrEqual(3);
    }
    expect(schedRounds(4)).toEqual({ rounds: 1, final: 4 });
    expect(schedRounds(6)).toEqual({ rounds: 1, final: 6 });
    expect(schedRounds(7)).toEqual({ rounds: 2, final: 4 });
    expect(schedRounds(16)).toEqual({ rounds: 3, final: 4 });
  });
});

// --- Vrai serveur, horloge simulée -------------------------------------------------------------
const dir = mkdtempSync(join(tmpdir(), '421-sched-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
let now = Date.parse('2026-11-04T09:00:00Z'); // 10h00 à Bruxelles
const H11 = Date.parse('2026-11-04T10:00:00Z');
const SLOT = '2026-11-04-11h', SLOT21 = '2026-11-04-21h';
const quick = { variant: 'manches', rounds: 1, turnSeconds: 0 };
const boot = (dbPath: string) => startServer({
  port: 0, dbPath, now: () => now, schedTickMs: 0, schedConfig: quick as never, accounts: { authAttempts: 1000 },
  disconnectGraceMs: 50, autoPlayDelayMs: 5, rollGraceMs: 0, stopGraceMs: 0, tournamentPauseMs: 50,
});
type Srv = Awaited<ReturnType<typeof startServer>>;
const apiOf = (srv: Srv) => async (path: string, body?: object, token?: string) => {
  const r = await fetch(`http://localhost:${srv.port}/api${path}`, {
    method: body ? 'POST' : 'GET', body: body ? JSON.stringify(body) : undefined,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  return { status: r.status, ...(await r.json()) };
};
interface C { s: Socket; t: PublicTournament | null; removed: string | null }
const client = (srv: Srv) => new Promise<C>((resolve) => {
  const c: C = { s: connect(`http://localhost:${srv.port}`, { transports: ['websocket'], forceNew: true }), t: null, removed: null };
  c.s.on('tournament:state', (t: PublicTournament) => (c.t = t));
  c.s.on('tournament:removed', ({ reason }: { reason: string }) => (c.removed = reason));
  c.s.on('connect', () => resolve(c));
});
const emit = (c: C, ev: string, p: object = {}) => new Promise<any>((res) => c.s.emit(ev, p, res));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(fn: () => boolean, ms = 30000) { const t = Date.now(); while (!fn()) { if (Date.now() - t > ms) throw new Error('délai dépassé'); await wait(20); } }
let n = 0;
const accounts = (api: ReturnType<typeof apiOf>, k: number, coins = 50) =>
  Promise.all(Array.from({ length: k }, () => api('/register', { username: `Prog${++n}`, password: 'motdepasse1', guestProfile: { coins } })));
const coinsOf = async (api: ReturnType<typeof apiOf>, token: string) => (await api('/me', undefined, token)).profile.coins as number;

describe('tournois programmés : serveur', () => {
  it('inscription payante, double inscription, invités, désinscription remboursée', async () => {
    now = Date.parse('2026-11-04T09:00:00Z');
    const srv = await boot(':memory:');
    const api = apiOf(srv);
    const [a] = await accounts(api, 1, 25);
    const prog = await api('/tournois/programme', undefined, a.token);
    expect(prog.slots.map((s: any) => s.id)).toEqual([SLOT, SLOT21]);
    expect(prog.fee).toBe(10);
    // Invité : refusé.
    expect((await api('/tournois/inscription', { slot: SLOT })).status).toBe(401);
    const r1 = await api('/tournois/inscription', { slot: SLOT }, a.token);
    expect(r1.ok).toBe(true);
    expect(r1.profile.coins).toBe(15);
    expect(r1.slots[0]).toMatchObject({ registered: true, count: 1 });
    // Pas de double inscription (et pas de double débit).
    const r2 = await api('/tournois/inscription', { slot: SLOT }, a.token);
    expect(r2.ok).toBe(false);
    expect(await coinsOf(api, a.token)).toBe(15);
    // Inscription à l'avance au suivant aussi.
    expect((await api('/tournois/inscription', { slot: SLOT21 }, a.token)).ok).toBe(true);
    expect(await coinsOf(api, a.token)).toBe(5);
    // Plus assez de pièces pour un rendez-vous qui n'est pas dans les deux prochains : refusé.
    expect((await api('/tournois/inscription', { slot: '2026-11-05-11h' }, a.token)).ok).toBe(false);
    // Désinscription avant l'ouverture : remboursée.
    const u = await api('/tournois/desinscription', { slot: SLOT21 }, a.token);
    expect(u.ok).toBe(true);
    expect(u.profile.coins).toBe(15);
    expect(u.slots[1]).toMatchObject({ registered: false, count: 0 });
    // Le salon ouvre : plus de désinscription.
    now = H11 + 1000;
    srv.schedTick();
    expect((await api('/tournois/desinscription', { slot: SLOT }, a.token)).ok).toBe(false);
    expect((await api('/tournois/programme', undefined, a.token)).slots[0]).toMatchObject({ status: 'salon', registered: true });
    await srv.close();
  });

  it('plafond de 16 inscrits', async () => {
    now = Date.parse('2026-11-04T09:00:00Z');
    const srv = await boot(':memory:');
    const api = apiOf(srv);
    const accts = await accounts(api, 17);
    for (const a of accts.slice(0, 16)) expect((await api('/tournois/inscription', { slot: SLOT }, a.token)).ok).toBe(true);
    const last = await api('/tournois/inscription', { slot: SLOT }, accts[16].token);
    expect(last.ok).toBe(false);
    expect(last.error).toMatch(/complet/);
    expect(await coinsOf(api, accts[16].token)).toBe(50);
    await srv.close();
  });

  it('moins de 4 présents : annulé et tous remboursés (absent compris)', async () => {
    now = Date.parse('2026-11-04T09:00:00Z');
    const srv = await boot(':memory:');
    const api = apiOf(srv);
    const accts = await accounts(api, 4);
    for (const a of accts) await api('/tournois/inscription', { slot: SLOT }, a.token);
    now = H11 + 1000;
    srv.schedTick();
    const code = (await api('/tournois/programme', undefined, accts[0].token)).slots[0].code;
    expect(code).toMatch(/^[A-Z0-9]{5}$/);
    // Trois présents seulement.
    const cs = await Promise.all(accts.slice(0, 3).map(() => client(srv)));
    for (let i = 0; i < 3; i++) expect((await emit(cs[i], 'tournament:join', { code, auth: accts[i].token, name: 'x' })).ok).toBe(true);
    await until(() => cs[0].t?.players.length === 3);
    expect(cs[0].t!.sched).toMatchObject({ slot: SLOT, registered: 4, bags: [] });
    now = H11 + SCHED_LOBBY_MS + 1000;
    srv.schedTick();
    await until(() => !!cs[0].t?.sched?.cancelled);
    expect(cs[0].t!.sched!.cancelled).toMatch(/annulé/);
    for (const a of accts) expect(await coinsOf(api, a.token)).toBe(50);
    const last = (await api('/tournois/programme', undefined, accts[0].token)).last;
    expect(last).toMatchObject({ slot: SLOT, status: 'annule', refunded: 10 });
    expect(srv.accounts.social.sent.some((m) => m.title === 'Tournoi remboursé')).toBe(true);
    for (const c of cs) c.s.disconnect();
    await srv.close();
  });

  it('inscription dans le salon, absent remboursé, tournoi joué, sacs de dés au podium', async () => {
    now = Date.parse('2026-11-04T09:00:00Z');
    const srv = await boot(':memory:');
    const api = apiOf(srv);
    const accts = await accounts(api, 7);
    for (const a of accts.slice(0, 6)) await api('/tournois/inscription', { slot: SLOT }, a.token);
    // Rappel 5 minutes avant l'ouverture.
    now = H11 - 4 * 60_000;
    srv.schedTick();
    expect(srv.accounts.social.sent.filter((m) => m.title.includes('dans 5 minutes')).length).toBe(6);
    now = H11 + 1000;
    srv.schedTick();
    const code = (await api('/tournois/programme', undefined, accts[0].token)).slots[0].code;
    const cs = await Promise.all(accts.map(() => client(srv)));
    // Un invité ne rentre pas.
    expect((await emit(cs[0], 'tournament:join', { code, name: 'Invité' })).ok).toBe(false);
    // Cinq inscrits présents (le 6e est absent) + le 7e s'inscrit pendant le salon.
    for (let i = 0; i < 5; i++) expect((await emit(cs[i], 'tournament:join', { code, auth: accts[i].token })).ok).toBe(true);
    expect((await emit(cs[6], 'tournament:join', { code, auth: accts[6].token })).ok).toBe(false); // pas encore payé
    expect((await emit(cs[6], 'tournament:join', { code, auth: accts[6].token, pay: true })).ok).toBe(true);
    expect(await coinsOf(api, accts[6].token)).toBe(40);
    await until(() => cs[0].t?.players.length === 6);
    expect(cs[0].t!.sched!.bags).toEqual([2, 1]);
    now = H11 + SCHED_LOBBY_MS + 1000;
    srv.schedTick();
    await until(() => cs[0].t?.status === 'en-cours');
    expect(cs[0].t!.sched!.starters).toBe(6);
    // L'absent est remboursé.
    expect(await coinsOf(api, accts[5].token)).toBe(50);
    // Tout le monde abandonne : le serveur joue jusqu'au bout.
    for (const i of [0, 1, 2, 3, 4, 6]) await emit(cs[i], 'tournament:leave');
    const t = [...srv.tournaments.values()].find((x) => x.sched?.slot === SLOT)!;
    await until(() => t.status === 'termine', 40000);
    expect(t.standings!.length).toBe(6);
    const byId = (id: string) => t.players.find((p) => p.id === id)!.userId!;
    const winner = accts.find((a) => a.user.id === byId(t.standings![0]))!;
    const second = accts.find((a) => a.user.id === byId(t.standings![1]))!;
    const third = accts.find((a) => a.user.id === byId(t.standings![2]))!;
    expect((await api('/me', undefined, winner.token)).profile.bags).toBe(2 + WELCOME_BAGS);
    expect((await api('/me', undefined, second.token)).profile.bags).toBe(1 + WELCOME_BAGS);
    expect((await api('/me', undefined, third.token)).profile.bags ?? 0).toBe(WELCOME_BAGS);
    const last = (await api('/tournois/programme', undefined, winner.token)).last;
    expect(last).toMatchObject({ status: 'joue', place: 0, bags: 2, players: 6 });
    for (const c of cs) c.s.disconnect();
    await srv.close();
  }, 60000);

  it('persistance : inscriptions gardées après redémarrage, tournoi interrompu remboursé', async () => {
    const dbPath = join(dir, 'base.sqlite');
    now = Date.parse('2026-11-04T09:00:00Z');
    let srv = await boot(dbPath);
    let api = apiOf(srv);
    const accts = await accounts(api, 4);
    for (const a of accts) await api('/tournois/inscription', { slot: SLOT }, a.token);
    await srv.close();
    // Redémarrage avant l'heure : les inscriptions sont là, les pièces aussi.
    srv = await boot(dbPath);
    api = apiOf(srv);
    expect((await api('/tournois/programme', undefined, accts[0].token)).slots[0]).toMatchObject({ registered: true, count: 4 });
    expect(await coinsOf(api, accts[0].token)).toBe(40);
    // Le tournoi commence…
    now = H11 + 1000;
    srv.schedTick();
    const code = (await api('/tournois/programme', undefined, accts[0].token)).slots[0].code;
    const cs = await Promise.all(accts.map(() => client(srv)));
    for (let i = 0; i < 4; i++) await emit(cs[i], 'tournament:join', { code, auth: accts[i].token });
    now = H11 + SCHED_LOBBY_MS + 1000;
    srv.schedTick();
    await until(() => cs[0].t?.status === 'en-cours');
    for (const c of cs) c.s.disconnect();
    await srv.close(); // … et le serveur redémarre en pleine partie.
    srv = await boot(dbPath);
    api = apiOf(srv);
    for (const a of accts) expect(await coinsOf(api, a.token)).toBe(50);
    expect((await api('/tournois/programme', undefined, accts[0].token)).last).toMatchObject({ slot: SLOT, status: 'annule', refunded: 10 });
    await srv.close();
    // Serveur arrêté pendant toute l'heure du départ : annulé et remboursé au redémarrage.
    now = Date.parse('2026-11-04T19:00:00Z');
    srv = await boot(dbPath);
    api = apiOf(srv);
    await api('/tournois/inscription', { slot: SLOT21 }, accts[0].token);
    await srv.close();
    now = Date.parse('2026-11-04T20:30:00Z');
    srv = await boot(dbPath);
    api = apiOf(srv);
    expect(await coinsOf(api, accts[0].token)).toBe(50);
    await srv.close();
  }, 60000);
});
