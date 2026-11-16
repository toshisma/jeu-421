/**
 * Campagne du Poker menteur « Les Arrière-salles » : chaque étape jouée jusqu'au bout par des ordinateurs
 * (les adversaires exactement comme dans le jeu : niveau, style, tirage rejouable), contre :
 *  - un « joueur moyen » (le même modèle que scripts/pokermenteur-simulate.ts : vérité quand il peut,
 *    ment d'un cran, garde ses dés qui comptent, crie quand l'annonce paraît trop belle) ;
 *  - un Habitué et une Fine fouine à sa place (repères).
 * Donne : taux de victoire, durée (manches, décisions), parties bloquées, taux de chaque étoile.
 * Contrôle aussi que chaque partie se rejoue à l'identique (replayPm). Les styles sont comparés à part.
 *   npx tsx scripts/camppm-simulate.ts --games 2000
 */
import { act, canBelieve, lastClaim, newGame, type PmAction, type PmLevel, type PmState } from '../shared/pokermenteur/engine';
import { aiRng, claimChance, decide, PM_STYLES, type PmStyle } from '../shared/pokermenteur/ai';
import { coreDice, handAt, rankOf } from '../shared/pokermenteur/hands';
import { encodePm, newGamePm, pmBotDecideFor, replayPm } from '../shared/rejeu/poker';
import { CPM_STAGES, cpmSetup, starMet } from '../shared/campaigns/pm';
import type { Rng } from '../shared/rng';

const arg = (k: string, d: number) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? Number(process.argv[i + 1]) : d; };
const GAMES = arg('games', 2000);

/** Joueur moyen (pas de calcul exact). */
export function average(s: PmState, rng: Rng): PmAction {
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
  return { type: 'annoncer', hand: [...handAt(Math.max(min, rankOf(dice, ns)), ns).dice] };
}

type Me = 'moyen' | PmLevel;
function playStage(i: number, seed: number, me: Me, check: boolean) {
  const st = CPM_STAGES[i];
  const setup = cpmSetup(st, seed % (st.opponents.length + 1));
  let s = newGamePm(setup, seed);
  const hr = aiRng(seed * 31 + 7);
  const moves: string[] = [];
  let n = 0;
  while (s.phase !== 'fini' && n < 5000) {
    const mine = s.players[s.current].id === 'moi';
    const a = mine ? (me === 'moyen' ? average(s, hr) : decide(s, me, hr)) : pmBotDecideFor(setup, s);
    const r = act(s, a);
    if ('error' in r) throw new Error(`${st.id} : ${r.error}`);
    if (mine) moves.push(encodePm(a));
    s = r.state; n++;
  }
  const rep = replayPm(setup, seed, moves.join('.'));
  if (!rep.ok) throw new Error(`${st.id} : rejeu refusé (${rep.error})`);
  if (check && (rep.facts.won !== (s.winner === 'moi'))) throw new Error(`${st.id} : rejeu différent`);
  return { s, facts: rep.facts, blocked: s.phase !== 'fini' };
}

const t0 = Date.now();
const pct = (a: number, b: number) => `${((100 * a) / Math.max(1, b)).toFixed(0)} %`.padStart(5);
console.log(`Campagne « Les Arrière-salles » : ${GAMES} parties par étape et par joueur.`);
console.log('étape        adv vies sans-suites | moyen  habitué  fouine | manches décisions | étoile 2 / 3 (parmi les victoires du joueur moyen)');
let blocked = 0;
for (let i = 0; i < CPM_STAGES.length; i++) {
  const st = CPM_STAGES[i];
  const w: Record<Me, number> = { moyen: 0, debutant: 0, habitue: 0, fouine: 0 };
  let rounds = 0, turns = 0, s2 = 0, s3 = 0;
  for (const me of ['moyen', 'habitue', 'fouine'] as Me[]) {
    for (let g = 0; g < GAMES; g++) {
      const r = playStage(i, 1_000_003 * (i + 1) + g, me, g % 50 === 0);
      if (r.blocked) blocked++;
      if (r.facts.won) w[me]++;
      if (me === 'moyen') {
        rounds += r.s.round; turns += r.s.turns;
        if (r.facts.won) { if (starMet(st.stars[0], r.facts)) s2++; if (starMet(st.stars[1], r.facts)) s3++; }
      }
    }
  }
  const star = (k: typeof st.stars[0]) => `${k.k}${k.n}`;
  console.log(`${String(i + 1).padStart(2)} ${st.id.padEnd(10)} ${st.opponents.length}   ${st.lives}    ${st.noStraights ? 'oui' : 'non'}       | ${pct(w.moyen, GAMES)} ${pct(w.habitue, GAMES)}   ${pct(w.fouine, GAMES)}  | ${(rounds / GAMES).toFixed(1).padStart(5)}  ${(turns / GAMES).toFixed(1).padStart(6)}   | ${star(st.stars[0])} ${pct(s2, w.moyen)} · ${star(st.stars[1])} ${pct(s3, w.moyen)}`);
}

// Styles : chaque style (niveau Habitué) contre trois Habitués sans style, 4 joueurs.
console.log('\nStyles de bluff (un ordinateur stylé Habitué contre 3 Habitués, 4 joueurs, 3 vies) :');
for (const style of [undefined, ...PM_STYLES] as (PmStyle | undefined)[]) {
  let wins = 0, claims = 0, lies = 0, calls = 0, decisions = 0;
  for (let g = 0; g < GAMES; g++) {
    const seed = 77_000 + g;
    let s = newGame([0, 1, 2, 3].map((i) => ({ id: `p${i}`, name: `J${i}`, bot: 'habitue' as PmLevel })), { lives: 3 }, seed);
    s = { ...s };
    const rng = aiRng(seed);
    let n = 0;
    while (s.phase !== 'fini' && n++ < 5000) {
      const me = s.current === 0;
      const a = decide(s, 'habitue', rng, me ? style : undefined);
      if (me) {
        if (a.type === 'annoncer') { claims++; if (rankOf(s.dice!, false) < rankOf(a.hand, false)) lies++; }
        if (s.phase === 'decision') { decisions++; if (a.type === 'menteur') calls++; }
      }
      const r = act(s, a);
      if ('error' in r) throw new Error(r.error);
      s = r.state;
    }
    if (s.winner === 'p0') wins++;
  }
  console.log(`  ${(style ?? 'sans style').padEnd(13)} victoires ${pct(wins, GAMES)} (25 % = égalité) · annonces fausses ${pct(lies, claims)} · « Menteur ! » ${pct(calls, decisions)} des décisions`);
}
console.log(`\nParties bloquées : ${blocked}. Durée : ${((Date.now() - t0) / 1000).toFixed(1)} s.`);
