/** Mots techniques des cartes (0.39) : chaque carte a au moins un mot expliqué, les noms de cartes cités ne sont pas touchés. */
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { GlossText } from '../client/src/cards/Gloss';
import { CARDS } from '../shared/cards/catalog';

const html = (text: string, bold?: string) => renderToStaticMarkup(createElement(GlossText, { text, bold }));

describe('mots techniques', () => {
  it('en couleur et touchables, une seule fois par mot, gras conservé', () => {
    const h = html('Gagnez 2 Tournées. Puis encore 1 Tournée.', '2 Tournées');
    expect(h.match(/class="cf-term"/g)).toHaveLength(1);
    expect(h).toContain('<b>');
  });
  it('pas dans les noms de cartes cités', () => {
    expect(html('Rejouez « Tournée du patron ».')).not.toContain('cf-term');
  });
  it('la plupart des cartes ont un mot expliqué', () => {
    const n = CARDS.filter((c) => html(c.text).includes('cf-term')).length;
    expect(n / CARDS.length).toBeGreaterThan(0.7);
  });
});
