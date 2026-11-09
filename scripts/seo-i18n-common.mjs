/**
 * Pages d'aide traduites (en, de, nl) : groupes de traduction (hreflang), mention d'indépendance, boutons,
 * tableaux communs. Chaque langue a son propre fichier de textes, écrits pour les recherches de cette langue.
 *
 * NOTE GELÉE : ces pages décrivent un jeu entièrement traduit. Tant que le jeu complet (421, Coups Fourrés,
 * comptes, boutique…) n'est PAS publié en en/de/nl, elles NE DOIVENT PAS être publiées seules : elles partent
 * sur `main` en même temps que le jeu traduit, jamais avant. Tant que ce n'est pas le cas, garder la branche
 * wip-i18n-seo hors de main.
 *
 * Valeurs (Farkle, 421, Coups Fourrés) : lues dans les mêmes sources que les pages françaises, contrôlées par tests/seo.test.ts.
 */
import { CF_RULES, CARDS, DECK_RULES } from '../shared/cards/catalog.ts';
import { DM_TARGETS, kindValue } from './seo-courtisan-pages.mjs';

export const UPDATED = '2026-11-09';
export { CF_RULES, CARDS, DECK_RULES, DM_TARGETS, kindValue };
export const LOCALES = { en: 'en-US', de: 'de-DE', nl: 'nl-NL' };

/** Fond 421 (valeurs par défaut du jeu, shared/config.ts) : mêmes chiffres que `DEFAULT_CONFIG`, contrôlés par les tests. */
export const V421 = { pot: 21, v421: 8, v111: 7, suite: 2, autre: 1, nenette: 2, throws: 3, chargeThrows: 1 };

/** Une page = un groupe : version française et versions traduites (hreflang réciproques, x-default vers le français). */
export const I18N_GROUPS = [
  { fr: 'jouer-au-421-en-ligne', en: 'play-421-dice-game-online', de: '421-wuerfelspiel-online', nl: '421-dobbelspel-online' },
  { fr: 'regles-du-421', en: '421-dice-game-rules', de: '421-wuerfelspiel-regeln', nl: '421-dobbelspel-regels' },
  { fr: 'jeu-de-des-entre-amis', en: 'online-dice-game-with-friends', de: 'online-wuerfelspiel-mit-freunden', nl: 'online-dobbelspel-met-vrienden' },
  { fr: 'dix-mille-en-ligne', en: 'play-farkle-online', de: 'farkle-online-spielen', nl: 'farkle-online-spelen' },
  { fr: 'regles-du-dix-mille', en: 'farkle-rules', de: 'zehntausend-wuerfelspiel-regeln', nl: 'farkle-spelregels' },
  { fr: 'jeu-de-des-kingdom-come-deliverance-2', en: 'kingdom-come-deliverance-2-dice-game', de: 'kingdom-come-deliverance-2-wuerfelspiel', nl: 'kingdom-come-deliverance-2-dobbelspel' },
  { fr: 'coups-fourres', en: 'coups-fourres-card-dice-game', de: 'coups-fourres-karten-wuerfelspiel', nl: 'coups-fourres-kaart-dobbelspel' },
  { fr: 'regles-coups-fourres', en: 'coups-fourres-rules', de: 'coups-fourres-regeln', nl: 'coups-fourres-spelregels' },
];

export const DISCLAIMERS = {
  en: '421online.com is an independent website, not affiliated with Warhorse Studios, Deep Silver or Plaion; Kingdom Come: Deliverance is a trademark of its owners.',
  de: '421online.com ist eine unabhängige Website und steht in keiner Verbindung zu Warhorse Studios, Deep Silver oder Plaion; Kingdom Come: Deliverance ist eine Marke der jeweiligen Inhaber.',
  nl: '421online.com is een onafhankelijke website, niet verbonden aan Warhorse Studios, Deep Silver of Plaion; Kingdom Come: Deliverance is een handelsmerk van de respectieve eigenaars.',
};

/** Boutons « Jouer » (échappés pour un attribut HTML). */
export const playLinks = (lang) => ({
  l421: `/?lang=${lang}`,
  courtisan: `/?mode=courtisan&amp;lang=${lang}`,
  cartes: `/?mode=cartes&amp;lang=${lang}`,
});

