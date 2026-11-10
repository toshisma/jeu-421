/**
 * Le Courtisan 0.53 : bonus de bienvenue (100 Groschen), succès du Courtisan (faits du serveur),
 * mises contre les ordinateurs (pas de Débutant, part des ordinateurs plafonnée par jour), traductions.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import { startServer } from '../server/app';
import { Store } from '../server/db';
import { createGroschen } from '../server/groschen';
import { currentPlayer, newGame, type DmState } from '../shared/dixmille/engine';
import { decide } from '../shared/dixmille/ai';
import { trackFeats, type DmFeats } from '../shared/dixmille/feats';
import { applyDixMilleGame, dixMilleReward, nextDmStats } from '../shared/dixmille/reward';
import { DM_BOT_GAIN_DAILY, GROSCHEN_WELCOME } from '../shared/dixmille/groschen';
import { ACHIEVEMENTS } from '../shared/progress/achievements';
import { newProfile, capGuestImport } from '../shared/progress/profile';
import { courtisan2Fr } from '../shared/i18n/zones/courtisan2.fr';
import { courtisan2En } from '../shared/i18n/zones/courtisan2.en';
import { courtisan2De } from '../shared/i18n/zones/courtisan2.de';
import { courtisan2Nl } from '../shared/i18n/zones/courtisan2.nl';
import { translateServerText } from '../shared/i18n/server-texts';
import { NO_STAKE_WITH_BEGINNER } from '../server/dixmille-online';
import type { DmUpdate } from '../shared/dixmille/protocol';

const DM = ACHIEVEMENTS.filter((a) => a.game === 'courtisan');

describe('Courtisan 0.53 : traductions', () => {
  const holes = (t: string) => [...t.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
  it('chaque clé existe en en/de/nl avec les mêmes trous', () => {
    for (const [l, d] of [['en', courtisan2En], ['de', courtisan2De], ['nl', courtisan2Nl]] as const) {
      for (const k of Object.keys(courtisan2Fr) as (keyof typeof courtisan2Fr)[]) {
        expect(d[k], `${l}:${k}`).toBeTruthy();
        expect(d[k], `${l}:${k}`).not.toBe(courtisan2Fr[k]);
        expect(holes(d[k]), `${l}:${k}`).toEqual(holes(courtisan2Fr[k]));
      }
    }
  });
  it('chaque succès du Courtisan a son nom et sa description (français identique au catalogue)', () => {
    expect(DM.length).toBeGreaterThanOrEqual(12);
    const fr = courtisan2Fr as Record<string, string>;
    for (const a of DM) { expect(fr[`dm2.a.${a.id}`]).toBe(a.name); expect(fr[`dm2.a.${a.id}.d`]).toBe(a.description); }
  });
  it('messages du serveur traduits', () => {
    const cap = `Plafond du jour atteint : la part des ordinateurs n’est versée que jusqu’à ${DM_BOT_GAIN_DAILY} Groschen par jour.`;
    for (const l of ['en', 'de', 'nl'] as const) {
      expect(translateServerText(l, NO_STAKE_WITH_BEGINNER)).not.toBe(NO_STAKE_WITH_BEGINNER);
      expect(translateServerText(l, cap)).toContain(String(DM_BOT_GAIN_DAILY));
      expect(translateServerText(l, cap)).not.toBe(cap);
    }
  });
  it('récompenses basses, à l’échelle des autres succès', () => {
    for (const a of DM) expect(a.coins).toBeLessThanOrEqual(a.rare ? 30 : 20);
  });
});

describe('Courtisan 0.53 : exploits et statistiques', () => {
  const state = (dice: number[], out = [false, false, false, false, false, false]): DmState => {
    const s = newGame([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], 4000, 1);
    return { ...s, phase: 'choisir', dice, out, rolled: out.map((o) => !o) };
  };
  it('six dés d’un coup, grande suite, six identiques', () => {
    const f: DmFeats = {};
    trackFeats(f, state([1, 2, 3, 4, 5, 6]), { type: 'encaisser', pick: [0, 1, 2, 3, 4, 5] }, { ...state([1, 2, 3, 4, 5, 6]), events: [] });
    trackFeats(f, state([4, 4, 4, 4, 4, 4]), { type: 'encaisser', pick: [0, 1, 2, 3, 4, 5] }, { ...state([1, 2, 3, 4, 5, 6]), events: [] });
    trackFeats(f, state([1, 1, 1, 5, 5, 5]), { type: 'encaisser', pick: [0, 1, 2, 3, 4, 5] }, { ...state([1, 2, 3, 4, 5, 6]), events: [] });
    // Cinq dés pris sur six : rien.
    trackFeats(f, state([1, 1, 1, 5, 5, 3]), { type: 'encaisser', pick: [0, 1, 2, 3, 4] }, { ...state([1, 2, 3, 4, 5, 6]), events: [] });
    expect(f.a).toMatchObject({ six: 3, straight: 1, sixKind: 1 });
  });
  it('mains pleines comptées par tour, remises à zéro au tour suivant ; pas quand le serveur joue pour le joueur', () => {
    const f: DmFeats = {};
    const s = state([1, 1, 1, 5, 5, 5]);
    const hot = { ...s, events: [{ kind: 'main-pleine' as const, playerId: 'a', turn: 0 }] };
    trackFeats(f, s, { type: 'relancer', pick: [0, 1, 2, 3, 4, 5] }, hot);
    trackFeats(f, s, { type: 'relancer', pick: [0, 1, 2, 3, 4, 5] }, hot);
    trackFeats(f, s, { type: 'encaisser', pick: [0] }, { ...s, events: [{ kind: 'encaisse', playerId: 'a', points: 100, score: 100 }] });
    trackFeats(f, s, { type: 'relancer', pick: [0, 1, 2, 3, 4, 5] }, hot);
    expect(f.a.hotMax).toBe(2);
    expect(f.a.hot).toBe(1);
    const g: DmFeats = {};
    trackFeats(g, s, { type: 'relancer', pick: [0, 1, 2, 3, 4, 5] }, hot, false);
    expect(g.a).toMatchObject({ hot: 0, six: 0 });
  });
  it('résultat annoncé par le téléphone : seules les victoires avancent ; partie du serveur : tout', () => {
    const declared = nextDmStats(undefined, true, { won: true, players: 2, minutes: 5, mode: 'solo', bestTurn: 16000, declared: true,
      verified: { online: true, target: 10000, misses: 0, botLevels: ['fouine'], hotMax: 9, six: 9, straight: 9, sixKind: 9 } });
    expect(declared).toMatchObject({ games: 1, wins: 1, vGames: 0, vWins: 0, onlineWins: 0, vBestTurn: 0, six: 0, beaten: 0, cleanWins: 0, streak: 0 });
    const v = { online: false, target: 4000, misses: 0, botLevels: ['debutant', 'fouine'] as const, hotMax: 2, six: 1, straight: 1, sixKind: 0 };
    let st = nextDmStats(undefined, true, { won: true, players: 3, minutes: 5, mode: 'solo', bestTurn: 2600, verified: { ...v, botLevels: [...v.botLevels] } });
    expect(st).toMatchObject({ vWins: 1, onlineWins: 0, vBestTurn: 2600, hotMax: 2, six: 1, straight: 1, cleanWins: 1, beaten: 5, streak: 1 });
    st = nextDmStats(st, true, { won: true, players: 2, minutes: 5, mode: 'online', verified: { ...v, online: true, misses: 2, botLevels: ['habitue'] } });
    expect(st).toMatchObject({ onlineWins: 1, cleanWins: 1, beaten: 7, streak: 2, bestStreak: 2 });
    st = nextDmStats(st, false, { won: false, players: 2, minutes: 5, mode: 'online', verified: { ...v, botLevels: [] } });
    expect(st).toMatchObject({ streak: 0, bestStreak: 2 });
  });
  it('déblocage : une victoire annoncée ne donne que « Premier courtisan »', () => {
    const r = dixMilleReward({ won: true, place: 1, opponents: 1, level: 'fouine', minutes: 5, day: '2026-11-10', now: 0 });
    const a = applyDixMilleGame(newProfile(), r, '2026-11-10', { won: true, players: 2, minutes: 5, mode: 'solo', level: 'fouine', bestTurn: 3000, declared: true }, () => 0.99);
    expect(a.achievementsDone.map((x) => x.id)).toEqual(['dm-premiere']);
    expect(a.profile.coins).toBe(r.coins + 5 + a.levelBonusCoins);
    const b = applyDixMilleGame(a.profile, r, '2026-11-10', { won: true, players: 2, minutes: 5, mode: 'online', bestTurn: 2500,
      verified: { online: true, target: 4000, misses: 1, botLevels: [], hotMax: 0, six: 1, straight: 1, sixKind: 0 } }, () => 0.99);
    expect(b.achievementsDone.map((x) => x.id).sort()).toEqual(['dm-en-ligne', 'dm-grande-suite', 'dm-gros-tour', 'dm-six-des', 'dm-tresor']);
  });
  it('reprise d’un profil invité : pas de faits « vérifiés » ni de succès qu’ils justifieraient', () => {
    const p = { ...newProfile(), dm: { ...nextDmStats(undefined, true, { won: true, players: 2, minutes: 5, mode: 'online', bestTurn: 3000, verified: { online: true, target: 4000, misses: 0, botLevels: [], hotMax: 3, six: 2, straight: 1, sixKind: 1 } }) },
      achievements: { 'dm-premiere': 1, 'dm-en-ligne': 1, 'dm-six-identiques': 1 } };
    const imported = capGuestImport(p);
    expect(imported.dm?.onlineWins).toBe(0);
    expect(Object.keys(imported.achievements)).toEqual(['dm-premiere']);
  });
});

describe('Courtisan 0.53 : part des ordinateurs plafonnée par jour', () => {
  it('au-delà du plafond, seules les mises des joueurs sont versées ; remis à zéro le lendemain', () => {
    const store = new Store(':memory:');
    store.createUser({ id: 'u1', username: 'Ana', passHash: 'x', recoveryHash: 'y' });
    let t = Date.parse('2026-11-10T10:00:00Z');
    const g = createGroschen({ store, userFromToken: () => undefined, isAdmin: () => false, now: () => t });
    store.dmMove('u1', 500, 'admin');
    for (const ref of ['R1', 'R2']) { expect(g.stake('u1', 60, ref)).toBe(true); }
    // Pot de 240 : 60 de la joueuse, 180 de trois ordinateurs.
    expect(g.payWinner('R1', 'u1', 240, 180)).toEqual({ paid: 60 + DM_BOT_GAIN_DAILY, capped: true });
    expect(g.payWinner('R2', 'u1', 240, 180)).toEqual({ paid: 60, capped: true });
    expect(store.dmBalance('u1')).toBe(500 - 120 + 60 + DM_BOT_GAIN_DAILY + 60);
    t += 86400_000;
    expect(g.stake('u1', 10, 'R3')).toBe(true);
    expect(g.payWinner('R3', 'u1', 20, 10)).toEqual({ paid: 20, capped: false });
    // Entre humains seulement : jamais de plafond.
    expect(g.stake('u1', 10, 'R4')).toBe(true);
    expect(g.payWinner('R4', 'u1', 1000, 0)).toEqual({ paid: 1000, capped: false });
  });
});

// ---------------------------------------------------------------------------------------------
// Vrai serveur

let clock = Date.parse('2026-11-10T10:00:00Z');
let srv: Awaited<ReturnType<typeof startServer>>;
let url = '';
beforeAll(async () => {
  srv = await startServer({
    port: 0, dbPath: ':memory:', turnTimeoutMs: 60_000, accounts: { now: () => clock, authAttempts: 1000 },
    dm: { decisionMs: 60_000, autoplayMs: 5, animMs: 0, disconnectMs: 150, now: () => clock },
  });
  url = `http://localhost:${srv.port}`;
});
afterAll(async () => { await srv.close(); });

async function api(path: string, body?: object, token?: string) {
  const r = await fetch(`${url}/api${path}`, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, ...(await r.json()) };
}
let seq = 0;
async function account() {
  const username = `Dm2x${++seq}${Math.floor(Math.random() * 10000)}`;
  const r = await api('/register', { username, password: 'motdepasse1' });
  return { username, token: r.token as string, id: srv.store.userByName(username)!.id };
}
interface C { s: Socket; state: DmState | null; version: number; id: string; rewards: any[] }
function client(): Promise<C> {
  return new Promise((resolve) => {
    const c: C = { s: connect(`${url}/dixmille`, { transports: ['websocket'], forceNew: true }), state: null, version: 0, id: '', rewards: [] };
    c.s.on('game:state', (m: { version: number; state: DmState } | null) => { c.state = m?.state ?? null; c.version = m?.version ?? 0; });
    c.s.on('game:update', (u: DmUpdate) => { c.state = u.state; c.version = u.version; });
    c.s.on('profile:reward', (m: unknown) => c.rewards.push(m));
    c.s.on('connect', () => resolve(c));
  });
}
const emit = (c: C, ev: string, p: object = {}) => new Promise<any>((res) => c.s.emit(ev, p, res));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(fn: () => boolean, ms = 5000) { const t = Date.now(); while (!fn()) { if (Date.now() - t > ms) throw new Error('délai dépassé'); await wait(5); } }

describe('Courtisan 0.53 : bonus de bienvenue', () => {
  it('nouveau compte : 100 Groschen au départ (80 + 20 du jour), une seule fois', async () => {
    const u = await account();
    const peek = await api('/dixmille/wallet?peek=1', undefined, u.token);
    expect(peek).toMatchObject({ balance: 0, giftReady: true, giftAmount: GROSCHEN_WELCOME });
    expect(await api('/dixmille/wallet', undefined, u.token)).toMatchObject({ balance: GROSCHEN_WELCOME, welcome: 80, gift: 20, newcomer: true });
    expect(await api('/dixmille/wallet?peek=1', undefined, u.token)).toMatchObject({ giftReady: false, giftAmount: 0 });
  });
  it('compte existant (départ de 20 déjà reçu) : +80 une seule fois, même en rejouant la requête', async () => {
    const u = await account();
    // Ce que faisait la 0.52 : cadeau du jour seulement.
    srv.store.dmDailyGift(u.id, '2026-11-09', 20);
    srv.store.dmMove(u.id, -15, 'mise', 'DM:OLD:1');
    const all = await Promise.all(Array.from({ length: 6 }, () => api('/dixmille/wallet', undefined, u.token)));
    expect(all.filter((r) => r.welcome === 80)).toHaveLength(1);
    expect(all.find((r) => r.welcome)!.newcomer).toBe(false);
    expect(await api('/dixmille/wallet', undefined, u.token)).toMatchObject({ balance: 5 + 80 + 20 });
    clock += 86400_000;
    const next = await api('/dixmille/wallet', undefined, u.token);
    expect(next.welcome).toBeUndefined();
    expect(next.balance).toBe(5 + 80 + 20 + 20);
    const moves = next.history.filter((m: { reason: string }) => m.reason === 'bienvenue');
    expect(moves).toHaveLength(1);
  });
});

describe('Courtisan 0.53 : pas de mise contre un ordinateur Débutant', () => {
  it('refusé contre l’ordinateur, à l’ajout, au remplissage et au réglage de la mise', async () => {
    const u = await account();
    await api('/dixmille/wallet', undefined, u.token);
    const a = await client();
    expect((await emit(a, 'table:solo', { stake: 10, opponents: 3, level: 'debutant', auth: u.token })).error).toBe(NO_STAKE_WITH_BEGINNER);
    const cr = await emit(a, 'table:create', { name: u.username, stake: 10, auth: u.token });
    expect(cr.ok).toBe(true);
    expect((await emit(a, 'table:addBot', { level: 'debutant' })).error).toBe(NO_STAKE_WITH_BEGINNER);
    expect((await emit(a, 'table:fill', { level: 'debutant' })).error).toBe(NO_STAKE_WITH_BEGINNER);
    expect((await emit(a, 'table:addBot', { level: 'habitue' })).ok).toBe(true);
    // Table gratuite avec un Débutant : on ne peut plus y mettre de mise.
    expect((await emit(a, 'table:config', { stake: 0 })).ok).toBe(true);
    expect((await emit(a, 'table:addBot', { level: 'debutant' })).ok).toBe(true);
    expect((await emit(a, 'table:config', { stake: 5 })).error).toBe(NO_STAKE_WITH_BEGINNER);
    expect(await api('/dixmille/wallet', undefined, u.token)).toMatchObject({ balance: 100 });
    a.s.close();
  });
  it('contre un Habitué, la mise reste possible', async () => {
    const u = await account();
    await api('/dixmille/wallet', undefined, u.token);
    const a = await client();
    const r = await emit(a, 'table:solo', { stake: 10, opponents: 1, level: 'habitue', target: 2000, auth: u.token });
    expect(r.ok).toBe(true);
    await emit(a, 'table:leave');
    a.s.close();
  });
});

describe('Courtisan 0.53 : succès débloqués en ligne (faits du serveur)', () => {
  it('partie entre deux comptes : le gagnant débloque « Premier courtisan » et « Duel à la cour »', async () => {
    const [ua, ub] = [await account(), await account()];
    const [a, b] = [await client(), await client()];
    const cr = await emit(a, 'table:create', { name: ua.username, auth: ua.token, target: 2000 });
    a.id = cr.playerId;
    const jr = await emit(b, 'table:join', { code: cr.code, name: ub.username, auth: ub.token });
    b.id = jr.playerId;
    await emit(b, 'table:ready', { ready: true });
    expect((await emit(a, 'table:start')).ok).toBe(true);
    await until(() => !!a.state && !!b.state);
    const all = [a, b];
    const t0 = Date.now();
    while (a.state!.phase !== 'fini') {
      if (Date.now() - t0 > 30_000) throw new Error('partie trop longue');
      await until(() => a.version === b.version, 3000).catch(() => {});
      const s = a.state!;
      if (s.phase === 'fini') break;
      const me = all.find((c) => c.id === currentPlayer(s).id)!;
      const v = me.version;
      const r = await emit(me, 'game:act', { version: v, action: decide(s, 'habitue') });
      if (r.ok) await until(() => me.version > v, 3000); else await wait(10);
    }
    await until(() => a.rewards.length > 0 && b.rewards.length > 0, 3000);
    const winner = a.state!.winner === a.id ? a : b;
    const loser = winner === a ? b : a;
    const wTok = winner === a ? ua.token : ub.token;
    expect(winner.rewards[0].achievements).toEqual(expect.arrayContaining(['dm-premiere', 'dm-en-ligne']));
    expect(loser.rewards[0].achievements ?? []).not.toContain('dm-premiere');
    const prof = (await api('/me', undefined, wTok)).profile;
    expect(prof.achievements['dm-en-ligne']).toBeGreaterThan(0);
    expect(prof.dm).toMatchObject({ vWins: 1, onlineWins: 1, streak: 1 });
    expect(prof.dm.vBestTurn).toBeGreaterThan(0);
    a.s.close(); b.s.close();
  }, 60_000);
});
