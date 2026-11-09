import { tr } from '../i18n/lang';
/**
 * Coups Fourrés : « Apprendre » (menu du mode) et ses écrans de ressources.
 * Partie guidée, règles, toutes les cartes (pour tous, même les invités et les cartes non possédées),
 * conseils de stratégie et lexique. Les chiffres viennent du catalogue (CF_RULES, BOOSTER…).
 */
import { useState } from 'react';
import { BOOSTER, CF_RULES, DECK_RULES, type CardFamily, type CardType } from '../../../shared/cards/catalog';
import { CARDS, FAMILY_LABEL, TYPE_LABEL, cardDef } from './i18n';
import { FERMETURE_TOURNEES, LEURRE_DRAW, LEURRE_TOURNEES, TOURNEE_PATRON_GAIN, VESTE_MIN } from '../../../shared/cards/engine';
import { Icon } from '../ui/Icon';
import { plural } from './describe';
import { CardView, FamilyBadge } from './components';
import { CfShell } from './cfui';
import { TYPE_META, TypeIcon } from './cardTypes';

/** Coût imprimé d'une carte (conseils). */
const cost = (id: string) => cardDef(id)?.cost ?? 0;

const vw = () => (typeof window !== 'undefined' ? window.innerWidth : 360);

/** Bandeau « Nouveau ? » en haut du menu, pour qui n'a encore jamais joué. */
export function LearnHero({ onTuto }: { onTuto: () => void }) {
  return (
    <button className="cf-learn-hero" onClick={onTuto}>
      <span className="cf-learn-hero-ic" aria-hidden>🎓</span>
      <span><b>{tr('cf.learn.nouveau_apprenez_a_jouer_en_3')}</b><small>{tr('cf.learn.partie_guidee_contre_dede_pas_a')}</small></span>
      <Icon name="dice" size={20} />
    </button>
  );
}

