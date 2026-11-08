/**
 * Coups Fourrés : parcours débutant (0.39, « apprendre en jouant »). Quatre parties contre l'ordinateur,
 * chacune avec un deck d'entraînement qui ajoute un type de carte : d'abord les Coups seuls, puis les
 * Pièges, les Habitués, et enfin les Ripostes et les Derniers mots. Les decks n'ont pas besoin d'être
 * possédés (entraînement) ; l'ordinateur joue avec le même deck. Partagé client / serveur.
 * 0.40 : chaque deck respecte la règle de construction (2 familles au plus).
 * 0.46 : chaque étape montre aussi une ou deux cartes du nouveau set.
 * 0.41 : économie serrée (1 Tournée par manche) : la première partie montre comment économiser et enchaîner.
 */
import { CARD_BY_ID, CF_RULES, deckProblems, type CardType } from './catalog';

export interface ParcoursStep {
  step: number;
  title: string;
  /** Types de cartes présents dans cette partie. */
  types: CardType[];
  /** Bulle d'accueil : ce qui est nouveau dans cette partie. */
  intro: string;
  cards: Record<string, number>;
}

export const PARCOURS: ParcoursStep[] = [
  {
    step: 1, title: 'Les Coups', types: ['coup'],
    intro: `Pour commencer, seulement des Coups : ils se jouent pendant votre tour, avant ou après un lancer, et se paient en Tournées (le chiffre dans le petit verre). Vous n’en recevez que ${CF_RULES.tourneesPerRound} par manche (${CF_RULES.tourneesPerRound + CF_RULES.tourneesLoserBonus} après une manche perdue) : économisez pour les grosses cartes. « Mise en bouche » fait baisser de 2 Tournées la carte suivante, « Tant qu’on y est » rapporte des Tournées : de quoi enchaîner. Le premier à 0 jeton gagne.`,
    cards: { 'cul-sec': 2, 'tete-tourne': 2, 'pari-comptoir': 2, 'double-tournee': 2, 'de-sous-table': 1, 'coup-coude': 2, 'coup-pouce': 1, 'boule-de-neige': 1, 'petit-dernier': 1, 'mise-bouche': 2, 'tant-qu-on-y-est': 2, 'petite-soeur': 2 },
  },
  {
    step: 2, title: 'Les Pièges', types: ['coup', 'piege'],
    intro: 'Nouveau : les Pièges. Vous les posez face cachée devant un adversaire ; ils se déclenchent tout seuls au bon moment. L’adversaire voit qu’il y a un piège, pas lequel. La Fouine en défausse un. Le Leurre et le Mouchard vous rapportent une Tournée.',
    cards: { 'cul-sec': 2, 'tete-tourne': 2, 'de-sous-table': 2, 'pari-comptoir': 2, fouine: 2, leurre: 2, 'croche-patte': 2, 'faux-421': 1, 'der-des-ders': 1, 'gueule-bois': 2, mouchard: 2 },
  },
  {
    step: 3, title: 'Les Habitués', types: ['coup', 'piege', 'habitue'],
    intro: 'Nouveau : les Habitués. Ils s’installent devant vous pour 3 manches et agissent tout seuls (le chiffre sur leur pastille : les manches qu’il leur reste). Un seul de chaque à la fois, 3 au plus.',
    cards: { 'tournee-patron': 2, fermeture: 2, fouine: 2, 'vide-poches': 1, 'plat-du-jour': 1, leurre: 2, 'croche-patte': 2, 'faux-421': 2, mouchard: 2, 'vieux-marcel': 1, pilier: 1, josiane: 1, videur: 1 },
  },
  {
    step: 4, title: 'Ripostes et Derniers mots', types: ['coup', 'piege', 'habitue', 'riposte', 'dernier-mot'],
    intro: 'Nouveau : les Ripostes, qui annulent une carte adverse au moment où elle est jouée (vous avez 15 secondes), et les Derniers mots, qui se jouent juste avant les comptes, quand toutes les combinaisons sont posées.',
    cards: { 'tournee-patron': 2, 'coup-coude': 2, 'coup-pouce': 2, 'calcul-mental': 1, 'retour-envoyeur': 1, 'mise-bouche': 1, engrenage: 2, 'vieux-marcel': 1, pilier: 1, josiane: 1, 'ticket-caisse': 2, 'reaction-chaine': 1, 'note-salee': 1, addition: 1, recompter: 1 },
  },
];

/** Identifiant de deck spécial « parcours » (ex. « parcours:2 »), ou null. */
export function parcoursStepOf(deckId: string | null | undefined): ParcoursStep | null {
  const m = /^parcours:(\d)$/.exec(deckId ?? '');
  return m ? PARCOURS.find((p) => p.step === Number(m[1])) ?? null : null;
}

/** Vérification (tests) : chaque deck compte 20 cartes valides, des seuls types annoncés. */
export function parcoursProblems(): string[] {
  const out: string[] = [];
  for (const p of PARCOURS) {
    for (const x of deckProblems(p.cards)) if (!/exemplaire/.test(x)) out.push(`Étape ${p.step} : ${x}`);
    for (const id of Object.keys(p.cards)) {
      const d = CARD_BY_ID[id];
      if (!d) out.push(`Étape ${p.step} : carte inconnue ${id}`);
      else if (!p.types.includes(d.type)) out.push(`Étape ${p.step} : ${d.name} (${d.type}) n’est pas un type de l’étape`);
    }
  }
  return out;
}
