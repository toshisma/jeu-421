/**
 * Le Courtisan en ligne : vrai serveur Socket.IO (espace « /dixmille ») et plusieurs vrais clients.
 * Parties complètes à 2 et à 6, actions refusées, reprise, quitter puis revenir, temps écoulé,
 * invités, et les Groschen (cadeau du jour, mises, pot, remboursements, abandon).
 */
import { WELCOME_BAGS } from '../shared/progress/profile';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import { startServer } from '../server/app';
import { currentPlayer, type DmState } from '../shared/dixmille/engine';
import { decide } from '../shared/dixmille/ai';
import type { DmPublicTable, DmUpdate } from '../shared/dixmille/protocol';

let clock = Date.parse('2026-11-07T10:00:00Z');
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

interface C { s: Socket; table: DmPublicTable | null; state: DmState | null; version: number; id: string; token: string; notices: string[]; updates: DmUpdate[]; balance: number | null }
function client(): Promise<C> {
  return new Promise((resolve) => {
    const c: C = { s: connect(`${url}/dixmille`, { transports: ['websocket'], forceNew: true }), table: null, state: null, version: 0, id: '', token: '', notices: [], updates: [], balance: null };
    c.s.on('table:state', (t: DmPublicTable) => (c.table = t));
    c.s.on('game:state', (m: { version: number; state: DmState } | null) => { c.state = m?.state ?? null; c.version = m?.version ?? 0; });
    c.s.on('game:update', (u: DmUpdate) => { c.state = u.state; c.version = u.version; c.updates.push(u); });
    c.s.on('table:notice', (n: { text: string }) => c.notices.push(n.text));
    c.s.on('groschen:balance', (b: { balance: number }) => (c.balance = b.balance));
    c.s.on('connect', () => resolve(c));
  });
}
const emit = (c: C, ev: string, p: object = {}) => new Promise<any>((res) => c.s.emit(ev, p, res));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(fn: () => boolean, ms = 5000) {
  const t = Date.now();
  while (!fn()) { if (Date.now() - t > ms) throw new Error('délai dépassé'); await wait(5); }
}
async function api(path: string, body?: object, token?: string) {
  const r = await fetch(`${url}/api${path}`, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, ...(await r.json()) };
}
let nameSeq = 0;
async function account() {
  const username = `Court${++nameSeq}${Math.floor(Math.random() * 1000)}`;
  const r = await api('/register', { username, password: 'motdepasse1' });
  return { username, token: r.token as string };
}

/** Joue la partie jusqu'au bout : chaque client joue son tour (décision d'un Habitué). */
async function playOut(all: C[], ms = 20_000) {
  const t0 = Date.now();
  while (true) {
    const ref = all.find((c) => c.state)!;
    await until(() => all.every((c) => c.version === ref.version), 3000).catch(() => {});
    const s = ref.state!;
    if (s.phase === 'fini') return s;
    if (Date.now() - t0 > ms) throw new Error('partie trop longue');
    const me = all.find((c) => c.id === currentPlayer(s).id);
    if (!me) { await wait(10); continue; } // ordinateur ou joueur parti : le serveur joue
    const v = me.version;
    const r = await emit(me, 'game:act', { version: v, action: decide(s, 'habitue') });
    if (!r.ok) await wait(10);
    else await until(() => me.version > v, 3000);
  }
}

