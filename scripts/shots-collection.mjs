/** Captures de la collection de dés. Usage : node scripts/shots-collection.mjs [url] [dossier] */
import puppeteer from 'puppeteer-core';
const [,, url = 'http://localhost:3001', out = 'captures'] = process.argv;
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errs = [];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const click = (p, text) => p.evaluate((t) => { const el = [...document.querySelectorAll('button')].find((x) => x.textContent.includes(t)); el?.click(); return !!el; }, text);
const p = await b.newPage(); await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
p.on('pageerror', (e) => errs.push(e.message));
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await p.goto(url, { waitUntil: 'networkidle2' });
const reg = await p.evaluate(async () => (await fetch('/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'Sam' + Math.floor(Math.random() * 1e5), password: 'motdepasse1', guestProfile: { bags: 6 } }) })).json());
await p.evaluate((r) => { localStorage.setItem('421.compte', JSON.stringify({ token: r.token, username: r.user.username })); localStorage.setItem('421.reglages', JSON.stringify({ name: r.user.username })); }, reg);
await p.goto(url, { waitUntil: 'networkidle2' }); await wait(1500);
await p.evaluate(() => document.querySelector('.coll-promo')?.scrollIntoView({ block: 'center' })); await wait(400);
await p.screenshot({ path: `${out}/c-home.png` });
await click(p, 'Collectionne'); await wait(1000);
await p.screenshot({ path: `${out}/c-collection.png` });
await click(p, 'Ouvrir un sac'); await wait(500);
await p.screenshot({ path: `${out}/c-bag-shake.png` });
await wait(1600);
await p.screenshot({ path: `${out}/c-bag-reveal.png` });
for (let i = 0; i < 4; i++) { await click(p, 'Ouvrir le suivant'); await wait(2100); }
await p.screenshot({ path: `${out}/c-bag-reveal2.png` });
await click(p, 'Jouer avec'); await wait(800);
await p.screenshot({ path: `${out}/c-collection2.png`, fullPage: true });
// Fiche d'un dé
await p.evaluate(() => document.querySelector('.coll-card:not(.missing)')?.click()); await wait(700);
await p.screenshot({ path: `${out}/c-sheet.png` });
await click(p, 'Mettre en vitrine'); await wait(600);
await click(p, 'Fermer'); await wait(300);
// Partie solo contre le patron (dés épiques) : lecture des dés dans le bac
await p.goto(url, { waitUntil: 'networkidle2' }); await wait(1200);
await click(p, 'Défier'); await wait(3000);
await p.screenshot({ path: `${out}/c-game1.png` });
// Lancer nous-mêmes, puis laisser jouer le patron
await p.evaluate(() => [...document.querySelectorAll('button')].find((x) => /Lancer/.test(x.textContent))?.click());
await wait(3500);
await p.screenshot({ path: `${out}/c-game2.png` });
for (let i = 0; i < 10; i++) { await wait(1500); await p.screenshot({ path: `${out}/c-game-t${i}.png` }); }
console.log('erreurs', errs);
await b.close();
