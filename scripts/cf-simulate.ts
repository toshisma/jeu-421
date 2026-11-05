/**
 * « Coups Fourrés » : simulations entre ordinateurs pour l'équilibrage.
 *
 *   npx tsx scripts/cf-simulate.ts [--games 20000] [--workers 2] [--rules '{"startTokens":11}'] [--out rapport.json] [--quick]
 *
 * Joue des parties entre IA (decks de départ, decks aléatoires valides, decks optimisés
 * mono/bi-familles, à 2, 3 et 4 joueurs), vérifie que chaque partie se termine et affiche :
 * durée, avantage du premier meneur, victoires par deck et par famille, statistiques par carte.
 */
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { apply, legalActions, newGame, viewFor, waitingFor, type CfConfig } from '../shared/cards/engine';
import { cfDecide, type CfLevel } from '../shared/cards/ai';
import { CARDS, CARD_BY_ID, STARTER_DECKS, deckProblems, type CardFamily } from '../shared/cards/catalog';
import { mulberry32 } from '../shared/rng';

// ---------------------------------------------------------------------------------------------
// Decks

const FAMILIES: CardFamily[] = ['habitues', 'ivresse', 'pieges', 'chaines'];
const expand = (cards: Record<string, number>) => Object.entries(cards).flatMap(([id, n]) => Array(n).fill(id) as string[]);
const maxOf = (id: string) => (CARD_BY_ID[id].rarity === 'legendaire' ? 1 : 2);

/** Ordre de préférence (a priori) pour construire des decks « optimisés ». */
const PREF = [
  'bon-numero', 'patron', 'josiane', 'coup-pouce', 'retournement-veste', 'double-tournee', 'reaction-chaine', 'cul-sec',
  'tete-tourne', 'coup-coude', 'tournee-patron', 'pilier', 'videur', 'recompter', 'grand-enchainement', 'ticket-caisse',
  'tournee-generale', 'faux-421', 'coup-nenette', 'gueule-bois', 'calcul-mental', 'mise-bouche', 'croche-patte', 'ardoise-piegee',
  'de-sous-table', 'yeux-piquent', 'fouine', 'pari-comptoir', 'leurre', 'domino', 'note-salee', 'fermeture', 'vieux-marcel', 'main-sac',
];

function buildDeck(families: CardFamily[], mainQuota = 20): string[] {
  const deck: string[] = [];
  const [main, ...rest] = families;
  for (const id of PREF) {
    if (deck.length >= mainQuota) break;
    if (CARD_BY_ID[id].family !== main) continue;
    for (let k = 0; k < maxOf(id) && deck.length < mainQuota; k++) deck.push(id);
  }
  for (const id of PREF) {
    if (deck.length >= 20) break;
    if (!rest.includes(CARD_BY_ID[id].family)) continue;
    for (let k = 0; k < maxOf(id) && deck.length < 20; k++) deck.push(id);
  }
  return deck;
}

interface DeckSpec { name: string; kind: 'depart' | 'aleatoire' | 'optimise'; cards: string[] }

const STARTERS: DeckSpec[] = STARTER_DECKS.map((d) => ({ name: d.name, kind: 'depart', cards: expand(d.cards) }));
const OPTIMIZED: DeckSpec[] = [];
const FL: Record<CardFamily, string> = { habitues: 'Habitués', ivresse: 'Ivresse', pieges: 'Pièges', chaines: 'Chaînes' };
FAMILIES.forEach((f, i) => {
  OPTIMIZED.push({ name: `Mono ${FL[f]}`, kind: 'optimise', cards: buildDeck([f, FAMILIES[(i + 1) % 4]], 17) });
});
for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
  const a = FAMILIES[i], b = FAMILIES[j];
  const half = buildDeck([a], 10);
  const deck = [...half, ...buildDeck([b], 10)];
  OPTIMIZED.push({ name: `${FL[a]} + ${FL[b]}`, kind: 'optimise', cards: deck.slice(0, 20) });
}
for (const d of [...STARTERS, ...OPTIMIZED]) {
  const rec: Record<string, number> = {};
  for (const id of d.cards) rec[id] = (rec[id] ?? 0) + 1;
  const pb = deckProblems(rec);
  if (pb.length) throw new Error(`${d.name} : ${pb.join(' ')}`);
}

function randomDeck(r: () => number): DeckSpec {
  const d: string[] = [];
  while (d.length < 20) {
    const c = CARDS[Math.floor(r() * CARDS.length)];
    if (d.filter((x) => x === c.id).length < maxOf(c.id)) d.push(c.id);
  }
  return { name: 'Aléatoire', kind: 'aleatoire', cards: d };
}

