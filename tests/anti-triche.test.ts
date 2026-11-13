/** Failles fermées : date du téléphone, solo déclaré, demandes d'amis, pseudos, erreurs serveur. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io } from 'socket.io-client';
import { startServer } from '../server/app';
import { today } from '../shared/progress/quests';
import { bossOfWeek } from '../shared/progress/boss';
import { adminNameList, avoidBotName, nameSkeleton, tableName, usernameProblem } from '../shared/names';
import { BOT_NAMES, COUNTER_BOTS, CF_BOT_NAMES, PERSONA_NAMES } from '../shared/bot-names';
import { PERSONAS } from '../client/src/game/personas';
import { FRIEND_REQUESTS_PER_DAY, FRIEND_RETRY_DAYS } from '../server/social';
import { bossTable, solo421 } from './rejeu-helpers';

let clock = Date.now();
let srv: Awaited<ReturnType<typeof startServer>>;
let base = '';
beforeAll(async () => {
  srv = await startServer({ port: 0, dbPath: ':memory:', accounts: { minSoloMs: 0, authAttempts: 100000, now: () => clock, adminUsers: ['Sam'] } });
  base = `http://localhost:${srv.port}`;
});
afterAll(async () => { await srv.close(); });

const call = async (path: string, body?: object, token?: string, headers: Record<string, string> = {}) => {
  const r = await fetch(`${base}/api${path}`, {
    method: body ? 'POST' : 'GET', body: body ? JSON.stringify(body) : undefined,
    headers: { 'Content-Type': 'application/json', ...headers, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  return { status: r.status, ...(await r.json()) } as any;
};
let n = 0;
const account = async (prefix = 'Tricheur') => {
  const username = `${prefix}${++n}`;
  const r = await call('/register', { username, password: 'motdepasse1' });
  expect(r.ok).toBe(true);
  return { username, token: r.token as string };
};
const addDays = (d: string, k: number) => new Date(Date.parse(`${d}T12:00:00Z`) + k * 86400_000).toISOString().slice(0, 10);

describe('jour officiel', () => {
  it('est celui de Bruxelles, quel que soit le fuseau de la machine', () => {
    expect(today(new Date('2026-11-09T22:59:00Z'))).toBe('2026-11-09');
    expect(today(new Date('2026-11-09T23:01:00Z'))).toBe('2026-11-10'); // heure d'hiver : UTC+1
    expect(today(new Date('2026-07-01T21:59:00Z'))).toBe('2026-07-01');
    expect(today(new Date('2026-07-01T22:01:00Z'))).toBe('2026-07-02'); // heure d'été : UTC+2
  });
  it('un X-Day trafiqué ne donne pas un second cadeau', async () => {
    const a = await account();
    const d = today();
    expect((await call('/daily/claim', {}, a.token, { 'X-Day': addDays(d, -1) })).ok).toBe(true);
    for (const forged of [d, addDays(d, 1), addDays(d, -1)]) {
      expect((await call('/daily/claim', {}, a.token, { 'X-Day': forged })).status).toBe(400);
    }
  });
  it('un X-Day trafiqué ne donne pas un second défi', async () => {
    const a = await account();
    const d = today();
    const none = Array.from({ length: 5 }, () => []);
    expect((await call('/challenge/submit', { decisions: none }, a.token, { 'X-Day': addDays(d, 1) })).ok).toBe(true);
    for (const forged of [d, addDays(d, 1), addDays(d, -1)]) {
      expect((await call('/challenge/submit', { decisions: none }, a.token, { 'X-Day': forged })).status).toBe(409);
    }
  });
});

describe('solo déclaré', () => {
  const end = async (token: string, body: object, boss?: string) => {
    const s = await call('/solo/start', boss ? { boss } : {}, token);
    return call('/solo/end', { gameToken: s.gameToken, ...body }, token);
  };
  it('plafonne les combinaisons inventées, les succès qui en dépendent', async () => {
    const a = await account();
    const r = await end(a.token, { won: true, rounds: 10, opponents: 1, count421: 60, combos: { '421': 60, '111': 60, brelan: 60, autre: 60 }, gestureThrows: 300, roundsLost: 200, maxTokens: 21 });
    expect(r.ok).toBe(true);
    const st = r.applied.profile.stats;
    // Durée quasi nulle : 5 lancers au plus, dont 4-2-1 d'abord (plafond 3 + 5 manches / 5 = 4).
    expect(st.c421 ?? 0).toBeLessThanOrEqual(5);
    expect(st.triAces).toBeLessThanOrEqual(5);
    expect(st.brelans).toBeLessThanOrEqual(5);
    expect(st.gestures).toBeLessThanOrEqual(5);
  });
  it('combinaisons annoncées ignorées ; celles d’une vraie partie (rejouée) comptent', async () => {
    const a = await account();
    const r = await end(a.token, { won: true, rounds: 6, opponents: 1, count421: 1, combos: { '421': 1, brelan: 2 }, roundsLost: 2 });
    expect(r.verified).toBe(false);
    expect(r.applied.profile.stats.brelans).toBe(0);
    const v = await solo421(call as any, a.token, { extra: { combos: { brelan: 40 } } });
    expect(v.end.verified).toBe(true);
    expect(v.end.applied.profile.stats.brelans).toBe(v.facts.combos.brelan ?? 0);
  });
  it('le `boss` envoyé à la fin est ignoré ; seul celui noté au début (semaine en cours), vraiment battu, compte', async () => {
    const a = await account();
    const wk = bossOfWeek(today());
    expect((await end(a.token, { won: true, rounds: 5, opponents: 1, boss: wk.id })).applied.profile.stats.bossWins).toBe(0);
    expect((await end(a.token, { won: true, rounds: 5, opponents: 1 }, 'pas-le-patron')).applied.profile.stats.bossWins).toBe(0);
    // Ancien téléphone : victoire annoncée contre le patron → rien.
    expect((await end(a.token, { won: true, rounds: 5, opponents: 1 }, wk.id)).applied.profile.stats.bossWins).toBe(0);
    const lost = await solo421(call as any, a.token, { boss: wk.id, setup: bossTable(wk), want: 'lose', extra: { won: true } });
    expect(lost.end.applied.profile.stats.bossWins).toBe(0);
    const won = await solo421(call as any, a.token, { boss: wk.id, setup: bossTable(wk), want: 'win', tries: 400 });
    expect(won.end.applied.profile.stats.bossWins).toBe(1);
  });
  it('rien de public dans le fil d’actualité', async () => {
    const a = await account('Fil');
    const wk = bossOfWeek(today()).id;
    await end(a.token, { won: true, rounds: 5, opponents: 1, count421: 3, combos: { '421': 3 } }, wk);
    const feed = await call('/feed');
    expect(feed.feed.filter((x: { text: string }) => x.text.includes(a.username))).toEqual([]);
  });
  it('Courtisan : place et meilleur tour bornés', async () => {
    const a = await account();
    const s = await call('/dixmille/start', {}, a.token);
    const r = await call('/dixmille/end', { gameToken: s.gameToken, won: false, place: -50, opponents: 1, level: 'habitue', bestTurn: 999999 }, a.token);
    expect(r.ok).toBe(true);
    expect(r.verified).toBe(false);
    expect(r.applied.profile.dm?.bestTurn ?? 0).toBe(0); // partie non rejouée : statistiques du mode intactes
    expect(r.reward.won).toBe(false);
  });
});

describe('demandes d’amis', () => {
  it('après un refus, pas de nouvelle demande avant le délai', async () => {
    const a = await account('Ami'), b = await account('Ami');
    expect((await call('/friends', { username: b.username }, a.token)).result).toBe('sent');
    await call('/friends/decline', { username: a.username }, b.token);
    expect((await call('/friends', { username: b.username }, a.token)).status).toBe(429);
    clock += FRIEND_RETRY_DAYS * 86400_000 + 1000;
    expect((await call('/friends', { username: b.username }, a.token)).result).toBe('sent');
  });
  it('plafond par expéditeur et par 24 h', async () => {
    const a = await account('Spam');
    const targets = [];
    for (let i = 0; i <= FRIEND_REQUESTS_PER_DAY; i++) targets.push(await account('Cible'));
    for (const t of targets.slice(0, FRIEND_REQUESTS_PER_DAY)) expect((await call('/friends', { username: t.username }, a.token)).result).toBe('sent');
    expect((await call('/friends', { username: targets[FRIEND_REQUESTS_PER_DAY].username }, a.token)).status).toBe(429);
    clock += 86400_000 + 1000;
    expect((await call('/friends', { username: targets[FRIEND_REQUESTS_PER_DAY].username }, a.token)).result).toBe('sent');
  });
  it('demande annulée puis renvoyée : une seule notification', async () => {
    const a = await account('Boucle'), b = await account('Boucle');
    await call('/friends', { username: b.username }, a.token);
    await fetch(`${base}/api/friends/${b.username}`, { method: 'DELETE', headers: { Authorization: `Bearer ${a.token}` } });
    await call('/friends', { username: b.username }, a.token);
    await fetch(`${base}/api/friends/${b.username}`, { method: 'DELETE', headers: { Authorization: `Bearer ${a.token}` } });
    expect((await call('/friends', { username: b.username }, a.token)).result).toBe('sent');
    const incoming = await call('/friends/requests', undefined, b.token);
    expect(incoming.incoming.map((x: any) => x.username)).toContain(a.username);
  });
});

describe('pseudos', () => {
  it('liste des personnages à jour', () => {
    expect(PERSONAS.map((p) => p.name).sort()).toEqual([...PERSONA_NAMES].sort());
    for (const nm of [...COUNTER_BOTS.map((b) => b.name), ...CF_BOT_NAMES]) expect(BOT_NAMES).toContain(nm);
  });
  it('alphabet latin seulement, accents acceptés', () => {
    expect(usernameProblem('Élodie_33', [])).toBeNull();
    expect(usernameProblem('François-X', [])).toBeNull();
    expect(usernameProblem('Sαm', [])).toBeTruthy(); // grec
    expect(usernameProblem('Sаm', [])).toBeTruthy(); // cyrillique
    expect(usernameProblem('Sam​', [])).toBeTruthy(); // invisible
    expect(usernameProblem('Sıa', [])).toBeTruthy(); // i sans point
  });
  it('noms des ordinateurs et sosies réservés, administrateurs compris', () => {
    for (const nm of ['Marcel', 'MARCEL', 'Mârcel', 'LeBaron', 'Le.Baron', 'Gege']) expect(usernameProblem(nm, []), nm).toBeTruthy();
    for (const nm of ['Sam', 'SAM', 'sàm', 'S.a.m', 'S4m']) expect(usernameProblem(nm, ['Sam']), nm).toBeTruthy();
    expect(usernameProblem('Samuel', ['Sam'])).toBeNull();
    expect(nameSkeleton('Le Baron')).toBe(nameSkeleton('leb4ron'));
  });
  it('l’inscription refuse ; pas d’admin par une autre casse', async () => {
    expect((await call('/register', { username: 'sAm', password: 'motdepasse1' })).status).toBe(400);
    expect((await call('/register', { username: 'Marcel', password: 'motdepasse1' })).status).toBe(400);
    expect((await call('/register', { username: 'Sαmuel', password: 'motdepasse1' })).status).toBe(400);
  });
  it('nom à table', () => {
    expect(tableName({ username: 'Vrai' }, 'Faux', [])).toEqual({ name: 'Vrai' });
    expect(tableName(undefined, 'S.a.m', ['Sam'])).toHaveProperty('error');
    expect(tableName(undefined, 'Bob', ['Sam'])).toEqual({ name: 'Bob' });
    expect(avoidBotName('Marcel', ['Marcel'])).toBe('Marcel (invité)');
    expect(avoidBotName('Bob', ['Marcel'])).toBe('Bob');
    expect(adminNameList(['Sam ', ''])).toEqual(['Sam']);
  });
  it('à table : un compte garde son pseudo, un invité ne prend pas celui d’un admin', async () => {
    const a = await account('Joueur');
    const s = io(base, { transports: ['websocket'] });
    await new Promise<void>((ok) => s.on('connect', () => ok()));
    const create = (p: object) => new Promise<any>((ok) => s.emit('room:create', { avatar: '', config: {}, table: {}, ...p }, ok));
    const guest = await create({ name: 'SAM' });
    expect(guest.ok).toBe(false);
    const r = await create({ name: 'Sam', auth: a.token });
    expect(r.ok).toBe(true);
    const lobbies = await call('/lobbies');
    expect(JSON.stringify(lobbies)).not.toContain('Table de Sam');
    s.close();
  });
});

describe('erreurs serveur', () => {
  it('JSON invalide : message générique, aucun chemin de fichier', async () => {
    const r = await fetch(`${base}/api/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{pas du json' });
    expect(r.status).toBe(400);
    const t = await r.text();
    expect(t).toContain('Requête invalide');
    expect(t).not.toMatch(/node_modules|\.ts|\.js|SyntaxError|at /);
  });
  it('requête trop grosse : 413 générique', async () => {
    const r = await fetch(`${base}/api/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ x: 'y'.repeat(50_000) }) });
    expect(r.status).toBe(413);
    expect(await r.text()).toContain('trop volumineuse');
  });
});
