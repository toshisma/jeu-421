import { tr } from '../i18n/lang';
/**
 * Coups Fourrés : ce qui est « en jeu » pour un joueur pendant la manche, écrit en clair sous son nom
 * (0.39, « les informations se perdent ») : bonus et malus en attente que rien d'autre ne montre.
 */
import type { CfPlayerView, CfView } from '../../../shared/cards/engine';
import type { CardType } from '../../../shared/cards/catalog';

export interface ActiveEffect {
  /** Texte court (« ×2 s’il gagne »). */
  text: string;
  /** Carte d'où vient l'effet (pour ouvrir sa fiche). */
  card: string;
  type: CardType;
  /** good = à l'avantage de ce joueur, bad = à son désavantage. */
  tone: 'good' | 'bad';
}

/** Effets en attente pour ce joueur cette manche (vue publique : tout le monde les voit). */
export function activeEffects(v: CfView, p: CfPlayerView, me: boolean): ActiveEffect[] {
  const r = p.r;
  const out: ActiveEffect[] = [];
  const s = (a: string, b: string) => (me ? a : b);
  if (r.doubles > 0) out.push({ text: s(tr('cf.effects.combinaison_2_si_vous_gagnez'), tr('cf.effects.combinaison_2_s_il_gagne')), card: 'double-tournee', type: 'coup', tone: 'good' });
  if (r.noteSalee > 0) out.push({ text: s(tr('cf.effects.jetons_donnes_si_vous_gagnez', { a: 2 * r.noteSalee }), tr('cf.effects.jetons_donnes_s_il_gagne', { a: 2 * r.noteSalee })), card: 'note-salee', type: 'dernier-mot', tone: 'good' });
  if (r.pari > 0) out.push({ text: tr('cf.effects.pari_jetons', { a: 2 * r.pari }), card: 'pari-comptoir', type: 'coup', tone: 'good' });
  if (r.bonusThrows > 0) out.push({ text: tr('cf.effects.lancer', { bonusThrows: r.bonusThrows, s: r.bonusThrows > 1 ? 's' : '' }), card: 'cul-sec', type: 'coup', tone: 'good' });
  if (r.discount > 0) out.push({ text: r.discount >= 5 ? s(tr('cf.effects.prochaine_carte_gratuite'), tr('cf.effects.sa_prochaine_carte_gratuite')) : s(tr('cf.effects.prochaine_carte', { discount: r.discount }), tr('cf.effects.sa_prochaine_carte', { discount: r.discount })), card: 'mise-bouche', type: 'coup', tone: 'good' });
  if ((r.efface ?? 0) > 0) out.push({ text: s(tr('cf.effects.si_vous_perdez_1_seul_jeton'), tr('cf.effects.s_il_perd_1_seul_jeton')), card: 'efface-tout', type: 'dernier-mot', tone: 'good' });
  if ((r.addition ?? 0) > 0) out.push({ text: s(tr('cf.effects.au_moins_3_si_vous_gagnez'), tr('cf.effects.au_moins_3_s_il_gagne')), card: 'addition', type: 'dernier-mot', tone: 'good' });
  if ((r.sante ?? 0) > 0) out.push({ text: s(tr('cf.effects.si_vous_perdez_1_jeton_au'), tr('cf.effects.s_il_perd_1_jeton_au')), card: 'sante', type: 'dernier-mot', tone: 'good' });
  if ((r.roundDiscount ?? 0) > 0) out.push({ text: s(tr('cf.effects.vos_cartes_cette_manche', { roundDiscount: (r.roundDiscount)!}), tr('cf.effects.ses_cartes_cette_manche', { roundDiscount: (r.roundDiscount)!})), card: 'effet-papillon', type: 'coup', tone: 'good' });
  if ((p.tourneesNext ?? 0) > 0) out.push({ text: tr('cf.effects.tournees_a_la_prochaine_manche', { tourneesNext: (p.tourneesNext)!}), card: 'plat-du-jour', type: 'coup', tone: 'good' });
  if (r.locked) out.push({ text: tr('cf.effects.plus_de_carte_cette_manche'), card: r.locked, type: 'piege', tone: 'bad' });
  const penCard = (id: string | undefined) => (id === 'verre-offert' ? { card: id, type: 'coup' as const } : { card: 'gueule-bois', type: 'piege' as const });
  if (r.throwPenalty > 0) out.push({ text: tr('cf.effects.un_seul_lancer'), ...penCard(r.penaltyCard), tone: 'bad' });
  if (r.faux421) out.push({ text: tr('cf.effects.4_2_1_ne_vaut_que'), card: 'faux-421', type: 'piege', tone: 'bad' });
  if (r.forcedNenette) out.push({ text: tr('cf.effects.combinaison_changee_en_nenette'), card: 'coup-nenette', type: 'piege', tone: 'bad' });
  if (p.penaltyNext > 0 && (v.phase !== 'turn' || p.penaltyNextCard === 'verre-offert')) out.push({ text: tr('cf.effects.un_seul_lancer_a_la_prochaine'), ...penCard(p.penaltyNextCard), tone: 'bad' });
  return out;
}