describe('Le Courtisan en ligne', () => {
  it('partie complète à 2 invités, actions hors tour et trafiquées refusées', async () => {
    const a = await client(), b = await client();
    const cr = await emit(a, 'table:create', { name: 'Alice', avatar: '🦊', target: 2000 });
    expect(cr.ok).toBe(true);
    a.id = cr.playerId;
    const jr = await emit(b, 'table:join', { code: cr.code.toLowerCase(), name: 'Bob' });
    expect(jr.ok).toBe(true);
    b.id = jr.playerId;
    expect((await emit(b, 'table:start')).ok).toBe(false); // pas l'hôte
    expect((await emit(a, 'table:start')).error).toMatch(/prêts/);
    expect((await emit(b, 'table:ready', { ready: true })).ok).toBe(true);
    expect((await emit(b, 'table:config', { target: 10000 })).ok).toBe(false);
    expect((await emit(a, 'table:start')).ok).toBe(true);
    await until(() => !!a.state && !!b.state);
    expect(a.state!.target).toBe(2000);
    expect(a.state!.seed).toBe(0); // la graine du hasard n'est jamais envoyée
    const s = a.state!;
    const cur = [a, b].find((c) => c.id === currentPlayer(s).id)!;
    const other = cur === a ? b : a;
    expect((await emit(other, 'game:act', { version: cur.version, action: { type: 'lancer' } })).error).toMatch(/tour/);
    expect((await emit(cur, 'game:act', { version: cur.version + 5, action: { type: 'lancer' } })).ok).toBe(false);
    expect((await emit(cur, 'game:act', { version: cur.version, action: { type: 'tricher' } })).ok).toBe(false);
    const v = cur.version;
    expect((await emit(cur, 'game:act', { version: v, action: { type: 'lancer' } })).ok).toBe(true);
    // Double clic : la même version est refusée.
    expect((await emit(cur, 'game:act', { version: v, action: { type: 'lancer' } })).ok).toBe(false);
    await until(() => a.version === b.version && a.version > v);
    expect(a.updates.at(-1)!.animSeed).toBe(b.updates.at(-1)!.animSeed); // même lancer 3D pour tous
    if (a.state!.phase === 'choisir') {
      // Dés qui ne rapportent pas / déjà de côté / hors bornes : refusés.
      const st = a.state!;
      const bad = st.dice.findIndex((d, i) => st.rolled[i] && d !== 1 && d !== 5);
      if (bad >= 0 && st.dice.filter((d) => d === st.dice[bad]).length < 3) expect((await emit(cur, 'game:act', { version: cur.version, action: { type: 'encaisser', pick: [bad] } })).ok).toBe(false);
      expect((await emit(cur, 'game:act', { version: cur.version, action: { type: 'encaisser', pick: [9] } })).ok).toBe(false);
    }
    const end = await playOut([a, b]);
    expect(end.phase).toBe('fini');
    expect(end.players.find((p) => p.id === end.winner)!.score).toBeGreaterThanOrEqual(2000);
    // Revanche : retour au salon.
    expect((await emit(a, 'table:rematch')).ok).toBe(true);
    await until(() => a.table?.status === 'lobby');
    a.s.close(); b.s.close();
  });

  it('table à 6 : 4 vrais joueurs et 2 ordinateurs, jusqu’à la fin ; 7e refusé', async () => {
    const cs = await Promise.all([client(), client(), client(), client()]);
    const cr = await emit(cs[0], 'table:create', { name: 'Hôte', target: 2000, visibility: 'public' });
    cs[0].id = cr.playerId;
    for (const [i, c] of cs.slice(1).entries()) { const r = await emit(c, 'table:join', { code: cr.code, name: `J${i}` }); c.id = r.playerId; await emit(c, 'table:ready', { ready: true }); }
    expect((await emit(cs[0], 'table:addBot', { level: 'fouine' })).ok).toBe(true);
    expect((await emit(cs[0], 'table:addBot', { level: 'debutant' })).ok).toBe(true);
    expect((await emit(cs[0], 'table:addBot', {})).error).toMatch(/complète/);
    const extra = await client();
    expect((await emit(extra, 'table:join', { code: cr.code, name: 'Septième' })).error).toMatch(/complète/);
    // L'hôte retire un joueur, qui ne peut plus revenir avec un compte… ici invité : il est juste retiré.
    expect((await emit(cs[0], 'table:start')).ok).toBe(true);
    await until(() => cs.every((c) => !!c.state));
    expect(cs[0].state!.players.length).toBe(6);
    const end = await playOut(cs, 40_000);
    expect(end.phase).toBe('fini');
    for (const c of [...cs, extra]) c.s.close();
  }, 60_000);

  it('déconnexion puis reprise (jeton), quitter puis revenir, serveur qui joue pour l’absent', async () => {
    const a = await client(), b = await client();
    const cr = await emit(a, 'table:create', { name: 'A', target: 10000 });
    a.id = cr.playerId;
    const jr = await emit(b, 'table:join', { code: cr.code, name: 'B' });
    b.id = jr.playerId; b.token = jr.token;
    await emit(b, 'table:ready', { ready: true });
    await emit(a, 'table:start');
    await until(() => !!b.state);
    // B se déconnecte : le serveur finit par jouer pour lui.
    b.s.close();
    await until(() => a.notices.some((n) => /déconnecté/.test(n)));
    const start = a.version;
    // A joue ses tours ; ceux de B sont joués par le serveur.
    for (let i = 0; i < 40 && !a.notices.some((n) => /ne répond pas/.test(n)); i++) {
      const s = a.state!;
      if (currentPlayer(s).id === a.id) await emit(a, 'game:act', { version: a.version, action: decide(s, 'habitue') });
      await wait(30);
    }
    expect(a.notices.some((n) => /ne répond pas/.test(n))).toBe(true);
    expect(a.version).toBeGreaterThan(start);
    // Reprise avec le jeton : l'état revient.
    const b2 = await client();
    const back = await emit(b2, 'table:join', { code: cr.code, token: jr.token });
    expect(back.ok).toBe(true);
    expect(back.playerId).toBe(b.id);
    b2.id = b.id;
    await until(() => !!b2.state);
    // Quitter : le serveur joue à sa place, il peut revenir tant que la partie n'est pas finie.
    await emit(b2, 'table:leave');
    await until(() => a.table!.members.find((m) => m.id === b.id)!.left);
    const b3 = await client();
    const again = await emit(b3, 'table:join', { code: cr.code, token: jr.token });
    expect(again.ok).toBe(true);
    await until(() => !a.table!.members.find((m) => m.id === b.id)!.left);
    a.s.close(); b2.s.close(); b3.s.close();
  });

  it('temps écoulé : le serveur joue un coup raisonnable', async () => {
    const quick = await startServer({ port: 0, dbPath: ':memory:', dm: { decisionMs: 120, autoplayMs: 5, animMs: 0, disconnectMs: 100 } });
    const prev = url;
    url = `http://localhost:${quick.port}`;
    try {
      const a = await client(), b = await client();
      const cr = await emit(a, 'table:create', { name: 'Lent', target: 2000 });
      const jr = await emit(b, 'table:join', { code: cr.code, name: 'Lente' });
      await emit(b, 'table:ready', { ready: true });
      await emit(a, 'table:start');
      await until(() => a.notices.some((n) => /Temps écoulé/.test(n)), 3000);
      await until(() => a.version > 1);
      expect(a.updates.some((u) => u.auto === 'temps')).toBe(true);
      expect([cr.playerId, jr.playerId]).toContain(a.updates[0].by);
      a.s.close(); b.s.close();
    } finally { url = prev; await quick.close(); }
  });

  it('spectateur : table publique ouverte à tous, table privée réservée aux amis, aucune action', async () => {
    const a = await client(), b = await client(), w = await client();
    const pub = await emit(a, 'table:create', { name: 'Pub', target: 10000, visibility: 'public' });
    a.id = pub.playerId;
    expect((await emit(w, 'spectate:join', { code: pub.code })).error).toMatch(/Aucune partie/);
    await emit(a, 'table:addBot', { level: 'habitue' });
    await emit(a, 'table:start');
    await until(() => !!a.state);
    const sj = await emit(w, 'spectate:join', { code: pub.code, name: 'Curieux' });
    expect(sj.ok).toBe(true);
    await until(() => !!w.state);
    expect((await emit(w, 'game:act', { version: w.version, action: { type: 'lancer' } })).ok).toBe(false);
    expect((await emit(w, 'table:chat', { text: 'Bonjour' })).ok).toBe(true);
    const priv = await emit(b, 'table:create', { name: 'Priv', target: 10000 });
    await emit(b, 'table:addBot', {});
    await emit(b, 'table:start');
    const w2 = await client();
    expect((await emit(w2, 'spectate:join', { code: priv.code })).error).toMatch(/privée/);
    for (const c of [a, b, w, w2]) c.s.close();
  });

  it('partie rapide : rejoint une table publique gratuite, sinon en crée une', async () => {
    const a = await client(), b = await client();
    const r1 = await emit(a, 'table:quick', { name: 'Rapide' });
    expect(r1.ok).toBe(true);
    expect(r1.created).toBe(true);
    const r2 = await emit(b, 'table:quick', { name: 'Rapide' });
    expect(r2.code).toBe(r1.code);
    await until(() => b.table?.members.length === 2);
    expect(b.table!.members.map((m) => m.name)).toEqual(['Rapide', 'Rapide 2']);
    a.s.close(); b.s.close();
  });
});

