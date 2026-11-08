/** Banc d'essai : decks Pièges « forts » à composition fixe contre un panel varié. */
import { applyCosts, buildDecks, optimizedDecks, playGame } from './cf-simulate';
import { STARTER_DECKS, deckProblems } from '../shared/cards/catalog';
export const TEST: Record<string, Record<string, number>> = {
  'P+C pièges': { leurre: 2, fouine: 2, 'peau-banane': 2, 'mot-de-trop': 2, 'croche-patte': 2, 'coup-nenette': 2, 'retournement-veste': 1, 'mise-bouche': 2, 'compte-rond': 2, 'derniere-maille': 1, 'coup-pouce': 2 },
  'P+C verrou': { souriciere: 2, 'noeud-coulant': 2, engrenage: 2, embuscade: 1, leurre: 2, fouine: 2, 'croche-patte': 2, 'mot-de-trop': 2, 'compte-rond': 2, 'mise-bouche': 2, ricochet: 1 },
  'P+C opt': { leurre: 2, fouine: 2, 'peau-banane': 2, 'mot-de-trop': 2, 'retournement-veste': 1, 'croche-patte': 1, ricochet: 2, 'mise-bouche': 2, 'derniere-maille': 2, 'coup-pouce': 2, 'compte-rond': 2 },
  'P+H': { leurre: 2, fouine: 2, 'peau-banane': 2, 'mot-de-trop': 2, 'croche-patte': 2, 'coup-nenette': 1, guetteur: 1, josiane: 2, 'plat-du-jour': 2, 'tournee-patron': 2, 'efface-tout': 1, patron: 1 },
  'P+I': { leurre: 2, fouine: 2, 'peau-banane': 2, 'mot-de-trop': 2, 'croche-patte': 2, 'gueule-bois': 2, 'verre-de-trop': 2, 'double-tournee': 2, 'verre-offert': 2, 'tete-tourne': 1, 'tournee-generale': 1 },
};
const expand = (c: Record<string, number>) => Object.entries(c).flatMap(([id, n]) => Array(n).fill(id) as string[]);
applyCosts(JSON.parse(process.argv[6] ?? '{}'));
buildDecks();
const panel = [...STARTER_DECKS.map((d) => ({ name: d.name, cards: expand(d.cards) })), ...optimizedDecks().filter((d) => !d.name.includes('Pièges')).map((d) => ({ name: d.name, cards: d.cards }))];
const which = process.argv[2]; const N = Number(process.argv[3] ?? 2000); const off = Number(process.argv[4] ?? 0);
const patch = JSON.parse(process.argv[5] ?? '{}') as Record<string, number>;
const t: Record<string, number> = { ...TEST[which], ...patch }; for (const k of Object.keys(t)) if (!t[k]) delete t[k]; const pb = deckProblems(t); if (pb.length) throw new Error(pb.join(' '));
const me = { name: which, kind: 'optimise' as const, cards: expand(t) };
let w = 0; const per: Record<string, [number, number]> = {};
for (let k = 0; k < N; k++) {
  const o = panel[k % panel.length]; const opp = { name: o.name, kind: 'optimise' as const, cards: o.cards };
  const first = Math.floor(k / panel.length) % 2 === 0;
  const seats = first ? [me, opp] : [opp, me];
  const r = playGame(seats.map((d) => ({ deck: d, level: 'fine-fouine' as const })), 99991 * (k + 1) + off, {}, 'bench');
  const won = r.winner === (first ? 0 : 1) ? 1 : 0; w += won;
  (per[o.name] ??= [0, 0])[0] += won; per[o.name][1]++;
}
console.log(`${which} ${process.argv[5] ?? ''} ${process.argv[6] ?? ''} : ${(100 * w / N).toFixed(1)} % sur ${N} | ` + Object.entries(per).map(([n, [a, b]]) => `${n} ${(100 * a / b).toFixed(0)}`).join(', '));
