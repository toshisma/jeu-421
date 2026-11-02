/**
 * Informations légales affichées sur la page « Confidentialité et mentions légales ».
 * Adresse de contact et adresse postale de l'éditeur : obligatoires pour un site accessible
 * au public en Belgique.
 */
export const LEGAL = {
  owner: 'Sam Renson',
  /** Adresse e-mail de contact (droits RGPD, signalements). */
  contactEmail: 'samrenson@gmail.com',
  /** Adresse postale de l'éditeur (mentions légales). */
  postalAddress: 'rue Victor Croisier 32, 4000 Liège, Belgique',
  /** Hébergeur du serveur de jeu. */
  host: 'Render Services, Inc. (render.com), serveurs situés à Francfort (Allemagne)',
  updated: '2 novembre 2026',
};

/** Lien « Signaler un problème » : un e-mail prérempli avec les informations utiles. */
export function reportUrl(): string {
  const body = [
    'Décrivez le problème (ce que vous faisiez, ce qui s’est passé) :',
    '',
    '',
    '---',
    `Page : ${location.pathname}`,
    `Navigateur : ${navigator.userAgent}`,
    `Écran : ${window.innerWidth} × ${window.innerHeight}`,
    `Date : ${new Date().toLocaleString('fr-BE')}`,
  ].join('\n');
  return `mailto:${LEGAL.contactEmail}?subject=${encodeURIComponent('421 : un problème')}&body=${encodeURIComponent(body)}`;
}
