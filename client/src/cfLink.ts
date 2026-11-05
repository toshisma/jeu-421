/**
 * Lien d'entrée direct dans Coups Fourrés : `/?mode=cartes` (bouton « Jouer gratuitement » des
 * pages d'aide du mode). `?mode=coups-fourres` est aussi accepté.
 */
export const cfModeParam = (search: string): boolean =>
  /^(cartes|coups-fourres)$/i.test(new URLSearchParams(search).get('mode') ?? '');