// ---------------------------------------------------------------------------------------------
// Une partie

interface Seat { deck: DeckSpec; level: CfLevel }
export interface GameRecord {
  set: string;
  seats: { deck: string; kind: string; level: CfLevel; cards: string[]; played: string[]; place: number; tokens: number }[];
  firstLeader: number;
  winner: number;
  rounds: number;
  decisions: number;
  stalled: boolean;
  timeUp: boolean;
  /** Décisions qui ont réellement demandé un choix (plus d'une action possible). */
  realDecisions: number;
}

const STEP_CAP = 30000;

export function playGame(seats: Seat[], seed: number, config: CfConfig, set: string): GameRecord {
  let s = newGame(config, seats.map((x, i) => ({ id: `p${i}`, name: `J${i + 1}`, deck: x.deck.cards })), seed);
  const rng = mulberry32(seed ^ 0x9e3779b9);
  const played: Set<string>[] = seats.map(() => new Set());
  let steps = 0, real = 0, firstLeader = -1;
  let stalled = false;
  while (s.phase !== 'over') {
    if (++steps > STEP_CAP) { stalled = true; break; }
    const w = waitingFor(s);
    if (!w.length) { stalled = true; break; }
    const pid = w[0];
    const i = Number(pid.slice(1));
    const legal = legalActions(s, pid);
    if (!legal.length) { stalled = true; break; }
    if (legal.length > 1) real++;
    const a = cfDecide(viewFor(s, pid), legal, seats[i].level, rng);
    if (a.type === 'play') {
      const k = s.players[i].hand.find((x) => x.uid === a.card);
      if (k) played[i].add(k.id);
    }
    const res = apply(s, pid, a, { inPlace: true });
    if (!res.ok) throw new Error(`Action illégale de l'IA : ${res.error} ${JSON.stringify(a)}`);
    s = res.state;
    if (firstLeader < 0 && s.round >= 1) firstLeader = s.players.findIndex((p) => p.id === s.order[0]);
  }
  return {
    set,
    seats: seats.map((x, i) => ({
      deck: x.deck.name, kind: x.deck.kind, level: x.level, cards: x.deck.cards, played: [...played[i]],
      place: s.players[i].place ?? 0, tokens: s.players[i].tokens,
    })),
    firstLeader,
    winner: s.winner ? Number(s.winner.slice(1)) : -1,
    rounds: s.round,
    decisions: s.decisions,
    stalled,
    timeUp: !stalled && !s.players.some((p) => p.tokens <= 0),
    realDecisions: real,
  };
}

// ---------------------------------------------------------------------------------------------
// Plan de simulation

interface Job { set: string; seats: Seat[]; seed: number }

function plan(total: number, seed0: number): Job[] {
  const r = mulberry32(seed0);
  const jobs: Job[] = [];
  const F: CfLevel = 'fine-fouine';
  const add = (set: string, seats: Seat[]) => jobs.push({ set, seats, seed: (seed0 * 7919 + jobs.length * 104729) >>> 0 });
  const share = (x: number) => Math.max(2, Math.round(total * x));
  // 1. Decks de départ entre eux (sièges alternés).
  for (let k = 0; k < share(0.15); k++) {
    const [a, b] = k % 2 ? [STARTERS[0], STARTERS[1]] : [STARTERS[1], STARTERS[0]];
    add('depart', [{ deck: a, level: F }, { deck: b, level: F }]);
  }
  // 2. Decks aléatoires valides.
  for (let k = 0; k < share(0.35); k++) add('aleatoire', [{ deck: randomDeck(r), level: F }, { deck: randomDeck(r), level: F }]);
  // 3. Decks optimisés entre eux (toutes les paires, sièges alternés) et contre aléatoires.
  const n3 = share(0.3);
  for (let k = 0; k < n3; k++) {
    const a = OPTIMIZED[k % OPTIMIZED.length];
    const b = OPTIMIZED[Math.floor(k / OPTIMIZED.length) % OPTIMIZED.length];
    add('optimise', k % 2 ? [{ deck: a, level: F }, { deck: b, level: F }] : [{ deck: b, level: F }, { deck: a, level: F }]);
  }
  for (let k = 0; k < share(0.06); k++) {
    const o = OPTIMIZED[k % OPTIMIZED.length];
    add('optimise-alea', k % 2 ? [{ deck: o, level: F }, { deck: randomDeck(r), level: F }] : [{ deck: randomDeck(r), level: F }, { deck: o, level: F }]);
  }
  // 4. Niveaux d'IA (même deck de départ des deux côtés, sièges alternés).
  const L: [CfLevel, CfLevel][] = [['fine-fouine', 'habitue'], ['fine-fouine', 'debutant'], ['habitue', 'debutant']];
  for (let k = 0; k < share(0.06); k++) {
    const [x, y] = L[k % 3];
    const d = STARTERS[Math.floor(k / 3) % 2];
    add(`niveaux:${x}>${y}`, (Math.floor(k / 6) % 2) ? [{ deck: d, level: x }, { deck: d, level: y }] : [{ deck: d, level: y }, { deck: d, level: x }]);
  }
  // 5. Parties libres à 3 et 4.
  for (let k = 0; k < share(0.08); k++) {
    const n = 3 + (k % 2);
    add(`multi${n}`, Array.from({ length: n }, () => ({ deck: randomDeck(r), level: F })));
  }
  return jobs;
}

