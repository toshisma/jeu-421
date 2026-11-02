/**
 * Parcours : page de confidentialité, partie rapide, ordinateurs à la table, partie jusqu'au bout.
 * Usage : npm start   puis   node scripts/shots-extras.mjs [url] [dossier]
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
await p.setViewport({ width: 1280, height: 820 });
p.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
await p.evaluateOnNewDocument(() => localStorage.setItem('421.settings', JSON.stringify({ name: 'Sam', avatar: '🦊', volume: 0, muted: true })));
const click = (t) => p.evaluate((t) => { const x = [...document.querySelectorAll('button')].find((x) => x.textContent.includes(t) && !x.disabled); x?.click(); return !!x; }, t);
const text = () => p.evaluate(() => document.body.innerText);
async function until(fn, ms = 20000) { const t = Date.now(); while (Date.now() - t < ms) { if (await p.evaluate(fn)) return true; await w(250); } return false; }

await p.goto(`${URL_}/confidentialite`, { waitUntil: 'networkidle0' });
ok((await text()).includes('Autorité de protection des données'), 'page de confidentialité accessible par son adresse');
await p.screenshot({ path: `${OUT}/x1-confidentialite.png`, fullPage: true });
await p.evaluate(() => document.querySelector('.panel-head .icon-btn').click()); await w(500);
ok((await text()).includes('Confidentialité et mentions légales'), 'lien en bas de l’accueil');
const fonts = await p.evaluate(() => performance.getEntriesByType('resource').map((r) => r.name).filter((n) => /\.woff2?($|\?)/.test(n)));
ok(fonts.length > 0 && fonts.every((f) => f.startsWith(URL_)), `polices servies par le jeu (${fonts.length})`);

await click('Jouer en ligne'); await w(800);
await p.screenshot({ path: `${OUT}/x2-en-ligne.png`, fullPage: true });
await click('Partie rapide');
ok(await until(() => !!document.querySelector('.code')), 'partie rapide : table publique ouverte');
await click('Ajouter un ordinateur'); await w(300);
await p.evaluate(() => [...document.querySelectorAll('.bot-add .seg button')].find((x) => x.textContent === 'Difficile').click());
await click('Ajouter un ordinateur'); await w(500);
ok((await p.$$eval('.tag.bot', (x) => x.length)) === 2, 'deux ordinateurs à la table');
await p.screenshot({ path: `${OUT}/x3-salon-ordinateurs.png`, fullPage: true });
// Partie courte : aux points, une manche.
await p.select('.config select', 'manches'); await w(300);
await p.evaluate(() => { const i = document.querySelectorAll('.config input[type=number]')[0]; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, '2'); i.dispatchEvent(new Event('input', { bubbles: true })); });
await w(400);
await click('Lancer la partie');
ok(await until(() => document.body.innerText.includes('Historique')), 'la partie commence avec les ordinateurs');
await w(2500);
await p.screenshot({ path: `${OUT}/x4-partie-ordinateurs.png` });
const t0 = Date.now();
while (Date.now() - t0 < 240000 && !(await p.$('.end-overlay'))) {
  if (!(await click('Lancer les dés'))) await click('Valider mon tour');
  await w(600);
}
ok(!!(await p.$('.end-overlay')), 'partie terminée contre les ordinateurs');
await w(1500);
await p.screenshot({ path: `${OUT}/x5-fin.png` });
console.log(errors.length ? `Problèmes : ${errors.join(' | ')}` : 'Tout est bon.');
await b.close();
process.exit(errors.length ? 1 : 0);
