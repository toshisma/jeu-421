/**
 * Équité des parties en ligne : égalités, abandons, cagnottes conservées, reprise de place, exclusion.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import { startServer } from '../server/app';
import { MAX_ROUNDS, createGame, currentPlayerId, drawTies, rollAction, stopAction, type GameState } from '../shared/engine';
import { DEFAULT_CONFIG, sanitizeConfig, type GameConfig } from '../shared/config';
import { didWin, finalPlace } from '../shared/progress/profile';

const players = (...ids: string[]) => ids.map((id) => ({ id, name: id.toUpperCase() }));
/** Joue un tour : `dice[pid]` donne les dés (répétés), lancer unique puis validation. */
function turn(g: GameState, dice: Record<string, number[]>) {
  const pid = currentPlayerId(g)!;
  const seq = [...dice[pid]];
  rollAction(g, pid, [false, false, false], () => seq.shift()!);
  if (g.phase !== 'fini' && currentPlayerId(g) === pid) stopAction(g, pid);
}
const until421 = (g: GameState, dice: Record<string, number[]>) => { for (let i = 0; i < 500 && g.phase !== 'fini'; i++) turn(g, dice); };
const cfg = (patch: Partial<GameConfig>) => sanitizeConfig({ ...DEFAULT_CONFIG, turnSeconds: 0, ...patch });

describe('égalités aux points', () => {
  it('à égalité de points, la meilleure combinaison de la dernière manche départage', () => {
    // 4-2-1 et 1-1-1 peuvent valoir autant : on impose les valeurs égales par brelan vs suite selon le barème.
    const c = cfg({ variant: 'manches', rounds: 1, maxThrows: 1 });
    c.values = { ...c.values, v421: 7, v111: 7 };
    const g = createGame(c, players('a', 'b'));
    until421(g, { a: [1, 1, 1], b: [4, 2, 1] });
    expect(g.phase).toBe('fini');
    expect(g.players[0].score).toBe(g.players[1].score);
    expect(g.ranking).toEqual(['b', 'a']); // le 4-2-1 bat les trois as, quel que soit le siège
    expect(g.tiedWinners).toBeNull();
    expect(didWin(g, 'b')).toBe(true);
    expect(didWin(g, 'a')).toBe(false);
  });

  it('vraie égalité : ex æquo exposés, pas de vainqueur attribué au siège', () => {
    const g = createGame(cfg({ variant: 'manches', rounds: 1, maxThrows: 1 }), players('a', 'b', 'c'));
    until421(g, { a: [6, 6, 6], b: [6, 6, 6], c: [2, 3, 5] });
    expect(g.tiedWinners?.sort()).toEqual(['a', 'b']);
    expect(didWin(g, 'a')).toBe(true);
    expect(didWin(g, 'b')).toBe(true);
    expect(didWin(g, 'c')).toBe(false);
    expect(finalPlace(g, 'a')).toBe(1);
    expect(finalPlace(g, 'b')).toBe(1);
    expect(finalPlace(g, 'c')).toBe(3);
  });

  it('tirage au sort pour un tournoi : un seul devant, annoncé au journal', () => {
    const g = createGame(cfg({ variant: 'manches', rounds: 1, maxThrows: 1 }), players('a', 'b'));
    until421(g, { a: [6, 6, 6], b: [6, 6, 6] });
    const texts = drawTies(g, () => 0, () => true);
    expect(texts).toHaveLength(1);
    expect(g.tiedWinners).toBeNull();
    expect(g.tieGroups).toEqual([]);
    expect(g.log.some((l) => l.text.includes('tirage au sort'))).toBe(true);
    expect(new Set(g.ranking)).toEqual(new Set(['a', 'b']));
  });
});

describe('fin de charge : sorties simultanées', () => {
  // Pot de 5 : la 1re manche le vide d'un coup. A et B sortent ensemble.
  const charge = cfg({ variant: 'classique', totalTokens: 5, chargeThrows: 1, maxThrows: 1 });
  it('départagées par la meilleure combinaison de la manche', () => {
    const g = createGame(charge, players('a', 'b', 'c'));
    until421(g, { a: [6, 6, 6], b: [4, 2, 1], c: [2, 2, 3] });
    expect(g.phase).toBe('fini');
    expect(g.ranking).toEqual(['b', 'a', 'c']); // quel que soit le siège
    expect(g.tiedWinners).toBeNull();
  });
  it('sinon ex æquo : même place, le perdant reste connu', () => {
    const g = createGame(charge, players('a', 'b', 'c'));
    until421(g, { a: [4, 2, 1], b: [4, 2, 1], c: [2, 2, 3] });
    expect(g.phase).toBe('fini');
    expect(g.tiedWinners?.sort()).toEqual(['a', 'b']);
    expect(g.loserId).toBe('c');
    expect(finalPlace(g, 'a')).toBe(1);
    expect(finalPlace(g, 'b')).toBe(1);
  });
});

