import { describe, expect, it } from 'vitest';
import { CHANGELOG } from '../shared/changelog';

describe('nouveautés', () => {
  it('versions uniques, dates valides, la plus récente en premier, rien pour les administrateurs', () => {
    expect(new Set(CHANGELOG.map((e) => e.version)).size).toBe(CHANGELOG.length);
    const t = CHANGELOG.map((e) => Date.parse(e.date));
    expect(t.every((x) => !Number.isNaN(x))).toBe(true);
    for (let i = 1; i < t.length; i++) expect(t[i - 1]).toBeGreaterThan(t[i]);
    for (const e of CHANGELOG) expect(JSON.stringify(e).toLowerCase()).not.toMatch(/admin/);
  });
});
