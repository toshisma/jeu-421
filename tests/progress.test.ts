import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../shared/config';
import { createGame, currentPlayerId, rollAction, stopAction, type GameState } from '../shared/engine';
import { decide } from '../shared/ai';
import { mulberry32 } from '../shared/rng';
import { ITEMS, getItem, resolveAppearance } from '../shared/progress/catalog';
import { TRAY_SHAPES } from '../client/src/physics/trayShapes';
import {
  applyReward, buy, canBuy, computeReward, equip, levelInfo, newProfile, sanitizeProfile, xpToNext,
} from '../shared/progress/profile';

function finishedGame(seed: number, n = 4): GameState {
  const rng = mulberry32(seed);
  const s = createGame(DEFAULT_CONFIG, Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `J${i}` })));
  while (s.phase !== 'fini') {
    const id = currentPlayerId(s)!;
    const d = decide(s, id, 'normal', rng);
    if (d.kind === 'roll') rollAction(s, id, d.keep, () => 1 + Math.floor(rng() * 6)); else stopAction(s, id);
  }
  return s;
}

describe('niveaux', () => {
  it('courbe d’XP', () => {
    expect(levelInfo(0)).toEqual({ level: 1, into: 0, need: 120 });
    expect(levelInfo(119).level).toBe(1);
    expect(levelInfo(120).level).toBe(2);
    expect(levelInfo(120 + xpToNext(2)).level).toBe(3);
    // De plus en plus long : chaque niveau demande plus que le précédent.
    for (let l = 1; l < 30; l++) expect(xpToNext(l + 1)).toBeGreaterThan(xpToNext(l));
  });
});

describe('récompenses', () => {
  it('le gagnant reçoit plus que les autres, la difficulté et les adversaires comptent', () => {
    const s = finishedGame(42);
    const winner = s.ranking[0];
    const loser = s.ranking[s.ranking.length - 1];
    const ctx = { mode: 'solo' as const, opponents: 3, difficulty: 'normal' as const, count421: 0, day: '2026-06-10' };
    const w = computeReward(s, winner, ctx);
    const l = computeReward(s, loser, ctx);
    expect(w.won).toBe(true);
    expect(l.won).toBe(false);
    expect(w.coins).toBeGreaterThan(l.coins);
    expect(computeReward(s, winner, { ...ctx, difficulty: 'difficile' }).coins).toBeGreaterThan(w.coins);
    expect(computeReward(s, winner, { ...ctx, difficulty: 'facile' }).coins).toBeLessThan(w.coins);
    expect(computeReward(s, winner, { ...ctx, opponents: 1 }).coins).toBeLessThan(w.coins);
    // Bonus 421 plafonné
    expect(computeReward(s, loser, { ...ctx, count421: 50 }).coins).toBe(l.coins + 15); // plafonné à 3 × 5
  });

  it('pas de récompense pour une partie non terminée', () => {
    const s = createGame(DEFAULT_CONFIG, [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }]);
    expect(computeReward(s, 'a', { mode: 'solo', opponents: 1, count421: 0 }).xp).toBe(0);
  });

  it('montée de niveau : bonus de pièces', () => {
    const p = { ...newProfile(), xp: 90 };
    const a = applyReward(p, { won: true, xp: 300, coins: 50, lines: [] }, 1);
    expect(a.levelBefore).toBe(1);
    expect(a.levelAfter).toBe(levelInfo(390).level);
    expect(a.levelBonusCoins).toBeGreaterThan(0);
    expect(a.profile.coins).toBe(50 + a.levelBonusCoins);
    expect(a.profile.stats).toMatchObject({ played: 1, won: 1, total421: 1 });
  });
});

describe('boutique', () => {
  it('achat : prix, niveau requis, déjà possédé', () => {
    const p = newProfile();
    const rouge = getItem('dice-rouge')!; // niveau 2
    expect(canBuy({ ...p, coins: 1000 }, rouge)).toEqual({ ok: false, reason: 'level' });
    const lvl2 = { ...p, xp: 120 };
    expect(canBuy({ ...lvl2, coins: 10 }, rouge)).toEqual({ ok: false, reason: 'coins' });
    const bought = buy({ ...lvl2, coins: 1000 }, 'dice-rouge')!;
    expect(bought.coins).toBe(1000 - rouge.price);
    expect(bought.owned).toContain('dice-rouge');
    expect(buy(bought, 'dice-rouge')).toBeNull();
    expect(equip(p, 'dice-rouge')).toBeNull();
    expect(equip(bought, 'dice-rouge')!.equipped.dice).toBe('dice-rouge');
  });

  it('profil corrompu ou modifié : réparé', () => {
    const p = sanitizeProfile({ xp: -5, coins: 'beaucoup', owned: ['inexistant', 'felt-noir'], equipped: { dice: 'dice-or', felt: 'felt-noir' } });
    expect(p.xp).toBe(0);
    expect(p.coins).toBe(0);
    expect(p.owned).not.toContain('inexistant');
    expect(p.equipped.dice).toBe('dice-ivoire'); // non possédé → par défaut
    expect(p.equipped.felt).toBe('felt-noir');
  });

  it('catalogue cohérent', () => {
    const ids = new Set<string>();
    for (const it of ITEMS) {
      expect(ids.has(it.id)).toBe(false);
      ids.add(it.id);
      if (it.category === 'shape') expect(TRAY_SHAPES[it.shape]).toBeDefined();
    }
    expect(resolveAppearance({ dice: 'felt-vert' }).dice.id).toBe('dice-ivoire');
  });
});