describe('Le Courtisan : les Groschen', () => {
  it('cadeau de connexion : une fois par jour (horloge du serveur)', async () => {
    const { token } = await account();
    const w1 = await api('/dixmille/wallet', undefined, token);
    expect(w1).toMatchObject({ ok: true, gift: 20, balance: 20 });
    const w2 = await api('/dixmille/wallet', undefined, token);
    expect(w2).toMatchObject({ gift: 0, balance: 20 });
    // Un en-tête de date envoyé par le téléphone n'y change rien.
    const r = await fetch(`${url}/api/dixmille/wallet`, { headers: { Authorization: `Bearer ${token}`, 'X-Day': '2030-01-01' } });
    expect((await r.json()).gift).toBe(0);
    clock += 86400_000;
    expect(await api('/dixmille/wallet', undefined, token)).toMatchObject({ gift: 20, balance: 40 });
    expect((await api('/dixmille/wallet')).status).toBe(401);
  });

  it('mise : supérieure au solde refusée, invités refusés, solde envoyé par le client ignoré', async () => {
    const u = await account();
    await api('/dixmille/wallet', undefined, u.token);
    const a = await client();
    expect((await emit(a, 'table:create', { name: 'Riche', stake: 21, auth: u.token, balance: 9999 })).error).toMatch(/Il faut 21/);
    expect((await emit(a, 'table:create', { name: 'Invité', stake: 5 })).error).toMatch(/compte/);
    expect((await emit(a, 'table:solo', { stake: 21, auth: u.token, balance: 9999 })).error).toMatch(/Il faut/);
    const ok = await emit(a, 'table:create', { name: 'Riche', stake: 20, auth: u.token });
    expect(ok.ok).toBe(true);
    const g = await client();
    expect((await emit(g, 'table:join', { code: ok.code, name: 'Invité' })).error).toMatch(/compte/);
    a.s.close(); g.s.close();
  });

  async function stakedTable(stake: number, humans: number, bots: number) {
    const accs = await Promise.all(Array.from({ length: humans }, () => account()));
    for (const x of accs) await api('/dixmille/wallet', undefined, x.token);
    const cs = await Promise.all(accs.map(() => client()));
    const cr = await emit(cs[0], 'table:create', { name: accs[0].username, stake, auth: accs[0].token, target: 2000 });
    expect(cr.ok).toBe(true);
    cs[0].id = cr.playerId;
    cs[0].token = cr.token;
    for (let i = 1; i < humans; i++) {
      const r = await emit(cs[i], 'table:join', { code: cr.code, name: accs[i].username, auth: accs[i].token });
      expect(r.ok).toBe(true);
      cs[i].id = r.playerId;
      await emit(cs[i], 'table:ready', { ready: true, auth: accs[i].token });
    }
    for (let i = 0; i < bots; i++) await emit(cs[0], 'table:addBot', { level: 'habitue' });
    return { accs, cs, code: cr.code as string };
  }
  const bal = async (token: string) => (await api('/dixmille/wallet', undefined, token)).balance as number;

  for (const [humans, bots] of [[2, 0], [2, 4]] as const) {
    it(`pot correct à ${humans + bots} joueurs (${bots} ordinateurs) : le gagnant emporte tout`, async () => {
      const { accs, cs } = await stakedTable(5, humans, bots);
      expect((await emit(cs[0], 'table:start')).ok).toBe(true);
      await until(() => cs.every((c) => !!c.state));
      expect(cs[0].table!.pot).toBe(5 * (humans + bots));
      for (const x of accs) expect(await bal(x.token)).toBe(15); // mise prélevée au lancement
      const end = await playOut(cs, 40_000);
      await wait(50);
      const winner = cs.findIndex((c) => c.id === end.winner);
      for (const [i, x] of accs.entries()) expect(await bal(x.token)).toBe(i === winner ? 15 + 5 * (humans + bots) : 15);
      for (const c of cs) c.s.close();
    }, 60_000);
  }

  it('tout le monde quitte : les partants perdent leur mise ; table rangée : les absents sont remboursés', async () => {
    const { accs, cs, code } = await stakedTable(7, 2, 0);
    await emit(cs[0], 'table:start');
    await until(() => cs.every((c) => !!c.state));
    // Le joueur 0 quitte (abandon), le joueur 1 se déconnecte seulement.
    await emit(cs[0], 'table:leave');
    cs[1].s.close();
    await wait(50);
    // La table est rangée (ménage) avant la fin de la partie.
    srv.closeDmTable(code);
    expect(await bal(accs[0].token)).toBe(13); // abandon : mise perdue
    expect(await bal(accs[1].token)).toBe(20); // remboursé
    cs[0].s.close();
  });

  it('abandon : la mise est perdue et le partant ne touche rien même si le serveur gagne pour lui', async () => {
    const { accs, cs } = await stakedTable(4, 2, 0);
    await emit(cs[0], 'table:start');
    await until(() => cs.every((c) => !!c.state));
    await emit(cs[0], 'table:leave');
    // Il revient : il retrouve sa place, mais la partie reste un abandon (ni pot ni récompense).
    const back = await client();
    expect((await emit(back, 'table:join', { code: (cs[1].table as DmPublicTable).code, token: cs[0].token, auth: accs[0].token })).ok).toBe(true);
    back.id = cs[0].id;
    await until(() => !!back.state);
    const end = await playOut([back, cs[1]], 40_000);
    await wait(50);
    expect(await bal(accs[0].token)).toBe(16);
    expect(await bal(accs[1].token)).toBe(end.winner === cs[1].id ? 16 + 8 : 20);
    for (const c of [...cs, back]) c.s.close();
  }, 60_000);

  it('contre l’ordinateur avec mise : partie jouée par le serveur, pot au gagnant', async () => {
    const u = await account();
    await api('/dixmille/wallet', undefined, u.token);
    const a = await client();
    const r = await emit(a, 'table:solo', { stake: 10, opponents: 2, level: 'debutant', target: 2000, auth: u.token, name: 'Moi' });
    expect(r.ok).toBe(true);
    a.id = r.playerId;
    await until(() => !!a.state);
    expect(a.state!.players.length).toBe(3);
    expect(await bal(u.token)).toBe(10);
    // Personne d'autre ne peut s'asseoir à cette table.
    const g = await client();
    expect((await emit(g, 'table:join', { code: r.code, name: 'Intrus' })).ok).toBe(false);
    const end = await playOut([a], 40_000);
    await wait(50);
    expect(await bal(u.token)).toBe(end.winner === a.id ? 10 + 30 : 10);
    a.s.close(); g.s.close();
  }, 60_000);
});

