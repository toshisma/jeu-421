/** Zone « clubs » (bistrots entre amis) : complète en en/de/nl, messages du serveur couverts. */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DICTS } from '../shared/i18n';
import { clubsFr } from '../shared/i18n/zones/clubs.fr';
import { translateServerText } from '../shared/i18n/server-texts';
import { BISTROT_MAX_MEMBERS, BISTROTS_PER_PLAYER, bistrotNameProblem } from '../shared/bistrots';

const FOREIGN = ['en', 'de', 'nl'] as const;
const keys = Object.keys(clubsFr) as (keyof typeof clubsFr)[];
const holes = (s: string) => [...new Set([...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort();

describe('zone clubs', () => {
  it('chaque clé existe en en/de/nl, avec les mêmes trous, sans rester en français', () => {
    for (const l of FOREIGN) for (const k of keys) {
      const t = DICTS[l][k];
      expect(t, `${l}:${k}`).toBeTruthy();
      expect(holes(t!), `${l}:${k}`).toEqual(holes(clubsFr[k]));
      if (clubsFr[k].length > 12 && !/^\{|421|Coups Fourrés/.test(clubsFr[k])) expect(t, `${l}:${k}`).not.toBe(clubsFr[k]);
    }
  });
  it('chaque annonce du mur et chaque jeu ont leur texte', () => {
    for (const k of ['ouvert', 'recrue', 'depart', 'retire', 'victoire', 'coup', 'tournoi', 'champion', 'patron']) expect(keys).toContain(`club.w.${k}`);
    for (const g of ['421', 'courtisan', 'cf', 'duel']) expect(keys).toContain(`club.g.${g}`);
  });
  it('messages de server/bistrots.ts traduits (erreurs et notifications)', () => {
    const src = readFileSync(join(process.cwd(), 'server', 'bistrots.ts'), 'utf8');
    const sample = (t: string) => t.replace(/\$\{BISTROTS_PER_PLAYER\}/g, String(BISTROTS_PER_PLAYER)).replace(/\$\{BISTROT_MAX_MEMBERS\}/g, String(BISTROT_MAX_MEMBERS))
      .replace(/\$\{[^}]*points[^}]*\}/g, '7').replace(/\$\{[^}]*\}/g, 'Marie');
    const texts = [
      ...[...src.matchAll(/fail\(res, \d+, (['`])((?:(?!\1).)+)\1\)/g)].map((m) => m[2]),
      ...[...src.matchAll(/d\.push\([^,]+, '([^']+)', `([^`]+)`/g)].flatMap((m) => [m[1], m[2]]),
      ...[...src.matchAll(/modNotify\([^,]+, 'bistrot', `([^`]+)`/g)].map((m) => m[1]),
    ].map(sample);
    expect(texts.length).toBeGreaterThan(20);
    for (const l of FOREIGN) for (const t of texts) expect(translateServerText(l, t), `${l}: ${t}`).not.toBe(t);
    // Problèmes de nom (shared/bistrots.ts).
    for (const n of ['ab', 'Les Connards', 'Bar des Admins']) for (const l of FOREIGN) {
      const p = bistrotNameProblem(n)!;
      expect(translateServerText(l, p), `${l}: ${p}`).not.toBe(p);
    }
    expect(translateServerText('de', 'Vous êtes le champion du bistrot « Chez Dédé » avec 12 points.')).toBe('Du bist Champion der Kneipe „Chez Dédé“ mit 12 Punkten.');
  });
});
