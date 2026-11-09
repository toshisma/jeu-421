/** Coups Fourrés en 4 langues : clés complètes, 90 cartes traduites, journal du moteur couvert, moteur inchangé. */
import { describe, expect, it } from 'vitest';
import { DICTS, translate } from '../shared/i18n';
import { CARDS, STARTER_DECKS } from '../shared/cards/catalog';
import { startBotMatch, playMine, advanceBots, type BotMatchSetup } from '../shared/cards/botmatch';
import { legalActions, viewFor, type CfEvent } from '../shared/cards/engine';
import { cfDecide } from '../shared/cards/ai';
import { mulberry32 } from '../shared/rng';
import { translateCfRule, trCombo } from '../shared/i18n/zones/cartes-rules';
import { translateServerText } from '../shared/i18n/server-texts';
import { cartesFr } from '../shared/i18n/zones/cartes.fr';

const FOREIGN = ['en', 'de', 'nl'] as const;
const decklist = (d: Record<string, number>) => Object.entries(d).flatMap(([id, n]) => Array(n).fill(id) as string[]);
const k = (s: string) => s as Parameters<typeof translate>[1];

function allText(seed: number): string[] {
  const setup: BotMatchSetup = { seed, me: { id: 'moi', name: 'Moi', deck: decklist(STARTER_DECKS[0].cards) }, bots: [{ id: 'bot', name: 'Dédé', deck: decklist(STARTER_DECKS[1].cards), level: 'fine-fouine' }] } as BotMatchSetup;
  const { match, events } = startBotMatch(setup);
  const out: string[] = []; const add = (es: CfEvent[]) => { for (const e of es) { out.push(e.text); if (e.textYou) out.push(e.textYou); } };
  add(events);
  const rng = mulberry32(seed + 7);
  add(advanceBots(match));
  let guard = 0;
  while (match.state.phase !== 'over' && guard++ < 3000) {
    const a = cfDecide(viewFor(match.state, 'moi'), legalActions(match.state, 'moi'), 'fine-fouine', rng);
    const r = playMine(match, a); add(r.events); add(advanceBots(match));
  }
  return out;
}

describe('Coups Fourrés : traductions', () => {
  it('toutes les clés cf. existent en en, de, nl', () => {
    const miss: string[] = [];
    for (const key of Object.keys(cartesFr)) for (const l of FOREIGN) if (!DICTS[l][k(key)]) miss.push(`${l}:${key}`);
    expect(miss).toEqual([]);
  });
  it('les 90 cartes ont un nom et un texte dans chaque langue, pas identiques au français', () => {
    expect(CARDS.length).toBe(90);
    for (const c of CARDS) for (const l of FOREIGN) {
      const n = translate(l, k(`cf.card.${c.id}.n`)); const t = translate(l, k(`cf.card.${c.id}.t`));
      expect(n.trim(), `${l} ${c.id}`).toBeTruthy();
      expect(t.trim(), `${l} ${c.id}`).toBeTruthy();
      if (c.text.length > 30) expect(t, `${l} ${c.id}`).not.toBe(c.text);
    }
  });
  it('français : les clés rendent exactement le texte d’origine (noms, textes, répliques)', () => {
    for (const c of CARDS) {
      expect(translate('fr', k(`cf.card.${c.id}.n`))).toBe(c.name);
      expect(translate('fr', k(`cf.card.${c.id}.t`))).toBe(c.text);
      expect(translate('fr', k(`cf.card.${c.id}.f`))).toBe(c.flavor);
    }
  });
  it('messages du moteur : aucune ligne de journal d’une partie complète ne reste en français', () => {
    const missed = new Set<string>();
    for (const seed of [1, 2, 3, 5, 8, 13, 21, 34, 55, 89]) {
      for (const text of allText(seed)) {
        for (const l of FOREIGN) if (translateCfRule(l, text) === null) missed.add(text.replace(/\d/g, '#'));
      }
    }
    expect([...missed].slice(0, 40)).toEqual([]);
  });
  it('français : translateServerText laisse tout intact', () => {
    expect(translateServerText('fr', 'Vous piochez une carte.')).toBe('Vous piochez une carte.');
  });
  it('combinaisons et messages composés', () => {
    expect(trCombo('en', 'Brelan de 5')).toBe('Three 5s');
    expect(trCombo('de', 'Suite 6-5-4')).toBe('Straße 6-5-4');
    expect(translateServerText('en', 'Dédé joue La Fée verte.')).toBe('Dédé plays The Green Fairy.');
    expect(translateServerText('nl', 'Manche 3 : vous menez.')).toBe('Ronde 3: jij leidt.');
    expect(translateServerText('de', 'Vous gagnez 3 Tournées.')).toBe('Du bekommst 3 Biere.');
  });
  it('moteur inchangé : même résultat quelle que soit la langue (le moteur ne lit jamais le dictionnaire)', () => {
    const a = allText(7).join('|'); const b = allText(7).join('|');
    expect(a).toBe(b);
    expect(a).toMatch(/Tournée|lance|manche/);
  });
});
