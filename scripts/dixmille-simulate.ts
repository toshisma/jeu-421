/**
 * Simulation du Dix mille entre ordinateurs : aucune partie bloquée, niveaux ordonnés, durée.
 * npx tsx scripts/dixmille-simulate.ts --games 4000
 */
import { act, newGame, DM_TARGETS, type DmLevel, type DmState } from '../shared/dixmille/engine';
import { decide } from '../shared/dixmille/ai';

const arg = (k: string, d: number) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? Number(process.argv[i + 1]) : d; };
const GAMES = arg('games', 3000);
const MAX_ACTIONS = 20000;

export function playOut(levels: DmLevel[], target: number, seed: number): { s: DmState; actions: number; blocked: boolean } {
  let s = newGame(levels.map((l, i) => ({ id: `p${i}`, name: `J${i}`, bot: l })), target, seed);
  let actions = 0;
  while (s.phase !== 'fini' && actions < MAX_ACTIONS) {
    const lvl = s.players[s.current].bot!;
    const r = act(s, decide(s, lvl));
    if ('error' in r) throw new Error(r.error);
    s = r.state;
    actions++;
  }
  return { s, actions, blocked: s.phase !== 'fini' };
}

const t0 = Date.now();
let seed = 1;
let blocked = 0;
// 1. Durée : deux Habitués, pour chaque cible (tours de table = tours joués / 2).
console.log('Durée moyenne (2 joueurs Habitué) :');
for (const target of DM_TARGETS) {
  const rounds: number[] = [];
  for (let g = 0; g < GAMES; g++) {
    const r = playOut(['habitue', 'habitue'], target, seed++);
    if (r.blocked) blocked++;
    rounds.push(r.s.turns / 2);
  }
  rounds.sort((a, b) => a - b);
  const avg = rounds.reduce((a, b) => a + b, 0) / rounds.length;
  console.log(`  ${String(target).padStart(5)} : ${avg.toFixed(1)} tours chacun en moyenne (médiane ${rounds[rounds.length >> 1]}, 90 % ≤ ${rounds[Math.floor(rounds.length * 0.9)]}, max ${rounds[rounds.length - 1]})`);
}
// 2. Niveaux face à face (on alterne qui commence).
console.log('Face à face (victoires du premier niveau) :');
const pairs: [DmLevel, DmLevel][] = [['habitue', 'debutant'], ['fouine', 'habitue'], ['fouine', 'debutant']];
for (const target of DM_TARGETS) {
  const line: string[] = [];
  for (const [a, b] of pairs) {
    let wa = 0;
    for (let g = 0; g < GAMES; g++) {
      const first = g % 2 === 0;
      const r = playOut(first ? [a, b] : [b, a], target, seed++);
      if (r.blocked) blocked++;
      if (r.s.winner === (first ? 'p0' : 'p1')) wa++;
    }
    line.push(`${a} vs ${b} ${((100 * wa) / GAMES).toFixed(1)} %`);
  }
  console.log(`  ${String(target).padStart(5)} : ${line.join(' · ')}`);
}
// 3. Avantage du premier joueur, ratés par tour, 4 joueurs.
let firstWins = 0, misses = 0, turns = 0;
for (let g = 0; g < GAMES; g++) {
  const r = playOut(['habitue', 'habitue'], 4000, seed++);
  if (r.s.winner === 'p0') firstWins++;
  misses += r.s.players.reduce((a, p) => a + p.misses, 0); turns += r.s.turns + 1;
}
console.log(`Avantage du premier (4 000, Habitués) : ${((100 * firstWins) / GAMES).toFixed(1)} % de victoires pour celui qui commence`);
console.log(`Tours ratés : ${((100 * misses) / turns).toFixed(1)} %`);
let four = 0;
for (let g = 0; g < GAMES / 4; g++) { const r = playOut(['fouine', 'habitue', 'debutant', 'habitue'], 4000, seed++); if (r.blocked) blocked++; four += r.s.turns / 4; }
console.log(`4 joueurs en 4 000 : ${(four / (GAMES / 4)).toFixed(1)} tours chacun en moyenne`);
console.log(`Parties bloquées : ${blocked} · ${((Date.now() - t0) / 1000).toFixed(1)} s`);