describe('Le Courtisan en ligne : sacs de dés (tirés par le serveur)', () => {
  /** Compte prêt pour un sac garanti (9 parties sans sac : la 10e en donne un). */
  async function nearPity() {
    const username = `Sac${++nameSeq}${Math.floor(Math.random() * 1000)}`;
    const r = await api('/register', { username, password: 'motdepasse1', guestProfile: { pity: 9 } });
    return { username, token: r.token as string };
  }
  const prof = async (token: string) => (await api('/me', undefined, token)).profile;
  async function table(accs: { username: string; token: string }[]) {
    const cs = await Promise.all(accs.map(() => client()));
    const rewards: Record<number, { bags?: number }[]> = {};
    cs.forEach((c, i) => { rewards[i] = []; c.s.on('profile:reward', (m: { bags?: number }) => rewards[i].push(m)); });
    const cr = await emit(cs[0], 'table:create', { name: accs[0].username, auth: accs[0].token, target: 2000 });
    cs[0].id = cr.playerId;
    for (let i = 1; i < accs.length; i++) {
      const r = await emit(cs[i], 'table:join', { code: cr.code, name: accs[i].username, auth: accs[i].token });
      cs[i].id = r.playerId;
      await emit(cs[i], 'table:ready', { ready: true, auth: accs[i].token });
    }
    return { cs, rewards };
  }

  it('partie assez longue : sac au joueur resté, rien pour celui qui a quitté', async () => {
    const accs = [await nearPity(), await nearPity()];
    const { cs, rewards } = await table(accs);
    expect((await emit(cs[0], 'table:start')).ok).toBe(true);
    await until(() => cs.every((c) => !!c.state));
    clock += 3 * 60_000; // 3 minutes de jeu (horloge du serveur)
    await emit(cs[1], 'table:leave'); // abandon : le serveur joue pour lui
    await playOut([cs[0]], 40_000);
    await until(() => rewards[0].length > 0, 3000);
    expect(rewards[0][0].bags).toBe(1);
    expect(rewards[1]).toEqual([]);
    const [p0, p1] = [await prof(accs[0].token), await prof(accs[1].token)];
    expect(p0.bags).toBe(1 + WELCOME_BAGS);
    expect(p0.pity ?? 0).toBe(0);
    expect(p0.dm.games).toBe(1);
    expect(p1.bags ?? 0).toBe(WELCOME_BAGS);
    expect(p1.pity).toBe(9);
    expect(p1.dm).toBeUndefined();
    for (const c of cs) c.s.close();
  }, 60_000);

  it('partie trop courte (moins de 1 min 30) : jamais de sac, même au bout du compteur', async () => {
    const accs = [await nearPity(), await nearPity()];
    const { cs, rewards } = await table(accs);
    await emit(cs[0], 'table:start');
    await until(() => cs.every((c) => !!c.state));
    clock += 60_000;
    await playOut(cs, 40_000);
    await until(() => rewards[0].length > 0 && rewards[1].length > 0, 3000);
    for (const i of [0, 1]) {
      expect(rewards[i][0].bags).toBe(0);
      const p = await prof(accs[i].token);
      expect(p.bags ?? 0).toBe(WELCOME_BAGS);
      expect(p.pity).toBe(9); // la partie ne compte pas pour le sac garanti
      expect(p.dm.games).toBe(1);
    }
    for (const c of cs) c.s.close();
  }, 60_000);
});
