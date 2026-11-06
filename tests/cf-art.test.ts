import { describe, expect, it } from 'vitest';
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { CARDS } from '../shared/cards/catalog';
import { contrast } from '../shared/progress/dice-collection';
import { CARD_ART_IDS, CardArt, hasCardArt } from '../client/src/cards/art';
import { BoosterPack, CapsuleIcon, CardBack, CardView, FamilyBadge, HandFan, MiniCard, RarityGem, TrapBack, CostBadge } from '../client/src/cards/components';
import { CARD_EMPHASIS, FAMILY_STYLE, PAPER, splitEmphasis } from '../client/src/cards/meta';

const ids = (html: string) => [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
const refs = (html: string) => [...html.matchAll(/url\(#([^)]+)\)/g)].map((m) => m[1]);

describe('Coups Fourrés : illustrations des cartes', () => {
  it('chacune des cartes a son illustration (et aucune en trop)', () => {
    expect(CARDS).toHaveLength(42);
    for (const c of CARDS) expect(hasCardArt(c.id), c.id).toBe(true);
    expect([...CARD_ART_IDS].sort()).toEqual(CARDS.map((c) => c.id).sort());
  });

  it('chaque carte se rend côté serveur sans erreur, sous toutes ses formes', () => {
    for (const c of CARDS) {
      const html = renderToString(h('div', null,
        h(CardView, { id: c.id }),
        h(CardView, { id: c.id, width: 120, shiny: true, isNew: true, dimmed: true, selected: true, count: 2, onClick: () => {} }),
        h(MiniCard, { id: c.id, playable: true, selected: true }),
        h(MiniCard, { id: c.id, disabled: true, width: 60 }),
      ));
      expect(html).toContain('<svg');
      expect(html).toContain('Brillante');
      expect(html).toContain('×2');
      // Le nom (échappé par React) apparaît.
      expect(html).toContain(c.name.replace(/&/g, '&amp;').replace(/'/g, '&#x27;'));
    }
    const misc = renderToString(h('div', null,
      h(CardBack), h(TrapBack), h(BoosterPack), h(CapsuleIcon, { title: 'Capsules' }), h(CostBadge, { cost: 3 }),
      h(FamilyBadge, { family: 'pieges' }), h(RarityGem, { rarity: 'legendaire', label: true }),
      h(HandFan, null, ...['patron', 'leurre', 'domino'].map((id) => h(MiniCard, { key: id, id }))),
    ));
    expect(misc).toContain('CF');
    expect(renderToString(h(CardView, { id: 'carte-inconnue' }))).toBe('');
  });

  it('aucun identifiant SVG en double quand la même carte est affichée plusieurs fois', () => {
    const html = renderToString(h('div', null,
      ...CARDS.flatMap((c) => [h(CardArt, { key: c.id + 'a', id: c.id }), h(CardArt, { key: c.id + 'b', id: c.id })]),
      h(CardView, { id: 'patron' }), h(CardView, { id: 'patron' }), h(MiniCard, { id: 'patron' }),
      h(CardBack), h(CardBack), h(TrapBack), h(TrapBack), h(BoosterPack), h(BoosterPack), h(CapsuleIcon), h(CapsuleIcon),
    ));
    const all = ids(html);
    expect(all.length).toBeGreaterThan(68);
    expect(new Set(all).size).toBe(all.length);
    // Chaque référence url(#…) vise un identifiant présent.
    const known = new Set(all);
    for (const r of refs(html)) expect(known.has(r), r).toBe(true);
  });

  it('texte de règle et réplique lisibles sur le papier crème (contraste ≥ 4,5)', () => {
    for (const paper of [PAPER.top, PAPER.bottom]) {
      expect(contrast(PAPER.text, paper)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(PAPER.flavor, paper)).toBeGreaterThanOrEqual(4.5);
      for (const f of Object.values(FAMILY_STYLE)) expect(contrast(f.ink, paper)).toBeGreaterThanOrEqual(4.5);
    }
    // Nom et type en crème sur le bas (le plus clair des deux) du dégradé de famille.
    for (const f of Object.values(FAMILY_STYLE)) expect(contrast('#fbf6e9', f.c1)).toBeGreaterThanOrEqual(4.5);
  });

  it('le passage en gras existe bien dans le texte de chaque carte', () => {
    for (const c of CARDS) {
      expect(CARD_EMPHASIS[c.id], c.id).toBeTruthy();
      const [a, b, z] = splitEmphasis(c.id, c.text);
      expect(b, c.id).toBe(CARD_EMPHASIS[c.id]);
      expect(a + b + z).toBe(c.text);
    }
  });
});