import { applyGameEnd, claimQuest } from '../shared/progress/profile';
import { dailyQuests, QUESTS } from '../shared/progress/quests';
describe('défis du jour', () => {
  it('3 défis distincts, les mêmes pour tous un jour donné, différents selon les jours', () => {
    const a = dailyQuests('2026-11-02').map((q) => q.id);
    expect(new Set(a).size).toBe(3);
    expect(dailyQuests('2026-11-02').map((q) => q.id)).toEqual(a);
    const days = new Set(Array.from({ length: 10 }, (_, i) => dailyQuests(`2026-11-${String(10 + i)}`).map((q) => q.id).join()));
    expect(days.size).toBeGreaterThan(3);
  });
  it('progression, accomplissement, récupération unique, remise à zéro le lendemain', () => {
    // Un jour où « Terminer 3 parties » est tiré.
    let day = '';
    for (let i = 1; i < 60 && !day; i++) { const d = `2026-12-${String(i % 28 + 1).padStart(2, '0')}`; if (dailyQuests(d).some((q) => q.id === 'jouer-3')) day = d; }
    expect(day).not.toBe('');
    let p = newProfile();
    const reward = { won: false, xp: 10, coins: 5, lines: [] };
    const ctx = { mode: 'solo' as const, opponents: 2, count421: 0, day: '2026-06-10' };
    for (let i = 0; i < 2; i++) p = applyGameEnd(p, reward, ctx, day).profile;
    expect(claimQuest(p, 'jouer-3', day)).toBeNull(); // 2/3
    const third = applyGameEnd(p, reward, ctx, day);
    expect(third.questsDone!.map((q) => q.id)).toContain('jouer-3');
    const claimed = claimQuest(third.profile, 'jouer-3', day)!;
    const def = QUESTS.find((q) => q.id === 'jouer-3')!;
    expect(claimed.profile.coins).toBeGreaterThanOrEqual(third.profile.coins + def.coins);
    expect(claimQuest(claimed.profile, 'jouer-3', day)).toBeNull(); // pas deux fois
    expect(claimQuest(claimed.profile, 'jouer-3', '2027-01-01')).toBeNull(); // nouveau jour : à refaire
  });
});

import { ACHIEVEMENTS } from '../shared/progress/achievements';
describe('succès', () => {
  it('débloqués une seule fois, avec leurs pièces, série de victoires suivie', () => {
    let p = newProfile();
    const win = { won: true, xp: 10, coins: 10, lines: [] };
    const ctx = { mode: 'solo' as const, opponents: 3, difficulty: 'difficile' as const, count421: 1, combos: { '421': 1, brelan: 1 }, day: '2026-06-10' };
    const a = applyGameEnd(p, win, ctx, '2026-11-02');
    const ids = a.achievementsDone!.map((x) => x.id);
    expect(ids).toEqual(expect.arrayContaining(['premiere-victoire', 'premier-421', 'difficile', 'grande-table']));
    const bonus = a.achievementsDone!.reduce((n, x) => n + x.coins, 0);
    expect(a.profile.coins).toBe(10 + bonus);
    p = a.profile;
    for (let i = 0; i < 2; i++) p = applyGameEnd(p, win, ctx, '2026-11-02').profile;
    expect(p.stats.bestStreak).toBe(3);
    expect(p.achievements['serie-3']).toBeGreaterThan(0);
    const again = applyGameEnd(p, win, ctx, '2026-11-02');
    expect(again.achievementsDone!.map((x) => x.id)).not.toContain('premiere-victoire');
    const lost = applyGameEnd(again.profile, { ...win, won: false }, ctx, '2026-11-02').profile;
    expect(lost.stats.streak).toBe(0);
    expect(lost.stats.bestStreak).toBe(4);
    expect(new Set(ACHIEVEMENTS.map((x) => x.id)).size).toBe(ACHIEVEMENTS.length);
  });
});

import { PAID_ITEMS } from '../shared/progress/achievements';
describe('succès difficiles', () => {
  it('partie parfaite, remontada, trois as ; « tout le catalogue » vise tous les objets payants', () => {
    const win = { won: true, xp: 10, coins: 10, lines: [] };
    const base = { mode: 'solo' as const, opponents: 2, difficulty: 'normal' as const, count421: 0, day: '2026-06-10' };
    const perfect = applyGameEnd(newProfile(), win, { ...base, rounds: 8, roundsLost: 0, maxTokens: 3 }, '2026-11-02');
    expect(perfect.achievementsDone!.map((x) => x.id)).toContain('parfait');
    const short = applyGameEnd(newProfile(), win, { ...base, rounds: 3, roundsLost: 0 }, '2026-11-02');
    expect(short.profile.stats.perfectWins).toBe(0); // trop courte
    const points = applyGameEnd(newProfile(), win, { ...base, rounds: 8, roundsLost: undefined }, '2026-11-02');
    expect(points.profile.stats.perfectWins).toBe(0); // variante aux points : pas de manche perdue possible
    const comeback = applyGameEnd(newProfile(), win, { ...base, rounds: 12, roundsLost: 4, maxTokens: 11 }, '2026-11-02');
    expect(comeback.achievementsDone!.map((x) => x.id)).toContain('remontada');
    const aces = applyGameEnd(newProfile(), { ...win, won: false }, { ...base, combos: { '111': 2 } }, '2026-11-02');
    expect(aces.profile.stats.triAces).toBe(2);
    expect(PAID_ITEMS).toBe(ITEMS.filter((i) => i.price > 0).length);
    expect(PAID_ITEMS).toBeGreaterThan(40);
  });
});
