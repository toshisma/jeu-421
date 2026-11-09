/** Traductions : choix de la langue, repli sur le français, Courtisan complet en en/de/nl, messages du serveur. */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AUTO_LANG, DICTS, LANGS, numberIn, resolveLang, translate } from '../shared/i18n';
import { fr, type MessageKey } from '../shared/i18n/fr';
import { translateServerText } from '../shared/i18n/server-texts';
import { DM_RULES, DM_VALUE_LABELS, PERSONA_LABELS, PHRASE_LABELS, BARON } from '../shared/i18n/courtisan';
import { langParam } from '../client/src/i18n/lang';
import { DM_VALUES } from '../shared/dixmille/engine';
import { PHRASES } from '../shared/protocol';
import { PERSONAS } from '../client/src/game/personas';

const FOREIGN = ['en', 'de', 'nl'] as const;
describe('choix de la langue', () => {
  const auto = (browser: string | null | undefined) => resolveLang({ browser, auto: true });
  it('tout le site est traduit : le navigateur compte, sans jamais basculer un francophone', () => {
    expect(AUTO_LANG).toBe(true);
    expect(resolveLang({ browser: 'en-US' })).toBe('en');
    expect(resolveLang({ browser: 'nl-BE' })).toBe('nl');
    for (const b of ['fr-FR', 'fr-BE', 'es-ES', null]) expect(resolveLang({ browser: b })).toBe('fr');
  });
  it('détection (quand elle sera active) : en, de, nl seulement ; fr, absent et autres = français', () => {
    expect(auto('en-US')).toBe('en');
    expect(auto('en')).toBe('en');
    expect(auto('de-DE')).toBe('de');
    expect(auto('nl-BE')).toBe('nl');
    for (const b of ['fr', 'fr-BE', 'fr-FR', '', null, undefined, 'es', 'it-IT', 'enm', 'ja']) expect(auto(b as string)).toBe('fr');
  });
  it('priorité : choix enregistré, puis ?lang, puis navigateur', () => {
    expect(resolveLang({ saved: 'fr', param: 'en', browser: 'en-US', auto: true })).toBe('fr');
    expect(resolveLang({ saved: 'nl', browser: 'fr-BE' })).toBe('nl');
    expect(resolveLang({ param: 'de', browser: 'fr-BE' })).toBe('de');
    expect(resolveLang({ param: 'fr', browser: 'en-US', auto: true })).toBe('fr');
    expect(resolveLang({ saved: 'x', param: 'y', browser: 'fr' })).toBe('fr');
  });
  it('?lang : valeurs connues seulement, avec d’autres paramètres', () => {
    expect(langParam('?mode=courtisan&lang=en')).toBe('en');
    expect(langParam('?rejoindre=ABCDE&lang=nl')).toBe('nl');
    expect(langParam('?lang=es')).toBeNull();
    expect(langParam('')).toBeNull();
  });
});

describe('catalogue', () => {
  const holes = (s: string) => [...new Set([...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].filter((x) => x !== 's').sort();
  const keys = Object.keys(fr) as MessageKey[];
  it('Courtisan et parcours complets en en, de, nl, avec les mêmes valeurs insérées', () => {
    for (const lang of FOREIGN) {
      for (const k of keys) {
        const t = DICTS[lang][k];
        expect(t, `${lang}:${k}`).toBeTruthy();
        if (k !== 'dm.quest') expect(holes(t!), `${lang}:${k}`).toEqual(holes(fr[k]));
      }
    }
  });
  it('aucune clé inconnue', () => { for (const l of LANGS) for (const k of Object.keys(DICTS[l])) expect(keys).toContain(k); });
  it('repli sur le français pour une clé manquante ; valeurs insérées', () => {
    const k = 'dm.back' as MessageKey;
    const saved = DICTS.de[k]; delete DICTS.de[k];
    expect(translate('de', k)).toBe(fr[k]);
    DICTS.de[k] = saved;
    expect(translate('en', 'dm.pointsW', { n: 5 })).toBe('5 points');
    expect(translate('fr', 'dm.tableN', { code: 'AB' })).toBe('Table AB');
    expect(translate('nl', 'dm.tableN', { code: 'AB' })).toBe('Tafel AB');
  });
  it('nombres selon la langue', () => { expect(numberIn('en', 2000)).toBe('2,000'); expect(numberIn('de', 2000)).toBe('2.000'); });
  it('listes fermées traduites : règles, valeurs, phrases, personnages', () => {
    for (const l of FOREIGN) {
      expect(DM_RULES[l].steps).toHaveLength(7);
      for (const v of DM_VALUES) expect(DM_VALUE_LABELS[l][v.label], v.label).toBeTruthy();
      for (const p of PHRASES) expect(PHRASE_LABELS[l][p], p).toBeTruthy();
      for (const p of PERSONAS) expect(PERSONA_LABELS[l][p.id], p.id).toBeTruthy();
      expect(BARON[l]).not.toBe('Le Baron');
    }
  });
});

describe('messages du serveur du Courtisan', () => {
  const src = readFileSync(join(process.cwd(), 'server', 'dixmille-online.ts'), 'utf8');
  const sample = (t: string) => t.replace(/\$\{[^}]*\}/g, (m) => (/(stake|have|pot|MAX)/i.test(m) ? '7' : 'Xy'));
  const texts = [
    ...[...src.matchAll(/error: '([^']+)'/g)].map((m) => m[1]),
    ...[...src.matchAll(/error: `([^`]+)`/g)].map((m) => sample(m[1])),
    ...[...src.matchAll(/notice\(t, `([^`]+)`/g)].map((m) => sample(m[1])),
    ...[...src.matchAll(/return '([^']+)'/g)].map((m) => m[1]),
    ...[...src.matchAll(/return `([^`]+)`/g)].map((m) => sample(m[1])),
    ...[...src.matchAll(/text: '([^']+)'/g)].map((m) => m[1]),
  ].filter((t) => /[a-zà-ÿ]{2}/.test(t) && !/^[a-z]+$/.test(t) && !t.includes('DM:') && !t.includes('${') && t !== 'Xy : Xy');
  it('chacun se traduit, dans chaque langue', () => {
    expect(texts.length).toBeGreaterThan(30);
    for (const l of FOREIGN) for (const t of texts) expect(translateServerText(l, t), `${l}: ${t}`).not.toBe(t);
  });
  it('français inchangé, titres de table, comptes, composés', () => {
    expect(translateServerText('fr', 'Sam a rejoint la table.')).toBe('Sam a rejoint la table.');
    expect(translateServerText('en', 'Table de Sam')).toBe('Sam’s table');
    expect(translateServerText('de', 'Sam a rejoint la table.')).toBe('Sam ist dem Tisch beigetreten.');
    expect(translateServerText('nl', 'Le Baron (ordinateur) gagne : les mises sont perdues.')).toBe('De Baron (computer) wint: de inzetten zijn verloren.');
    expect(translateServerText('en', 'Pseudo ou mot de passe incorrect.')).toBe('Wrong username or password.');
    expect(translateServerText('en', 'Sam : Il faut 7 Groschen pour cette mise (vous en avez 2).')).toBe('Sam: You need 7 Groschen for this stake (you have 2).');
    expect(translateServerText('en', 'Texte inconnu')).toBe('Texte inconnu');
  });
});