/**
 * Ce que fait chaque carte, en quelques mots (écrit sous son nom dans la main). Le texte complet reste
 * sur la carte en grand. Une carte absente d'ici affiche le passage en gras de son texte.
 */
export const CARD_GIST: Record<string, string> = {
  get patron() { return tr('cf.effects.1_tournee_et_1_carte_par'); },
  get josiane() { return tr('cf.effects.1_de_relance_gratis_par_manche'); },
  get 'vieux-marcel'() { return tr('cf.effects.suites_a_4_piochez_1_carte'); },
  get pilier() { return tr('cf.effects.2_jetons_de_moins_si_vous'); },
  get videur() { return tr('cf.effects.annule_le_1er_piege_adverse'); },
  get 'tournee-patron'() { return tr('cf.effects.3_tournees'); },
  get 'ticket-caisse'() { return tr('cf.effects.annule_un_coup_4_ou_moins'); },
  get fermeture() { return tr('cf.effects.chasse_un_habitue_sinon_2_tournees'); },
  get 'note-salee'() { return tr('cf.effects.2_jetons_donnes_si_vous_gagnez'); },
  get 'cul-sec'() { return tr('cf.effects.1_lancer_ce_tour_et_1'); },
  get 'tete-tourne'() { return tr('cf.effects.retourne_un_de_1_6_2'); },
  get 'pari-comptoir'() { return tr('cf.effects.pari_2_jetons_de_plus'); },
  get 'double-tournee'() { return tr('cf.effects.combinaison_2_si_vous_gagnez'); },
  get 'de-sous-table'() { return tr('cf.effects.relance_un_de_le_sien_si'); },
  get 'yeux-piquent'() { return tr('cf.effects.annule_un_coup_sur_les_des'); },
  get 'gueule-bois'() { return tr('cf.effects.s_il_perd_un_seul_lancer'); },
  get 'tournee-generale'() { return tr('cf.effects.relance_tous_les_des'); },
  get leurre() { return tr('cf.effects.faux_piege_1_tournee_1_carte'); },
  get 'croche-patte'() { return tr('cf.effects.relance_un_de_ses_des_a'); },
  get 'main-sac'() { return tr('cf.effects.annule_son_coup_a_1_ou'); },
  get fouine() { return tr('cf.effects.defausse_un_piege_piochez_1'); },
  get 'ardoise-piegee'() { return tr('cf.effects.ses_coups_coutent_3_de_plus'); },
  get 'faux-421'() { return tr('cf.effects.son_4_2_1_ne_vaut'); },
  get 'coup-nenette'() { return tr('cf.effects.sa_victoire_a_1_ou_2'); },
  get 'retournement-veste'() { return tr('cf.effects.renvoie_un_gros_don_8_et'); },
  get 'coup-coude'() { return tr('cf.effects.piochez_1_carte'); },
  get 'mise-bouche'() { return tr('cf.effects.1_carte_la_suivante_2'); },
  get 'coup-pouce'() { return tr('cf.effects.1_ou_1_sur_un_de'); },
  get 'calcul-mental'() { return tr('cf.effects.choisissez_1_carte_parmi_3'); },
  get recompter() { return tr('cf.effects.1_ou_1_sur_un_de_2'); },
  get domino() { return tr('cf.effects.l_adversaire_perd_ses_tournees'); },
  get 'reaction-chaine'() { return tr('cf.effects.annule_une_carte_adverse'); },
  get 'bon-numero'() { return tr('cf.effects.un_de_sur_la_face_voulue'); },
  get 'grand-enchainement'() { return tr('cf.effects.rejouez_votre_dernier_coup'); },
  get 'beau-frere'() { return tr('cf.effects.1_tournee_cartes_a_1_de'); },
  get 'efface-tout'() { return tr('cf.effects.si_vous_perdez_1_seul_jeton_2'); },
  get 'verre-offert'() { return tr('cf.effects.un_seul_lancer_pour_l_adversaire'); },
  get trinquer() { return tr('cf.effects.echange_un_de_avec_l_adversaire'); },
  get 'vide-poches'() { return tr('cf.effects.prenez_lui_1_tournee_et_1'); },
  get mouchard() { return tr('cf.effects.s_il_joue_un_coup_1'); },
  get 'tant-qu-on-y-est'() { return tr('cf.effects.2_tournees_1_par_carte_jouee'); },
  get 'petite-soeur'() { return tr('cf.effects.reprend_le_dernier_coup_defausse'); },
  get pourboire() { return tr('cf.effects.donnez_1_jeton_piochez_1_carte'); },
  get 'coup-etrier'() { return tr('cf.effects.relance_un_de_vos_des_a'); },
  get fanfaron() { return tr('cf.effects.1_jeton_donne_si_vous_gagnez'); },
  get 'verre-de-trop'() { return tr('cf.effects.s_il_relance_1_jeton_pour'); },
  get 'courant-air'() { return tr('cf.effects.son_habitue_ou_sa_riposte_s'); },
  get 'pot-aux-roses'() { return tr('cf.effects.annule_une_carte_a_2_ou'); },
  get complice() { return tr('cf.effects.vos_pieges_1_tournee_1_carte'); },
  get engrenage() { return tr('cf.effects.annule_sa_2e_carte_de_la'); },
  // 0.46
  get 'joueur-belote'() { return tr('cf.effects.brelans_3_piochez_1_carte'); },
  get 'garde-champetre'() { return tr('cf.effects.1_carte_personne_ne_touche_a'); },
  get doyen() { return tr('cf.effects.1_tournee_1_carte_habitues_1'); },
  get 'cafe-serre'() { return tr('cf.effects.1_carte_1_tournee_si_habitue'); },
  get 'plat-du-jour'() { return tr('cf.effects.2_tournees_a_la_manche_suivante'); },
  get 'table-reservee'() { return tr('cf.effects.annule_un_piege_pose_sur_vous'); },
  get addition() { return tr('cf.effects.gagnant_au_moins_3'); },
  get 'pique-assiette'() { return tr('cf.effects.ses_tournees_gagnees_sont_pour_vous'); },
  get debauchage() { return tr('cf.effects.prenez_lui_un_habitue_sinon_2'); },
  get retrouvailles() { return tr('cf.effects.un_habitue_revient_1_carte'); },
  get 'petit-dernier'() { return tr('cf.effects.relance_un_de_vos_des'); },
  get hoquet() { return tr('cf.effects.un_de_ses_des_gardes_est'); },
  get 'der-des-ders'() { return tr('cf.effects.s_il_perd_1_jeton_pour'); },
  get sante() { return tr('cf.effects.si_vous_perdez_1_jeton_au'); },
  get calva() { return tr('cf.effects.retourne_un_de_a_la_fin'); },
  get miroir() { return tr('cf.effects.un_de_copie_un_autre_de'); },
  get pochtron() { return tr('cf.effects.1_lancer_a_chaque_tour'); },
  get 'a-la-votre'() { return tr('cf.effects.annule_une_riposte'); },
  get 'verres-echanges'() { return tr('cf.effects.echange_vos_3_des_avec_les'); },
  get 'fee-verte'() { return tr('cf.effects.un_de_vise_jusqu_a_3'); },
  get 'mot-de-trop'() { return tr('cf.effects.annule_son_dernier_mot'); },
  get 'peau-banane'() { return tr('cf.effects.combinaison_a_4_un_de_relance'); },
  get guetteur() { return tr('cf.effects.1_tournee_1_carte_voit_les'); },
  get denonciation() { return tr('cf.effects.defausse_un_piege_1_tournee_1'); },
  get 'passe-passe'() { return tr('cf.effects.reprend_un_piege_1_tournee_1'); },
  get 'attrape-nigaud'() { return tr('cf.effects.defausse_le_piege_qu_il_pose'); },
  get 'lot-consolation'() { return tr('cf.effects.s_il_gagne_1_tournee_2'); },
  get 'flagrant-delit'() { return tr('cf.effects.annule_un_coup_a_0_ou'); },
  get souriciere() { return tr('cf.effects.apres_sa_1re_carte_plus_rien'); },
  get embuscade() { return tr('cf.effects.pose_tous_vos_pieges_gratis'); },
  get 'boule-de-neige'() { return tr('cf.effects.1_carte_par_carte_deja_jouee'); },
  get ricochet() { return tr('cf.effects.1_sur_un_de_apres_une'); },
  get 'noeud-coulant'() { return tr('cf.effects.a_sa_2e_carte_1_jeton'); },
  get 'compte-rond'() { return tr('cf.effects.1_tournee_par_carte_jouee'); },
  get 'retour-envoyeur'() { return tr('cf.effects.annule_un_coup_il_le_reprend'); },
  get comptable() { return tr('cf.effects.2e_carte_1_tournee_1_carte'); },
  get 'derniere-maille'() { return tr('cf.effects.un_de_sur_la_face_voulue_2'); },
  get echo() { return tr('cf.effects.rejoue_son_dernier_coup'); },
  get boucle() { return tr('cf.effects.reprend_2_cartes_defaussees'); },
  get 'effet-papillon'() { return tr('cf.effects.1_carte_les_suivantes_1'); },
};
