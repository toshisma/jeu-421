/**
 * Coups Fourrés : « Apprendre » (menu du mode) et ses écrans de ressources.
 * Partie guidée, règles, les 34 cartes (pour tous, même les invités et les cartes non possédées),
 * conseils de stratégie et lexique. Les chiffres viennent du catalogue (CF_RULES, BOOSTER…).
 */
import { useState } from 'react';
import { BOOSTER, CARDS, CF_RULES, FAMILY_LABEL, TYPE_LABEL, type CardFamily, type CardType } from '../../../shared/cards/catalog';
import { Icon } from '../ui/Icon';
import { CardView, FamilyBadge } from './components';
import { CfShell } from './cfui';
import { TYPE_META, TypeIcon } from './cardTypes';

const vw = () => (typeof window !== 'undefined' ? window.innerWidth : 360);

/** Bandeau « Nouveau ? » en haut du menu, pour qui n'a encore jamais joué. */
export function LearnHero({ onTuto }: { onTuto: () => void }) {
  return (
    <button className="cf-learn-hero" onClick={onTuto}>
      <span className="cf-learn-hero-ic" aria-hidden>🎓</span>
      <span><b>Nouveau ? Apprenez à jouer en 3 minutes</b><small>Partie guidée contre Dédé, pas à pas</small></span>
      <Icon name="dice" size={20} />
    </button>
  );
}