export const helpers = (lang) => {
  const nb = (n) => n.toLocaleString(LOCALES[lang]);
  const dice = (s) => `<span class="dice" role="img" aria-label="${s.split('').join('-')}">${s.split('').map((d) => `<i class="d d${d}"></i>`).join('')}</span>`;
  const toc = (label, items) => `<nav class="toc" aria-label="${label}"><b>${label}</b><ol>${items.map(([id, t]) => `<li><a href="#${id}">${t}</a></li>`).join('')}</ol></nav>`;
  const play = (href, label, sub) => `<p class="play-box"><a class="cta" href="${href}" data-play>${label}</a>${sub ? `<small>${sub}</small>` : ''}</p>`;
  return { nb, dice, toc, play };
};

/** Tableau des combinaisons du 421 (mêmes valeurs que DEFAULT_CONFIG). */
export const combosTable = (L, dice) => `<div class="table-wrap"><table>
<thead><tr><th>${L.head[0]}</th><th>${L.head[1]}</th><th>${L.head[2]}</th></tr></thead>
<tbody>
<tr><td>${L.r421}</td><td>${dice('421')}</td><td>${L.tokens(V421.v421)}</td></tr>
<tr><td>${L.r111}</td><td>${dice('111')}</td><td>${L.tokens(V421.v111)}</td></tr>
<tr><td>${L.rx}</td><td>${dice('611')} ${dice('666')} … ${dice('211')} ${dice('222')}</td><td>${L.rxv}</td></tr>
<tr><td>${L.rs}</td><td>${dice('654')} ${dice('321')}</td><td>${L.tokens(V421.suite)}</td></tr>
<tr><td>${L.ro}</td><td>${dice('652')} ${dice('533')}</td><td>${L.tokens(V421.autre)}</td></tr>
<tr><td>${L.rn}</td><td>${dice('221')}</td><td>${L.rnv}</td></tr>
</tbody></table></div>`;

/** Tableau trois à six dés identiques (valeurs du moteur). */
export const kindsTable = (L, dice, nb) => `<div class="table-wrap"><table>
<thead><tr><th>${L.face}</th><th>${L.three}</th><th>${L.four}</th><th>${L.five}</th><th>${L.six}</th></tr></thead>
<tbody>
${[1, 2, 3, 4, 5, 6].map((f) => `<tr><td>${dice(String(f))} ${L.of(f)}</td>${[3, 4, 5, 6].map((n) => `<td>${nb(kindValue(f, n))}</td>`).join('')}</tr>`).join('\n')}
</tbody></table></div>`;

/** Barème principal du Farkle. */
export const scoringTable = (L, dice, nb) => `<div class="table-wrap"><table>
<thead><tr><th>${L.h[0]}</th><th>${L.h[1]}</th></tr></thead>
<tbody>
<tr><td>${L.one}<br>${dice('1')}</td><td>100</td></tr>
<tr><td>${L.five}<br>${dice('5')}</td><td>50</td></tr>
<tr><td>${L.t1}<br>${dice('111')}</td><td>${nb(kindValue(1, 3))}</td></tr>
<tr><td>${L.tx}<br>${dice('444')}</td><td>${L.txv}</td></tr>
<tr><td>${L.more}<br>${dice('2222')}</td><td>${L.morev}</td></tr>
<tr><td>${L.s15}<br>${dice('12345')}</td><td>500</td></tr>
<tr><td>${L.s26}<br>${dice('23456')}</td><td>750</td></tr>
<tr><td>${L.s16}<br>${dice('123456')}</td><td>${nb(1500)}</td></tr>
</tbody></table></div>`;

/** Risque de « farkle » selon le nombre de dés (MISS_CHANCE de shared/dixmille/ai.ts). */
export const oddsTable = (head, rows) => `<div class="table-wrap"><table>
<thead><tr><th>${head[0]}</th><th>${head[1]}</th></tr></thead>
<tbody>
${rows.map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join('\n')}
</tbody></table></div>`;
