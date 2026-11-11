/**
 * Simulation du Poker menteur entre ordinateurs : aucune partie bloquée, durée, niveaux ordonnés,
 * bluffs. npx tsx scripts/pokermenteur-simulate.ts --games 3000
 *
 * « Humain simple » : un joueur moyen modélisé sans calcul (il dit la vérité quand il peut, ment d'un
 * cran sinon, garde ses dés qui comptent, crie « Menteur ! » quand l'annonce lui paraît trop belle).
 */
import { act, newGame, lastClaim, canBelieve, type PmAction, type PmLevel, type PmState } from '../shared/pokermenteur/engine';
import { decide, aiRng, claimChance } from '../shared/pokermenteur/ai';
import { coreDice, handAt, rankOf } from '../shared/pokermenteur/hands';
import type { Rng } from '../shared/rng';

const arg = (k: string, d: number) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? Number(process.argv[i + 1]) : d; };
const GAMES = arg('games', 3000);
const MAX_ACTIONS = 5000;
type Who = PmLevel | 'humain';

function human(s: PmState, rng: Rng): PmAction {
  const ns = s.options.noStraights;
  if (s.phase === 'decision') {
    if (!canBelieve(s)) return { type: 'menteur' };
    const q = claimChance(s) + 0.15 + (rng() * 2 - 1) * 0.15;
    return q < 0.35 ? { type: 'menteur' } : { type: 'croire' };
  }
  const dice = s.dice!;
  if (s.phase === 'relance') {
    const target = rankOf(lastClaim(s)!.hand, ns) + 1;
    if (rankOf(dice, ns) >= target) return { type: 'relancer', pick: [] };
    const pool = [...coreDice(dice, ns)];
    const keep: number[] = [];
    dice.forEach((d, i) => { const j = pool.indexOf(d); if (j >= 0) { pool.splice(j, 1); keep.push(i); } });
    return { type: 'relancer', pick: [0, 1, 2, 3, 4].filter((i) => !keep.includes(i)) };
  }
  const last = lastClaim(s);
  const min = last ? rankOf(last.hand, ns) + 1 : 0;
  const r = Math.max(min, rankOf(dice, ns));
  return { type: 'annoncer', hand: [...handAt(r, ns).dice] };
}

interface Out { s: PmState; actions: number; blocked: boolean; lies: number; liesCaught: number; claims: number; calls: number; wrongCalls: number }
export function playOut(who: Who[], seed: number, opts: { lives?: number; noStraights?: boolean } = {}): Out {
  let s = newGame(who.map((l, i) => ({ id: `p${i}`, name: `J${i}`, ...(l !== 'humain' ? { bot: l } : {}) })), { lives: opts.lives ?? 3, noStraights: !!opts.noStraights }, seed);
  const rng = aiRng(seed * 7 + 3);
  const o: Out = { s, actions: 0, blocked: false, lies: 0, liesCaught: 0, claims: 0, calls: 0, wrongCalls: 0 };
  while (s.phase !== 'fini' && o.actions < MAX_ACTIONS) {
    const i = s.current;
    const w = who[i];
    const a = w === 'humain' ? human(s, rng) : decide(s, w, rng);
    if (a.type === 'annoncer') { o.claims++; if (rankOf(s.dice!, s.options.noStraights) < rankOf(a.hand, s.options.noStraights)) o.lies++; }
    const r = act(s, a);
    if ('error' in r) throw new Error(`${r.error} (${JSON.stringify(a)})`);
    if (a.type === 'menteur') { o.calls++; const rv = r.state.lastReveal!; if (!rv.truth) o.liesCaught++; else o.wrongCalls++; }
    s = r.state;
    o.actions++;
  }
  o.s = s;
  o.blocked = s.phase !== 'fini';
  return o;
}

const t0 = Date.now();
let seed = 1;
let blocked = 0;
const pct = (a: number, b: number) => `${((100 * a) / Math.max(1, b)).toFixed(1)} %`;

// 1. Durée et bluffs : tables de 2, 4 et 6 Habitués, 3 vies.
console.log(`Durée et bluffs (Habitués, 3 vies, ${GAMES} parties par ligne) :`);
for (const n of [2, 4, 6]) {
  for (const noStraights of [false, true]) {
    let rounds = 0, decisions = 0, lies = 0, caught = 0, claims = 0, calls = 0, wrong = 0;
    for (let g = 0; g < GAMES; g++) {
      const r = playOut(Array(n).fill('habitue'), seed++, { noStraights });
      if (r.blocked) blocked++;
      rounds += r.s.round; decisions += r.s.turns; lies += r.lies; caught += r.liesCaught; claims += r.claims; calls += r.calls; wrong += r.wrongCalls;
    }
    console.log(`  ${n} joueurs${noStraights ? ' sans suites' : ''} : ${(rounds / GAMES).toFixed(1)} manches, ${(decisions / GAMES).toFixed(1)} décisions (${(decisions / GAMES / n).toFixed(1)} par joueur) ; `
      + `annonces fausses ${pct(lies, claims)}, « Menteur ! » justes ${pct(caught, calls)} (bluffs démasqués ${pct(caught, lies)} des mensonges)`);
  }
}
const lives5: number[] = [];
for (let g = 0; g < GAMES; g++) { const r = playOut(['habitue', 'habitue', 'habitue'], seed++, { lives: 5 }); if (r.blocked) blocked++; lives5.push(r.s.round); }
console.log(`  3 joueurs, 5 vies : ${(lives5.reduce((a, b) => a + b, 0) / GAMES).toFixed(1)} manches`);

// 2. Duels entre niveaux (places alternées).
console.log('\nDuels (taux de victoire du premier nommé) :');
const pairs: [Who, Who][] = [['fouine', 'debutant'], ['habitue', 'debutant'], ['fouine', 'habitue'], ['humain', 'debutant'], ['humain', 'habitue'], ['humain', 'fouine'], ['habitue', 'habitue']];
for (const [a, b] of pairs) {
  let wins = 0;
  for (let g = 0; g < GAMES; g++) {
    const first = g % 2 === 0;
    const r = playOut(first ? [a, b] : [b, a], seed++);
    if (r.blocked) blocked++;
    if (r.s.winner === (first ? 'p0' : 'p1')) wins++;
  }
  console.log(`  ${a.padEnd(8)} contre ${b.padEnd(8)} : ${pct(wins, GAMES)}`);
}

// 3. Tables de 4 : un de chaque + un Habitué (part de victoires par niveau, attendu 25 % chacun).
console.log('\nTables de 4 (Débutant, Habitué, Fine fouine, Humain simple), part des victoires :');
const tally: Record<string, number> = {};
for (let g = 0; g < GAMES; g++) {
  const who: Who[] = ['debutant', 'habitue', 'fouine', 'humain'];
  const sh = who.map((w, i) => ({ w, k: ((g * 31 + i * 17) % 97) })).sort((x, y) => x.k - y.k).map((x) => x.w);
  const r = playOut(sh, seed++);
  if (r.blocked) blocked++;
  const w = sh[Number(r.s.winner!.slice(1))];
  tally[w] = (tally[w] ?? 0) + 1;
}
for (const w of ['debutant', 'habitue', 'fouine', 'humain']) console.log(`  ${w.padEnd(8)} : ${pct(tally[w] ?? 0, GAMES)}`);

console.log(`\nParties bloquées : ${blocked}. Temps : ${((Date.now() - t0) / 1000).toFixed(1)} s`);
