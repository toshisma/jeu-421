/**
 * Coups Fourrés : visite guidée de l'écran (0.39, demande de Sam : « montrer où sont toutes les infos
 * et à quoi elles correspondent »). Jouée au début des parties guidées (à 2 et à 4) et depuis l'aide.
 */
import { CF_RULES } from '../../../shared/cards/catalog';

export interface TourStep { title: string; text: string; focus: 'top' | 'opp' | 'say' | 'tray' | 'hand' | 'me' | null }

export function screenTour(opponents: number): TourStep[] {
  const multi = opponents > 1;
  const steps: TourStep[] = [
    { focus: 'opp', title: multi ? 'Vos adversaires' : 'Votre adversaire', text: `${multi ? `Une case par adversaire (${opponents} ici). Celui qui joue est encadré en doré. ` : ''}Le gros chiffre : ses jetons. Le premier à 0 jeton gagne. Dessous : 🍺 ses Tournées (elles paient les cartes), ses cartes en main, ses pièges posés et ses Habitués. Touchez une case pour tout voir en clair.` },
    { focus: 'say', title: 'Le bandeau', text: `Il dit toujours à qui de jouer et quoi faire.${multi ? ' La petite ligne dessous : le dernier coup joué.' : ' Le dernier coup de l’adversaire est écrit dans sa case.'}` },
    { focus: 'tray', title: 'Le bac', text: `Les dés de celui qui joue. À votre tour, lancez jusqu’à ${CF_RULES.maxThrows} fois et touchez un dé pour le garder avant de relancer.` },
    { focus: 'hand', title: 'Vos cartes', text: 'Sous chaque nom : ce que fait la carte. Le chiffre doré : son coût en Tournées. Les cartes dorées sont jouables maintenant. Touchez une carte pour la lire en grand.' },
    { focus: 'me', title: 'Vous', text: 'Vos jetons, vos Tournées, vos Habitués (le chiffre : les manches qu’il leur reste) et vos pièges posés. Touchez « Vous » pour votre fiche.' },
    { focus: 'top', title: 'En haut', text: '« Journal » : tout ce qui s’est passé, coup par coup. « ? » : ce que veut dire chaque chose à l’écran. La croix pour quitter.' },
  ];
  if (multi) steps.push({ focus: null, title: 'À plusieurs', text: 'À chaque manche, seul le plus mauvais reçoit des jetons, du meilleur. Une carte « contre l’adversaire » vise le joueur de votre choix, un piège se pose devant un joueur précis. Le premier à 0 jeton gagne et la partie s’arrête.' });
  return steps;
}
