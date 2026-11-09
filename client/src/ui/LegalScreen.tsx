import { trServer, tr } from '../i18n/lang';
import { LEGAL } from '../legal';
import { Shell } from './kit';

const missing = (v: string, what: string) => v || <span className="todo">{tr('app.a_completer', { what })}</span>;

/** Politique de confidentialité et mentions légales (adresse directe : /confidentialite). */
export function LegalScreen({ onBack }: { onBack: () => void }) {
  const contactNode = LEGAL.contactEmail ? <a className="link" href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</a> : missing('', tr('app.adresse_e_mail_de_contact'));
  const withContact = (t: string) => { const [a, b] = t.split('{contact}'); return <>{a}{contactNode}{b}</>; };
  return (
    <Shell title={tr('app.confidentialite')} onBack={onBack} icon="lock" sub={tr('app.sans_publicite_sans_cookie_sans_e_ma')}>
      <div className="rules legal">
        <p>{tr('app.derniere_mise_a_jour', { updated: trServer(LEGAL.updated) })}</p>
        <p>{tr('app.le_jeu_de_421_est_edite_par')} <b>{LEGAL.owner}</b>{withContact(tr('app.responsable_du_traitement_des_donnee'))}</p>

        <h3>{tr('app.en_bref')}</h3>
        <ul>
          <li>{tr('app.on_peut_jouer')} <b>{tr('app.sans_compte')}</b>{tr('app.le_serveur_ne_garde_alors_qu_un')}</li>
          <li>{tr('app.le_compte_est_facultatif_et_ne_deman')} <b>{tr('app.ni_e_mail_ni_nom_reel')}</b>{tr('app.un_pseudo_et_un_mot_de_passe')}</li>
          <li><b>{tr('app.aucune_publicite_aucune_mesure_d_aud')}</b>{tr('app.aucune_donnee_vendue_ni_partagee')}</li>
          <li>{tr('app.vous_pouvez')} <b>{tr('app.telecharger_vos_donnees')}</b> {tr('app.et')} <b>{tr('app.supprimer_votre_compte')}</b> {tr('app.a_tout_moment_depuis_mon_compte')}</li>
        </ul>

        <h3>{tr('app.sans_compte_2')}</h3>
        <p>{tr('app.vos_reglages_votre_progression_d_inv')} <b>{tr('app.sur_votre_appareil')}</b> {tr('app.stockage_du_navigateur_et_ne_sont_ja')}</p>
        <p><b>{tr('app.statistiques_du_jeu')}</b> {tr('app.pour_afficher_le_nombre_de_joueurs_e')}</p>
        <p><b>{tr('app.mesure_d_audience')}</b> {tr('app.avec_ce_meme_identifiant_aleatoire_h')}</p>

        <h3>{tr('app.avec_un_compte')}</h3>
        <p>{tr('app.le_serveur_enregistre')}</p>
        <ul>
          <li>{tr('app.votre')} <b>{tr('app.pseudo')}</b> {tr('app.et_la_date_de_creation_du_compte')}</li>
          <li>{tr('app.votre')} <b>{tr('app.mot_de_passe')}</b> {tr('app.et_votre')} <b>{tr('app.code_de_recuperation')}</b>{tr('app.uniquement_sous_forme_d_empreinte_ch')}</li>
          <li>{tr('app.votre')} <b>{tr('app.progression')}</b>{tr('app.niveau_xp_pieces_objets_statistiques')}</li>
          <li>{tr('app.votre')} <b>{tr('app.photo_de_profil')}</b>{tr('app.si_vous_en_ajoutez_une')}</li>
          <li>{tr('app.vos')} <b>{tr('app.amis_2')}</b>{tr('app.les_joueurs_que_vous_avez')} <b>{tr('app.bloques')}</b> {tr('app.et_les')} <b>{tr('app.signalements')}</b> {tr('app.de_photo_que_vous_avez_faits')}</li>
          <li>{tr('app.vos')} <b>{tr('app.sessions_de_connexion')}</b> {tr('app.empreinte_du_jeton_et_date_de_dernie')}</li>
          <li>{tr('app.les')} <b>{tr('app.mises')}</b> {tr('app.engagees_dans_une_partie_en_cours_le')}</li>
        </ul>
        <p>{tr('app.sont_visibles_par_les_autres_joueurs')}</p>
        <p>{tr('app.votre_2')} <b>{tr('app.adresse_ip')}</b> {tr('app.sert_uniquement_en_memoire_et_pendan')}</p>

        <h3>{tr('app.pourquoi_et_sur_quelle_base')}</h3>
        <ul>
          <li>{tr('app.faire_fonctionner_le_compte_et_le_je')}</li>
          <li>{tr('app.securite_prevention_des_abus_et_mode')}</li>
          <li>{tr('app.statistiques_anonymes_du_jeu_interet')}</li>
        </ul>

        <h3>{tr('app.duree_de_conservation')}</h3>
        <p>{tr('app.jusqu_a_la_suppression_de_votre_comp')}</p>

        <h3>{tr('app.qui_y_a_acces')}</h3>
        <p>{tr('app.l_editeur_et_l_hebergeur_du_serveur', { host: trServer(LEGAL.host) })}</p>

        <h3>{tr('app.vos_droits')}</h3>
        <p>{withContact(tr('app.vous_pouvez_acceder_a_vos_donnees_le'))}<b>{tr('app.autorite_de_protection_des_donnees')}</b> {tr('app.autoriteprotectiondonnees_be')}</p>

        <h3>{tr('app.age')}</h3>
        <p>{tr('app.la_creation_d_un_compte_est_reservee')} <b>{tr('app.13_ans_ou_plus')}</b>{tr('app.en_dessous_on_peut_jouer_sans_compte')}</p>

        <h3>{tr('app.pieces_et_mises')}</h3>
        <p>{tr('app.les_pieces_sont_des_points_de_jeu')}</p>

        <h3>{tr('app.mentions_legales')}</h3>
        <ul>
          <li>{tr('app.editeur', { owner: LEGAL.owner })} {missing(LEGAL.postalAddress, 'adresse postale')}.</li>
          <li>{withContact(tr('app.contact'))}</li>
          <li>{tr('app.hebergement', { host: trServer(LEGAL.host) })}</li>
          <li>{tr('app.le_jeu_de_421_est_un_jeu')}</li>
        </ul>
      </div>
    </Shell>
  );
}
