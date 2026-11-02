import { LEGAL } from '../legal';
import { Shell } from './Screens';

const missing = (v: string, what: string) => v || <span className="todo">[{what} à compléter]</span>;

/** Politique de confidentialité et mentions légales (adresse directe : /confidentialite). */
export function LegalScreen({ onBack }: { onBack: () => void }) {
  const contact = LEGAL.contactEmail ? <a className="link" href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</a> : missing('', 'adresse e-mail de contact');
  return (
    <Shell title="Confidentialité" onBack={onBack}>
      <div className="rules legal">
        <p>Dernière mise à jour : {LEGAL.updated}.</p>
        <p>Le jeu de 421 est édité par <b>{LEGAL.owner}</b>, responsable du traitement des données. Contact : {contact}.</p>

        <h3>En bref</h3>
        <ul>
          <li>On peut jouer <b>sans compte</b> : le serveur ne garde alors qu'un relevé anonyme des parties terminées, pour les statistiques publiques.</li>
          <li>Le compte est facultatif et ne demande <b>ni e-mail, ni nom réel</b> : un pseudo et un mot de passe.</li>
          <li><b>Aucune publicité, aucune mesure d'audience, aucun cookie</b>, aucune donnée vendue ni partagée.</li>
          <li>Vous pouvez <b>télécharger vos données</b> et <b>supprimer votre compte</b> à tout moment depuis « Mon compte ».</li>
        </ul>

        <h3>Sans compte</h3>
        <p>Vos réglages, votre progression d'invité et votre photo restent <b>sur votre appareil</b> (stockage du navigateur) et ne sont jamais envoyés.
          En ligne, le nom et l'avatar que vous choisissez ainsi que vos actions de jeu sont transmis aux autres joueurs de la table
          et gardés en mémoire par le serveur le temps de la partie, puis effacés.</p>
        <p><b>Statistiques du jeu.</b> Pour afficher le nombre de joueurs en ligne et de parties jouées, l'application tire au hasard un
          identifiant d'appareil (gardé sur votre appareil, sans lien avec votre identité) et le serveur enregistre, pour chaque partie
          terminée : la date, la durée, le type de partie, le nombre de joueurs, qui a gagné (identifiant d'appareil ou de compte).
          Seuls des totaux sont affichés publiquement. Quand un compte est supprimé, ses parties restent comptées mais ne lui sont plus rattachées.</p>

        <h3>Avec un compte</h3>
        <p>Le serveur enregistre :</p>
        <ul>
          <li>votre <b>pseudo</b> et la date de création du compte ;</li>
          <li>votre <b>mot de passe</b> et votre <b>code de récupération</b>, uniquement sous forme d'empreinte chiffrée (personne ne peut les lire) ;</li>
          <li>votre <b>progression</b> : niveau, XP, pièces, objets, statistiques, succès, défis du jour, résultats en ligne ;</li>
          <li>votre <b>photo de profil</b>, si vous en ajoutez une ;</li>
          <li>vos <b>amis</b>, les joueurs que vous avez <b>bloqués</b> et les <b>signalements</b> de photo que vous avez faits ;</li>
          <li>vos <b>sessions de connexion</b> (empreinte du jeton et date de dernière utilisation) ;</li>
          <li>les <b>mises</b> engagées dans une partie en cours, le temps de la partie (pour pouvoir les rembourser en cas d'incident).</li>
        </ul>
        <p>Sont visibles par les autres joueurs : votre pseudo, votre photo, votre niveau, vos statistiques, vos succès et votre place au classement.</p>
        <p>Votre <b>adresse IP</b> sert uniquement, en mémoire et pendant quelques minutes, à limiter les tentatives de connexion répétées. Elle n'est pas enregistrée dans la base du jeu.
          L'hébergeur peut conserver des journaux techniques selon sa propre politique.</p>

        <h3>Pourquoi, et sur quelle base</h3>
        <ul>
          <li>Faire fonctionner le compte et le jeu en ligne : exécution du service que vous demandez (article 6.1.b du RGPD).</li>
          <li>Sécurité, prévention des abus et modération des photos : intérêt légitime (article 6.1.f).</li>
          <li>Statistiques anonymes du jeu : intérêt légitime (article 6.1.f).</li>
        </ul>

        <h3>Durée de conservation</h3>
        <p>Jusqu'à la suppression de votre compte, qui efface immédiatement et définitivement toutes les données ci-dessus.
          Une session inutilisée pendant 180 jours expire. Les parties en cours ne sont gardées qu'en mémoire.</p>

        <h3>Qui y a accès</h3>
        <p>L'éditeur, et l'hébergeur du serveur en tant que sous-traitant : {LEGAL.host}. Les polices et tous les fichiers du jeu sont servis par notre propre serveur.
          Aucune donnée n'est transmise à d'autres services.</p>

        <h3>Vos droits</h3>
        <p>Vous pouvez accéder à vos données, les corriger, les emporter (fichier téléchargeable), vous opposer à un traitement ou les faire effacer.
          La plupart se font directement depuis « Mon compte » ; pour le reste, écrivez à {contact}.
          Vous pouvez aussi introduire une réclamation auprès de l'<b>Autorité de protection des données</b> (autoriteprotectiondonnees.be).</p>

        <h3>Âge</h3>
        <p>La création d'un compte est réservée aux personnes de <b>13 ans ou plus</b>. En dessous, on peut jouer sans compte.</p>

        <h3>Pièces et mises</h3>
        <p>Les pièces sont des points de jeu : elles ne s'achètent pas, ne s'échangent pas contre de l'argent et n'ont aucune valeur en dehors du jeu.
          Il en va de même des sacs et des dés de collection : ils se gagnent seulement en jouant, ne s'achètent ni avec de l'argent ni avec des pièces, et les chances de chaque rareté sont affichées dans la Collection.</p>

        <h3>Mentions légales</h3>
        <ul>
          <li>Éditeur : {LEGAL.owner}, {missing(LEGAL.postalAddress, 'adresse postale')}.</li>
          <li>Contact : {contact}.</li>
          <li>Hébergement : {LEGAL.host}.</li>
          <li>Le jeu de 421 est un jeu traditionnel ; le code, les graphismes et les sons de ce site appartiennent à leur éditeur.</li>
        </ul>
      </div>
    </Shell>
  );
}
