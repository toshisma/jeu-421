/**
 * Chiffres de la page « Stratégie du Dix mille » (scripts/seo-courtisan-pages.mjs), calculés
 * exactement avec le moteur du mode (shared/dixmille/engine.ts) : aucune valeur n'est recopiée.
 *   npx tsx scripts/courtisan-probas.ts
 *
 * 1. Chance de rater (aucun dé qui rapporte) selon le nombre de dés lancés : énumération des 6^n lancers.
 * 2. Points d'un lancer : meilleure sélection possible (0 si raté), en moyenne.
 * 3. Quelques combinaisons sur un lancer de 6 dés.
 * 4. Jeu « au mieux » pour un tour seul (maximiser les points encaissés en moyenne, programmation
 *    dynamique sur les points du tour et le nombre de dés) : espérance d'un tour, chance de le rater,
 *    seuils « encaisser à partir de » selon les dés restants, et des décisions d'exemple (page « Quels dés garder »).
 *    Ce critère ignore le score des adversaires : en fin de partie, il faut prendre plus ou moins de risques.
 */
import { bestScore, hasScoring, validSelections } from '../shared/dixmille/engine';

const pct = (x: number, d = 1) => `${(100 * x).toFixed(d).replace('.', ',')} %`;

// Lancers possibles de n dés, regroupés par valeurs triées (multiset) avec leur probabilité.
type Out = { vals: number[]; p: number; sels: { points: number; used: number }[] };
const outcomes: Out[][] = [[]];
for (let n = 1; n <= 6; n++) {
  const g = new Map<string, { vals: number[]; k: number }>();
  const total = 6 ** n;
  for (let m = 0; m < total; m++) {
    const vals: number[] = [];
    let x = m;
    for (let i = 0; i < n; i++) { vals.push(1 + (x % 6)); x = Math.floor(x / 6); }
    vals.sort();
    const key = vals.join('');
    const e = g.get(key);
    if (e) e.k++; else g.set(key, { vals, k: 1 });
  }
  outcomes.push([...g.values()].map(({ vals, k }) => ({ vals, p: k / total, sels: validSelections(vals).map((s) => ({ points: s.points, used: s.idx.length })) })));
}

console.log('1. Chance de rater selon le nombre de dés lancés');
for (let n = 1; n <= 6; n++) {
  const miss = outcomes[n].filter((o) => !hasScoring(o.vals)).reduce((a, o) => a + o.p, 0);
  const ways = Math.round(miss * 6 ** n);
  console.log(`  ${n} dé${n > 1 ? 's' : ' '} : ${pct(miss)}  (${ways} lancers sur ${6 ** n}, environ 1 fois sur ${(1 / miss).toFixed(1)})`);
}

console.log('2. Points d’un seul lancer (meilleure sélection, 0 si raté), en moyenne');
for (let n = 1; n <= 6; n++) {
  const e = outcomes[n].reduce((a, o) => a + o.p * bestScore(o.vals), 0);
  console.log(`  ${n} dé${n > 1 ? 's' : ' '} : ${e.toFixed(0)} points`);
}

console.log('3. Sur un lancer de 6 dés');
const six = outcomes[6];
const prob = (f: (o: Out) => boolean) => six.filter(f).reduce((a, o) => a + o.p, 0);
const count = (vals: number[]) => { const c = [0, 0, 0, 0, 0, 0, 0]; for (const v of vals) c[v]++; return c; };
console.log(`  grande suite 1 à 6        : ${pct(prob((o) => count(o.vals).slice(1).every((k) => k === 1)), 2)}`);
console.log(`  au moins trois dés pareils : ${pct(prob((o) => count(o.vals).some((k, f) => f > 0 && k >= 3)))}`);
console.log(`  au moins trois 1           : ${pct(prob((o) => count(o.vals)[1] >= 3))}`);
console.log(`  au moins une suite (1-5, 2-6 ou 1-6) : ${pct(prob((o) => { const c = count(o.vals); return [1, 2, 3, 4, 5].every((f) => c[f]) || [2, 3, 4, 5, 6].every((f) => c[f]); }))}`);
console.log(`  les 6 dés rapportent d’un coup (main pleine directe) : ${pct(prob((o) => o.sels.some((s) => s.used === 6)))}`);
console.log(`  1 000 points ou plus d’un coup : ${pct(prob((o) => bestScore(o.vals) >= 1000))}`);