// ---------------------------------------------------------------------------------------------
// Rapport

const pctf = (x: number) => `${(100 * x).toFixed(1)} %`;

export function summarize(recs: GameRecord[]) {
  const out: Record<string, unknown> = {};
  const duel = recs.filter((r) => r.seats.length === 2);
  const ff = duel.filter((r) => !r.set.startsWith('niveaux'));
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
  const pctl = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))] ?? 0; };
  out.games = recs.length;
  out.stalled = recs.filter((r) => r.stalled).length;
  out.timeUp = recs.filter((r) => r.timeUp).length;
  out.duel = {
    rounds: mean(ff.map((r) => r.rounds)), roundsP90: pctl(ff.map((r) => r.rounds), 0.9), roundsMax: Math.max(...ff.map((r) => r.rounds)),
    decisions: mean(ff.map((r) => r.decisions)), realDecisions: mean(ff.map((r) => r.realDecisions)),
    minutes: mean(ff.map((r) => r.realDecisions)) * 6 / 60,
    firstLeaderWins: mean(ff.map((r) => (r.winner === r.firstLeader ? 1 : 0))),
    seat0Wins: mean(ff.map((r) => (r.winner === 0 ? 1 : 0))),
  };
  for (const n of [3, 4]) {
    const m = recs.filter((r) => r.set === `multi${n}`);
    if (m.length) out[`multi${n}`] = { games: m.length, rounds: mean(m.map((r) => r.rounds)), realDecisions: mean(m.map((r) => r.realDecisions)), minutes: mean(m.map((r) => r.realDecisions)) * 6 / 60, firstLeaderWins: mean(m.map((r) => (r.winner === r.firstLeader ? 1 : 0))) };
  }
  // Decks de départ
  const dep = recs.filter((r) => r.set === 'depart');
  const zincWins = dep.filter((r) => r.seats[r.winner]?.deck === 'Le Zinc').length;
  out.starters = { games: dep.length, zinc: zincWins / Math.max(1, dep.length) };
  // Niveaux
  const lv: Record<string, number> = {};
  for (const set of ['niveaux:fine-fouine>habitue', 'niveaux:fine-fouine>debutant', 'niveaux:habitue>debutant']) {
    const g = recs.filter((r) => r.set === set);
    const strong = set.split(':')[1].split('>')[0];
    lv[set] = g.filter((r) => r.seats[r.winner]?.level === strong).length / Math.max(1, g.length);
  }
  out.levels = lv;
  // Decks optimisés
  const opt: Record<string, { w: number; n: number }> = {};
  for (const r of recs.filter((x) => x.set === 'optimise' || x.set === 'optimise-alea')) {
    r.seats.forEach((st, i) => {
      if (st.kind !== 'optimise') return;
      if (r.set === 'optimise' && r.seats[0].deck === r.seats[1].deck) return;
      const o = (opt[st.deck] ??= { w: 0, n: 0 }); o.n++; if (r.winner === i) o.w++;
    });
  }
  out.optimized = Object.fromEntries(Object.entries(opt).map(([k, v]) => [k, v.w / v.n]));
  // Familles : part de chaque famille dans le deck du gagnant, pondérée (decks aléatoires + optimisés, duels FF).
  const fam: Record<string, { w: number; n: number }> = {};
  for (const r of ff.filter((x) => x.set !== 'depart')) {
    r.seats.forEach((st, i) => {
      for (const f of FAMILIES) {
        const share = st.cards.filter((id) => CARD_BY_ID[id].family === f).length / 20;
        const o = (fam[f] ??= { w: 0, n: 0 }); o.n += share; if (r.winner === i) o.w += share;
      }
    });
  }
  out.families = Object.fromEntries(Object.entries(fam).map(([k, v]) => [k, v.w / v.n]));
  // Familles « dominantes » (≥ 10 cartes d'une famille)
  const dom: Record<string, { w: number; n: number }> = {};
  for (const r of ff.filter((x) => x.set !== 'depart')) {
    r.seats.forEach((st, i) => {
      for (const f of FAMILIES) if (st.cards.filter((id) => CARD_BY_ID[id].family === f).length >= 10) { const o = (dom[f] ??= { w: 0, n: 0 }); o.n++; if (r.winner === i) o.w++; }
    });
  }
  out.dominant = Object.fromEntries(Object.entries(dom).map(([k, v]) => [k, { rate: v.w / v.n, n: v.n }]));
  // Cartes (duels Fine fouine, decks aléatoires seulement : chaque carte y est aussi souvent que les autres)
  const cards: Record<string, { inDeck: number; winInDeck: number; played: number; winPlayed: number; notPlayed: number; winNotPlayed: number }> = {};
  for (const r of ff.filter((x) => x.set === 'aleatoire' || x.set === 'optimise-alea')) {
    r.seats.forEach((st, i) => {
      if (st.kind !== 'aleatoire') return;
      const won = r.winner === i ? 1 : 0;
      for (const id of new Set(st.cards)) {
        const c = (cards[id] ??= { inDeck: 0, winInDeck: 0, played: 0, winPlayed: 0, notPlayed: 0, winNotPlayed: 0 });
        c.inDeck++; c.winInDeck += won;
        if (st.played.includes(id)) { c.played++; c.winPlayed += won; } else { c.notPlayed++; c.winNotPlayed += won; }
      }
    });
  }
  out.marginal = marginal(ff.filter((x) => x.set === 'aleatoire'));
  out.cards = Object.fromEntries(Object.entries(cards).map(([id, c]) => [id, {
    inDeck: c.inDeck, playRate: c.played / c.inDeck, winInDeck: c.winInDeck / c.inDeck,
    winPlayed: c.winPlayed / Math.max(1, c.played), winNotPlayed: c.winNotPlayed / Math.max(1, c.notPlayed),
  }]));
  return out;
}

