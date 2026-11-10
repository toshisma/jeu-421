/** Bistrots entre amis : création, invitations, limites, classement (parties vérifiées), plafonds, champion du lundi, droits du patron. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer } from '../server/app';
import { CHALLENGE_TURNS } from '../shared/challenge';
import {
  BISTROT_MAX_MEMBERS, BISTROTS_PER_PLAYER, CHAMPION_COINS, PAIR_DAILY_CAP, POINTS_PLAY, POINTS_TOURNEY, POINTS_WIN, TOURNEY_DAILY_CAP, bistrotNameProblem,
} from '../shared/bistrots';

type Srv = Awaited<ReturnType<typeof startServer>>;
let srv: Srv;
let base = '';
let clock = Date.parse('2026-11-10T12:00:00Z'); // un mardi
beforeAll(async () => {
  srv = await startServer({ port: 0, dbPath: ':memory:', accounts: { authAttempts: 5000, minSoloMs: 0, now: () => clock }, stats: { adminUsers: ['Gerant'] } });
  base = `http://127.0.0.1:${srv.port}`;
});
afterAll(async () => { await srv.close(); });

const call = (b: string) => async (path: string, body?: object, token?: string) => {
  const r = await fetch(`${b}/api${path}`, { method: body ? 'POST' : 'GET', body: body ? JSON.stringify(body) : undefined,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
  return { code: r.status, ...(await r.json()) };
};
const api = (path: string, body?: object, token?: string) => call(base)(path, body, token);
const reg = async (username: string, a = api) => (await a('/register', { username, password: 'motdepasse1' })).token as string;
const idOf = (srvx: Srv, name: string) => srvx.store.userByName(name)!.id;
const befriend = async (a: string, an: string, b: string, bn: string) => { await api('/friends', { username: bn }, a); await api('/friends', { username: an }, b); };

describe('bistrots entre amis', () => {
  const t: Record<string, string> = {};
  let bid = '', code = '';

  it('nom modéré : longueur, alphabet, mots grossiers, noms réservés', () => {
    expect(bistrotNameProblem('Chez Dédé')).toBeNull();
    expect(bistrotNameProblem('Le Zinc d’Or')).toBeNull();
    expect(bistrotNameProblem('Mer de Glace')).toBeNull(); // pas de faux positif à cheval sur deux mots
    expect(bistrotNameProblem('ab')).toMatch(/caractères/);
    expect(bistrotNameProblem('x'.repeat(25))).toMatch(/caractères/);
    expect(bistrotNameProblem('Чай бар')).toMatch(/caractères/);
    expect(bistrotNameProblem('Les Connards')).toMatch(/pas accepté/);
    expect(bistrotNameProblem('Chez Merde')).toMatch(/pas accepté/);
    expect(bistrotNameProblem('F.U.C.K club')).toMatch(/pas accepté/);
    expect(bistrotNameProblem('Bar des Admins')).toMatch(/réservé/);
  });

  it('création, lien, invitation d’un ami, limites par joueur', async () => {
    for (const n of ['Alice', 'Bruno', 'Chloe', 'Denis', 'Emma']) t[n] = await reg(n);
    expect((await api('/bistrots', { name: 'Chez Alice' })).code).toBe(401); // invité : non
    expect((await api('/bistrots', { name: 'Les Connards' }, t.Alice)).code).toBe(400);
    const c = await api('/bistrots', { name: '  Chez   Alice ' }, t.Alice);
    expect(c.ok).toBe(true);
    expect(c.bistrot).toMatchObject({ name: 'Chez Alice', isOwner: true, owner: 'Alice' });
    bid = c.bistrot.id; code = c.bistrot.code;
    // Aperçu public du lien, puis entrée par le code.
    expect((await api(`/bistrots/apercu/${code}`)).bistrot).toMatchObject({ name: 'Chez Alice', owner: 'Alice', members: 1, member: false });
    const j = await api('/bistrots/rejoindre', { code: code.toLowerCase() }, t.Bruno);
    expect(j.ok).toBe(true);
    expect(j.bistrot.standings.map((r: { username: string }) => r.username).sort()).toEqual(['Alice', 'Bruno']);
    expect(j.bistrot.wall.map((w: { kind: string }) => w.kind)).toEqual(['recrue', 'ouvert']);
    expect((await api('/bistrots/rejoindre', { code: 'ZZZZZZ' }, t.Chloe)).code).toBe(404);
    // Inviter : seulement ses amis ; l'invité entre sans le code.
    expect((await api(`/bistrots/${bid}/inviter`, { username: 'Chloe' }, t.Alice)).code).toBe(403);
    expect((await api('/bistrots/rejoindre', { id: bid }, t.Chloe)).code).toBe(404); // pas d'invitation
    await befriend(t.Alice, 'Alice', t.Chloe, 'Chloe');
    expect((await api(`/bistrots/${bid}/inviter`, { username: 'Chloe' }, t.Alice)).ok).toBe(true);
    const inv = await api('/bistrots', undefined, t.Chloe);
    expect(inv.invites).toEqual([expect.objectContaining({ id: bid, name: 'Chez Alice', from: 'Alice', members: 2 })]);
    expect((await api('/bistrots/rejoindre', { id: bid }, t.Chloe)).ok).toBe(true);
    expect((await api('/bistrots', undefined, t.Chloe)).invites).toEqual([]);
    // Un non-membre ne voit pas le bistrot.
    expect((await api(`/bistrots/${bid}`, undefined, t.Denis)).code).toBe(404);
    // Limite : BISTROTS_PER_PLAYER bistrots par joueur.
    for (let i = 1; i < BISTROTS_PER_PLAYER; i++) expect((await api('/bistrots', { name: `Bar de Bruno ${i}` }, t.Bruno)).ok).toBe(true);
    expect((await api('/bistrots', { name: 'Bar de trop' }, t.Bruno)).code).toBe(400);
    const extra = await api('/bistrots', { name: 'Chez Denis' }, t.Denis);
    expect((await api('/bistrots/rejoindre', { code: extra.bistrot.code }, t.Bruno)).code).toBe(400);
    expect((await api('/bistrots', undefined, t.Bruno)).mine).toHaveLength(BISTROTS_PER_PLAYER);
  });

  it(`taille bornée : ${BISTROT_MAX_MEMBERS} membres au plus`, async () => {
    const own = await reg('Grand');
    const b = (await api('/bistrots', { name: 'Grande Salle' }, own)).bistrot;
    const tokens = await Promise.all(Array.from({ length: BISTROT_MAX_MEMBERS }, (_, i) => reg(`Client${i}`)));
    const res = [];
    for (const tk of tokens) res.push((await api('/bistrots/rejoindre', { code: b.code }, tk)).code);
    expect(res.filter((x) => x === 200)).toHaveLength(BISTROT_MAX_MEMBERS - 1);
    expect(res[res.length - 1]).toBe(400);
  });

  it('classement : parties en ligne vérifiées, victoire, abandon, ordinateur seul, solo ignoré', async () => {
    const A = idOf(srv, 'Alice'), B = idOf(srv, 'Bruno'), C = idOf(srv, 'Chloe');
    // 421 en ligne à trois : Alice gagne, Chloe abandonne (rien).
    const g = srv.bistrots.recordGame({ game: '421', players: [{ userId: A, won: true }, { userId: B, won: false }, { userId: C, won: false, abandoned: true }] });
    expect(Object.fromEntries(g)).toEqual({ [A]: POINTS_PLAY + POINTS_WIN, [B]: POINTS_PLAY });
    // Un seul compte (contre des ordinateurs) : rien.
    expect(srv.bistrots.recordGame({ game: 'courtisan', players: [{ userId: B, won: true }] }).size).toBe(0);
    // Le solo (déclaré par le téléphone) ne compte pas.
    const { gameToken } = await api('/solo/start', {}, t.Bruno);
    expect((await api('/solo/end', { gameToken, won: true, rounds: 10, opponents: 3 }, t.Bruno)).ok).toBe(true);
    // Défi entre amis (score rejoué par le serveur) : compte pour les deux.
    await befriend(t.Alice, 'Alice', t.Bruno, 'Bruno');
    const d = (await api('/duels', { username: 'Bruno' }, t.Alice)).duel;
    const quick = Array.from({ length: CHALLENGE_TURNS }, () => []);
    expect((await api(`/duels/${d.id}/play`, { decisions: quick }, t.Alice)).ok).toBe(true);
    expect((await api(`/duels/${d.id}/play`, { decisions: quick }, t.Bruno)).ok).toBe(true); // mêmes dés, mêmes choix : égalité
    const v = (await api(`/bistrots/${bid}`, undefined, t.Alice)).bistrot;
    const pts = Object.fromEntries(v.standings.map((r: { username: string; points: number }) => [r.username, r.points]));
    expect(pts).toEqual({ Alice: 3 + 1, Bruno: 1 + 1, Chloe: 0 });
    expect(v.standings[0]).toMatchObject({ rank: 1, username: 'Alice', games: 2, wins: 1, owner: true, me: true });
    expect(v.wall[0]).toMatchObject({ kind: 'victoire', name: 'Alice', data: { game: '421', points: 3 } });
  });

  it(`plafond : ${PAIR_DAILY_CAP} parties par jour entre deux mêmes joueurs, tournois plafonnés`, async () => {
    const a = await reg('Paire1'), b = await reg('Paire2');
    const A = idOf(srv, 'Paire1'), B = idOf(srv, 'Paire2');
    const bis = (await api('/bistrots', { name: 'La Paire' }, a)).bistrot;
    await api('/bistrots/rejoindre', { code: bis.code }, b);
    let counted = 0;
    for (let i = 0; i < PAIR_DAILY_CAP + 3; i++) if (srv.bistrots.recordGame({ game: 'cf', players: [{ userId: A, won: true }, { userId: B, won: false }] }).size) counted++;
    expect(counted).toBe(PAIR_DAILY_CAP);
    // Un nouvel adversaire : la partie compte de nouveau.
    const c = await reg('Paire3');
    expect(srv.bistrots.recordGame({ game: 'cf', players: [{ userId: A, won: true }, { userId: idOf(srv, 'Paire3'), won: false }] }).get(A)).toBe(3);
    void c;
    // Tournois gagnés : au plus TOURNEY_DAILY_CAP par jour, et au moins deux comptes.
    expect(srv.bistrots.tournamentWin(A, 1, '421')).toBe(0);
    const wins = Array.from({ length: TOURNEY_DAILY_CAP + 1 }, () => srv.bistrots.tournamentWin(A, 4, '421'));
    expect(wins).toEqual([...Array(TOURNEY_DAILY_CAP).fill(POINTS_TOURNEY), 0]);
    // Le lendemain, le plafond repart.
    clock += 86400_000;
    expect(srv.bistrots.recordGame({ game: 'cf', players: [{ userId: A, won: false }, { userId: B, won: true }] }).get(B)).toBe(3);
    clock -= 86400_000;
    const v = (await api(`/bistrots/${bis.id}`, undefined, a)).bistrot;
    expect(v.standings.find((r: { username: string }) => r.username === 'Paire1').points).toBe(PAIR_DAILY_CAP * 3 + 3 + TOURNEY_DAILY_CAP * POINTS_TOURNEY + 1); // + la défaite du lendemain
    expect(v.wall.some((w: { kind: string }) => w.kind === 'tournoi')).toBe(true);
  });

  it('droits du patron : retirer, transmettre, fermer ; réactions ; modération', async () => {
    expect((await api(`/bistrots/${bid}/retirer`, { username: 'Chloe' }, t.Bruno)).code).toBe(403);
    expect((await api(`/bistrots/${bid}/fermer`, {}, t.Bruno)).code).toBe(403);
    expect((await api(`/bistrots/${bid}/nouveau-lien`, {}, t.Bruno)).code).toBe(403);
    expect((await api(`/bistrots/${bid}/retirer`, { username: 'Alice' }, t.Alice)).code).toBe(400);
    const k = await api(`/bistrots/${bid}/retirer`, { username: 'Chloe' }, t.Alice);
    expect(k.bistrot.standings.map((r: { username: string }) => r.username)).not.toContain('Chloe');
    expect((await api('/bistrots/rejoindre', { code }, t.Chloe)).code).toBe(403); // retirée : pas de retour par le lien
    // Nouveau lien : l'ancien ne marche plus.
    const nl = (await api(`/bistrots/${bid}/nouveau-lien`, {}, t.Alice)).bistrot;
    expect(nl.code).not.toBe(code);
    expect((await api(`/bistrots/apercu/${code}`)).code).toBe(404);
    // Réaction rapide (liste fermée), retirée en la touchant de nouveau.
    const w = nl.wall[0].id;
    expect((await api(`/bistrots/${bid}/reaction`, { wall: w, emoji: '💩' }, t.Bruno)).code).toBe(400);
    expect((await api(`/bistrots/${bid}/reaction`, { wall: w, emoji: '🍺' }, t.Bruno)).bistrot.wall[0]).toMatchObject({ reactions: { '🍺': 1 }, mine: '🍺' });
    expect((await api(`/bistrots/${bid}/reaction`, { wall: w, emoji: '🍺' }, t.Bruno)).bistrot.wall[0]).toMatchObject({ reactions: {}, mine: null });
    // Transmettre : Bruno devient patron, Alice perd les droits.
    expect((await api(`/bistrots/${bid}/transmettre`, { username: 'Bruno' }, t.Alice)).bistrot).toMatchObject({ owner: 'Bruno', isOwner: false });
    expect((await api(`/bistrots/${bid}/fermer`, {}, t.Alice)).code).toBe(403);
    // Le patron qui part : le plus ancien membre reprend.
    expect((await api(`/bistrots/${bid}/quitter`, {}, t.Bruno)).ok).toBe(true);
    expect((await api(`/bistrots/${bid}`, undefined, t.Alice)).bistrot).toMatchObject({ owner: 'Alice', isOwner: true });
    // Signalement du nom : il arrive au panel de modération ; un modérateur (admin) peut fermer.
    await api('/bistrots/rejoindre', { code: nl.code }, t.Emma);
    expect((await api(`/bistrots/${bid}/signaler`, {}, t.Emma)).ok).toBe(true);
    const admin = await reg('Gerant');
    const reports = (await api('/moderation/reports', undefined, admin)).reports;
    expect(reports.some((r: { message: { where: string } | null }) => r.message?.where.includes('Chez Alice'))).toBe(true);
    expect((await api(`/bistrots/${bid}/fermer-moderation`, {}, t.Emma)).code).toBe(403);
    expect((await api(`/bistrots/apercu/${nl.code}`, undefined, admin)).bistrot.staff).toBe(true);
    expect((await api(`/bistrots/${bid}/fermer-moderation`, {}, admin)).ok).toBe(true);
    expect((await api(`/bistrots/${bid}`, undefined, t.Alice)).code).toBe(404);
    expect((await api('/bistrots', undefined, t.Emma)).mine).toEqual([]);
  });
});

describe('champion du lundi', () => {
  it('désigné une seule fois, même après un redémarrage', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bistrot-'));
    const dbPath = join(dir, 'x.sqlite');
    let now = Date.parse('2026-11-12T10:00:00Z'); // jeudi
    const start = () => startServer({ port: 0, dbPath, accounts: { authAttempts: 1000, now: () => now } });
    let s = await start();
    let a = call(`http://127.0.0.1:${s.port}`);
    const tk = { r: await reg('Rene', a), s: await reg('Sara', a), u: await reg('Ugo', a) };
    const b = (await a('/bistrots', { name: 'Au Bon Coin' }, tk.r)).bistrot;
    await a('/bistrots/rejoindre', { code: b.code }, tk.s);
    await a('/bistrots/rejoindre', { code: b.code }, tk.u);
    const [R, S, U] = ['Rene', 'Sara', 'Ugo'].map((n) => idOf(s, n));
    s.bistrots.recordGame({ game: '421', players: [{ userId: S, won: true }, { userId: R, won: false }, { userId: U, won: false }] });
    s.bistrots.recordGame({ game: 'courtisan', players: [{ userId: S, won: true }, { userId: R, won: false }] });
    const coins = (await a('/me', undefined, tk.s)).profile.coins;
    // Lundi suivant : la semaine passée est close.
    now = Date.parse('2026-11-16T08:00:00Z');
    const v = (await a(`/bistrots/${b.id}`, undefined, tk.r)).bistrot;
    expect(v.champions).toEqual([{ week: '2026-11-09', name: 'Sara', points: 6 }]);
    expect(v.standings.find((r: { username: string }) => r.username === 'Sara')).toMatchObject({ champion: true, points: 0 });
    expect(v.wall[0]).toMatchObject({ kind: 'champion', name: 'Sara', data: { points: 6, coins: CHAMPION_COINS } });
    expect((await a('/me', undefined, tk.s)).profile.coins).toBe(coins + CHAMPION_COINS);
    expect(s.accounts.social.sent.some((p) => p.userId === S && /champion/i.test(p.title))).toBe(true);
    // Redémarrage, avec la marque « semaine close » perdue (arrêt brutal) : rien n'est donné deux fois.
    s.store.setMeta('bistrots_rolled', '2026-11-09');
    await s.close();
    s = await start();
    a = call(`http://127.0.0.1:${s.port}`);
    const v2 = (await a(`/bistrots/${b.id}`, undefined, tk.r)).bistrot;
    expect(v2.champions).toHaveLength(1);
    expect(v2.wall.filter((w: { kind: string }) => w.kind === 'champion')).toHaveLength(1);
    expect((await a('/me', undefined, tk.s)).profile.coins).toBe(coins + CHAMPION_COINS);
    // L'insigne ne dure qu'une semaine.
    now = Date.parse('2026-11-24T08:00:00Z');
    const v3 = (await a(`/bistrots/${b.id}`, undefined, tk.r)).bistrot;
    expect(v3.standings.some((r: { champion: boolean }) => r.champion)).toBe(false);
    await s.close();
    rmSync(dir, { recursive: true, force: true });
  }, 120_000);
});

describe('partie de 421 en ligne réellement jouée', () => {
  it('les points du bistrot viennent de la fin de partie arbitrée par le serveur', async () => {
    const { io: connect } = await import('socket.io-client');
    const { currentPlayerId } = await import('../shared/engine');
    const dieOf = new Map<string, number>();
    const s = await startServer({ port: 0, dbPath: ':memory:', accounts: { authAttempts: 1000, minSoloMs: 0 }, turnTimeoutMs: 60_000,
      autoPlayDelayMs: 10, rollGraceMs: 0, stopGraceMs: 0, testDie: (pid) => dieOf.get(pid) ?? 3 });
    const a = call(`http://127.0.0.1:${s.port}`);
    const tk = [await reg('Jouea', a), await reg('Joueb', a)];
    const b = (await a('/bistrots', { name: 'Le Tapis Vert' }, tk[0])).bistrot;
    await a('/bistrots/rejoindre', { code: b.code }, tk[1]);
    const socks = await Promise.all(tk.map(() => new Promise<ReturnType<typeof connect>>((ok) => { const x = connect(`http://127.0.0.1:${s.port}`, { transports: ['websocket'], forceNew: true }); x.on('connect', () => ok(x)); })));
    const emit = (i: number, ev: string, p: object = {}) => new Promise<any>((res) => socks[i].emit(ev, p, res)); // eslint-disable-line @typescript-eslint/no-explicit-any
    const created = await emit(0, 'room:create', { name: 'Jouea', auth: tk[0], table: { visibility: 'private', maxPlayers: 2, stake: 0 } });
    expect((await emit(0, 'room:config', { config: { variant: 'decharge', startTokens: 1, maxThrows: 1, turnSeconds: 0 } })).ok).toBe(true);
    const j = await emit(1, 'room:join', { code: created.code, name: 'Joueb', auth: tk[1] });
    await emit(1, 'room:ready', { ready: true });
    const ids = [created.playerId as string, j.playerId as string];
    dieOf.set(ids[0], 1); dieOf.set(ids[1], 6);
    expect((await emit(0, 'room:start')).ok).toBe(true);
    const code = created.code as string;
    for (let n = 0; n < 50 && s.rooms.get(code)?.game?.phase !== 'fini'; n++) {
      const g = s.rooms.get(code)!.game!;
      const pid = currentPlayerId(g);
      if (!pid) { await new Promise((r) => setTimeout(r, 20)); continue; }
      const i = ids.indexOf(pid);
      await emit(i, 'game:roll', { keep: [false, false, false], version: g.version });
      const g2 = s.rooms.get(code)!.game!;
      if (currentPlayerId(g2) === pid && g2.phase !== 'fini') await emit(i, 'game:stop', { version: g2.version });
    }
    expect(s.rooms.get(code)!.game!.phase).toBe('fini');
    await new Promise((r) => setTimeout(r, 100));
    const v = (await a(`/bistrots/${b.id}`, undefined, tk[0])).bistrot;
    expect(Object.fromEntries(v.standings.map((r: { username: string; points: number }) => [r.username, r.points]))).toEqual({ Jouea: 3, Joueb: 1 });
    expect(v.wall[0]).toMatchObject({ kind: 'victoire', name: 'Jouea', data: { game: '421' } });
    for (const x of socks) x.close();
    await s.close();
  }, 120_000);
});
