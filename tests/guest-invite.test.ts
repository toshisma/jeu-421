/** Invitation à créer un compte : cadeau de bienvenue (3 sacs + 3 boosters) et reprise plafonnée de la progression d'invité. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startServer } from '../server/app';
import { CAPSULES } from '../shared/cards/catalog';
import { ITEMS } from '../shared/progress/catalog';
import { GUEST_IMPORT, WELCOME_BAGS, capGuestImport, levelInfo, newProfile, sanitizeProfile } from '../shared/progress/profile';
import { ACHIEVEMENTS } from '../shared/progress/achievements';
import { inviteDue, INVITE_COOLDOWN_MS } from '../client/src/ui/guestInvite';

const ALL_ITEMS = ITEMS.map((i) => i.id);
const HUGE = {
  xp: 999_999_999, coins: 999_999_999, prestige: 99, owned: ALL_ITEMS,
  equipped: { dice: 'dice-diamant', decor: 'decor-espace', felt: 'felt-damier' },
  titles: ['saison:2026-10_grand-cafe', 'pass:2026-10', 'ligue:or', 'patron:dede'], title: 'saison:2026-10_grand-cafe',
  season: { id: '2026-11', points: 99_999, claimed: [] },
  daily: { last: '2026-11-08', count: 999 },
  quests: { day: '2026-11-08', progress: { a: 999, b: 999, c: 999 }, claimed: [] },
  achievements: Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, 1])),
  stats: { played: 1e9, won: 1e9, total421: 1e9, onlineGames: 1e9, onlineWins: 1e9, tournamentWins: 1e9 },
  bags: 500, shards: 9999, referralBags: 3, dm: { games: 1e9, wins: 1e9, bestTurn: 25_000, bestPot: 1e9 },
};

describe('reprise de la progression d’invité (plafonds)', () => {
  it('faux profil énorme → valeurs plafonnées', () => {
    const p = capGuestImport(sanitizeProfile(HUGE));
    expect(p.coins).toBe(GUEST_IMPORT.coins);
    expect(levelInfo(p.xp).level).toBe(GUEST_IMPORT.level);
    expect(p.prestige).toBeUndefined();
    expect(p.titles).toBeUndefined();
    expect(p.title).toBeUndefined();
    expect(p.season).toBeUndefined();
    expect(p.daily).toBeUndefined();
    expect(p.quests).toBeUndefined();
    expect(p.bags).toBe(GUEST_IMPORT.bags);
    expect(p.shards).toBeUndefined();
    expect(p.referralBags).toBeUndefined();
    expect(p.dm?.bestPot).toBe(0);
    expect(Object.values(p.stats).every((v) => v <= GUEST_IMPORT.stat)).toBe(true);
    // Objets : boutique seulement (pas d'événement ni de pass), niveau atteint, budget total.
    const paid = p.owned.map((id) => ITEMS.find((i) => i.id === id)!).filter((i) => i.price > 0);
    expect(paid.every((i) => !i.pass && !i.event && i.level <= GUEST_IMPORT.level)).toBe(true);
    expect(paid.reduce((a, i) => a + i.price, 0)).toBeLessThanOrEqual(GUEST_IMPORT.shopBudget);
    expect(p.owned).not.toContain('dice-diamant');
    expect(p.equipped.dice).not.toBe('dice-diamant');
  });
  it('un vrai joueur invité garde ce qu’il a gagné normalement', () => {
    const honest = sanitizeProfile({ ...newProfile(), xp: 900, coins: 140, owned: [...newProfile().owned, 'felt-bordeaux', 'dice-noir'],
      equipped: { ...newProfile().equipped, felt: 'felt-bordeaux' }, bags: 2, stats: { ...newProfile().stats, played: 40, won: 15 }, tutorial: 1 });
    const p = capGuestImport(honest);
    expect(p).toMatchObject({ xp: 900, coins: 140, bags: 2, tutorial: 1 });
    expect(p.owned).toEqual(expect.arrayContaining(['felt-bordeaux', 'dice-noir']));
    expect(p.equipped.felt).toBe('felt-bordeaux');
    expect(p.stats.played).toBe(40);
  });
});

describe('fenêtre « Créez un compte » : règles d’affichage', () => {
  it('jamais pour un compte, ni sans serveur ; pas deux fois en moins de 2 minutes', () => {
    const t = 1_000_000;
    expect(inviteDue({ isAccount: false, server: true, lastClosed: 0, now: t })).toBe(true);
    expect(inviteDue({ isAccount: true, server: true, lastClosed: 0, now: t })).toBe(false);
    expect(inviteDue({ isAccount: false, server: false, lastClosed: 0, now: t })).toBe(false);
    expect(inviteDue({ isAccount: false, server: true, lastClosed: t - 30_000, now: t })).toBe(false);
    expect(inviteDue({ isAccount: false, server: true, lastClosed: t - INVITE_COOLDOWN_MS, now: t })).toBe(true);
  });
});

describe('inscription : cadeau de bienvenue et plafonds (serveur)', () => {
  let srv: Awaited<ReturnType<typeof startServer>>;
  let base = '';
  beforeAll(async () => {
    srv = await startServer({ port: 0, dbPath: ':memory:', accounts: { minSoloMs: 0, authAttempts: 1000 } });
    base = `http://localhost:${srv.port}`;
  });
  afterAll(async () => { await srv.close(); });
  const api = async (path: string, body?: object, token?: string) => {
    const r = await fetch(`${base}/api${path}`, { method: body ? 'POST' : 'GET', body: body ? JSON.stringify(body) : undefined,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
    return { status: r.status, ...(await r.json()) };
  };

  it('nouveau compte : 3 sacs de dés, puis 3 boosters à la découverte de Coups Fourrés (une seule fois)', async () => {
    const r = await api('/register', { username: 'Nouveau', password: 'motdepasse1' });
    expect(r.ok).toBe(true);
    expect(r.profile.bags).toBe(WELCOME_BAGS);
    expect(r.welcome).toEqual({ bags: 3, boosters: 3 });
    expect((await api('/me', undefined, r.token)).profile.bags).toBe(3); // pas de second cadeau
    const d = await api('/cf/discover', {}, r.token);
    expect(d.boosters).toBe(CAPSULES.welcomeBoosters);
    expect(d.state.boosters).toBe(3);
    expect((await api('/cf/discover', {}, r.token)).status).toBe(409);
    expect((await api('/bags/open', {}, r.token)).profile.bags).toBe(2);
    expect((await api('/cf/booster/open', {}, r.token)).cards).toHaveLength(5);
  });

  it('les sacs de bienvenue s’ajoutent aux sacs gardés en invité', async () => {
    const r = await api('/register', { username: 'Garde', password: 'motdepasse1', guestProfile: { ...newProfile(), bags: 4 } });
    expect(r.profile.bags).toBe(7);
  });

  it('inscription avec un faux profil invité énorme → valeurs plafonnées', async () => {
    const r = await api('/register', { username: 'Tricheur2', password: 'motdepasse1', guestProfile: HUGE });
    expect(r.ok).toBe(true);
    expect(r.profile.coins).toBe(GUEST_IMPORT.coins);
    expect(levelInfo(r.profile.xp).level).toBeLessThanOrEqual(GUEST_IMPORT.level);
    expect(r.profile.prestige ?? 0).toBe(0);
    expect(r.profile.titles ?? []).toEqual([]);
    expect(r.profile.season?.points ?? 0).toBe(0);
    expect(r.profile.bags).toBe(GUEST_IMPORT.bags + WELCOME_BAGS);
    expect(r.profile.owned).not.toContain('dice-diamant');
    const me = await api('/me', undefined, r.token);
    expect(me.profile.coins).toBe(GUEST_IMPORT.coins);
  });
});
