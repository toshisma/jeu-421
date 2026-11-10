/** Zone « commun » (accueil, comptes, boutique, collection, légal) : complète en en/de/nl, catalogues et serveur. */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DICTS } from '../shared/i18n';
import { communFr } from '../shared/i18n/zones/commun.fr';
import { translateServerText } from '../shared/i18n/server-texts';
import { ITEMS } from '../shared/progress/catalog';
import { ACHIEVEMENTS } from '../shared/progress/achievements';
import { QUESTS } from '../shared/progress/quests';

const FOREIGN = ['en', 'de', 'nl'] as const;
const keys = Object.keys(communFr);
const holes = (s: string) => [...new Set([...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].filter((x) => x !== 's').sort();

describe('zone commun', () => {
  it('aucune clé absente ni texte encore en français exact (sauf noms propres)', () => {
    for (const l of FOREIGN) for (const k of keys) {
      const t = DICTS[l][k as keyof typeof communFr];
      expect(t, `${l}:${k}`).toBeTruthy();
      expect(holes(t as string), `${l}:${k}`).toEqual(holes(communFr[k as keyof typeof communFr]));
    }
  });
  it('catalogues : boutique, succès, défis ont leurs clés', () => {
    for (const it of ITEMS) {
      if (/^(dc-|dl-|ds-)|-brillant$|^felt-serie-/.test(it.id)) continue;
      expect(keys, it.id).toContain(`app.item.${it.id}`);
    }
    for (const a of ACHIEVEMENTS.filter((x) => !x.game)) expect(keys, a.id).toContain(`app.a.${a.id}`); // Courtisan : dm2.a.* (tests/courtisan2.test.ts)
    for (const q of QUESTS) expect(keys, q.id).toContain(`app.q.${q.id}`);
  });
  it('messages du serveur et textes composés traduits ; français rendu tel quel', () => {
    expect(translateServerText('fr', 'Ce pseudo est déjà pris.')).toBe('Ce pseudo est déjà pris.');
    expect(translateServerText('en', 'Ce pseudo est déjà pris.')).toBe('That username is already taken.');
    expect(translateServerText('de', '🎲 Marie a sorti 3 fois 4-2-1 dans la même partie !')).not.toContain('sorti');
    expect(translateServerText('en', 'Gagner 2 parties')).toBe('Win 2 games');
    expect(translateServerText('nl', 'Ligue Argent')).toBe('Competitie Zilver');
    expect(translateServerText('en', 'Champion de novembre 2026')).toBe('Champion of November 2026');
  });
  it('couverture des messages joueurs de accounts, social, messages', () => {
    const missing: string[] = [];
    const sample = (t: string) => t.replace(/\$\{[^}]*\}/g, '7');
    for (const f of ['accounts.ts', 'social.ts', 'messages.ts']) {
      const src = readFileSync(join(process.cwd(), 'server', f), 'utf8');
      for (const m of src.matchAll(/error:\s*(['`])((?:(?!\1).)+)\1/g)) {
        const t = sample(m[2]);
        if (/\$\{/.test(t)) continue;
        if (translateServerText('en', t) === t) missing.push(`${f}: ${t}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
