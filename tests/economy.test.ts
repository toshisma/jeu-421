import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS } from '../shared/progress/achievements';
import { BAG_PRICE, buyBag, checkAchievements, newProfile, REWARDS } from '../shared/progress/profile';
import { challengeReward } from '../shared/challenge';
import { collectionDie } from '../shared/progress/dice-collection';

describe('économie rééquilibrée', () => {
  it('succès : 2 500 pièces au total, sacs pour les difficiles, dé exclusif pour le catalogue complet', () => {
    expect(ACHIEVEMENTS.reduce((n, a) => n + a.coins, 0)).toBe(2500);
    expect(ACHIEVEMENTS.filter((a) => a.bags).length).toBe(11);
    expect(ACHIEVEMENTS.find((a) => a.id === 'premiere-victoire')!.coins).toBe(10);
    const cat = ACHIEVEMENTS.find((a) => a.id === 'collection-tout')!;
    expect(cat.coins).toBe(300);
    expect(collectionDie(cat.item!)?.rarity).toBe('legendaire');
    // « 10 tournois gagnés » et « 50 tournois terminés » ne sont plus incohérents
    expect(ACHIEVEMENTS.find((a) => a.id === 'tournoi-50')!.coins).toBeGreaterThanOrEqual(ACHIEVEMENTS.find((a) => a.id === 'tournoi-10')!.coins);
  });
  it('un succès difficile verse son sac une seule fois', () => {
    const p = { ...newProfile(), stats: { ...newProfile().stats, played: 600, won: 250 } };
    const a = checkAchievements(p);
    expect((a.profile.bags ?? 0)).toBeGreaterThanOrEqual(2); // pilier-500 et gagnant-200
    const b = checkAchievements(a.profile);
    expect(b.unlocked).toHaveLength(0);
    expect(b.profile.bags).toBe(a.profile.bags);
    expect(b.profile.coins).toBe(a.profile.coins);
  });
  it('sac en boutique : 150 pièces, un par jour', () => {
    const p = { ...newProfile(), coins: 400 };
    const a = buyBag(p, '2026-11-06')!;
    expect(a.coins).toBe(400 - BAG_PRICE);
    expect(a.bags).toBe((p.bags ?? 0) + 1);
    expect(buyBag(a, '2026-11-06')).toBeNull();
    expect(buyBag(a, '2026-11-07')).not.toBeNull();
    expect(buyBag({ ...newProfile(), coins: 100 }, '2026-11-06')).toBeNull();
  });
  it('défi du jour : la moitié des points ; bonus en ligne ×1,5', () => {
    expect(challengeReward(40).coins).toBe(30);
    expect(REWARDS.online).toBe(1.5);
  });
});