/** Section « Apprendre » du menu : mise en avant tant que la partie guidée n'est pas faite. */
export function LearnBlock({ fresh, onTuto, onRules, onCards, onTips, onLexicon }: {
  fresh: boolean; onTuto: () => void; onRules: () => void; onCards: () => void; onTips: () => void; onLexicon: () => void;
}) {
  return (
    <section className={`cf-learn${fresh ? ' fresh' : ''}`} aria-labelledby="cf-learn-h">
      <h2 id="cf-learn-h">{fresh ? 'Bien débuter' : 'Apprendre'}</h2>
      <div className="cf-learn-grid">
        <button className={fresh ? 'hot' : ''} onClick={onTuto}><Icon name="dice" size={18} /><span><b>Partie guidée</b><small>3 minutes, pas à pas</small></span></button>
        <button onClick={onRules}><Icon name="rules" size={18} /><span><b>Règles du jeu</b><small>Manche, Tournées, cartes</small></span></button>
        <button onClick={onCards}><span className="cf-learn-n" aria-hidden>{CARDS.length}</span><span><b>Les {CARDS.length} cartes</b><small>Par famille, texte complet</small></span></button>
        <button onClick={onTips}><Icon name="target" size={18} /><span><b>Conseils</b><small>Stratégie de comptoir</small></span></button>
        <button onClick={onLexicon}><Icon name="album" size={18} /><span><b>Lexique</b><small>Tournée, ardoise, Riposte…</small></span></button>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------------------------------------
// Les 34 cartes

const FAMS: CardFamily[] = ['habitues', 'ivresse', 'pieges', 'chaines'];
const WHEN: Record<CardType, string> = {
  coup: 'Pendant votre tour, avant ou après un lancer.',
  piege: 'Posé face cachée pendant votre tour ; se déclenche tout seul chez l’adversaire.',
  riposte: 'À tout moment, en réponse à une carte adverse.',
  'dernier-mot': 'Seulement au Dernier mot, avant les comptes.',
  habitue: 'Pendant votre tour ; reste 3 manches.',
};

export function CardsCatalogScreen({ onBack }: { onBack: () => void }) {
  const [fam, setFam] = useState<CardFamily | 'tout'>('habitues');
  const [type, setType] = useState<CardType | 'tout'>('tout');
  const list = CARDS.filter((c) => (fam === 'tout' || c.family === fam) && (type === 'tout' || c.type === type));
  const w = Math.min(250, vw() - 48);
  return (
    <CfShell title={`Les ${CARDS.length} cartes`} sub="Toutes, même celles que vous n’avez pas encore" onBack={onBack}>
      <div className="cf-chips cf-cat-chips" role="tablist" aria-label="Famille">
        {FAMS.map((f) => <button key={f} role="tab" aria-selected={fam === f} className={fam === f ? 'on' : ''} onClick={() => setFam(f)}>{FAMILY_LABEL[f].replace(/^(Les |L’)/, '')}</button>)}
        <button role="tab" aria-selected={fam === 'tout'} className={fam === 'tout' ? 'on' : ''} onClick={() => setFam('tout')}>Toutes</button>
      </div>
      <div className="cf-chips cf-cat-chips small" aria-label="Type">
        {(['tout', 'coup', 'piege', 'riposte', 'dernier-mot', 'habitue'] as const).map((t) => <button key={t} className={type === t ? 'on' : ''} onClick={() => setType(t)}>{t === 'tout' ? 'Tous types' : TYPE_LABEL[t]}</button>)}
      </div>
      {fam !== 'tout' && <p className="cf-cat-fam"><FamilyBadge family={fam} /> <span>{FAM_TEXT[fam]}</span></p>}
      <ul className="cf-cat-list">
        {list.map((c) => (
          <li key={c.id}>
            <CardView id={c.id} width={w} />
            <small><b className="cfn-typetag" style={{ color: TYPE_META[c.type].color }}><TypeIcon type={c.type} size={13} />{TYPE_LABEL[c.type]}</b> · {WHEN[c.type]}</small>
          </li>
        ))}
        {!list.length && <li className="cf-muted">Aucune carte de ce type dans cette famille.</li>}
      </ul>
    </CfShell>
  );
}

const FAM_TEXT: Record<CardFamily, string> = {
  habitues: 'Des alliés qui s’installent pour 3 manches, des Tournées et de quoi annuler les petits coups.',
  ivresse: 'Des dés qui tournent : relancer, retourner, parier… et bousculer les dés adverses.',
  pieges: 'Des pièges posés face cachée, qui se déclenchent tout seuls. Et la Fouine pour les défausser.',
  chaines: 'Des cartes qui s’enchaînent : pioche, réductions, retouches de dés, ripostes de plus en plus fortes.',
};

// ------------------------------------------------------------------------------------------------
// Conseils

const TIPS: { t: string; d: string }[] = [
  { t: 'Gardez une Riposte et de quoi la payer', d: 'Un « Ticket de caisse » (1 Tournée) ou une « Réaction en chaîne » (2) en main, avec les Tournées qui vont avec, fait réfléchir l’adversaire avant chaque gros coup.' },
  { t: 'Lisez les Tournées adverses', d: 'Elles sont visibles. Zéro Tournée : il ne peut presque rien jouer. Quatre ou plus : attention au Retournement de veste, au Bon numéro ou à la Tournée générale.' },
  { t: 'Un piège posé juste avant un gros coup ? Méfiance', d: 'Si l’adversaire pose un piège pendant que vous tenez un 4-2-1, pensez au Faux 4-2-1. Une Fouine (gratuite) envoie le piège à la défausse et vous montre ce que c’était.' },
  { t: 'La Fouine n’est jamais perdue', d: 'Sans piège en face, elle pioche une carte. Avec un piège, elle le défausse : vous voyez lequel, et le danger disparaît.' },
  { t: 'Face à un Retournement de veste, visez plus bas', d: 'Il ne se déclenche que si vous deviez donner 6 jetons ou plus. Arrêtez-vous volontairement sur une combinaison qui vaut 5 ou moins : vous gagnez la manche sans vous faire retourner.' },
  { t: 'Le meneur fixe la limite', d: `Si vous menez avec une bonne combinaison, arrêtez-vous tôt : un seul lancer et l’autre n’aura qu’un lancer pour faire mieux (${CF_RULES.maxThrows} au plus).` },
  { t: 'Jouer en second a ses avantages', d: 'Vous voyez la combinaison à battre. « Le dé sous la table » et « Tournée générale » frappent les dés de l’adversaire s’il a fini son tour : c’est là qu’elles sont les plus fortes.' },
  { t: 'Le Dernier mot, c’est pour le perdant', d: 'Avant les comptes, celui qui perd parle en premier. « Recompter » (si vous avez déjà joué une carte dans la manche) peut transformer un 4-2-2 en 4-2-1.' },
  { t: 'Perdre une manche, c’est se refaire', d: `Le perdant mène la suivante et reçoit ${CF_RULES.tourneesPerRound + CF_RULES.tourneesLoserBonus} Tournées au lieu de ${CF_RULES.tourneesPerRound}. Une petite défaite n’est pas grave si elle prépare une grosse manche.` },
  { t: 'Les Habitués s’accumulent', d: `Jusqu’à ${CF_RULES.maxHabitues} en jeu, chacun pour ${CF_RULES.habitueRounds} manches. Le Vieux Marcel fait valoir vos suites 4, le Pilier adoucit vos défaites. Attention à « Fermeture ! » qui les chasse.` },
  { t: 'Bluffez avec le Leurre', d: 'Il ne fait rien, mais l’adversaire voit un piège posé. Il hésitera, ou gaspillera une Fouine. Et s’il est défaussé, vous piochez.' },
];

export function TipsScreen({ onBack }: { onBack: () => void }) {
  return (
    <CfShell title="Conseils" sub="Stratégie de comptoir" onBack={onBack}>
      <ol className="cf-tips">{TIPS.map((x, i) => <li key={i}><span aria-hidden>{i + 1}</span><div><b>{x.t}</b><p>{x.d}</p></div></li>)}</ol>
    </CfShell>
  );
}

// ------------------------------------------------------------------------------------------------
// Lexique

const LEXICON: { w: string; d: string }[] = [
  { w: 'Booster', d: `${BOOSTER.size} cartes tirées au pur hasard, pour ${BOOSTER.price} capsules. Une carte sur vingt sort brillante (sans effet en partie).` },
  { w: 'Capsules', d: 'La monnaie du mode : parties, missions du jour, ligue. Elles servent à acheter des boosters.' },
  { w: 'Comptes', d: 'Fin de manche : le gagnant donne au perdant autant de jetons que vaut sa combinaison, cartes comprises.' },
  { w: 'Coup', d: 'Carte jouée pendant votre tour, avant ou après un lancer, puis défaussée.' },
  { w: 'Décharge', d: `On commence avec ${CF_RULES.startTokens} jetons (${CF_RULES.startTokensMulti} à 3 ou 4) : le premier à n’en avoir plus aucun gagne.` },
  { w: 'Deck', d: `Vos ${CF_RULES.deckSize} cartes pour une partie : ${CF_RULES.maxCopies} exemplaires au plus, une seule par légendaire. Jusqu’à 5 decks enregistrés.` },
  { w: 'Dernier mot', d: 'Étape avant les comptes : le joueur qui perd peut jouer une carte « Dernier mot », l’autre peut répondre, jusqu’à ce que tous passent.' },
  { w: 'Éclats de verre', d: 'Rendus par les doublons en trop ; ils servent à fabriquer la carte de votre choix.' },
  { w: 'Famille', d: 'Habitués (vert), Ivresse (rouge), Pièges (violet), Chaînes (bleu et or). Les familles du deck adverse sont visibles.' },
  { w: 'Habitué', d: `Carte qui s’installe devant vous pour ${CF_RULES.habitueRounds} manches, puis rentre chez lui (${CF_RULES.maxHabitues} au plus, jamais deux fois le même).` },
  { w: 'Meneur', d: 'Celui qui joue en premier dans la manche (le perdant de la précédente). Son nombre de lancers fixe le maximum des autres.' },
  { w: 'Piège', d: `Posé face cachée (on paie à la pose), il se déclenche tout seul quand sa condition arrive. ${CF_RULES.maxTraps} posés au plus ; il revient en main après ${CF_RULES.trapReturnRounds} manches sans se déclencher.` },
  { w: 'Riposte', d: 'Carte jouée à tout moment en réponse à une carte adverse. En chaîne, la dernière posée s’applique la première.' },
  { w: 'Tournée', d: `Ce que coûtent les cartes (la pastille dorée). ${CF_RULES.tourneesPerRound} par manche, +${CF_RULES.tourneesLoserBonus} pour le perdant de la précédente, ${CF_RULES.tourneesMax} en réserve au plus.` },
];

export function LexiconScreen({ onBack }: { onBack: () => void }) {
  return (
    <CfShell title="Lexique" sub="Les mots du comptoir" onBack={onBack}>
      <dl className="cf-lexicon">{LEXICON.map((x) => <div key={x.w}><dt>{x.w}</dt><dd>{x.d}</dd></div>)}</dl>
    </CfShell>
  );
}