describe('limite de manches', () => {
  it(`au-delà de ${MAX_ROUNDS} manches, la partie se clôt, classée aux jetons`, () => {
    const g = createGame(cfg({ variant: 'decharge', startTokens: 30, maxThrows: 1 }), players('a', 'b', 'c'));
    g.round = MAX_ROUNDS;
    g.players[0].tokens = 5; g.players[1].tokens = 40; g.players[2].tokens = 20;
    turn(g, { a: [6, 5, 4], b: [6, 5, 4], c: [6, 5, 4] });
    for (let i = 0; i < 9 && g.phase !== 'fini'; i++) turn(g, { a: [6, 5, 4], b: [3, 2, 2], c: [6, 6, 1] });
    expect(g.phase).toBe('fini');
    expect(g.round).toBe(MAX_ROUNDS);
    expect(g.ranking[g.ranking.length - 1]).toBe(g.loserId);
    expect(g.log.some((l) => l.text.includes('Limite de'))).toBe(true);
  });
});

// --- Serveur -----------------------------------------------------------------------------------
const dieOf = new Map<string, number>();
const pots = new Map<string, number>();
const potOf = (a: { userId: string }) => pots.get(a.userId) ?? 0;
let srv: Awaited<ReturnType<typeof startServer>>;
let base = '';
beforeAll(async () => {
  srv = await startServer({
    port: 0, dbPath: ':memory:', accounts: { authAttempts: 1000, minSoloMs: 0 }, turnTimeoutMs: 60_000, disconnectGraceMs: 100,
    autoPlayDelayMs: 30, rollGraceMs: 0, stopGraceMs: 0, tournamentPauseMs: 100, tournamentFullStartMs: 50,
    testDie: (pid) => dieOf.get(pid) ?? 3,
  });
  base = `http://localhost:${srv.port}`;
  // Les gains de partie (XP, pièces) s'ajoutent au solde : on suit à part ce qui vient de la cagnotte.
  const win = srv.accounts.winPot, end = srv.accounts.tournamentEnd;
  srv.accounts.winPot = (u: string, n: number) => { pots.set(u, (pots.get(u) ?? 0) + n); return win(u, n); };
  srv.accounts.tournamentEnd = (u: string, place: number, n: number) => { pots.set(u, (pots.get(u) ?? 0) + n); return end(u, place, n); };
});
afterAll(async () => { await srv.close(); });