/**
 * Valeur marginale de chaque carte : régression linéaire (avec un léger rappel vers 0) de la victoire
 * sur la différence de composition des deux decks aléatoires. Résultat : points de victoire par exemplaire.
 */
export function marginal(recs: GameRecord[]): Record<string, number> {
  const ids = CARDS.map((c) => c.id);
  const n = ids.length + 1; // + siège
  const A = Array.from({ length: n }, () => new Array(n).fill(0));
  const b = new Array(n).fill(0);
  for (const r of recs) {
    const x = new Array(n).fill(0);
    for (const id of r.seats[0].cards) x[ids.indexOf(id)] += 1;
    for (const id of r.seats[1].cards) x[ids.indexOf(id)] -= 1;
    x[n - 1] = 1;
    const y = (r.winner === 0 ? 1 : 0) - 0.5;
    for (let i = 0; i < n; i++) { b[i] += x[i] * y; for (let j = 0; j < n; j++) A[i][j] += x[i] * x[j]; }
  }
  for (let i = 0; i < n - 1; i++) A[i][i] += 20; // rappel vers 0
  // Élimination de Gauss
  for (let i = 0; i < n; i++) {
    let p = i; for (let k = i + 1; k < n; k++) if (Math.abs(A[k][i]) > Math.abs(A[p][i])) p = k;
    [A[i], A[p]] = [A[p], A[i]]; [b[i], b[p]] = [b[p], b[i]];
    for (let k = i + 1; k < n; k++) { const f = A[k][i] / A[i][i]; for (let j = i; j < n; j++) A[k][j] -= f * A[i][j]; b[k] -= f * b[i]; }
  }
  const w = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) { let t = b[i]; for (let j = i + 1; j < n; j++) t -= A[i][j] * w[j]; w[i] = t / A[i][i]; }
  return Object.fromEntries(ids.map((id, i) => [id, 100 * w[i]]));
}

