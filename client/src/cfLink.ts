/**
 * Lien d'entrée direct dans Coups Fourrés : `/?mode=cartes` (bouton « Jouer gratuitement » des
 * pages d'aide du mode). `?mode=coups-fourres` est aussi accepté.
 */
export const cfModeParam = (search: string): boolean =>
  /^(cartes|coups-fourres)$/i.test(new URLSearchParams(search).get('mode') ?? '');

/** Lien d'entrée direct dans Le Courtisan : `/?mode=courtisan` (aussi `dix-mille` et `farkle`). */
export const courtisanModeParam = (search: string): boolean =>
  /^(courtisan|dix-mille|dixmille|farkle)$/i.test(new URLSearchParams(search).get('mode') ?? '');

/** Lien d'entrée direct dans le Poker menteur : `/?mode=poker` (aussi `poker-menteur`). */
export const pokerModeParam = (search: string): boolean =>
  /^(poker|poker-menteur|pokermenteur)$/i.test(new URLSearchParams(search).get('mode') ?? '');
