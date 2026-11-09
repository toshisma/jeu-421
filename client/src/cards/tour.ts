import { tr } from '../i18n/lang';
/**
 * Coups Fourrés : visite guidée de l'écran (0.39, demande de Sam : « montrer où sont toutes les infos
 * et à quoi elles correspondent »). Jouée au début des parties guidées (à 2 et à 4) et depuis l'aide.
 */
import { CF_RULES } from '../../../shared/cards/catalog';

export interface TourStep { title: string; text: string; focus: 'top' | 'opp' | 'say' | 'tray' | 'hand' | 'me' | null }

export function screenTour(opponents: number): TourStep[] {
  const multi = opponents > 1;
  const steps: TourStep[] = [
    { focus: 'opp', title: multi ? tr('cf.tour.vos_adversaires') : tr('cf.tour.votre_adversaire'), text: tr('cf.tour.le_gros_chiffre_ses_jetons_le', { a: multi ? tr('cf.tour.une_case_par_adversaire_ici_celui', { opponents: opponents }) : '' }) },
    { focus: 'say', title: tr('cf.boardparts.le_bandeau'), text: tr('cf.tour.il_dit_toujours_a_qui_de', { a: multi ? tr('cf.tour.la_petite_ligne_dessous_le_dernier') : tr('cf.tour.le_dernier_coup_de_l_adversaire') }) },
    { focus: 'tray', title: tr('cf.boardparts.le_bac'), text: tr('cf.tour.les_des_de_celui_qui_joue', { maxThrows: CF_RULES.maxThrows }) },
    { focus: 'hand', title: tr('cf.boardparts.vos_cartes'), text: tr('cf.tour.sous_chaque_nom_ce_que_fait') },
    { focus: 'me', title: tr('cf.boardparts.vous'), text: tr('cf.tour.vos_jetons_vos_tournees_vos_habitues') },
    { focus: 'top', title: tr('cf.boardparts.en_haut'), text: tr('cf.tour.journal_tout_ce_qui_s_est') },
  ];
  if (multi) steps.push({ focus: null, title: tr('cf.tour.a_plusieurs'), text: tr('cf.tour.a_chaque_manche_seul_le_plus') });
  return steps;
}
