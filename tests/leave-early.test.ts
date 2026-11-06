/**
 * « Empocher et quitter » : un joueur sorti avant la fin (place définitive) est récompensé tout de
 * suite, une seule fois, et peut partir sans que ce soit un abandon ; la partie continue sans lui.
 * Dés imposés (testDie) : chaque joueur fait toujours le même brelan, l'ordre de sortie est connu.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import { startServer } from '../server/app';
import { createGame, currentPlayerId, rollAction, stopAction, type GameState } from '../shared/engine';
import { DEFAULT_CONFIG, sanitizeConfig } from '../shared/config';
import { computeReward, didWin, finalPlace, settledPlace } from '../shared/progress/profile';
import { decide } from '../shared/ai';
import { LocalController } from '../client/src/game/localController';
import { PERSONAS } from '../client/src/game/personas';
import type { PublicRoom } from '../shared/protocol';
import type { PublicTournament } from '../shared/tournament';
import { bagPrizes } from '../shared/scheduled';

/** Brelan imposé par joueur (1 = trois as, le meilleur ; puis 6, 5, 4, 3, 2). */
const dieOf = new Map<string, number>();
/** Tournoi : brelans attribués selon la place voulue à la table (voir le test). */
let tableDie: ((pid: string, g: GameState) => number) | null = null;

let srv: Awaited<ReturnType<typeof startServer>>;
let base = '';
beforeAll(async () => {
  srv = await startServer({
    port: 0, dbPath: ':memory:', accounts: { authAttempts: 1000, minSoloMs: 0 }, turnTimeoutMs: 60_000, disconnectGraceMs: 100,
    // Ordinateurs un peu lents : on a le temps de voir la partie continuer après une sortie.
    autoPlayDelayMs: 60, rollGraceMs: 0, stopGraceMs: 0, tournamentPauseMs: 100, tournamentFullStartMs: 100,
    testDie: (pid, g) => tableDie?.(pid, g) ?? dieOf.get(pid) ?? 3,
  });
  base = `http://localhost:${srv.port}`;
});
afterAll(async () => { await srv.close(); });

