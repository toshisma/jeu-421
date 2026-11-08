import { playGame } from './cf-simulate';
import { STARTER_DECKS, deckProblems } from '../shared/cards/catalog';
const n = Number(process.argv[2] ?? 2000);
const patch = JSON.parse(process.argv[3] ?? '{}') as Record<string, Record<string, number>>;
const decks = STARTER_DECKS.map((d) => { const c = { ...d.cards, ...(patch[d.id] ?? {}) }; for (const k of Object.keys(c)) if (!c[k]) delete c[k]; const pb = deckProblems(c); if (pb.length) throw new Error(d.id + ' ' + pb.join(' ')); return { name: d.name, kind: 'depart' as const, cards: Object.entries(c).flatMap(([id, k]) => Array(k).fill(id) as string[]) }; });
const off = Number(process.argv[4] ?? 0);
let z = 0; const e = { pr: 0, paid: 0, p3: 0, p4: 0 };
for (let k = 0; k < n; k++) {
  const [a, b] = k % 2 ? [decks[0], decks[1]] : [decks[1], decks[0]];
  const r = playGame([{ deck: a, level: 'fine-fouine' }, { deck: b, level: 'fine-fouine' }], 777 + k * 104729 + off, {}, 'depart');
  if (r.seats[r.winner]?.deck === 'Le Zinc') z++;
  e.pr += r.eco.pr; e.paid += r.eco.paid; e.p3 += r.eco.p3; e.p4 += r.eco.p4;
}
console.log(`${process.argv[3] ?? ''} Zinc ${(100 * z / n).toFixed(1)} % sur ${n} ; payantes/manche ${(e.paid / e.pr).toFixed(2)}, 3+ ${(100 * e.p3 / e.pr).toFixed(1)} %, 4+ ${(100 * e.p4 / e.pr).toFixed(1)} %`);
