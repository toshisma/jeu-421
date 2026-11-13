/** Album, patron de la semaine, récap, prestige, mode arbitre, soirée sur un téléphone, clubs. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  ALBUM, ALBUM_KEYS, applyAlbum, applyGameEnd, canBuy, doPrestige, newProfile, recordMonth, rewardFor, sanitizeProfile, titleLabel,
} from '../shared/progress/profile';
import { BOSSES, bossOfWeek, weekKey } from '../shared/progress/boss';
import { getItem } from '../shared/progress/catalog';
import { DEFAULT_CONFIG } from '../shared/config';
import { createGame, currentPlayerId } from '../shared/engine';
import { PartyController, refereeTurn } from '../client/src/game/party';
import { solo421 } from './rejeu-helpers';
import { startServer } from '../server/app';

describe('album des combinaisons', () => {
  it('pages, récompenses et album complet', () => {
    let p = newProfile();
    let r = applyAlbum(p, ['421', '111', '999', '421']);
    expect(r.profile.album).toEqual(['421', '111']);
    expect(r.done.map((d) => d.id)).toEqual(['album-grands']);
    expect(r.profile.coins).toBe(30);
    p = r.profile;
    r = applyAlbum(p, ALBUM_KEYS);
    expect(r.profile.albumPages?.length).toBe(ALBUM.length);
    expect(r.profile.owned).toContain('dice-album');
    expect(titleLabel('album:complet')).toBe('Collectionneur de combinaisons');
    expect(sanitizeProfile(JSON.parse(JSON.stringify(r.profile))).album?.length).toBe(ALBUM_KEYS.length);
    expect(applyAlbum(r.profile, ['421']).done).toEqual([]);
  });
});

describe('patron de la semaine', () => {
  it('change chaque lundi, récompense une fois par semaine', () => {
    expect(weekKey('2026-11-04')).toBe('2026-11-02');
    expect(weekKey('2026-11-08')).toBe('2026-11-02');
    expect(bossOfWeek('2026-11-02').id).toBe(bossOfWeek('2026-11-08').id);
    expect(bossOfWeek('2026-11-02').id).not.toBe(bossOfWeek('2026-11-09').id);
    const b = bossOfWeek('2026-11-04');
    const ctx = { mode: 'solo' as const, opponents: 1, count421: 0, day: '2026-11-04', boss: b.id };
    const win = rewardFor(true, 10, ctx);
    const a1 = applyGameEnd(newProfile(), win, ctx, '2026-11-04');
    expect(a1.profile.stats.bossWins).toBe(1);
    expect(a1.profile.titles).toContain(`patron:${b.id}`);
    expect(a1.achievementsDone?.some((x) => x.id.startsWith('patron-'))).toBe(true);
    const a2 = applyGameEnd(a1.profile, win, ctx, '2026-11-05');
    expect(a2.profile.stats.bossWins).toBe(1); // une fois par semaine
    const wrong = applyGameEnd(newProfile(), win, { ...ctx, boss: 'pas-le-bon' }, '2026-11-04');
    expect(wrong.profile.stats.bossWins).toBe(0);
  });
  it('aucun patron ne touche aux dés : seulement aux règles', () => {
    for (const b of BOSSES) expect('luck' in b).toBe(false);
  });
});

describe('récap et prestige', () => {
  it('le récap du mois bascule au mois suivant', () => {
    const r = rewardFor(true, 10, { mode: 'solo', opponents: 1, count421: 1, day: '2026-06-10' });
    let p = recordMonth(newProfile(), r, { mode: 'solo', opponents: 1, count421: 1, opponentNames: ['Marcel'], hour: 21, best: { label: '421', rank: 1000 } }, '2026-11-20');
    p = recordMonth(p, r, { mode: 'solo', opponents: 1, count421: 0, opponentNames: ['Marcel'], hour: 21 }, '2026-11-21');
    expect(p.month).toMatchObject({ id: '2026-11', played: 2, won: 2, c421: 1, best: { label: '421' }, opp: { Marcel: 2 } });
    expect(p.month!.hours[21]).toBe(2);
    p = recordMonth(p, r, { mode: 'solo', opponents: 1, count421: 0, hour: 9 }, '2026-12-01');
    expect(p.prevMonth?.id).toBe('2026-11');
    expect(p.month?.played).toBe(1);
  });
  it('prestige au niveau 30 : niveau à 1, boutique sans niveau requis', () => {
    expect(doPrestige(newProfile())).toBeNull();
    const big = { ...newProfile(), xp: 10_000_000, coins: 10 };
    const p = doPrestige(big)!;
    expect(p.xp).toBe(0);
    expect(p.prestige).toBe(1);
    expect(p.coins).toBe(70);
    expect(canBuy({ ...p, coins: 99999 }, getItem('dice-diamant')).ok).toBe(true);
    expect(canBuy({ ...newProfile(), coins: 99999 }, getItem('dice-diamant')).ok).toBe(false);
  });
});

describe('soirée', () => {
  it('arbitre : vrais dés saisis, mêmes règles qu’à l’écran', () => {
    const s = createGame({ ...DEFAULT_CONFIG, totalTokens: 21 }, [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], 0);
    expect(refereeTurn(s, [4, 2, 1], 1)).toBeNull();
    expect(currentPlayerId(s)).toBe('b');
    expect(refereeTurn(s, [6, 5, 3], 1)).toBeNull();
    // B a la plus faible combinaison : il prend les 8 jetons du 4-2-1 dans le pot.
    expect(s.players.find((p) => p.id === 'b')!.tokens).toBe(8);
    expect(s.pot).toBe(13);
    expect(refereeTurn(s, [0, 2, 1], 1)).toBe('Indiquez les trois dés');
    let guard = 0;
    while (s.phase !== 'fini' && guard++ < 50) refereeTurn(s, currentPlayerId(s) === 'a' ? [4, 2, 1] : [6, 5, 3], 2);
    expect(s.phase).toBe('fini');
  });
  it('un seul téléphone : « moi », c’est le joueur dont c’est le tour', async () => {
    const c = new PartyController({ ...DEFAULT_CONFIG, turnSeconds: 0 }, ['Léa', 'Sam', 'Max']);
    const first = c.meId;
    expect(['j0', 'j1', 'j2']).toContain(first);
    await c.roll([false, false, false], c.current().version);
    if (c.current().throwsUsed > 0) await c.stop(c.current().version);
    expect(c.meId).not.toBe(first);
    expect(c.getMeta().filter((m) => m.isMe).length).toBe(1);
  });
});

let srv: Awaited<ReturnType<typeof startServer>>;
let base = '';
beforeAll(async () => { srv = await startServer({ port: 0, dbPath: ':memory:', accounts: { authAttempts: 1000, minSoloMs: 0, soloDailyCap: 1000 } }); base = `http://localhost:${srv.port}`; });
afterAll(async () => { await srv.close(); });
const call = async (path: string, body?: object, token?: string) => {
  const r = await fetch(`${base}/api${path}`, { method: body ? 'POST' : 'GET', body: body ? JSON.stringify(body) : undefined,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
  return { status: r.status, ...(await r.json()) };
};

describe('clubs', () => {
  it('fonder, rejoindre, coffre de la semaine, discussion en phrases rapides', async () => {
    const a = await call('/register', { username: 'Club1', password: 'motdepasse1', guestProfile: { coins: 150 } });
    const b = await call('/register', { username: 'Club2', password: 'motdepasse1' });
    expect((await call('/clubs', { name: 'Le Pot au Lait', emblem: '🍺' }, b.token)).status).toBe(400); // pas assez de pièces
    const c = await call('/clubs', { name: 'Le Pot au Lait', emblem: '🍺' }, a.token);
    expect(c.ok).toBe(true);
    expect(c.profile.coins).toBe(50);
    expect((await call('/clubs', { name: 'le pot au lait' }, a.token)).status).toBe(400); // déjà dans un club
    const list = await call('/clubs?q=Pot', undefined, b.token);
    expect(list.top[0]).toMatchObject({ name: 'Le Pot au Lait', members: 1 });
    expect((await call('/clubs/join', { id: c.club.id }, b.token)).club.members.length).toBe(2);
    // Une victoire de B remplit le coffre du club.
    await solo421(call as any, b.token, { want: 'win' }); // vraie victoire (rejouée par le serveur)
    const mine = (await call('/clubs', undefined, a.token)).mine;
    expect(mine.wins).toBe(1);
    expect(mine.members[0]).toMatchObject({ username: 'Club2', wins: 1 });
    expect((await call('/clubs/chat', { phrase: 'texte libre' }, a.token)).status).toBe(400);
    expect((await call('/clubs/chat', { phrase: 'Santé !' }, a.token)).club.chat[0]).toMatchObject({ username: 'Club1', phrase: 'Santé !' });
    // Le fondateur part : le club passe à B ; B part : le club disparaît.
    await call('/clubs/leave', {}, a.token);
    expect((await call('/clubs', undefined, b.token)).mine.members[0].owner).toBe(true);
    await call('/clubs/leave', {}, b.token);
    expect((await call('/clubs?q=Pot', undefined, b.token)).top).toEqual([]);
  });
});