interface C { s: Socket; id: string; token: string; notices: string[] }
const client = () => new Promise<C>((resolve) => {
  const c: C = { s: connect(base, { transports: ['websocket'], forceNew: true }), id: '', token: '', notices: [] };
  c.s.on('room:notice', (n: { text: string }) => c.notices.push(n.text));
  c.s.on('connect', () => resolve(c));
});
const emit = (c: C, ev: string, p: object = {}) => new Promise<any>((res) => c.s.emit(ev, p, res));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(fn: () => boolean, ms = 8000) { const t = Date.now(); while (!fn()) { if (Date.now() - t > ms) throw new Error('délai dépassé'); await wait(10); } }
async function api(path: string, body?: object, token?: string) {
  const r = await fetch(`${base}/api${path}`, {
    method: body ? 'POST' : 'GET', body: body ? JSON.stringify(body) : undefined,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  return r.json();
}
let seq = 0;
async function account(prefix: string, coins = 1000) {
  const username = `${prefix}${++seq}`;
  const acc = await api('/register', { username, password: 'motdepasse1' });
  const userId = srv.store.userByName(username)!.id;
  srv.accounts.adjust(userId, coins - srv.accounts.coinsOf(userId));
  return { username, userId, token: acc.token as string };
}
const coins = (a: { userId: string }) => srv.accounts.coinsOf(a.userId);
const coinsSum = (as: { userId: string }[]) => as.reduce((n, a) => n + coins(a), 0);
const escrowFor = (code: string) => srv.store.escrowAll().filter((e) => e.context.startsWith(`R:${code}:`));

const SUDDEN = { variant: 'manches', rounds: 1, maxThrows: 1, turnSeconds: 0 };
/** Table à mise lancée : `seats` comptes déjà assis, partie en cours. */
async function stakeTable(accs: { username: string; token: string }[], stake: number, config: object = SUDDEN) {
  const cs = await Promise.all(accs.map(() => client()));
  const a = await emit(cs[0], 'room:create', { name: accs[0].username, auth: accs[0].token, config, table: { stake, maxPlayers: accs.length, visibility: 'private' } });
  cs[0].id = a.playerId; cs[0].token = a.token;
  for (let i = 1; i < accs.length; i++) {
    const j = await emit(cs[i], 'room:join', { code: a.code, name: accs[i].username, auth: accs[i].token });
    cs[i].id = j.playerId; cs[i].token = j.token;
    await emit(cs[i], 'room:ready', { ready: true });
  }
  expect((await emit(cs[0], 'room:start')).ok).toBe(true);
  return { cs, code: a.code as string };
}
/** Tous les clients encore assis jouent leur tour jusqu'à la fin ; les partis sont joués par le serveur. */
async function playOut(cs: C[], code: string) {
  await until(() => {
    const r = srv.rooms.get(code);
    if (!r?.game || r.game.phase === 'fini') return true;
    const pid = currentPlayerId(r.game)!;
    const c = cs.find((x) => x.id === pid);
    const m = r.members.find((x) => x.id === pid);
    if (c && m && !m.left && r.game.throwsUsed === 0) void emit(c, 'game:roll', { keep: [false, false, false], version: r.game.version });
    else if (c && m && !m.left) void emit(c, 'game:stop', { version: r.game.version });
    return false;
  });
  await wait(30);
}

describe('cagnottes', () => {
  it('Mort subite à égalité : cagnotte partagée, jamais au siège', async () => {
    const accs = [await account('Tie'), await account('Tie')];
    const before = coinsSum(accs);
    const { cs, code } = await stakeTable(accs, 25);
    for (const c of cs) dieOf.set(c.id, 6);
    await playOut(cs, code);
    expect(srv.rooms.get(code)!.game!.tiedWinners).toHaveLength(2);
    expect(potOf(accs[0])).toBe(25);
    expect(potOf(accs[1])).toBe(25);
    expect(coinsSum(accs)).toBeGreaterThanOrEqual(before);
    expect(escrowFor(code)).toEqual([]);
    for (const c of cs) c.s.disconnect();
  });

  it('un abandon ne touche rien, même premier ; sa mise reste dans la cagnotte', async () => {
    const accs = [await account('Ab'), await account('Ab')];
    const { cs, code } = await stakeTable(accs, 50);
    dieOf.set(cs[0].id, 1); // le joueur qui part fait le meilleur jeu
    dieOf.set(cs[1].id, 3);
    await emit(cs[0], 'room:leave');
    await playOut(cs, code);
    await until(() => srv.rooms.get(code)?.game?.phase === 'fini' && potOf(accs[1]) > 0);
    expect(srv.rooms.get(code)!.game!.ranking[0]).toBe(cs[0].id);
    expect(potOf(accs[1])).toBe(100);
    expect(potOf(accs[0])).toBe(0);
    expect(escrowFor(code)).toEqual([]);
    for (const c of cs) c.s.disconnect();
  });

  it('tout le monde quitte : table close tout de suite, mises remboursées, pas de double versement', async () => {
    const accs = [await account('All'), await account('All')];
    const { cs, code } = await stakeTable(accs, 100, { ...SUDDEN, rounds: 30 });
    expect(coins(accs[0])).toBe(900);
    await emit(cs[0], 'room:leave');
    await emit(cs[1], 'room:leave');
    await until(() => !srv.rooms.has(code));
    expect(coins(accs[0])).toBe(1000);
    expect(coins(accs[1])).toBe(1000);
    expect(escrowFor(code)).toEqual([]);
    await wait(100);
    expect(coinsSum(accs)).toBe(2000);
    for (const c of cs) c.s.disconnect();
  });

  it('déconnexion involontaire : garde ses droits, la partie va à son terme', async () => {
    const accs = [await account('Dc'), await account('Dc')];
    const { cs, code } = await stakeTable(accs, 50);
    dieOf.set(cs[0].id, 1);
    dieOf.set(cs[1].id, 3);
    cs[0].s.disconnect();
    await playOut(cs, code);
    await until(() => potOf(accs[0]) > 0, 8000);
    expect(potOf(accs[0])).toBe(100);
    expect(potOf(accs[1])).toBe(0);
    expect(escrowFor(code)).toEqual([]);
    cs[1].s.disconnect();
  });

  it('tournoi à mise : l’abandon ne touche rien, la cagnotte est intégralement versée aux autres', async () => {
    const accs = await Promise.all([1, 2, 3, 4].map(() => account('Tour')));
    const cs = await Promise.all(accs.map(() => client()));
    const settings = { maxPlayers: 4, tableSize: 4, stake: 10, payout: 'podium', visibility: 'private', config: SUDDEN };
    const a = await emit(cs[0], 'tournament:create', { name: accs[0].username, auth: accs[0].token, settings });
    cs[0].id = a.playerId;
    for (let i = 1; i < 4; i++) { const j = await emit(cs[i], 'tournament:join', { code: a.code, name: accs[i].username, auth: accs[i].token }); cs[i].id = j.playerId; }
    await until(() => srv.tournaments.get(a.code)?.status === 'en-cours');
    const t = srv.tournaments.get(a.code)!;
    const table = t.rounds[0].tables[0].code;
    expect(t.pot).toBe(40);
    [1, 6, 5, 4].forEach((d, i) => dieOf.set(cs[i].id, d));
    await emit(cs[0], 'tournament:leave');
    await playOut(cs, table);
    await until(() => t.status === 'termine');
    expect(t.standings![0]).toBe(cs[0].id);
    expect(potOf(accs[0])).toBe(0);
    expect(potOf(accs[1]) + potOf(accs[2]) + potOf(accs[3])).toBe(40);
    expect(srv.store.escrowAll().filter((e) => e.context === `T:${a.code}`)).toEqual([]);
    for (const c of cs) c.s.disconnect();
  });

  it('tournoi : égalité parfaite en finale, tirage au sort annoncé, un seul champion', async () => {
    const accs = await Promise.all([1, 2, 3, 4].map(() => account('Tir')));
    const cs = await Promise.all(accs.map(() => client()));
    const a = await emit(cs[0], 'tournament:create', { name: accs[0].username, auth: accs[0].token, settings: { maxPlayers: 4, tableSize: 4, stake: 0, visibility: 'private', config: SUDDEN } });
    cs[0].id = a.playerId;
    for (let i = 1; i < 4; i++) { const j = await emit(cs[i], 'tournament:join', { code: a.code, name: accs[i].username, auth: accs[i].token }); cs[i].id = j.playerId; }
    await until(() => srv.tournaments.get(a.code)?.status === 'en-cours');
    const t = srv.tournaments.get(a.code)!;
    const table = t.rounds[0].tables[0].code;
    for (const c of cs) dieOf.set(c.id, 6);
    await playOut(cs, table);
    await until(() => t.status === 'termine');
    const g = srv.rooms.get(table)!.game!;
    expect(g.tiedWinners).toBeNull();
    expect(g.log.some((l) => l.text.includes('tirage au sort'))).toBe(true);
    for (const c of cs) c.s.disconnect();
  });
});

describe('reprise et exclusion', () => {
  it('page rechargée : même compte sans jeton, ou invité avec son jeton, reprend sa place', async () => {
    const accs = [await account('Rel'), await account('Rel')];
    const { cs, code } = await stakeTable(accs, 0, { ...SUDDEN, rounds: 30 });
    cs[0].s.disconnect();
    const back = await client();
    const j = await emit(back, 'room:join', { code, name: accs[0].username, auth: accs[0].token });
    expect(j).toMatchObject({ ok: true, playerId: cs[0].id });
    back.s.disconnect();
    const back2 = await client();
    const j2 = await emit(back2, 'room:join', { code, name: 'x', token: cs[1].token });
    expect(j2).toMatchObject({ ok: true, playerId: cs[1].id });
    back2.s.disconnect();
    cs[1].s.disconnect();
  });

  it('invité exclu : ne revient pas sous un autre nom depuis le même appareil', async () => {
    const host = await client();
    const a = await emit(host, 'room:create', { name: 'Hote', device: 'hostdevice1' });
    const guest = await client();
    const j = await emit(guest, 'room:join', { code: a.code, name: 'Vilain', device: 'devicevilain' });
    expect(j.ok).toBe(true);
    expect((await emit(host, 'room:kick', { playerId: j.playerId })).ok).toBe(true);
    // Même connexion, même appareil sur une nouvelle connexion : refusé ; un autre appareil : accepté.
    expect((await emit(guest, 'room:join', { code: a.code, name: 'Autre', device: 'autredevice' })).ok).toBe(false);
    const again = await client();
    expect((await emit(again, 'room:join', { code: a.code, name: 'Autre', device: 'devicevilain' })).ok).toBe(false);
    const other = await client();
    expect((await emit(other, 'room:join', { code: a.code, name: 'Ami', device: 'deviceami01' })).ok).toBe(true);
    for (const c of [host, guest, again, other]) c.s.disconnect();
  });

  it('après la fin, partir n’est plus annoncé comme un abandon', async () => {
    const host = await client();
    const a = await emit(host, 'room:create', { name: 'Hote', config: SUDDEN });
    const b = await client();
    const j = await emit(b, 'room:join', { code: a.code, name: 'Bob' });
    b.id = j.playerId; host.id = a.playerId;
    await emit(b, 'room:ready', { ready: true });
    await emit(host, 'room:start');
    await playOut([host, b], a.code);
    await emit(b, 'room:leave');
    await until(() => host.notices.some((n) => n.includes('a quitté la table')));
    expect(host.notices.some((n) => n.includes('a quitté la partie'))).toBe(false);
    for (const c of [host, b]) c.s.disconnect();
  });
});
