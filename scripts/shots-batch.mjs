/**
 * Captures et vérifications : accueil (série, pass, défi, événement), pass de saison, partie guidée,
 * gobelet, défi du jour, ligue, boutique (accessoires).
 * Usage : npm start   puis   node scripts/shots-batch.mjs [url] [dossier]
 */
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
const URL_ = process.argv[2] || 'http://localhost:3001';
const OUT = process.argv[3] || 'captures';
mkdirSync(OUT, { recursive: true });
const w = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];
const ok = (c, l) => { console.log(`${c ? '✓' : '✗'} ${l}`); if (!c) errors.push(l); };
const b = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await b.createBrowserContext();
const p = await ctx.newPage();
await p.setViewport({ width: 1280, height: 860 });
p.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
await p.evaluateOnNewDocument(() => { if (!localStorage.getItem('421.settings')) localStorage.setItem('421.settings', JSON.stringify({ name: 'Sam', avatar: '🦊', volume: 0, muted: true })); });
const click = (t, sel = 'button') => p.evaluate((t, sel) => { const x = [...document.querySelectorAll(sel)].find((x) => x.textContent.includes(t) && !x.disabled); x?.click(); return !!x; }, t, sel);
const text = () => p.evaluate(() => document.body.innerText);
async function until(fn, ms = 20000) { const t = Date.now(); while (Date.now() - t < ms) { if (await p.evaluate(fn)) return true; await w(200); } return false; }
const home = async () => { await p.goto(URL_, { waitUntil: 'networkidle0' }); await w(400); };

// Compte (pour la ligue et le défi classé)
await home();
await click('Créer un compte'); await w(300);
const uniq = Date.now().toString(36).slice(-4);
await p.type('input[placeholder="3 à 20 caractères"]', `Sam${uniq}`);
await p.type('input[placeholder="8 caractères minimum"]', 'motdepasse1');
await click('Créer mon compte');
await until(() => document.body.innerText.includes('code de récupération'));
await click("C'est noté"); await w(300);
await home();
ok((await text()).includes('Apprendre à jouer'), 'carte « partie guidée » pour un nouveau joueur');
ok((await text()).includes('Récompense du jour'), 'série de connexions');
ok((await text()).includes('Pass de'), 'pass de saison');
ok((await text()).includes('Défi du jour'), 'défi du jour');
await p.screenshot({ path: `${OUT}/b1-accueil.png`, fullPage: true });
await click('Récupérer la récompense du jour'); await w(600);
ok(!(await text()).includes('Récupérer la récompense du jour'), 'récompense du jour récupérée');

// Partie guidée
await click('Apprendre à jouer');
ok(await until(() => !!document.querySelector('.coach')), 'le guide parle');
await w(1500);
await p.screenshot({ path: `${OUT}/b2-guide.png` });
await click('Lancer les dés');
await w(350);
await p.screenshot({ path: `${OUT}/b3-gobelet.png` });
const t0 = Date.now();
let turns = 0;
while (Date.now() - t0 < 120000 && !(await p.$('.end-overlay'))) {
  const coach = await p.evaluate(() => document.querySelector('.coach p')?.textContent ?? '');
  if (coach.includes('Touchez-le pour le garder')) { await p.evaluate(() => [...document.querySelectorAll('.keep-die')].find((x) => x.textContent.includes('4'))?.click()); }
  if (coach.includes('Gardez le 4 et le 2')) {
    await p.evaluate(() => { const ks = [...document.querySelectorAll('.keep-die')]; for (const v of ['4', '2']) { const k = ks.find((x) => x.textContent.trim().startsWith(v) && !x.classList.contains('on')); k?.click(); } });
  }
  if (await click('Relancer') || await click('Lancer les dés')) turns++;
  else await click('Valider mon tour');
  await w(1200);
}
ok(!!(await p.$('.end-overlay')), 'partie guidée terminée');
await w(1500);
await p.screenshot({ path: `${OUT}/b4-guide-fin.png` });
const coins = await p.evaluate(async () => { const s = JSON.parse(localStorage.getItem('421.compte')); return (await (await fetch('/api/me', { headers: { Authorization: `Bearer ${s.token}` } })).json()).profile; });
ok(coins.tutorial === 1, 'partie guidée enregistrée sur le compte');
await click('Terminer'); await w(500);

// Pass de saison
await home();
await p.evaluate(() => document.querySelector('.pass-summary').click()); await w(500);
await p.screenshot({ path: `${OUT}/b5-pass.png`, fullPage: true });

// Défi du jour
await home();
await p.evaluate(() => document.querySelector('.challenge-card').click()); await w(1200);
for (let turn = 0; turn < 5; turn++) {
  await click('Lancer'); await w(5000);
  if (turn === 0) await p.screenshot({ path: `${OUT}/b6-defi.png` });
  await click('Garder ce coup'); await w(800);
}
ok(await until(() => document.body.innerText.includes('points') && !!document.querySelector('.end-overlay')), 'défi terminé et classé');
await w(800);
await p.screenshot({ path: `${OUT}/b7-defi-fin.png` });

// Ligue
await home();
await click('Classement'); await w(1200);
ok((await text()).includes('Ligue Bronze'), 'ligue affichée');
await p.screenshot({ path: `${OUT}/b8-ligue.png`, fullPage: true });

// Boutique : accessoires et objets d'événement
await home();
await click('Boutique'); await w(1500);
await click('Accessoires', '.tabs button'); await w(500);
await p.screenshot({ path: `${OUT}/b9-accessoires.png` });

// Mobile
const m = await ctx.newPage();
await m.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await m.goto(URL_, { waitUntil: 'networkidle0' }); await w(600);
await m.screenshot({ path: `${OUT}/b10-mobile.png`, fullPage: true });

console.log(errors.length ? `Problèmes : ${errors.join(' | ')}` : 'Tout est bon.');
await b.close();
process.exit(errors.length ? 1 : 0);
