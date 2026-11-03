import { describe, expect, it } from 'vitest';
import { chestStatus, newProfile, openChest } from '../shared/progress/profile';

describe('coffre du soir', () => {
  it('s’ouvre à partir de 19 h (Bruxelles), une fois par soir', () => {
    const before = Date.parse('2026-11-10T17:30:00Z'); // 18 h 30 à Bruxelles
    const after = Date.parse('2026-11-10T18:05:00Z'); // 19 h 05
    const p = newProfile();
    expect(chestStatus(p, before)).toBe('later');
    expect(openChest(p, before)).toBeNull();
    const r = openChest(p, after, () => 0.05)!;
    expect(r.coins).toBeGreaterThanOrEqual(15);
    expect(r.bag).toBe(true);
    expect(r.profile.coins).toBe(p.coins + r.coins);
    expect(chestStatus(r.profile, after)).toBe('done');
    expect(openChest(r.profile, after)).toBeNull();
    expect(chestStatus(r.profile, Date.parse('2026-11-11T18:30:00Z'))).toBe('ready'); // le lendemain soir
  });
});