interface C { s: Socket; room: PublicRoom | null; game: GameState | null; t: PublicTournament | null; rewards: any[]; profile: any; notices: string[]; id: string; token: string }
const client = () => new Promise<C>((resolve) => {
  const c: C = { s: connect(base, { transports: ['websocket'], forceNew: true }), room: null, game: null, t: null, rewards: [], profile: null, notices: [], id: '', token: '' };
  c.s.on('room:state', (r: PublicRoom) => (c.room = r));
  c.s.on('game:state', ({ state }: { state: GameState }) => (c.game = state));
  c.s.on('game:roll', ({ state }: { state: GameState }) => (c.game = state));
  c.s.on('tournament:state', (t: PublicTournament) => (c.t = t));
  c.s.on('profile:reward', (r: any) => c.rewards.push(r));
  c.s.on('profile:update', ({ profile }: { profile: any }) => (c.profile = profile));
  c.s.on('room:notice', (n: { text: string }) => c.notices.push(n.text));
  c.s.on('connect', () => resolve(c));
});
const emit = (c: C, ev: string, p: object = {}) => new Promise<any>((res) => c.s.emit(ev, p, res));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(fn: () => boolean, ms = 15000) { const t = Date.now(); while (!fn()) { if (Date.now() - t > ms) throw new Error('délai dépassé'); await wait(10); } }
async function api(path: string, body?: object, token?: string) {
  const r = await fetch(`${base}/api${path}`, {
    method: body ? 'POST' : 'GET', body: body ? JSON.stringify(body) : undefined,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  return r.json();
}
/** Décharge à 1 jeton : à chaque manche, le meilleur donne son jeton et sort. */
const sprint = { variant: 'decharge', startTokens: 1, maxThrows: 1, turnSeconds: 0 };

/** Le joueur dont c'est le tour (parmi `cs`) lance puis valide. */
async function playTurn(cs: C[], code: string) {
  const g = srv.rooms.get(code)!.game!;
  const pid = currentPlayerId(g)!;
  const c = cs.find((x) => x.id === pid)!;
  const v = g.version;
  expect((await emit(c, 'game:roll', { keep: [false, false, false], version: v })).ok).toBe(true);
  const g2 = srv.rooms.get(code)!.game!;
  if (currentPlayerId(g2) === pid && g2.phase !== 'fini') await emit(c, 'game:stop', { version: g2.version });
}

describe('règles : place définitive d’un joueur sorti', () => {
  it('sorti avant la fin : place, victoire et récompense connues ; un joueur encore en jeu n’a rien', () => {
    const cfg = sanitizeConfig({ ...DEFAULT_CONFIG, ...sprint });
    const g = createGame(cfg, ['a', 'b', 'c'].map((id) => ({ id, name: id })));
    const v: Record<string, number> = { a: 1, b: 6, c: 2 };
    while (!g.players.some((p) => p.out)) {
      const pid = currentPlayerId(g)!;
      rollAction(g, pid, [false, false, false], () => v[pid]);
      if (currentPlayerId(g) === pid) stopAction(g, pid);
    }
    expect(g.phase).not.toBe('fini');
    expect(settledPlace(g, 'a')).toBe(1);
    expect(settledPlace(g, 'b')).toBeNull();
    expect(didWin(g, 'a')).toBe(true);
    expect(finalPlace(g, 'a')).toBe(1);
    const ctx = { mode: 'online' as const, opponents: 2, count421: 0, minutes: 10 };
    const early = computeReward(g, 'a', ctx);
    expect(early.xp).toBeGreaterThan(0);
    expect(computeReward(g, 'b', ctx).xp).toBe(0);
    // Fin de la partie : sa place n'a pas bougé, sa récompense (à durée égale) est la même.
    while (g.phase !== 'fini') {
      const pid = currentPlayerId(g)!;
      rollAction(g, pid, [false, false, false], () => v[pid]);
      if (currentPlayerId(g) === pid && (g.phase as string) !== 'fini') stopAction(g, pid);
    }
    expect(g.ranking).toEqual(['a', 'b', 'c']);
    expect(computeReward(g, 'a', ctx)).toEqual({ ...early });
  });
});

describe('solo : empocher une fois sorti', () => {
  it('la récompense à la sortie est celle de la place finale, même si les ordinateurs finissent la partie', async () => {
    class T extends LocalController { get st(): GameState { return this.state; } }
    for (let attempt = 0; attempt < 40; attempt++) {
      const c = new T(sanitizeConfig({ ...DEFAULT_CONFIG, turnSeconds: 0 }), PERSONAS.slice(0, 3).map((persona) => ({ persona, difficulty: 'normal' as const })), { name: 'Sam', avatar: '🦊' });
      c.subscribeEvents(() => {});
      for (let i = 0; i < 20000 && c.st.phase !== 'fini' && !c.st.players[0].out; i++) {
        const pid = currentPlayerId(c.st)!;
        const d = decide(c.st, pid, 'normal', Math.random);
        if (d.kind === 'roll' && rollAction(c.st, pid, d.keep, () => 1 + Math.floor(Math.random() * 6)).ok) continue;
        stopAction(c.st, pid);
      }
      if (c.st.phase === 'fini') { c.leave(); continue; }
      const place = settledPlace(c.st, 'moi')!;
      expect(place).toBeGreaterThanOrEqual(1);
      const ctx = { mode: 'solo' as const, opponents: 3, difficulty: 'normal' as const, count421: 0, minutes: 8, rounds: c.st.round };
      const early = computeReward(c.st, 'moi', ctx);
      expect(early.xp).toBeGreaterThan(0);
      // « Continuer à regarder » puis fin : même place, même victoire, même récompense (même durée).
      c.skipToEnd();
      expect(c.st.phase).toBe('fini');
      expect(finalPlace(c.st, 'moi')).toBe(place);
      expect(computeReward(c.st, 'moi', ctx)).toEqual(early);
      c.leave();

      // Compte : le serveur accepte la partie déclarée à la sortie (victoire ou place bornée).
      const acc = await api('/register', { username: `Solo${attempt}x`, password: 'motdepasse1' });
      const { gameToken } = await api('/solo/start', {}, acc.token);
      const r = await api('/solo/end', { gameToken, won: place === 1, place, rounds: ctx.rounds, opponents: 3, difficulty: 'normal', count421: 0 }, acc.token);
      expect(r.ok).toBe(true);
      expect(r.reward.xp).toBeGreaterThan(0);
      // Le jeton de partie est consommé : pas de deuxième récompense.
      expect((await api('/solo/end', { gameToken, won: place === 1, place, rounds: ctx.rounds, opponents: 3 }, acc.token)).ok).toBe(false);
      return;
    }
    throw new Error('aucune partie où le joueur sort avant la fin');
  });
});

describe('en ligne avec cagnotte', () => {
  it('le premier sorti empoche sa part et sa récompense tout de suite, part, ne revient pas, et n’est jamais payé deux fois', async () => {
    const accts = await Promise.all(['A', 'B', 'C'].map((n) => api('/register', { username: `Pot${n}`, password: 'motdepasse1', guestProfile: { coins: 50 } })));
    const cs = await Promise.all(accts.map(() => client()));
    const created = await emit(cs[0], 'room:create', { name: 'PotA', auth: accts[0].token, table: { visibility: 'private', maxPlayers: 3, stake: 10 } });
    cs[0].id = created.playerId; cs[0].token = created.token;
    expect((await emit(cs[0], 'room:config', { config: sprint })).ok).toBe(true);
    for (const i of [1, 2]) {
      const j = await emit(cs[i], 'room:join', { code: created.code, name: `Pot${'ABC'[i]}`, auth: accts[i].token });
      cs[i].id = j.playerId; cs[i].token = j.token;
      await emit(cs[i], 'room:ready', { ready: true });
    }
    dieOf.set(cs[0].id, 1); dieOf.set(cs[1].id, 6); dieOf.set(cs[2].id, 2);
    expect((await emit(cs[0], 'room:start')).ok).toBe(true);
    const code = created.code as string;
    await until(() => srv.rooms.get(code)?.pot === 30);
    const r = srv.rooms.get(code)!;
    // Première manche : A (trois as) donne son jeton et sort, 1er. B et C continuent.
    while (!r.game!.players.find((p) => p.id === cs[0].id)!.out) await playTurn(cs, code);
    expect(r.game!.phase).not.toBe('fini');
    await until(() => cs[0].rewards.length === 1);
    expect(cs[0].rewards[0].reward.won).toBe(true);
    // Part de cagnotte : 30 pièces, poids 2 et 1 entre les deux premiers → 20 pour le premier.
    await until(() => cs[0].profile?.coins != null && cs[0].notices.some((n) => /empoche 20 pièces/.test(n)));
    const meA1 = await api('/me', undefined, accts[0].token);
    expect(meA1.profile.stats.played).toBe(1);
    expect(meA1.profile.stats.potsWon).toBe(1);
    const coinsAfter = meA1.profile.coins;
    expect(coinsAfter).toBeGreaterThanOrEqual(40 + 20);

    // Empocher et quitter : pas un abandon, pas de retour possible.
    expect((await emit(cs[0], 'room:leave')).ok).toBe(true);
    await until(() => cs[1].notices.some((n) => /a empoché ses gains/.test(n)));
    expect(cs[1].notices.some((n) => /jouera à sa place/.test(n))).toBe(false);
    const back = await client();
    const rj = await emit(back, 'room:join', { code, token: cs[0].token, name: 'PotA' });
    expect(rj.ok).toBe(false);
    expect(rj.error).toMatch(/empoché/);
    // Spectateur possible, mais sans action de jeu ni récompense.
    expect((await emit(back, 'spectate:join', { code, auth: accts[0].token })).ok).toBe(true);

    // La partie continue sans lui : B sort 2e, C perd.
    while (r.game!.phase !== 'fini') await playTurn([cs[1], cs[2]], code);
    expect(r.game!.ranking).toEqual([cs[0].id, cs[1].id, cs[2].id]);
    await until(() => cs[1].rewards.length === 1 && cs[2].rewards.length === 1);
    expect(cs[1].notices.some((n) => /Cagnotte de 30 pièces : PotA \+20, PotB \+10/.test(n))).toBe(true);
    await wait(50);
    const [ma, mb, mc] = await Promise.all(accts.map((a) => api('/me', undefined, a.token)));
    // A : rien de plus à la fin (ni récompense ni cagnotte en double).
    expect(ma.profile.coins).toBe(coinsAfter);
    expect(ma.profile.stats.played).toBe(1);
    expect(ma.profile.stats.potsWon).toBe(1);
    expect(mb.profile.stats.played).toBe(1);
    expect(mb.profile.stats.potsWon).toBe(1);
    expect(mc.profile.stats.played).toBe(1);
    expect(mc.profile.stats.potsWon).toBe(0);
    // Classement en ligne : victoire de A comptée (pas un abandon).
    expect((await api('/players/PotA')).player.onlineWins).toBe(1);
    // Saison classée : A premier.
    const season = await api('/season', undefined, accts[0].token);
    expect(season.me).toMatchObject({ games: 1, wins: 1 });
    for (const c of [...cs, back]) c.s.disconnect();
  }, 30000);

  it('seul humain à une table avec des ordinateurs : il empoche, part, et le serveur termine la partie', async () => {
    const acc = await api('/register', { username: 'SeulBots', password: 'motdepasse1' });
    const c = await client();
    const created = await emit(c, 'room:create', { name: 'Seul', auth: acc.token, table: { visibility: 'private', maxPlayers: 3, stake: 0 } });
    c.id = created.playerId;
    await emit(c, 'room:config', { config: sprint });
    await emit(c, 'room:addBot', { difficulty: 'normal' });
    await emit(c, 'room:addBot', { difficulty: 'normal' });
    // Lui : trois as ; les ordinateurs : brelans de 6 et de 5 (pas d'égalité sans fin).
    tableDie = (pid, g) => (pid === c.id ? 1 : [6, 5][g.players.filter((p) => p.id !== c.id).findIndex((p) => p.id === pid)] ?? 3);
    expect((await emit(c, 'room:start')).ok).toBe(true);
    const code = created.code as string;
    const r = srv.rooms.get(code)!;
    await until(() => !!r.game);
    // Les ordinateurs jouent seuls ; à son tour, il lance.
    await until(() => {
      const g = r.game!;
      if (currentPlayerId(g) === c.id && g.throwsUsed === 0 && g.phase !== 'fini') void emit(c, 'game:roll', { keep: [false, false, false], version: g.version });
      return !!g.players.find((p) => p.id === c.id)!.out;
    });
    await until(() => c.rewards.length === 1);
    const stopAt = r.game!.phase;
    expect(stopAt).not.toBe('fini');
    expect((await emit(c, 'room:leave')).ok).toBe(true);
    // Table rangée, partie close (statistiques), pas de deuxième récompense.
    await until(() => !srv.rooms.has(code));
    expect(r.game!.phase).toBe('fini');
    const me = await api('/me', undefined, acc.token);
    expect(me.profile.stats.played).toBe(1);
    expect(c.rewards.length).toBe(1);
    tableDie = null;
    c.s.disconnect();
  }, 20000);
});

describe('tournoi', () => {
  it('éliminé avant la fin de sa table : récompensé, part sans abandon, classé à la fin', async () => {
    const acc = await api('/register', { username: 'TourElim', password: 'motdepasse1' });
    const c = await client();
    const created = await emit(c, 'tournament:create', {
      name: 'Elim', auth: acc.token, settings: { title: 'Coupe', maxPlayers: 12, tableSize: 6, stake: 0, payout: 'winner', visibility: 'private', config: sprint },
    });
    expect(created.ok).toBe(true);
    c.id = created.playerId; c.token = created.token;
    // À sa table : trois joueurs plus forts, deux plus faibles → il sort 4e, éliminé (3 qualifiés).
    tableDie = (pid, g) => {
      if (pid === c.id) return 4;
      const others = g.players.map((p) => p.id).filter((id) => id !== c.id);
      const mine = g.players.some((p) => p.id === c.id);
      return (mine ? [1, 6, 5, 3, 2] : [1, 6, 5, 4, 3, 2])[others.indexOf(pid)] ?? 3;
    };
    expect((await emit(c, 'tournament:fillBots', { difficulty: 'normal' })).ok).toBe(true);
    const t = () => srv.tournaments.get(created.code)!;
    await until(() => t().status === 'en-cours');
    await until(() => !!c.room?.code && !!srv.rooms.get(c.room.code)?.game);
    const code = c.room!.code;
    const r = srv.rooms.get(code)!;
    await until(() => {
      const g = r.game!;
      if (currentPlayerId(g) === c.id && g.throwsUsed === 0 && g.phase !== 'fini') void emit(c, 'game:roll', { keep: [false, false, false], version: g.version });
      return !!g.players.find((p) => p.id === c.id)!.out;
    }, 20000);
    expect(r.game!.phase).not.toBe('fini');
    expect(r.game!.players.find((p) => p.id === c.id)!.finishPos).toBe(4);
    await until(() => c.rewards.length === 1);
    const tp = t().players.find((p) => p.id === c.id)!;
    expect(tp.finished).toBe(true);
    expect(tp.out).toBe(0);
    // Il part : pas un abandon.
    await emit(c, 'tournament:leave');
    expect(tp.left).toBe(false);
    expect(r.members.find((m) => m.id === c.id)!.quit).toBe('cashed');
    // Retour avec son jeton : il retrouve le tableau, pas sa table.
    const back = await client();
    expect((await emit(back, 'tournament:join', { code: created.code, token: c.token })).ok).toBe(true);
    expect(r.members.find((m) => m.id === c.id)!.socketId).toBeNull();
    await emit(back, 'tournament:leave');
    // Le tournoi va au bout sans lui ; il est classé et compté une fois.
    await until(() => t().status === 'termine', 30000);
    expect(t().standings).toContain(c.id);
    expect(t().standings!.indexOf(c.id)).toBeGreaterThanOrEqual(6);
    const me = await api('/me', undefined, acc.token);
    expect(me.profile.stats.played).toBe(1);
    expect(me.profile.stats.tournaments).toBe(1);
    tableDie = null;
    c.s.disconnect(); back.s.disconnect();
  }, 40000);

  it('finale : le premier sorti remporte le tournoi tout de suite, une seule fois', async () => {
    const acc = await api('/register', { username: 'TourWin', password: 'motdepasse1' });
    const c = await client();
    const created = await emit(c, 'tournament:create', {
      name: 'Champion', auth: acc.token, settings: { title: 'Finale', maxPlayers: 4, tableSize: 4, stake: 0, payout: 'winner', visibility: 'private', config: sprint },
    });
    c.id = created.playerId;
    tableDie = (pid, g) => (pid === c.id ? 1 : [6, 5, 4][g.players.filter((p) => p.id !== c.id).findIndex((p) => p.id === pid)] ?? 3);
    expect((await emit(c, 'tournament:fillBots', { difficulty: 'normal' })).ok).toBe(true);
    const t = () => srv.tournaments.get(created.code)!;
    await until(() => t().status === 'en-cours');
    await until(() => !!c.room?.code && !!srv.rooms.get(c.room.code)?.game);
    const r = srv.rooms.get(c.room!.code)!;
    await until(() => {
      const g = r.game!;
      if (currentPlayerId(g) === c.id && g.throwsUsed === 0 && g.phase !== 'fini') void emit(c, 'game:roll', { keep: [false, false, false], version: g.version });
      return !!g.players.find((p) => p.id === c.id)!.out;
    });
    expect(r.game!.phase).not.toBe('fini');
    // Gain de tournoi versé à la sortie (statistiques du tournoi), avant la fin de la finale.
    await until(() => !!t().paidEarly?.has(c.id));
    const mid = await api('/me', undefined, acc.token);
    expect(mid.profile.stats.tournamentWins).toBe(1);
    await emit(c, 'tournament:leave');
    await until(() => t().status === 'termine', 20000);
    expect(t().standings![0]).toBe(c.id);
    const me = await api('/me', undefined, acc.token);
    expect(me.profile.stats.tournaments).toBe(1);
    expect(me.profile.stats.tournamentWins).toBe(1);
    expect(me.profile.stats.played).toBe(1);
    tableDie = null;
    c.s.disconnect();
  }, 30000);
});

describe('tournoi programmé', () => {
  it('finale : le vainqueur sorti le premier reçoit ses sacs tout de suite, une seule fois', async () => {
    let now = Date.parse('2026-11-04T09:00:00Z'); // 10h à Bruxelles
    const H11 = Date.parse('2026-11-04T10:00:00Z');
    let aId = '';
    const s2 = await startServer({
      port: 0, dbPath: ':memory:', now: () => now, schedTickMs: 0, schedConfig: sprint as never, accounts: { authAttempts: 1000 },
      disconnectGraceMs: 50, autoPlayDelayMs: 60, rollGraceMs: 0, stopGraceMs: 0, tournamentPauseMs: 50,
      testDie: (pid, g) => (pid === aId ? 1 : [6, 5, 4][g.players.filter((p) => p.id !== aId).findIndex((p) => p.id === pid)] ?? 3),
    });
    const api2 = async (path: string, body?: object, token?: string) => (await fetch(`http://localhost:${s2.port}/api${path}`, {
      method: body ? 'POST' : 'GET', body: body ? JSON.stringify(body) : undefined,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    })).json();
    const accts = await Promise.all([0, 1, 2, 3].map((i) => api2('/register', { username: `Prog${i}x`, password: 'motdepasse1', guestProfile: { coins: 50 } })));
    for (const a of accts) await api2('/tournois/inscription', { slot: '2026-11-04-11h' }, a.token);
    now = H11 + 1000;
    s2.schedTick();
    const code = (await api2('/tournois/programme', undefined, accts[0].token)).slots[0].code;
    const cs = await Promise.all(accts.map(() => new Promise<Socket>((ok) => { const s = connect(`http://localhost:${s2.port}`, { transports: ['websocket'], forceNew: true }); s.on('connect', () => ok(s)); })));
    const em = (s: Socket, ev: string, p: object = {}) => new Promise<any>((res) => s.emit(ev, p, res));
    for (let i = 0; i < 4; i++) expect((await em(cs[i], 'tournament:join', { code, auth: accts[i].token })).ok).toBe(true);
    const t = [...s2.tournaments.values()].find((x) => x.sched?.slot === '2026-11-04-11h')!;
    aId = t.players.find((p) => p.userId === accts[0].user.id)!.id;
    const prize = bagPrizes(4)[0] ?? 0;
    now = H11 + 5 * 60_000 + 1000;
    s2.schedTick();
    await until(() => t.status === 'en-cours');
    // Les trois autres laissent le serveur jouer pour eux ; A joue ses tours.
    for (const i of [1, 2, 3]) await em(cs[i], 'tournament:leave');
    const r = s2.rooms.get(t.rounds[0].tables[0].code)!;
    await until(() => {
      const g = r.game!;
      if (currentPlayerId(g) === aId && g.throwsUsed === 0 && g.phase !== 'fini') void em(cs[0], 'game:roll', { keep: [false, false, false], version: g.version });
      return !!g.players.find((p) => p.id === aId)!.out;
    });
    expect(r.game!.phase).not.toBe('fini');
    await until(() => !!t.paidEarly?.has(aId));
    // Sacs du podium déjà notés et versés (une partie peut aussi faire trouver un sac : on compare avant / après).
    expect((await api2('/tournois/programme', undefined, accts[0].token)).last).toMatchObject({ place: 0, bags: prize });
    const bagsMid = (await api2('/me', undefined, accts[0].token)).profile.bags ?? 0;
    expect(bagsMid).toBeGreaterThanOrEqual(prize);
    await em(cs[0], 'tournament:leave');
    await until(() => t.status === 'termine', 20000);
    expect(t.standings![0]).toBe(aId);
    const me = await api2('/me', undefined, accts[0].token);
    expect(me.profile.bags ?? 0).toBe(bagsMid);
    expect(me.profile.stats.tournamentWins).toBe(1);
    expect(me.profile.stats.tournaments).toBe(1);
    expect((await api2('/tournois/programme', undefined, accts[0].token)).last).toMatchObject({ place: 0, bags: prize });
    for (const s of cs) s.disconnect();
    await s2.close();
  }, 30000);
});
