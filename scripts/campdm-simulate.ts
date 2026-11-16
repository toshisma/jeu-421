/**
 * Simulation de la Route des Auberges (campagne du Courtisan) : chaque étape jouée jusqu'au bout par des
 * ordinateurs, le « joueur » étant tenu par un ordinateur Débutant, Habitué (joueur moyen) ou Fine fouine.
 * Donne le taux de victoire, la part de chaque étoile, la durée (tours du joueur) et vérifie que les faits
 * du rejeu serveur (replayDm) sont identiques à la partie jouée.
 * npx tsx scripts/campdm-simulate.ts --games 2000
 */
import { act, currentPlayer, type DmAction, type DmLevel } from '../shared/dixmille/engine';
import { decide } from '../shared/dixmille/ai';
import { encodeDm, newGameDm, replayDm } from '../shared/rejeu/dixmille';
import { CDM_STAGES, cdmSetup, cdmStarsOf } from '../shared/campaigns/dm';

const arg = (k: string, d: number) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? Number(process.argv[i + 1]) : d; };
const GAMES = arg('games', 2000);
const DETAIL = process.argv.includes('--detail');
const pct = (n: number, d: number) => `${((100 * n) / Math.max(1, d)).toFixed(1)} %`.padStart(7);

const t0 = Date.now();
let mismatch = 0, blocked = 0;
console.log(`Route des Auberges — ${GAMES} parties par étape et par niveau du joueur`);
console.log('étape        | Débutant | Habitué (moyen) : victoire, ★2, ★3, tours joueur (moy / 90 %) | Fine fouine');
for (const st of CDM_STAGES) {
  const setup = cdmSetup(st);
  const res: Record<DmLevel, { w: number; s2: number; s3: number; turns: number[] }> = {
    debutant: { w: 0, s2: 0, s3: 0, turns: [] }, habitue: { w: 0, s2: 0, s3: 0, turns: [] }, fouine: { w: 0, s2: 0, s3: 0, turns: [] },
  };
  const wf: { misses: number; best: number; turns: number; opp: number; hot: number }[] = [];
  for (const me of ['debutant', 'habitue', 'fouine'] as DmLevel[]) {
    for (let g = 0; g < GAMES; g++) {
      const seed = (g * 7919 + st.id.length * 104729 + me.length) >>> 0;
      let s = newGameDm(setup, seed);
      const moves: string[] = [];
      let guard = 0;
      while (s.phase !== 'fini' && guard++ < 50_000) {
        const mine = currentPlayer(s).id === 'moi';
        const a: DmAction = decide(s, mine ? me : currentPlayer(s).bot!);
        const r = act(s, a);
        if ('error' in r) throw new Error(`${st.id}: ${r.error}`);
        if (mine) moves.push(encodeDm(a));
        s = r.state;
      }
      if (s.phase !== 'fini') { blocked++; continue; }
      const rp = replayDm(setup, seed, moves.join('.'));
      if (!rp.ok || rp.facts.won !== (s.winner === 'moi')) { mismatch++; continue; }
      const m = cdmStarsOf(st, rp.facts);
      const x = res[me];
      if (m & 1) x.w++;
      if (m & 2) x.s2++;
      if (m & 4) x.s3++;
      x.turns.push(rp.facts.turns);
      if (me === 'habitue' && m & 1) wf.push({ misses: rp.facts.misses, best: rp.facts.bestTurn, turns: rp.facts.turns, opp: rp.facts.oppBest, hot: rp.facts.hotMax });
    }
  }
  const h = res.habitue;
  h.turns.sort((a, b) => a - b);
  const avg = h.turns.reduce((a, b) => a + b, 0) / h.turns.length;
  if (DETAIL) {
    const q = (k: keyof (typeof wf)[number]) => { const v = wf.map((x) => x[k]).sort((a, b) => a - b); return [0.25, 0.5, 0.75].map((f) => v[Math.floor(v.length * f)]).join('/'); };
    console.log(`   gagnées (quartiles 25/50/75) : ratés ${q('misses')} · meilleur tour ${q('best')} · tours ${q('turns')} · meilleur adversaire ${q('opp')} · main pleine ${pct(wf.filter((x) => x.hot > 0).length, wf.length)}`);
  }
  console.log(`${st.id.padEnd(12)} | ${pct(res.debutant.w, GAMES)} | ${pct(h.w, GAMES)} ★2 ${pct(h.s2, GAMES)} ★3 ${pct(h.s3, GAMES)} · ${avg.toFixed(1)} / ${h.turns[Math.floor(h.turns.length * 0.9)]} tours | ${pct(res.fouine.w, GAMES)}`);
}
console.log(`Parties bloquées : ${blocked} · rejeu différent : ${mismatch} · ${((Date.now() - t0) / 1000).toFixed(1)} s`);
