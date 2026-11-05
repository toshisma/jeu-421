/**
 * Coups Fourrés : « Construire un deck automatiquement » à partir des cartes possédées.
 * Choisit les deux familles les mieux fournies, puis complète, en gardant une courbe de coûts jouable.
 * Renvoie null si le joueur n'a pas assez de cartes utilisables (20).
 */
import { CARDS, CF_RULES, cardDef, type CardFamily, type CardDef } from './catalog';

const RARITY_SCORE = { commune: 0, rare: 1, epique: 2, legendaire: 3 } as const;

export function usableCopies(owned: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, n] of Object.entries(owned)) {
    const d = cardDef(id);
    if (!d || n <= 0) continue;
    out[id] = Math.min(n, d.rarity === 'legendaire' ? CF_RULES.maxLegendaryCopies : CF_RULES.maxCopies);
  }
  return out;
}

export function usableCount(owned: Record<string, number>): number {
  return Object.values(usableCopies(owned)).reduce((a, b) => a + b, 0);
}

export function buildAutoDeck(owned: Record<string, number>): Record<string, number> | null {
  const use = usableCopies(owned);
  if (Object.values(use).reduce((a, b) => a + b, 0) < CF_RULES.deckSize) return null;
  const fams: CardFamily[] = ['habitues', 'ivresse', 'pieges', 'chaines'];
  const famCount = (f: CardFamily) => CARDS.filter((c) => c.family === f).reduce((a, c) => a + (use[c.id] ?? 0), 0);
  const [f1, f2] = [...fams].sort((a, b) => famCount(b) - famCount(a));
  // Ordre de préférence : familles principales d'abord, puis cartes bon marché et plus rares.
  const score = (c: CardDef) => (c.family === f1 ? 0 : c.family === f2 ? 10 : 20) + Math.max(0, c.cost - 2) * 2 - RARITY_SCORE[c.rarity];
  const pool = CARDS.filter((c) => use[c.id]).sort((a, b) => score(a) - score(b) || a.cost - b.cost || a.id.localeCompare(b.id));
  const deck: Record<string, number> = {};
  let total = 0;
  let expensive = 0; // cartes à 3-4 Tournées : 6 au plus pour garder une main jouable
  for (const pass of [0, 1]) {
    for (const c of pool) {
      while ((deck[c.id] ?? 0) < use[c.id] && total < CF_RULES.deckSize) {
        if (pass === 0 && c.cost >= 3 && expensive >= 6) break;
        deck[c.id] = (deck[c.id] ?? 0) + 1;
        total++;
        if (c.cost >= 3) expensive++;
      }
    }
  }
  return total === CF_RULES.deckSize ? deck : null;
}
