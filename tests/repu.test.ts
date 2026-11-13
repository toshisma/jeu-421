/**
 * Réputation de la Tournée des comptoirs à table en ligne : calcul (paliers, lecture prudente), textes
 * en/de/nl complets, et envoi par le SERVEUR dans les 4 jeux en ligne (421, Courtisan, Poker menteur,
 * Coups Fourrés) : présente pour un compte qui a des étoiles, absente pour un invité ou un compte sans
 * étoile, jamais imposable par le client.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import { startServer } from '../server/app';
import { DICTS } from '../shared/i18n';
import { repuFr } from '../shared/i18n/zones/repu.fr';
import { bestRep, readRep, repOf, repTier, REP_TIERS } from '../shared/progress/repu';
import { TDC_BISTROS, TDC_MAX_STARS } from '../shared/progress/comptoirs';

describe('réputation : calcul', () => {
  it('somme des étoiles, quartiers terminés, paliers', () => {
    expect(repOf(undefined)).toBeUndefined();
    expect(repOf({})).toBeUndefined();
    // Place du Marché terminée (3 bistrots gagnés, 7 étoiles) + 1 bistrot du Port.
    const tdc = { 'petit-zinc': 7, 'cafe-sports': 3, 'chope-or': 1, phare: 1 };
    expect(repOf(tdc)).toEqual({ s: 3 + 2 + 1 + 1, q: 1 });
    // Données sales : bistrot inconnu, masque hors bornes, étoile 2 sans victoire.
    expect(repOf({ inconnu: 7, 'petit-zinc': 99, 'cafe-sports': 6 })).toBeUndefined();
    const all = Object.fromEntries(TDC_BISTROS.map((b) => [b.id, 7]));
    expect(repOf(all)).toEqual({ s: TDC_MAX_STARS, q: 4 });
    expect([0, 1, 7, 8, 17, 18, 29, 30, 36].map(repTier)).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4]);
    expect(REP_TIERS.length).toBe(4);
    expect(bestRep([undefined, { s: 5, q: 1 }, { s: 17, q: 2 }])).toEqual({ s: 17, q: 2 });
  });
  it('lecture côté client : valeurs bornées, sinon rien', () => {
    expect(readRep({ s: 12, q: 2 })).toEqual({ s: 12, q: 2 });
    expect(readRep({ s: 999, q: 1 })).toBeUndefined();
    expect(readRep({ s: 0, q: 0 })).toBeUndefined();
    expect(readRep({ s: '12' })).toBeUndefined();
    expect(readRep({ s: 3.5 })).toBeUndefined();
    expect(readRep({ s: 4, q: 50 })).toEqual({ s: 4, q: 4 });
    expect(readRep(null)).toBeUndefined();
  });
});

describe('zone repu (textes)', () => {
  const holes = (s: string) => [...new Set([...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].filter((h) => h !== 's').sort();
  it('chaque clé existe en en/de/nl, avec les mêmes trous, traduite', () => {
    for (const l of ['en', 'de', 'nl'] as const) for (const k of Object.keys(repuFr) as (keyof typeof repuFr)[]) {
      const t = DICTS[l][k];
      expect(t, `${l}:${k}`).toBeTruthy();
      expect(holes(t!), `${l}:${k}`).toEqual(holes(repuFr[k]));
      expect(t, `${l}:${k}`).not.toBe(repuFr[k]);
    }
  });
});

describe('réputation envoyée par le serveur dans les 4 jeux en ligne', () => {
  let srv: Awaited<ReturnType<typeof startServer>>;
  let url = '';
  const socks: Socket[] = [];
  beforeAll(async () => {
    srv = await startServer({ port: 0, dbPath: ':memory:', turnTimeoutMs: 60_000, accounts: { authAttempts: 1000 } });
    url = `http://localhost:${srv.port}`;
  });
  afterAll(async () => { for (const s of socks) s.disconnect(); await srv.close(); });

  async function api(path: string, body?: object, token?: string) {
    const r = await fetch(`${url}/api${path}`, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, ...(await r.json()) };
  }
  let seq = 0;
  async function account(stars?: Record<string, number>) {
    const username = `Repu${++seq}${Math.floor(Math.random() * 10000)}`;
    const r = await api('/register', { username, password: 'motdepasse1' });
    const id = r.user.id as string;
    if (stars) srv.store.saveProfile(id, { ...srv.store.profileOf(srv.store.userById(id)!), tdc: stars });
    return { username, token: r.token as string, id };
  }
  const EXPERT = { 'petit-zinc': 7, 'cafe-sports': 7, 'chope-or': 7, phare: 7, ancre: 7, mimile: 3 }; // 17 étoiles, 2 quartiers
  const FORGED = { rep: { s: 36, q: 4 } };
  function sock(path: string, auth?: object): Promise<Socket> {
    return new Promise((res) => { const s = connect(`${url}${path}`, { transports: ['websocket'], forceNew: true, ...(auth ? { auth } : {}) }); socks.push(s); s.on('connect', () => res(s)); });
  }
  const emit = (s: Socket, ev: string, p: object = {}) => new Promise<any>((res) => {
    const t = setTimeout(() => res({ ok: false, error: 'sans réponse' }), 3000);
    s.emit(ev, p, (r: unknown) => { clearTimeout(t); res(r); });
  });
  const latest = <T,>(s: Socket, ev: string) => { const box: { v: T | null } = { v: null }; s.on(ev, (v: T) => (box.v = v)); return box; };
  async function until(fn: () => boolean, ms = 4000) {
    const t = Date.now();
    while (!fn()) { if (Date.now() - t > ms) throw new Error('délai dépassé'); await new Promise((r) => setTimeout(r, 10)); }
  }
  type M = { name: string; rep?: unknown };

  /** 421, Courtisan, Poker menteur : même schéma (création par un compte étoilé, arrivée d'un invité qui tente d'imposer sa réputation, d'un compte sans étoile). */
  for (const g of [
    { game: '421', path: '', create: 'room:create', join: 'room:join', state: 'room:state', extra: {} },
    { game: 'Courtisan', path: '/dixmille', create: 'table:create', join: 'table:join', state: 'table:state', extra: { target: 2000 } },
    { game: 'Poker menteur', path: '/poker', create: 'table:create', join: 'table:join', state: 'table:state', extra: {} },
  ]) {
    it(`${g.game} : compte étoilé → rep ; invité et compte sans étoile → rien ; pas imposable`, async () => {
      const pro = await account(EXPERT), plain = await account();
      const a = await sock(g.path), b = await sock(g.path), c = await sock(g.path);
      const box = latest<{ members: M[] }>(a, g.state);
      const cr = await emit(a, g.create, { name: pro.username, avatar: '🦊', auth: pro.token, ...g.extra, ...FORGED });
      expect(cr.ok, cr.error).toBe(true);
      expect((await emit(b, g.join, { code: cr.code, name: 'Invite', avatar: '🐻', ...FORGED })).ok).toBe(true);
      expect((await emit(c, g.join, { code: cr.code, name: plain.username, auth: plain.token, ...FORGED })).ok).toBe(true);
      await until(() => (box.v?.members.length ?? 0) === 3);
      const [m1, m2, m3] = box.v!.members;
      expect(m1.rep).toEqual({ s: 17, q: 2 });
      expect(m2.rep).toBeUndefined();
      expect(m3.rep).toBeUndefined();
      expect(JSON.stringify(box.v)).not.toContain('"s":36');
    });
  }

  it('Coups Fourrés : table à code et partie, réputation du profil serveur seulement', async () => {
    const pro = await account(EXPERT), plain = await account();
    for (const u of [pro, plain]) await api('/cf/discover', {}, u.token);
    const hello = (s: Socket) => new Promise<void>((res) => s.once('cf:hello', () => res()));
    const ca = connect(`${url}/cf`, { transports: ['websocket'], forceNew: true, auth: { token: pro.token } }); socks.push(ca);
    const cb = connect(`${url}/cf`, { transports: ['websocket'], forceNew: true, auth: { token: plain.token } }); socks.push(cb);
    await Promise.all([hello(ca), hello(cb)]);
    const table = latest<{ players: { account: string; rep?: unknown }[] }>(ca, 'cf:table');
    const st = latest<{ snap: { seats: { account?: string; rep?: unknown }[] } }>(ca, 'cf:state');
    const t = await emit(ca, 'cf:table:create', FORGED);
    expect(t.ok, t.error).toBe(true);
    expect((await emit(cb, 'cf:table:join', { code: t.code, ...FORGED })).ok).toBe(true);
    await until(() => table.v?.players.length === 2);
    const byName = (n: string) => table.v!.players.find((p) => p.account === n)!;
    expect(byName(pro.username).rep).toEqual({ s: 17, q: 2 });
    expect(byName(plain.username).rep).toBeUndefined();
    expect((await emit(ca, 'cf:table:start')).ok).toBe(true);
    await until(() => !!st.v);
    const seat = (n: string) => st.v!.snap.seats.find((s) => s.account === n)!;
    expect(seat(pro.username).rep).toEqual({ s: 17, q: 2 });
    expect(seat(plain.username).rep).toBeUndefined();
  });
});