/** Section « Apprendre » du menu : mise en avant tant que la partie guidée n'est pas faite. */
export function LearnBlock({ fresh, onTuto, onTuto4, onRules, onCards, onTips, onLexicon }: {
  fresh: boolean; onTuto: () => void; onTuto4?: () => void; onRules: () => void; onCards: () => void; onTips: () => void; onLexicon: () => void;
}) {
  return (
    <section className={`cf-learn${fresh ? ' fresh' : ''}`} aria-labelledby="cf-learn-h">
      <h2 id="cf-learn-h">{fresh ? tr('cf.learn.bien_debuter') : tr('cf.learn.apprendre')}</h2>
      <div className="cf-learn-grid">
        <button className={fresh ? 'hot' : ''} onClick={onTuto}><Icon name="dice" size={18} /><span><b>{tr('cf.learn.partie_guidee_a_2')}</b><small>{tr('cf.learn.3_minutes_pas_a_pas')}</small></span></button>
        {onTuto4 && <button onClick={onTuto4}><Icon name="people" size={18} /><span><b>{tr('cf.learn.partie_guidee_a_4')}</b><small>{tr('cf.learn.visite_de_l_ecran_puis_3')}</small></span></button>}
        <button onClick={onRules}><Icon name="rules" size={18} /><span><b>{tr('cf.learn.regles_du_jeu')}</b><small>{tr('cf.learn.manche_tournees_cartes')}</small></span></button>
        <button onClick={onCards}><span className="cf-learn-n" aria-hidden>{CARDS.length}</span><span><b>{tr('cf.info.les')}{CARDS.length}{tr('cf.info.cartes')}</b><small>{tr('cf.learn.par_famille_texte_complet')}</small></span></button>
        <button onClick={onTips}><Icon name="target" size={18} /><span><b>{tr('cf.learn.conseils')}</b><small>{tr('cf.learn.strategie_de_comptoir')}</small></span></button>
        <button onClick={onLexicon}><Icon name="album" size={18} /><span><b>{tr('cf.learn.lexique')}</b><small>{tr('cf.learn.tournee_habitue_riposte')}</small></span></button>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------------------------------------
// Toutes les cartes

const FAMS: CardFamily[] = ['habitues', 'ivresse', 'pieges', 'chaines'];
const WHEN: Record<CardType, string> = {
  get coup() { return tr('cf.learn.pendant_votre_tour_avant_ou_apres'); },
  get piege() { return tr('cf.learn.pose_face_cachee_pendant_votre_tour'); },
  get riposte() { return tr('cf.learn.a_tout_moment_en_reponse_a'); },
  get 'dernier-mot'() { return tr('cf.learn.seulement_au_dernier_mot_avant_les'); },
  get habitue() { return tr('cf.learn.pendant_votre_tour_reste_3_manches'); },
};

export function CardsCatalogScreen({ onBack }: { onBack: () => void }) {
  const [fam, setFam] = useState<CardFamily | 'tout'>('habitues');
  const [type, setType] = useState<CardType | 'tout'>('tout');
  const list = CARDS.filter((c) => (fam === 'tout' || c.family === fam) && (type === 'tout' || c.type === type));
  const w = Math.min(250, vw() - 48);
  return (
    <CfShell title={tr('cf.learn.les_cartes', { length: CARDS.length })} sub={tr('cf.learn.toutes_meme_celles_que_vous_n')} onBack={onBack}>
      <div className="cf-chips cf-cat-chips" role="tablist" aria-label={tr('cf.collection.famille')}>
        {FAMS.map((f) => <button key={f} role="tab" aria-selected={fam === f} className={fam === f ? 'on' : ''} onClick={() => setFam(f)}>{FAMILY_LABEL[f].replace(/^(Les |L’)/, '')}</button>)}
        <button role="tab" aria-selected={fam === 'tout'} className={fam === 'tout' ? 'on' : ''} onClick={() => setFam('tout')}>{tr('cf.collection.toutes')}</button>
      </div>
      <div className="cf-chips cf-cat-chips small" aria-label={tr('cf.collection.type')}>
        {(['tout', 'coup', 'piege', 'riposte', 'dernier-mot', 'habitue'] as const).map((t) => <button key={t} className={type === t ? 'on' : ''} onClick={() => setType(t)}>{t === 'tout' ? tr('cf.learn.tous_types') : TYPE_LABEL[t]}</button>)}
      </div>
      {fam !== 'tout' && <p className="cf-cat-fam"><FamilyBadge family={fam} /> <span>{FAM_TEXT[fam]}</span></p>}
      <ul className="cf-cat-list">
        {list.map((c) => (
          <li key={c.id}>
            <CardView id={c.id} width={w} />
            <small><b className="cfn-typetag" style={{ color: TYPE_META[c.type].color }}><TypeIcon type={c.type} size={13} />{TYPE_LABEL[c.type]}</b> · {WHEN[c.type]}</small>
          </li>
        ))}
        {!list.length && <li className="cf-muted">{tr('cf.learn.aucune_carte_de_ce_type_dans')}</li>}
      </ul>
    </CfShell>
  );
}

const FAM_TEXT: Record<CardFamily, string> = {
  get habitues() { return tr('cf.learn.des_allies_qui_s_installent_pour'); },
  get ivresse() { return tr('cf.info.des_des_qui_tournent_relancer_retour'); },
  get pieges() { return tr('cf.learn.des_pieges_poses_face_cachee_qui'); },
  get chaines() { return tr('cf.info.des_cartes_qui_s_enchainent_pioche'); },
};

// ------------------------------------------------------------------------------------------------
// Conseils

const R = CF_RULES;
const TIPS: { t: string; d: string }[] = [
  { get t() { return tr('cf.learn.economisez_puis_enchainez'); }, d: `Vous ne recevez que ${plural(R.tourneesPerRound, 'Tournée')} par manche (${R.tourneesPerRound + R.tourneesLoserBonus} après une manche perdue) et pouvez en garder ${R.tourneesMax}. Passer une manche sans rien jouer n’est pas une faute : c’est ce qui permet, plus tard, de jouer deux ou trois cartes d’affilée au moment qui compte.` },
  { get t() { return tr('cf.learn.les_combos'); }, d: `« Mise en bouche » (${plural(cost('mise-bouche'), 'Tournée')}) fait baisser de 2 la carte suivante : enchaînez-la avec « Tant qu’on y est », qui ne coûte alors qu’une Tournée et en rapporte 3, puis une grosse carte comme « Coup de pouce ». « L’Effet papillon » fait baisser toutes vos cartes de la manche, et « La Boule de neige » pioche d’autant plus que vous avez déjà joué. « Tournée du patron » (${plural(cost('tournee-patron'), 'Tournée')}, en rend ${TOURNEE_PATRON_GAIN}) et « Fermeture ! » sans Habitué en face (+${FERMETURE_TOURNEES}) remplissent aussi la réserve ; avec le Beau-frère installé, toutes vos cartes coûtent 1 de moins.` },
  { get t() { return tr('cf.learn.gardez_une_riposte_et_de_quoi'); }, d: `Un « Ticket de caisse » (${plural(cost('ticket-caisse'), 'Tournée')}) ou une « Réaction en chaîne » (${plural(cost('reaction-chaine'), 'Tournée')}) en main, avec les Tournées qui vont avec, fait réfléchir l’adversaire avant chaque gros coup.` },
  { get t() { return tr('cf.learn.lisez_les_tournees_adverses'); }, d: 'Elles sont visibles. Zéro Tournée : il ne peut presque rien jouer. Quatre ou plus : attention au Retournement de veste, au Bon numéro ou à la Tournée générale.' },
  { get t() { return tr('cf.learn.un_piege_pose_juste_avant_un'); }, d: `Si l’adversaire pose un piège pendant que vous tenez un 4-2-1, pensez au Faux 4-2-1. Une Fouine (${cost('fouine') ? plural(cost('fouine'), 'Tournée') : 'gratuite'}) envoie le piège à la défausse et vous montre ce que c’était.` },
  { get t() { return tr('cf.learn.la_fouine_n_est_jamais_perdue'); }, d: 'Elle pioche toujours une carte. Avec un piège en face, elle le défausse aussi : vous voyez lequel, et le danger disparaît. Et elle ne déclenche pas les pièges qui guettent vos Coups (Mouchard, Ardoise piégée, Main dans le sac) : elle les retire.' },
  { get t() { return tr('cf.learn.face_a_un_retournement_de_veste'); }, d: `Il ne se déclenche que si vous deviez donner ${VESTE_MIN} jetons ou plus. Arrêtez-vous volontairement sur une combinaison qui vaut moins : vous gagnez la manche sans vous faire retourner.` },
  { get t() { return tr('cf.learn.le_meneur_fixe_la_limite'); }, d: `Si vous menez avec une bonne combinaison, arrêtez-vous tôt : un seul lancer et l’autre n’aura qu’un lancer pour faire mieux (${CF_RULES.maxThrows} au plus).` },
  { get t() { return tr('cf.learn.jouer_en_second_a_ses_avantages'); }, d: 'Vous voyez la combinaison à battre. « Le dé sous la table » et « Tournée générale » frappent les dés de l’adversaire s’il a fini son tour : c’est là qu’elles sont les plus fortes.' },
  { get t() { return tr('cf.learn.le_dernier_mot_c_est_pour'); }, d: 'Avant les comptes, celui qui perd parle en premier. « Recompter » (si vous avez déjà joué une carte dans la manche) peut transformer un 4-2-2 en 4-2-1.' },
  { get t() { return tr('cf.learn.perdre_une_manche_c_est_se'); }, d: `Le perdant mène la suivante et reçoit ${CF_RULES.tourneesPerRound + CF_RULES.tourneesLoserBonus} Tournées au lieu de ${CF_RULES.tourneesPerRound}. Une petite défaite n’est pas grave si elle prépare une grosse manche.` },
  { get t() { return tr('cf.learn.les_habitues_s_accumulent'); }, d: `Jusqu’à ${CF_RULES.maxHabitues} en jeu, chacun pour ${CF_RULES.habitueRounds} manches. Le Vieux Marcel fait valoir vos suites 4, le Pilier adoucit vos défaites. Attention à « Fermeture ! » qui les chasse.` },
  { get t() { return tr('cf.learn.bluffez_avec_le_leurre'); }, d: `Il ne fait rien, mais l’adversaire voit un piège posé. Il hésitera, ou gaspillera une Fouine. Et si une carte adverse le défausse, vous gagnez ${plural(LEURRE_TOURNEES, 'Tournée')} et piochez ${plural(LEURRE_DRAW, 'carte')}.` },
];

export function TipsScreen({ onBack }: { onBack: () => void }) {
  return (
    <CfShell title={tr('cf.learn.conseils')} sub={tr('cf.learn.strategie_de_comptoir')} onBack={onBack}>
      <ol className="cf-tips">{TIPS.map((x, i) => <li key={i}><span aria-hidden>{i + 1}</span><div><b>{x.t}</b><p>{x.d}</p></div></li>)}</ol>
    </CfShell>
  );
}

// ------------------------------------------------------------------------------------------------
// Lexique

const LEXICON: { w: string; d: string }[] = [
  { get w() { return tr('cf.boardparts.commande_du_comptoir'); }, d: 'Une règle bonus tirée au début de chaque manche, la même pour tous et pour cette manche seulement (brelans +2, un lancer de plus, bonne pioche…). Elle est écrite en haut de l’écran.' },
  { get w() { return tr('cf.learn.booster'); }, d: `${BOOSTER.size} cartes tirées au pur hasard, pour ${BOOSTER.price} capsules. Une carte sur vingt sort brillante (sans effet en partie).` },
  { get w() { return tr('cf.learn.capsules'); }, d: 'La monnaie du mode : parties, missions du jour, ligue. Elles servent à acheter des boosters.' },
  { get w() { return tr('cf.learn.pieces'); }, d: 'La monnaie de tout le jeu (boutique : dés, tapis, accessoires). Chaque partie terminée en rapporte un peu, comme au 421 ; parfois aussi un sac de dés.' },
  { get w() { return tr('cf.boardparts.comptes'); }, d: 'Fin de manche : le gagnant donne au perdant autant de jetons que vaut sa combinaison, cartes comprises.' },
  { get w() { return tr('cf.learn.coup'); }, d: 'Carte jouée pendant votre tour, avant ou après un lancer, puis défaussée.' },
  { get w() { return tr('cf.learn.decharge'); }, d: `On commence avec ${CF_RULES.startTokens} jetons (${CF_RULES.startTokensMulti} à 3 ou 4) : le premier à n’en avoir plus aucun gagne.` },
  { get w() { return tr('cf.learn.deck'); }, d: `Vos ${CF_RULES.deckSize} cartes pour une partie : ${CF_RULES.maxCopies} exemplaires au plus de chaque carte, ${DECK_RULES.maxFamilies} familles au plus et une seule légendaire. Jusqu’à 5 decks enregistrés.` },
  { get w() { return tr('cf.boardparts.dernier_mot'); }, d: 'Étape avant les comptes : le joueur qui perd peut jouer une carte « Dernier mot », l’autre peut répondre, jusqu’à ce que tous passent.' },
  { get w() { return tr('cf.learn.eclats_de_verre'); }, d: 'Rendus par les doublons en trop ; ils servent à fabriquer la carte de votre choix.' },
  { get w() { return tr('cf.collection.famille'); }, d: `Habitués (vert), Ivresse (rouge), Pièges (violet), Chaînes (bleu et or). Un deck mélange ${DECK_RULES.maxFamilies} familles au plus. Les familles du deck adverse sont visibles.` },
  { get w() { return tr('cf.learn.habitue'); }, d: `Carte qui s’installe devant vous pour ${CF_RULES.habitueRounds} manches, puis rentre chez lui (${CF_RULES.maxHabitues} au plus, jamais deux fois le même).` },
  { get w() { return tr('cf.learn.meneur'); }, d: 'Celui qui joue en premier dans la manche (le perdant de la précédente). Son nombre de lancers fixe le maximum des autres.' },
  { get w() { return tr('cf.boardparts.piege'); }, d: `Posé face cachée (on paie à la pose), il se déclenche tout seul quand sa condition arrive. ${CF_RULES.maxTrapsOn} au plus devant un même joueur (et ${CF_RULES.maxTraps} posés au plus par joueur) ; il revient en main après ${CF_RULES.trapReturnRounds} manches sans se déclencher.` },
  { get w() { return tr('cf.learn.riposte'); }, d: 'Carte jouée à tout moment en réponse à une carte adverse. En chaîne, la dernière posée s’applique la première.' },
  { get w() { return tr('cf.game.tournee'); }, d: `Ce que coûtent les cartes (le chiffre dans le petit verre, en haut à gauche ; ce ne sont pas des jetons). ${CF_RULES.tourneesPerRound} par manche, +${CF_RULES.tourneesLoserBonus} pour le perdant de la précédente, ${CF_RULES.tourneesMax} en réserve au plus.` },
];

export function LexiconScreen({ onBack }: { onBack: () => void }) {
  return (
    <CfShell title={tr('cf.learn.lexique')} sub={tr('cf.learn.les_mots_du_comptoir')} onBack={onBack}>
      <dl className="cf-lexicon">{LEXICON.map((x) => <div key={x.w}><dt>{x.w}</dt><dd>{x.d}</dd></div>)}</dl>
    </CfShell>
  );
}
