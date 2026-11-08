import { playGame } from './cf-simulate';
import { STARTER_DECKS, deckProblems } from '../shared/cards/catalog';
const n = Number(process.argv[2] ?? 2000);
const patch = JSON.parse(process.argv[3] ?? '{}') as Record<string, Record<string, number>>;
const decks = STARTER_DECKS.map((d) => { const c = { ...d.cards, ...(patch[d.id] ?? {}) }; for (const k of Object.keys(c)) if (!c[k]) delete c[k]; const pb = deckProblems(c); if (pb.length) throw new Error(d.id + ' ' + pb.join(' ')); return { name: d.name, kind: 'depart' as const, cards: Object.entries(c).flatMap(([id, k]) => Array(k).fill(id) as string[]) }; });
const off = Number(process.argv[4] ?? 0);
let z = 0;
for (let k = 0; k < n; k++) {
  const [a, b] = k % 2 ? [decks[0], decks[1]] : [decks[1], decks[0]];
  const r = playGame([{ deck: a, level: 'fine-fouine' }, { deck: b, level: 'fine-fouine' }], 777 + k * 104729 + off, {}, 'depart');
  if (r.seats[r.winner]?.deck === 'Le Zinc') z++;
}
console.log(`Zinc ${(100 * z / n).toFixed(1)} % sur ${n}`);
