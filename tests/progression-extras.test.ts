/** Série de connexions, pass de saison, titres, événements et boutique d'événement. */
import { describe, expect, it } from 'vitest';
import {
  passThreshold, availableTitles, buy, canBuy, claimDaily, claimPassTier, completeTutorial, dailyStatus, newProfile, rewardFor,
  sanitizeProfile, seasonOf, setTitle, addSeasonPoints, titleLabel,
} from '../shared/progress/profile';
import { activeEvent, coinBoost } from '../shared/progress/events';
import { getItem, ITEMS } from '../shared/progress/catalog';

describe('série de connexions', () => {
  it('avance chaque jour, repart à 1 après un trou, coffre au 7e jour', () => {
    let p = newProfile();
    const days = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08'];
    let coins = 0;
    for (const d of days) { const r = claimDaily(p, d)!; p = r.profile; coins += r.coins; }
    expect(p.daily).toEqual({ last: '2026-11-08', count: 7 });
    expect(coins).toBe(3 + 5 + 7 + 8 + 10 + 12 + 40);
    expect(claimDaily(p, '2026-11-08')).toBeNull();
    expect(dailyStatus(p, '2026-11-10')).toMatchObject({ count: 1, cycleDay: 1, canClaim: true });
    expect(dailyStatus(p, '2026-11-09')).toMatchObject({ count: 8, cycleDay: 1 });
  });
});

describe('pass de saison', () => {
  it('points du mois, paliers, objets et titre, remise à zéro le mois suivant', () => {
    let p = addSeasonPoints(newProfile(), passThreshold(20), '2026-11-15');
    expect(claimPassTier(p, 21, '2026-11-15')).toBeNull();
    for (let t = 1; t <= 20; t++) p = claimPassTier(p, t, '2026-11-15')!.profile;
    expect(p.owned).toContain('dice-pass-opale');
    expect(p.owned).toContain('acc-pass-feu');
    expect(availableTitles(p)).toContain('pass:2026-11');
    expect(titleLabel('pass:2026-11')).toBe('Champion de novembre 2026');
    expect(claimPassTier(p, 3, '2026-11-15')).toBeNull();
    expect(seasonOf(p, '2026-12-01')).toEqual({ id: '2026-12', points: 0, claimed: [] });
    // Survit à la sauvegarde.
    expect(sanitizeProfile(JSON.parse(JSON.stringify(p))).season?.claimed.length).toBe(20);
    // Les objets du pass ne s'achètent pas et ne sont pas offerts d'office.
    expect(newProfile().owned).not.toContain('dice-pass-cuivre');
    expect(canBuy({ ...newProfile(), coins: 9999 }, getItem('dice-pass-opale')).ok).toBe(false);
  });
});

describe('titres et partie guidée', () => {
  it('seuls les titres débloqués peuvent être choisis', () => {
    const p = { ...newProfile(), achievements: { 'premier-421': 1 } };
    expect(setTitle(p, 'gagnant-200')).toBeNull();
    expect(setTitle(p, 'premier-421')!.title).toBe('premier-421');
    expect(titleLabel('premier-421')).toBe('Le coup parfait');
    expect(setTitle(p, null)!.title).toBeUndefined();
    const t = completeTutorial(newProfile())!;
    expect(t.coins).toBe(50);
    expect(completeTutorial(t)).toBeNull();
  });
});

describe('événements', () => {
  it('calendrier liégeois et pièces boostées', () => {
    expect(activeEvent('2026-11-02')?.id).toBe('halloween');
    expect(activeEvent('2026-08-15')?.id).toBe('outremeuse');
    expect(activeEvent('2026-12-05')?.id).toBe('saint-nicolas');
    expect(activeEvent('2027-01-01')?.id).toBe('fetes');
    expect(activeEvent('2026-09-20')?.id).toBe('wallonie'); // 3e dimanche de septembre 2026
    expect(activeEvent('2027-02-09')?.id).toBe('carnaval'); // mardi gras 2027
    expect(activeEvent('2026-06-10')).toBeNull();
    expect(coinBoost('2026-11-02')?.factor).toBe(1.5); // lundi, Halloween
    expect(coinBoost('2026-11-01')?.factor).toBe(2); // dimanche, Halloween
    expect(coinBoost('2026-06-06')?.factor).toBe(2); // premier week-end de juin
    expect(coinBoost('2026-06-10')).toBeNull();
    const base = rewardFor(true, 10, { mode: 'solo', opponents: 1, count421: 0, day: '2026-06-10' });
    const boosted = rewardFor(true, 10, { mode: 'solo', opponents: 1, count421: 0, day: '2026-06-06' });
    expect(boosted.coins).toBe(base.coins * 2);
  });
  it('objets d’événement en vente seulement pendant l’événement', () => {
    const p = { ...newProfile(), coins: 5000 };
    expect(canBuy(p, getItem('dice-citrouille'), '2026-11-02').ok).toBe(true);
    expect(canBuy(p, getItem('dice-citrouille'), '2026-11-20')).toEqual({ ok: false, reason: 'event' });
    expect(buy(p, 'acc-citrouille', '2026-10-30')!.owned).toContain('acc-citrouille');
    for (const it of ITEMS.filter((i) => i.event)) expect(['halloween', 'saint-nicolas', 'fetes', 'carnaval', 'outremeuse', 'wallonie']).toContain(it.event);
  });
});

describe('mort subite', () => {
  it('récompense divisée par dix, rien ne compte pour la progression', async () => {
    const { applyGameEnd, REWARDS: R } = await import('../shared/progress/profile');
    const ctx = { mode: 'solo' as const, opponents: 3, difficulty: 'difficile' as const, count421: 2, day: '2026-06-06', suddenDeath: true };
    const r = rewardFor(true, 1, ctx);
    const full = rewardFor(true, R.fullLengthRounds, { ...ctx, suddenDeath: false, count421: 0, day: '2026-06-10' });
    expect(r.coins).toBe(Math.round(full.coins / 10));
    expect(r.xp).toBe(Math.round(full.xp / 10));
    const p = newProfile();
    const a = applyGameEnd(p, r, ctx, '2026-06-06');
    expect(a.profile.stats).toEqual(p.stats);
    expect(a.profile.season).toBeUndefined();
    expect(a.profile.coins).toBe(r.coins);
  });
});