// 4. Jeu au mieux pour un tour seul.
const STEP = 50; // toutes les valeurs du jeu sont des multiples de 50
const CAP = 30000; // au-delà, on encaisse (jamais atteint en pratique)
const steps = CAP / STEP + 1;
const C = Array.from({ length: 7 }, () => new Float64Array(steps)); // espérance si l'on relance n dés avec T en jeu
const F = Array.from({ length: 7 }, () => new Float64Array(steps)); // chance de finir le tour sur un raté (en jouant au mieux)
const V = (T: number, n: number) => (T >= CAP ? T : Math.max(T, C[n][T / STEP]));
const FV = (T: number, n: number) => (T >= CAP || T >= C[n][T / STEP] ? 0 : F[n][T / STEP]);
for (let t = steps - 1; t >= 0; t--) {
  const T = t * STEP;
  for (let n = 1; n <= 6; n++) {
    let e = 0, f = 0;
    for (const o of outcomes[n]) {
      if (!o.sels.length) { f += o.p; continue; }
      let best = -1, bf = 0;
      for (const s of o.sels) {
        const left = n - s.used === 0 ? 6 : n - s.used;
        const v = V(T + s.points, left);
        if (v > best) { best = v; bf = FV(T + s.points, left); }
      }
      e += o.p * best; f += o.p * bf;
    }
    C[n][t] = e; F[n][t] = f;
  }
}
console.log('4. Un tour joué au mieux (maximiser les points encaissés en moyenne)');
console.log(`  points encaissés en moyenne par tour : ${C[6][0].toFixed(0)}`);
console.log(`  chance de finir le tour sur un raté   : ${pct(F[6][0])}`);
console.log('  encaisser à partir de (points du tour déjà mis de côté, selon les dés qu’on relancerait) :');
for (let n = 1; n <= 6; n++) {
  let th = -1;
  for (let t = 1; t < steps; t++) if (t * STEP >= C[n][t]) { th = t * STEP; break; }
  // Vérifie que le seuil est net (on encaisse ensuite toujours).
  let clean = true;
  for (let t = th / STEP; t < Math.min(steps, th / STEP + 200); t++) if (t * STEP < C[n][t]) clean = false;
  console.log(`    ${n} dé${n > 1 ? 's' : ' '} : ${th < 0 ? 'relancer toujours (jusqu’à ' + CAP + ')' : th + ' points'}${clean ? '' : ' (seuil non net)'}`);
}
const show = (label: string, opts: [string, number, number][]) => {
  console.log(`  ${label}`);
  for (const [name, T, n] of opts) console.log(`    ${name} : ${T} en jeu, ${n} dé(s) à relancer → relancer vaut ${C[n][T / STEP].toFixed(0)} en moyenne, encaisser ${T}`);
};
show('Exemple A : premier lancer 1-5-2-2-3-6', [['garder le 1 seul', 100, 5], ['garder le 1 et le 5', 150, 4]]);
show('Exemple B : 300 points de côté, lancer de 3 dés 5-2-3', [['garder le 5', 350, 2]]);
show('Exemple C : 250 points de côté, lancer de 2 dés 1-5', [['garder les deux (main pleine)', 400, 6], ['garder le 1 seul', 350, 1]]);
show('Exemple D : premier lancer 2-2-2-5-3-4', [['garder les trois 2', 200, 3], ['garder les trois 2 et le 5', 250, 2]]);
show('Exemple E : premier lancer 3-3-3-5-2-6', [['garder les trois 3', 300, 3], ['garder les trois 3 et le 5', 350, 2]]);
