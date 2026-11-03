import { describe, expect, it } from 'vitest';
import { CHEST_COOLDOWN, chestWait, newProfile, openChest } from '../shared/progress/profile';

describe('coffre du comptoir', () => {
  it('s’ouvre, puis se recharge 24 h après', () => {
    const t = Date.parse('2026-11-10T20:00:00Z');
    const p = newProfile();
    expect(chestWait(p, t)).toBe(0);
    const r = openChest(p, t, () => 0.05)!;
    expect(r.coins).toBeGreaterThanOrEqual(15);
    expect(r.bag).toBe(true);
    expect(r.profile.coins).toBe(p.coins + r.coins);
    expect(chestWait(r.profile, t + 3600_000)).toBe(CHEST_COOLDOWN - 3600_000);
    expect(openChest(r.profile, t + CHEST_COOLDOWN - 1)).toBeNull();
    expect(openChest(r.profile, t + CHEST_COOLDOWN)).not.toBeNull();
  });
});
