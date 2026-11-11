/** Zone « poker » (Poker menteur) : complète en en/de/nl, mêmes trous, lettres des dés, messages du serveur traduits. */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DICTS, translate } from '../shared/i18n';
import { pokerFr } from '../shared/i18n/zones/poker.fr';
import { translateServerText } from '../shared/i18n/server-texts';
import { ACHIEVEMENTS } from '../shared/progress/achievements';
import { PM_PERSONAS } from '../shared/pokermenteur/personas';
import { contrast } from '../shared/progress/dice-collection';
import { PM_DIE_BODY, PM_DIE_EDGE, PM_FACE_INK } from '../shared/pokermenteur/look';

const FOREIGN = ['en', 'de', 'nl'] as const;
const keys = Object.keys(pokerFr) as (keyof typeof pokerFr)[];
const holes = (s: string) => [...new Set([...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort();

describe('zone poker', () => {
  it('chaque clé existe en en/de/nl, avec les mêmes trous, sans rester en français', () => {
    for (const l of FOREIGN) for (const k of keys) {
      const t = DICTS[l][k];
      expect(t, `${l}:${k}`).toBeTruthy();
      expect(holes(t!), `${l}:${k}`).toEqual(holes(pokerFr[k]));
      if (pokerFr[k].length > 14 && !/^pm\.(face|vp|vd|va)\./.test(k)) expect(t, `${l}:${k}`).not.toBe(pokerFr[k]);
    }
  });
  it('lettres des dés par langue (fr 9 10 V D R A ; en 9 10 J Q K A ; de 9 10 B D K A ; nl 9 10 B V H A)', () => {
    const faces = (l: 'fr' | 'en' | 'de' | 'nl') => [0, 1, 2, 3, 4, 5].map((v) => translate(l, `pm.face.${v}` as never));
    expect(faces('fr')).toEqual(['9', '10', 'V', 'D', 'R', 'A']);
    expect(faces('en')).toEqual(['9', '10', 'J', 'Q', 'K', 'A']);
    expect(faces('de')).toEqual(['9', '10', 'B', 'D', 'K', 'A']);
    expect(faces('nl')).toEqual(['9', '10', 'B', 'V', 'H', 'A']);
  });
  it('chaque succès, chaque habitué, chaque catégorie et niveau a ses textes', () => {
    for (const a of ACHIEVEMENTS.filter((x) => x.game === 'poker')) { expect(keys).toContain(`pm.a.${a.id}`); expect(keys).toContain(`pm.a.${a.id}.d`); expect(pokerFr[`pm.a.${a.id}` as keyof typeof pokerFr]).toBe(a.name); }
    for (const p of PM_PERSONAS) for (const k of ['tag', 'menteur', 'gagne', 'perd']) expect(keys).toContain(`pm.p.${p.id}.${k}`);
    for (let c = 0; c <= 8; c++) expect(keys).toContain(`pm.cat.${c}`);
    for (const l of ['debutant', 'habitue', 'fouine']) { expect(keys).toContain(`pm.lv.${l}`); expect(keys).toContain(`pm.lh.${l}`); }
    const n = ACHIEVEMENTS.filter((x) => x.game === 'poker');
    expect(n.length).toBeGreaterThanOrEqual(6);
    expect(n.length).toBeLessThanOrEqual(10);
    for (const a of n) expect(a.coins).toBeLessThanOrEqual(15);
  });
  it('dés lisibles : contraste des signes ≥ 4 sur la face', () => {
    for (const ink of PM_FACE_INK) { expect(contrast(ink, PM_DIE_BODY)).toBeGreaterThanOrEqual(4); expect(contrast(ink, PM_DIE_EDGE)).toBeGreaterThanOrEqual(4); }
  });
  it('messages de server/pokermenteur-online.ts, du moteur et des comptes traduits', () => {
    const src = readFileSync(join(process.cwd(), 'server', 'pokermenteur-online.ts'), 'utf8')
      + readFileSync(join(process.cwd(), 'shared', 'pokermenteur', 'engine.ts'), 'utf8');
    const sample = (t: string) => t.replace(/\$\{[^}]*\}/g, (m) => (/(MAX|QUICK|n\b)/.test(m) ? '7' : 'Xy'));
    const texts = [
      ...[...src.matchAll(/error: '([^']+)'/g)].map((m) => m[1]),
      ...[...src.matchAll(/error: `([^`]+)`/g)].map((m) => sample(m[1])),
      ...[...src.matchAll(/notice\(t, `([^`]+)`/g)].map((m) => sample(m[1])),
      ...[...src.matchAll(/return '([^']+)'/g)].map((m) => m[1]),
      ...[...src.matchAll(/return `([^`]+)`/g)].map((m) => sample(m[1])),
      ...[...src.matchAll(/text: '([^']+)'/g)].map((m) => m[1]),
      'Xy vous invite au Poker menteur', 'Un gobelet vous attend : touchez pour rejoindre la table.', '🃏 Xy a remporté une partie de Poker menteur',
    ].filter((t) => /[a-zà-ÿ]{2}/.test(t) && !/^[a-z]+$/.test(t) && !t.includes('${') && t !== 'Xy : Xy');
    expect(texts.length).toBeGreaterThan(30);
    const missing: string[] = [];
    for (const l of FOREIGN) for (const t of texts) if (translateServerText(l, t) === t) missing.push(`${l}: ${t}`);
    expect(missing).toEqual([]);
  });
});
