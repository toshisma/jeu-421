/** Demandes d'amis, défis entre amis, saisons classées, séries, secrets, happy hour. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as connect } from 'socket.io-client';
import { startServer } from '../server/app';
import { CHALLENGE_TURNS } from '../shared/challenge';
import { SERIES } from '../shared/progress/dice-collection';
import { applyGameEnd, applySeries, newProfile, rewardFor, titleLabel } from '../shared/progress/profile';
import { happyHour, happyHourOfDay } from '../shared/progress/events';
import { divisionOf, seasonDelta } from '../shared/season';

let srv: Awaited<ReturnType<typeof startServer>>;
let base = '';
let clock = Date.parse('2026-11-10T12:00:00Z');
beforeAll(async () => {
  srv = await startServer({ port: 0, dbPath: ':memory:', accounts: { authAttempts: 1000, now: () => clock } });
  base = `http://localhost:${srv.port}`;
});
afterAll(async () => { await srv.close(); });
const api = async (path: string, body?: object, token?: string) => {
  const r = await fetch(`${base}/api${path}`, { method: body ? 'POST' : 'GET', body: body ? JSON.stringify(body) : undefined,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
  return { code: r.status, ...(await r.json()) };
};
// Toujours garder tous les dés après le premier lancer : un coup = 1 lancer.
const quick = Array.from({ length: CHALLENGE_TURNS }, () => []);

describe('amis et défis', () => {
  let a = '', b = '';
  it('demande d’ami : acceptée ou refusée, notification avec compteur', async () => {
    a = (await api('/register', { username: 'Alice', password: 'motdepasse1', guestProfile: { coins: 100 } })).token;
    b = (await api('/register', { username: 'Bob', password: 'motdepasse1', guestProfile: { coins: 100 } })).token;
    expect((await api('/friends', { username: 'Bob' }, a)).result).toBe('sent');
    expect((await api('/friends', { username: 'Bob' }, a)).result).toBe('pending');
    const n = await api('/notifications', undefined, b);
    expect(n.count).toBe(1);
    expect(n.requests[0].username).toBe('Alice');
    expect((await api('/friends/decline', { username: 'Alice' }, b)).ok).toBe(true);
    expect((await api('/notifications', undefined, b)).count).toBe(0);
    expect((await api('/duels', { username: 'Bob' }, a)).code).toBe(403); // pas encore amis
    await api('/friends', { username: 'Bob' }, a);
    expect((await api('/friends', { username: 'Alice' }, b)).result).toBe('accepted'); // il demandait aussi : amis
    expect((await api('/friends', undefined, a)).friends.map((f: { username: string }) => f.username).sort()).toEqual(['Alice', 'Bob']);
    expect((await api('/friends', undefined, b)).friends.map((f: { username: string }) => f.username).sort()).toEqual(['Alice', 'Bob']);
    // Présence : Alice vient d'utiliser l'API, elle est en ligne, sans salon.
    const al = (await api('/friends', undefined, b)).friends.find((f: { username: string }) => f.username === 'Alice');
    expect(al).toMatchObject({ online: true, room: null });
    expect(al.lastSeen).toBeGreaterThan(0);
  });

  it('invitation à une table : seulement depuis une table ouverte, acceptée ou refusée ; historique public', async () => {
    expect((await api('/invites', { username: 'Bob' }, a)).code).toBe(409);
    const sock = connect(base);
    const r = await new Promise<{ ok: boolean; code: string }>((ok) => sock.emit('room:create', { name: 'Alice', auth: a, table: { visibility: 'private', maxPlayers: 4, stake: 0 } }, ok));
    expect(r.ok).toBe(true);
    expect((await api('/invites', { username: 'Bob' }, a)).ok).toBe(true);
    expect((await api('/invites', undefined, b)).invites).toEqual([{ from: 'Alice', code: r.code }]);
    expect((await api('/invites/decline', { code: r.code }, b)).ok).toBe(true);
    expect((await api('/invites', undefined, b)).invites).toEqual([]);
    sock.close();
    expect((await api('/players/Alice/history')).games).toEqual([]);
  });

  it('défi avec mise : mêmes dés, score caché tant qu’on n’a pas joué, cagnotte au gagnant', async () => {
    const d = (await api('/duels', { username: 'Bob', stake: 25 }, a)).duel;
    expect((await api('/me', undefined, a)).profile.coins).toBe(75);
    expect((await api(`/duels/${d.id}/play`, { decisions: 'n’importe quoi' }, a)).code).toBe(400);
    const pa = await api(`/duels/${d.id}/play`, { decisions: quick }, a);
    expect(pa.duel.mine.points).toBeGreaterThan(0);
    expect((await api(`/duels/${d.id}/play`, { decisions: quick }, a)).code).toBe(409);
    const nb = await api('/notifications', undefined, b);
    expect(nb.toPlay[0]).toMatchObject({ opponent: 'Alice', theirsPlayed: true, theirs: null }); // score caché
    expect(srv.accounts.social.sent.some((x) => x.title === 'Nouveau défi !')).toBe(true);
    const pb = await api(`/duels/${d.id}/play`, { decisions: quick }, b); // mêmes décisions, mêmes dés : égalité
    expect(pb.duel.theirs.points).toBe(pa.duel.mine.points);
    expect(pb.duel.status).toBe('fini');
    expect(pb.duel.winner).toBeNull();
    expect((await api('/me', undefined, a)).profile.coins).toBe(100); // égalité : mises rendues
    expect((await api('/me', undefined, b)).profile.coins).toBe(100);
    const na = await api('/notifications', undefined, a);
    expect(na.results).toHaveLength(1);
    await api(`/duels/${d.id}/seen`, {}, a);
    expect((await api('/notifications', undefined, a)).results).toHaveLength(0);
  });

  it('défi refusé ou expiré : mise rendue', async () => {
    const d = (await api('/duels', { username: 'Bob', stake: 10 }, a)).duel;
    expect((await api('/me', undefined, a)).profile.coins).toBe(90);
    expect((await api(`/duels/${d.id}/decline`, {}, b)).ok).toBe(true);
    expect((await api('/me', undefined, a)).profile.coins).toBe(100);
    const e = (await api('/duels', { username: 'Bob', stake: 10 }, a)).duel;
    clock += 73 * 3600_000;
    expect((await api('/duels', undefined, a)).duels.find((x: { id: string }) => x.id === e.id).status).toBe('expire');
    expect((await api('/me', undefined, a)).profile.coins).toBe(100);
  });
});

describe('retour après une absence', () => {
  it('un sac de dés après 3 jours sans venir, une seule fois', async () => {
    const t = (await api('/register', { username: 'Revenant', password: 'motdepasse1' })).token;
    const first = await api('/me', undefined, t);
    expect(first.welcomeBack).toBe(false);
    const bags = first.profile.bags ?? 0;
    clock += 2 * 86400_000;
    expect((await api('/me', undefined, t)).welcomeBack).toBe(false);
    clock += 3 * 86400_000;
    const back = await api('/me', undefined, t);
    expect(back.welcomeBack).toBe(true);
    expect(back.profile.bags).toBe(bags + 1);
    expect((await api('/me', undefined, t)).welcomeBack).toBe(false);
  });
});

describe('saisons classées', () => {
  it('points selon la place parmi les humains, divisions', () => {
    expect(seasonDelta(1, 2)).toBe(25);
    expect(seasonDelta(2, 2)).toBe(-12);
    expect(seasonDelta(1, 4)).toBeGreaterThan(seasonDelta(2, 4));
    expect(seasonDelta(1, 1)).toBe(0);
    expect(divisionOf(0).id).toBe('comptoir');
    expect(divisionOf(260).id).toBe('salle');
    expect(divisionOf(9999).id).toBe('patron');
  });
  it('fin de saison : dé de saison, titre et sacs', async () => {
    clock = Date.parse('2026-11-20T12:00:00Z');
    const t = (await api('/register', { username: 'Champion', password: 'motdepasse1' })).token;
    const me = await api('/me', undefined, t);
    const uid = srv.accounts.userFromToken(t)!.id;
    for (let i = 0; i < 12; i++) srv.accounts.seasonGame([{ userId: uid, place: 1, won: true }], 2); // 12 × 25 = 300 : Salle
    const s = await api('/season', undefined, t);
    expect(s.season).toBe('2026-11');
    expect(s.me).toMatchObject({ points: 300, division: 'salle', rank: 1 });
    expect(me.profile.owned).not.toContain('ds-2026-11');
    clock = Date.parse('2026-12-02T12:00:00Z');
    const after = (await api('/me', undefined, t)).profile;
    expect(after.owned).toContain('ds-2026-11');
    expect(after.titles).toContain('saison:2026-11_salle');
    expect(titleLabel('saison:2026-11_salle')).toBe('Salle de novembre 2026');
    expect(after.bags).toBe(3); // 2 sacs de saison + 1 sac de retour (12 jours d'absence)
    expect((await api('/season', undefined, t)).me.points).toBe(0); // nouvelle saison
    expect((await api('/me', undefined, t)).profile.bags).toBe(3); // versé une seule fois
  });
});

describe('séries, secrets, happy hour, habitués', () => {
  it('une série complète donne son titre et son tapis', () => {
    const s = SERIES[0];
    const r = applySeries({ ...newProfile(), owned: [...newProfile().owned, ...s.dice.slice(0, 4), s.dice[4] + '-brillant'] });
    expect(r.done).toEqual([s.id]);
    expect(r.profile.titles).toContain(`serie:${s.id}`);
    expect(r.profile.owned).toContain(s.felt);
    expect(titleLabel(`serie:${s.id}`)).toBe(s.title);
    expect(applySeries(r.profile).done).toEqual([]);
  });
  it('succès secrets et mémoire des habitués', () => {
    const ctx = { mode: 'solo' as const, opponents: 1, count421: 3, day: '2026-06-10', hour: 0, maxTokens: 16, combos: { nenette: 3 }, opponentNames: ['Marcel'] };
    const a = applyGameEnd(newProfile(), rewardFor(true, 10, ctx), ctx, '2026-06-10', () => 0.99);
    const ids = a.achievementsDone!.map((x) => x.id);
    expect(ids).toEqual(expect.arrayContaining(['secret-triple', 'secret-nenette', 'secret-minuit', 'secret-phenix']));
    expect(a.profile.vsAi).toEqual({ Marcel: { w: 1, l: 0 } });
  });
  it('happy hour : certains jours, une heure entre 12 h et 22 h, pièces doublées', () => {
    let days = 0, found: string | null = null;
    for (let d = 1; d <= 28; d++) { const day = `2026-02-${String(d).padStart(2, '0')}`; const h = happyHourOfDay(day); if (h) { days++; found ??= day; expect(h.hour).toBeGreaterThanOrEqual(12); expect(h.hour).toBeLessThanOrEqual(21); } }
    expect(days).toBeGreaterThan(8);
    expect(days).toBeLessThan(24);
    const h = happyHourOfDay(found!)!.hour;
    const t = Date.parse(`${found}T${String(h - 1).padStart(2, '0')}:30:00Z`); // février : UTC+1
    expect(happyHour(t)).toMatchObject({ hour: h });
    const ctx = { mode: 'solo' as const, opponents: 1, count421: 0, day: '2026-06-10', minutes: 20 };
    const plain = rewardFor(true, 10, ctx).coins;
    expect(rewardFor(true, 10, { ...ctx, now: t }).coins).toBe(plain * 2);
  });
});
