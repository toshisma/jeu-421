/** Dés de collection : sacs, ouverture, éclats, fabrication, vitrine, lisibilité, serveur. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ITEMS } from '../shared/progress/catalog';
import { COLLECTION, CRAFT_COST, RARITY_ODDS, SHINY_SUFFIX, contrast } from '../shared/progress/dice-collection';
import {
  BAG_PITY, applyGameEnd, bagChance, craftDie, newProfile, openBag, rewardFor, sanitizeProfile, setShowcase, type Profile,
} from '../shared/progress/profile';
import { startServer } from '../server/app';
import { io as connect } from 'socket.io-client';
import type { PublicRoom } from '../shared/protocol';

const ctx = { mode: 'solo' as const, opponents: 1, count421: 0, day: '2026-06-10', minutes: 12 };
const seq = (...v: number[]) => { let i = 0; return () => v[i++ % v.length]; };

describe('dés de collection', () => {
  it('tous les dés sont lisibles : points bien contrastés sur le dé', () => {
    for (const it of ITEMS) if (it.category === 'dice') {
      expect(contrast(it.pip, it.body), it.id).toBeGreaterThanOrEqual(4);
      expect(contrast(it.pip, it.body2), it.id).toBeGreaterThanOrEqual(4);
    }
  });

  it('25 dés en 4 raretés, chacun avec sa version brillante, jamais en vente', () => {
    expect(COLLECTION).toHaveLength(25);
    for (const c of COLLECTION) {
      const a = ITEMS.find((i) => i.id === c.id)!, b = ITEMS.find((i) => i.id === c.id + SHINY_SUFFIX)!;
      expect(a && b).toBeTruthy();
      expect(a.price).toBe(0);
      expect(a.pass).toBe(1);
    }
    expect(Object.values(RARITY_ODDS).reduce((x, y) => x + y, 0)).toBeCloseTo(1, 10);
  });

  it('sac trouvé en fin de partie : au hasard, et garanti au bout de 10 parties', () => {
    const r = rewardFor(true, 10, ctx);
    expect(bagChance(r, ctx)).toBeCloseTo(0.22 * 1, 5);
    expect(bagChance(rewardFor(false, 10, ctx), ctx)).toBeLessThan(bagChance(r, ctx));
    let p = newProfile();
    for (let i = 0; i < BAG_PITY - 1; i++) p = applyGameEnd(p, r, ctx, '2026-06-10', () => 0.99).profile;
    expect(p.bags ?? 0).toBe(0);
    const a = applyGameEnd(p, r, ctx, '2026-06-10', () => 0.99);
    expect(a.bagsFound).toBe(1);
    expect(a.profile.bags).toBe(1);
    expect(a.profile.pity).toBe(0);
    expect(applyGameEnd(newProfile(), r, ctx, '2026-06-10', () => 0).bagsFound).toBe(1);
    // Mort subite : rien.
    expect(applyGameEnd(newProfile(), r, { ...ctx, suddenDeath: true }, '2026-06-10', () => 0).bagsFound).toBeUndefined();
  });

  it('les raretés sortent à leur fréquence annoncée', () => {
    const N = 40_000;
    const n: Record<string, number> = {};
    let p: Profile = { ...newProfile(), bags: N };
    for (let i = 0; i < N; i++) {
      const r = openBag({ ...p, bags: 1, owned: [] })!;
      n[r.result.rarity] = (n[r.result.rarity] ?? 0) + 1;
    }
    for (const [k, v] of Object.entries(RARITY_ODDS)) expect(Math.abs(n[k] / N - v)).toBeLessThan(0.012);
    p = { ...p, bags: 0 };
    expect(openBag(p)).toBeNull();
  });

  it('doublon → éclats ; fabrication avec les éclats ; brillant non fabricable', () => {
    let p: Profile = { ...newProfile(), bags: 2 };
    const r1 = openBag(p, seq(0.9, 0, 0, 0.5))!; // un dé (pas un effet), commun, premier de la liste, pas brillant
    expect(r1.result).toMatchObject({ id: 'dc-craie', rarity: 'commun', duplicate: false, shards: 0 });
    const r2 = openBag(r1.profile, seq(0.9, 0, 0, 0.5))!;
    expect(r2.result).toMatchObject({ duplicate: true, shards: 5 });
    p = { ...r2.profile, shards: CRAFT_COST.rare };
    expect(craftDie(p, 'dc-galaxie')).toBeNull(); // épique : pas assez
    const c = craftDie(p, 'dc-grenat')!;
    expect(c.owned).toContain('dc-grenat');
    expect(c.shards).toBe(0);
    expect(craftDie({ ...p, shards: 99999 }, 'dc-grenat' + SHINY_SUFFIX)).toBeNull();
    const shiny = openBag({ ...newProfile(), bags: 1 }, seq(0.9, 0.999, 0, 0))!;
    expect(shiny.result).toMatchObject({ rarity: 'legendaire', shiny: true });
    expect(shiny.profile.owned).toContain(shiny.result.id);
  });

  it('vitrine : 3 dés possédés au plus ; le profil chargé est réparé', () => {
    const p = { ...newProfile(), owned: [...newProfile().owned, 'dc-craie', 'dc-dragon'] };
    expect(setShowcase(p, ['dc-craie', 'dc-dragon'])!.showcase).toEqual(['dc-craie', 'dc-dragon']);
    expect(setShowcase(p, ['dc-aurore'])).toBeNull();
    expect(setShowcase(p, ['dc-craie', 'dc-craie', 'dc-dragon', 'dc-craie'])).toBeNull();
    const s = sanitizeProfile({ ...p, bags: 5, shards: 30, showcase: ['dc-craie', 'dc-aurore'], equipped: { ...p.equipped, dice: 'dc-dragon' } });
    expect(s).toMatchObject({ bags: 5, shards: 30, showcase: ['dc-craie'] });
    expect(s.equipped.dice).toBe('dc-dragon');
  });
});

describe('dés de collection : serveur', () => {
  let srv: Awaited<ReturnType<typeof startServer>>;
  let base = '';
  beforeAll(async () => { srv = await startServer({ port: 0, dbPath: ':memory:', accounts: { minSoloMs: 50, authAttempts: 1000 } }); base = `http://localhost:${srv.port}`; });
  afterAll(async () => { await srv.close(); });
  const api = async (path: string, body?: object, token?: string) => {
    const r = await fetch(`${base}/api${path}`, { method: body ? 'POST' : 'GET', body: body ? JSON.stringify(body) : undefined,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
    return { status: r.status, ...(await r.json()) };
  };

  it('un invité ne peut pas apporter de faux dés rares à l’inscription', async () => {
    const r = await api('/register', { username: 'Tricheur', password: 'motdepasse1',
      guestProfile: { owned: ['dc-aurore', 'dc-aurore-brillant', 'dice-noir'], equipped: { dice: 'dc-aurore' }, bags: 500, shards: 9999 } });
    expect(r.profile.owned).not.toContain('dc-aurore');
    expect(r.profile.equipped.dice).toBe('dice-ivoire');
    expect(r.profile.bags).toBe(10);
    expect(r.profile.shards ?? 0).toBe(0);
  });

  it('ouverture sur le serveur, vitrine visible sur le profil public', async () => {
    const r = await api('/register', { username: 'Collec', password: 'motdepasse1', guestProfile: { bags: 10 } });
    expect((await api('/bags/open', {})).status).toBe(401);
    let o = await api('/bags/open', {}, r.token);
    expect(o.ok).toBe(true);
    expect(o.profile.owned).toContain(o.result.id);
    expect(o.profile.bags).toBe(9);
    let fx: string | null = o.result.kind === 'effet' ? o.result.id : null;
    while (o.result.kind !== 'de') { o = await api('/bags/open', {}, r.token); if (o.result.kind === 'effet') fx = o.result.id; }
    expect((await api('/shop/equip', { id: o.result.id }, r.token)).profile.equipped.dice).toBe(o.result.id);
    let left = o.profile.bags;
    while (left > 0) { const x = await api('/bags/open', {}, r.token); left = x.profile.bags; if (x.result.kind === 'effet') fx = x.result.id; }
    expect((await api('/bags/open', {}, r.token)).status).toBe(400);
    if (fx) {
      const kind = fx.startsWith('fx-') && ['fx-bravo', 'fx-ballons', 'fx-eclair', 'fx-pluie-or', 'fx-feu-artifice'].includes(fx) ? 'fete' : 'trainee';
      expect((await api('/collection/fx', { kind, id: fx }, r.token)).profile.fx[kind]).toBe(fx);
    }
    expect((await api('/collection/fx', { kind: 'trainee', id: 'fx-arc-en-ciel' }, r.token)).status).toBe(fx === 'fx-arc-en-ciel' ? 200 : 400);
    expect((await api('/collection/showcase', { ids: [o.result.id] }, r.token)).profile.showcase).toEqual([o.result.id]);
    expect((await api('/collection/showcase', { ids: ['dc-aurore'] }, r.token)).status).toBe(400);
    const pub = await api('/players/Collec');
    expect(pub.player.showcase).toEqual([o.result.id]);
    expect(pub.player.collection.owned).toBeGreaterThanOrEqual(1);
  });

  it('en ligne : les autres voient les dés du joueur (invité : boutique seulement)', async () => {
    const mk = () => new Promise<{ s: ReturnType<typeof connect>; room: PublicRoom | null }>((res) => {
      const c = { s: connect(base, { transports: ['websocket'], forceNew: true }), room: null as PublicRoom | null };
      c.s.on('room:state', (r: PublicRoom) => (c.room = r));
      c.s.on('connect', () => res(c));
    });
    const emit = (c: { s: ReturnType<typeof connect> }, ev: string, p: object) => new Promise<any>((res) => c.s.emit(ev, p, res)); // eslint-disable-line @typescript-eslint/no-explicit-any
    const reg = await api('/register', { username: 'Montreur', password: 'motdepasse1', guestProfile: { bags: 10 } });
    let o = await api('/bags/open', {}, reg.token);
    while (o.result.kind !== 'de') o = await api('/bags/open', {}, reg.token); // un sac sur quatre contient un effet
    await api('/shop/equip', { id: o.result.id }, reg.token);
    const a = await mk(), b = await mk(), g = await mk();
    const r = await emit(a, 'room:create', { name: 'Montreur', avatar: '🐻', auth: reg.token, dice: 'dice-noir', table: { stake: 0 } });
    await emit(b, 'room:join', { code: r.code, name: 'Invité', dice: 'dc-aurore' });
    await emit(g, 'room:join', { code: r.code, name: 'Noiraud', dice: 'dice-noir' });
    const t = Date.now(); while ((a.room?.members.length ?? 0) < 3 && Date.now() - t < 5000) await new Promise((x) => setTimeout(x, 20));
    const by = (n: string) => a.room!.members.find((m) => m.name === n)!;
    expect(by('Montreur').dice).toBe(o.result.id); // lu sur le compte, pas sur ce qu'annonce le navigateur
    expect(by('Invité').dice).toBeUndefined(); // un invité ne peut pas afficher un dé de collection
    expect(by('Noiraud').dice).toBe('dice-noir');
    a.s.disconnect(); b.s.disconnect(); g.s.disconnect();
  });
});
