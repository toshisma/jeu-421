/**
 * Coups Fourrés : « Construire un deck automatiquement » à partir des cartes possédées.
 * Choisit les deux familles les mieux fournies (règle de construction : 2 familles au plus, une seule
 * légendaire), puis complète, en gardant une courbe de coûts jouable.
 * Renvoie null si le joueur n'a pas assez de cartes utilisables (20).
 */
import { CARDS, CF_RULES, DECK_RULES, cardDef, type CardFamily, type CardDef } from './catalog';

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
  const sorted = [...fams].sort((a, b) => famCount(b) - famCount(a));
  // Règle de construction (0.40) : au plus DECK_RULES.maxFamilies familles. On essaie les familles les
  // mieux fournies d'abord (la première seule, puis par paires), et on garde le premier deck complet.
  const tries: CardFamily[][] = [];
  if (DECK_RULES.maxFamilies >= 4) tries.push(sorted);
  for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) tries.push(DECK_RULES.maxFamilies >= 2 ? [sorted[i], sorted[j]] : [sorted[i]]);
  for (let i = 0; i < 4; i++) tries.push([sorted[i]]);
  for (const t of tries) {
    const d = fill(use, t);
    if (d) return d;
  }
  return null;
}

function fill(use: Record<string, number>, families: CardFamily[]): Record<string, number> | null {
  const [f1] = families;
  // Ordre de préférence : famille principale d'abord, puis cartes bon marché et plus rares.
  const score = (c: CardDef) => (c.family === f1 ? 0 : 10) + Math.max(0, c.cost - 2) * 2 - RARITY_SCORE[c.rarity];
  const pool = CARDS.filter((c) => use[c.id] && families.includes(c.family)).sort((a, b) => score(a) - score(b) || a.cost - b.cost || a.id.localeCompare(b.id));
  const deck: Record<string, number> = {};
  let total = 0;
  let expensive = 0; // cartes à 3 Tournées ou plus : 6 au plus pour garder une main jouable
  let legends = 0;
  let epics = 0;
  for (const pass of [0, 1]) {
    for (const c of pool) {
      while ((deck[c.id] ?? 0) < use[c.id] && total < CF_RULES.deckSize) {
        if (pass === 0 && c.cost >= 3 && expensive >= 6) break;
        if (c.rarity === 'legendaire' && !deck[c.id] && legends >= DECK_RULES.maxLegendaries) break;
        if (c.rarity === 'epique' && epics >= DECK_RULES.maxEpics) break;
        deck[c.id] = (deck[c.id] ?? 0) + 1;
        total++;
        if (c.cost >= 3) expensive++;
        if (c.rarity === 'legendaire' && deck[c.id] === 1) legends++;
        if (c.rarity === 'epique') epics++;
      }
    }
  }
  return total === CF_RULES.deckSize ? deck : null;
}
