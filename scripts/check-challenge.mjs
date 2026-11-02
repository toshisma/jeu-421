/** Défi du jour : on peut garder des dés (barre du bas et clic sur le bac), ils ne bougent pas à la relance. */
import puppeteer from 'puppeteer-core';
const URL_ = process.argv[2] || 'http://localhost:3001';
const OUT = process.argv[3] || 'captures';
const w = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await (await b.createBrowserContext()).newPage();
await p.setViewport({ width: 1280, height: 860 });
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
await p.evaluateOnNewDocument(() => localStorage.setItem('421.settings', JSON.stringify({ name: 'Sam', avatar: '🦊', volume: 0, muted: true })));
await p.goto(URL_, { waitUntil: 'networkidle0' });
await p.evaluate(() => document.querySelector('.challenge-card').click()); await w(1200);
const click = (t) => p.evaluate((t) => { const x = [...document.querySelectorAll('button')].find((x) => x.textContent.includes(t) && !x.disabled); x?.click(); return !!x; }, t);
const dice = () => p.evaluate(() => [...document.querySelectorAll('.keep-die')].map((k) => k.getAttribute('aria-label')));
await w(1500); console.log('clic', await click('Lancer'));
for (let i = 0; i < 60 && !(await p.$('.keep-die')); i++) await w(500);
const before = await dice(); console.log('TEXT', (await p.evaluate(() => document.querySelector('.actionbar')?.innerText)));
// Garder le premier dé avec la barre du bas
await p.evaluate(() => document.querySelectorAll('.keep-die')[0].click()); await w(300);
const kept = await p.evaluate(() => document.querySelectorAll('.keep-die.on').length);
await p.screenshot({ path: `${OUT}/c1-garder.png` });
await click('Relancer');
await w(500); for (let i = 0; i < 60 && (await p.evaluate(() => document.querySelector('.throws span')?.textContent)).startsWith('2'); i++) await w(500);
const after = await dice();
console.log('avant', before, 'après', after);
const v = (s) => s.match(/Dé (\d)/)[1];
console.log(kept === 1 ? '✓ dé gardé' : '✗ dé non gardé');
console.log(v(before[0]) === v(after[0]) ? '✓ le dé gardé n’a pas bougé' : '✗ le dé gardé a changé');
// Clic directement sur le bac (au centre de l'écran du dé n°2 approximativement) : on vérifie juste que le bac est interactif
const interactive = await p.evaluate(() => getComputedStyle(document.querySelector('.tray-canvas')).cursor);
console.log('curseur du bac :', interactive);
console.log(errors.length ? `Erreurs : ${errors.join(' | ')}` : 'Aucune erreur de page');
await b.close();