export function printSummary(sm: ReturnType<typeof summarize>) {
  const d = sm.duel as Record<string, number>;
  const lines: string[] = [];
  lines.push(`Parties : ${sm.games} — bloquées : ${sm.stalled} — arrêtées au garde-fou : ${sm.timeUp}`);
  lines.push(`Duel : ${d.rounds.toFixed(1)} manches (90 % sous ${d.roundsP90}, max ${d.roundsMax}), ${d.decisions.toFixed(0)} décisions dont ${d.realDecisions.toFixed(0)} vrais choix ≈ ${d.minutes.toFixed(1)} min`);
  lines.push(`Premier meneur gagne : ${pctf(d.firstLeaderWins)} ; siège 1 gagne : ${pctf(d.seat0Wins)}`);
  for (const n of [3, 4]) { const m = sm[`multi${n}`] as Record<string, number> | undefined; if (m) lines.push(`À ${n} : ${m.rounds.toFixed(1)} manches, ${m.realDecisions.toFixed(0)} vrais choix ≈ ${m.minutes.toFixed(1)} min, premier meneur gagne ${pctf(m.firstLeaderWins)}`); }
  const st = sm.starters as Record<string, number>;
  lines.push(`Le Zinc contre La Bringue : ${pctf(st.zinc)} / ${pctf(1 - st.zinc)} (${st.games} parties)`);
  lines.push(`Niveaux : ${Object.entries(sm.levels as Record<string, number>).map(([k, v]) => `${k.split(':')[1]} ${pctf(v)}`).join(' ; ')}`);
  lines.push(`Familles (part pondérée) : ${Object.entries(sm.families as Record<string, number>).map(([k, v]) => `${k} ${pctf(v)}`).join(' ; ')}`);
  lines.push(`Familles dominantes (≥10 cartes) : ${Object.entries(sm.dominant as Record<string, { rate: number; n: number }>).map(([k, v]) => `${k} ${pctf(v.rate)} (${v.n})`).join(' ; ')}`);
  lines.push(`Decks optimisés : ${Object.entries(sm.optimized as Record<string, number>).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${pctf(v)}`).join(' ; ')}`);
  lines.push('Cartes (decks aléatoires) : id | famille | dans le deck | jouée | victoire si dans le deck | si jouée | si non jouée | valeur marginale (points par exemplaire)');
  const cards = sm.cards as Record<string, Record<string, number>>;
  const mg = sm.marginal as Record<string, number>;
  for (const [id, c] of Object.entries(cards).sort((a, b) => mg[b[0]] - mg[a[0]])) {
    lines.push(`  ${id.padEnd(20)} ${CARD_BY_ID[id].family.padEnd(9)} ${String(c.inDeck).padStart(5)} ${pctf(c.playRate).padStart(8)} ${pctf(c.winInDeck).padStart(8)} ${pctf(c.winPlayed).padStart(8)} ${pctf(c.winNotPlayed).padStart(8)} ${(mg[id] >= 0 ? '+' : '') + mg[id].toFixed(1)}`);
  }
  console.log(lines.join('\n'));
}

// ---------------------------------------------------------------------------------------------
// Lancement (avec plusieurs processus légers si demandé)

/** Essais : coûts de cartes modifiés le temps d'une simulation. */
export function applyCosts(costs: Record<string, number>) {
  for (const [id, c] of Object.entries(costs ?? {})) CARD_BY_ID[id].cost = c;
}

function arg(name: string, def?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
}

async function main() {
  const total = Number(arg('games', '20000'));
  const workers = Number(arg('workers', '2'));
  const rules = JSON.parse(arg('rules', '{}')!);
  const startTokens = arg('tokens') ? Number(arg('tokens')) : undefined;
  const seed = Number(arg('seed', '421'));
  const config: CfConfig = { rules, startTokens };
  const costs = JSON.parse(arg('costs', '{}')!) as Record<string, number>;
  applyCosts(costs);
  const jobs = plan(total, seed);
  const t0 = Date.now();
  let recs: GameRecord[] = [];
  if (workers <= 1) recs = jobs.map((j) => playGame(j.seats, j.seed, config, j.set));
  else {
    const chunks: Job[][] = Array.from({ length: workers }, () => []);
    jobs.forEach((j, i) => chunks[i % workers].push(j));
    const file = fileURLToPath(import.meta.url);
    const parts = await Promise.all(chunks.map((chunk) => new Promise<GameRecord[]>((res, rej) => {
      const w = new Worker(file, { workerData: { chunk, config, costs }, execArgv: ['--import', 'tsx'] });
      w.on('message', res); w.on('error', rej);
    })));
    recs = parts.flat();
  }
  const sm = summarize(recs);
  console.log(`(${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  printSummary(sm);
  const outFile = arg('out');
  if (outFile) writeFileSync(outFile, JSON.stringify({ config, summary: sm }, null, 1));
  if ((sm.stalled as number) > 0) process.exitCode = 1;
}

if (!isMainThread && workerData?.chunk) {
  const { chunk, config, costs } = workerData as { chunk: Job[]; config: CfConfig; costs: Record<string, number> };
  applyCosts(costs);
  parentPort!.postMessage(chunk.map((j) => playGame(j.seats, j.seed, config, j.set)));
} else if (isMainThread && process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  void main();
}
