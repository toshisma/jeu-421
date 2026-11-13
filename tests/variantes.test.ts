/** Pages « variantes du 421 » et « vocabulaire du 421 » : chaque réglage cité existe, avec son libellé exact. */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_CONFIG, sanitizeConfig } from '../shared/config';
import { evaluate } from '../shared/combos';
import { fr } from '../shared/i18n/fr';
// @ts-expect-error script Node sans déclaration de types
import { VARIANT_SETTINGS, VARIANT_UI, variantesPages } from '../scripts/seo-variantes-pages.mjs';

const pub = join(process.cwd(), 'client', 'public');
const html = (slug: string) => readFileSync(join(pub, `${slug}.html`), 'utf8');
const get = (o: unknown, path: string) => path.split('.').reduce((a: any, k) => a?.[k], o);
const set = (path: string, v: unknown) => {
  const [a, b] = path.split('.');
  return b ? { ...DEFAULT_CONFIG, [a]: { ...DEFAULT_CONFIG.values, [b]: v } } : { ...DEFAULT_CONFIG, [a]: v };
};

describe('variantes du 421', () => {
  it('deux pages distinctes, dans le plan du site, maillées avec les pages du 421', () => {
    const slugs = variantesPages.map((p: { slug: string }) => p.slug);
    expect(slugs).toEqual(['variantes-du-421', 'vocabulaire-du-421']);
    const sitemap = readFileSync(join(pub, 'sitemap.xml'), 'utf8');
    for (const s of slugs) expect(sitemap).toContain(`<loc>https://421online.com/${s}</loc>`);
    expect(html('regles-du-421')).toContain('href="/variantes-du-421"');
    expect(html('combinaisons-du-421')).toContain('href="/le-421-en-chiffres"');
    expect(readFileSync(join(process.cwd(), 'client', 'index.html'), 'utf8')).toMatch(/href="\/variantes-du-421"[\s\S]*href="\/le-421-en-chiffres"/);
    const [a, b] = variantesPages;
    expect(a.title).not.toBe(b.title);
    expect(a.description).not.toBe(b.description);
  });

  it('chaque réglage cité existe dans la configuration et accepte les valeurs données en exemple', () => {
    for (const s of VARIANT_SETTINGS) {
      expect(get(DEFAULT_CONFIG, s.key), s.key).not.toBeUndefined();
      for (const v of s.examples) {
        const cfg = s.key === 'chargeThrows' ? { ...set(s.key, v), maxThrows: 3 } : set(s.key, v);
        expect(get(sanitizeConfig(cfg), s.key), `${s.key}=${v}`).toBe(v);
      }
      if (s.i18n) expect(fr[s.i18n as keyof typeof fr], s.i18n).toBe(s.label);
    }
    for (const u of VARIANT_UI) expect(fr[u.i18n as keyof typeof fr], u.i18n).toBe(u.label);
  });

  it('libellés cités tels qu’ils apparaissent dans le jeu, et vrais par défaut', () => {
    const page = html('variantes-du-421');
    for (const s of VARIANT_SETTINGS) expect(page, s.label).toContain(`«\u00a0${s.label.replace(/'/g, '’')}\u00a0»`);
    expect(DEFAULT_CONFIG.values.v421).toBe(8);
    expect(DEFAULT_CONFIG.totalTokens).toBe(21);
    expect(DEFAULT_CONFIG.values.nenetteMin).toBe(2);
    expect(DEFAULT_CONFIG.chargeThrows).toBe(1);
    // « 6-1-1 passe devant 6-6-6 » et « le 4-2-2 ne vaut rien » (une combinaison ordinaire à 1 jeton).
    expect(evaluate([6, 1, 1], DEFAULT_CONFIG.values).rank).toBeGreaterThan(evaluate([6, 6, 6], DEFAULT_CONFIG.values).rank);
    expect(evaluate([4, 2, 2], DEFAULT_CONFIG.values).kind).toBe('autre');
    // Pas de « 421 belge » présenté comme une variante régionale.
    expect(page).not.toMatch(/variante belge|421 belge se joue|règle belge|règle suisse/i);
    expect(page).toContain('href="/?jouer=amis"');
  });
});
