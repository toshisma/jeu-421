/** Zone « accueil » : partie express (bouton « Lancer les dés », liens ?jouer=), boutons des pages d'aide, traductions. */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { jouerParam, quickDifficulty, showQuickPlay } from '../client/src/quickPlay';
import { accueilFr } from '../shared/i18n/zones/accueil.fr';
import { accueilEn } from '../shared/i18n/zones/accueil.en';
import { accueilDe } from '../shared/i18n/zones/accueil.de';
import { accueilNl } from '../shared/i18n/zones/accueil.nl';
import { translate } from '../shared/i18n';

describe('lien direct ?jouer=', () => {
  it('421 par défaut, Courtisan, Coups Fourrés, table entre amis ; rien sans paramètre', () => {
    expect(jouerParam('?jouer=1')).toBe('421');
    expect(jouerParam('?jouer')).toBe('421');
    expect(jouerParam('?jouer=421&lang=de')).toBe('421');
    expect(jouerParam('?lang=nl&jouer=courtisan')).toBe('courtisan');
    expect(jouerParam('?jouer=Farkle')).toBe('courtisan');
    expect(jouerParam('?jouer=cartes')).toBe('cartes');
    expect(jouerParam('?jouer=coups-fourres')).toBe('cartes');
    expect(jouerParam('?jouer=amis')).toBe('amis');
    expect(jouerParam('?jouer=nimporte')).toBe('421');
    expect(jouerParam('')).toBeNull();
    expect(jouerParam('?rejoindre=ABCDE')).toBeNull();
    expect(jouerParam('?mode=cartes&lang=en')).toBeNull();
  });
  it('ordinateur facile pour un débutant, ensuite le niveau choisi ; bouton mis en avant pour les 3 premières parties', () => {
    expect(quickDifficulty(0, 'difficile')).toBe('facile');
    expect(quickDifficulty(2, 'normal')).toBe('facile');
    expect(quickDifficulty(3, 'normal')).toBe('normal');
    expect(showQuickPlay(0)).toBe(true);
    expect(showQuickPlay(3)).toBe(false);
  });
});

describe('traductions de la zone accueil', () => {
  it('toutes les clés en en/de/nl, non vides, différentes du français', () => {
    const keys = Object.keys(accueilFr).sort();
    for (const d of [accueilEn, accueilDe, accueilNl]) {
      expect(Object.keys(d).sort()).toEqual(keys);
      for (const k of keys) { expect((d as Record<string, string>)[k].trim()).not.toBe(''); expect((d as Record<string, string>)[k]).not.toBe((accueilFr as Record<string, string>)[k]); }
    }
    expect(translate('de', 'acc.quick.title')).toBe(accueilDe['acc.quick.title']);
    expect(translate('nl', 'acc.quick.sub')).toBe(accueilNl['acc.quick.sub']);
  });
});

describe('pages d’aide : boutons Jouer vers une partie', () => {
  const pub = join(process.cwd(), 'client', 'public');
  const pages = readdirSync(pub).filter((f) => f.endsWith('.html') && f !== 'index.html')
    .map((f) => ({ f, h: readFileSync(join(pub, f), 'utf8') })).filter((p) => p.h.includes('<link rel="stylesheet" href="/seo.css">'));
  it('chaque page : bouton sous le titre et en bas, lien ?jouer= du jeu de la page, dans sa langue', () => {
    expect(pages.length).toBeGreaterThan(30);
    for (const { f, h } of pages) {
      const lang = /<html lang="(\w+)">/.exec(h)![1];
      const top = /<\/h1>\n<p class="play-box top"><a class="cta" href="([^"]+)" data-play>/.exec(h);
      expect(top, f).not.toBeNull();
      const href = top![1];
      expect(href, f).toMatch(lang === 'fr' ? /^\/\?jouer=(1|courtisan|cartes|amis|poker)$/ : new RegExp(`^/\\?jouer=(1|courtisan|cartes|amis|poker)&amp;lang=${lang}$`));
      expect(h, f).toContain(`<p class="play-box end"><a class="cta" href="${href}" data-play>`);
      // Le jeu de la page : Coups Fourrés et Courtisan vers leur mode, pages « entre amis » vers une table.
      if (/coups-fourres/.test(f)) expect(href, f).toContain('jouer=cartes');
      if (/dix-mille|farkle|zehntausend|kingdom-come|courtisan/.test(f)) expect(href, f).toContain('jouer=courtisan');
      if (/entre-amis|with-friends|mit-freunden|met-vrienden/.test(f)) expect(href, f).toContain('jouer=amis');
      if (/poker|liars-dice|luegenpoker|blufpoker/.test(f)) expect(href, f).toContain('jouer=poker');
      // Plus aucun bouton Jouer vers l'accueil nu ou l'ancien ?mode=.
      expect(h, f).not.toMatch(/class="cta( small)?" href="\/(\?lang=\w+)?"/);
      expect(h, f).not.toMatch(/class="cta( small)?" href="\/\?mode=/);
    }
  });
});
