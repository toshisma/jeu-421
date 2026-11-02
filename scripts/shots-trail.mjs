/** Capture d'une traînée de lancer (invité avec un effet équipé). */
import puppeteer from 'puppeteer-core';
const [,, url = 'http://localhost:3001', out = 'captures', fx = 'fx-flammes'] = process.argv;
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const p = await b.newPage(); await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
// Ralenti ×8 pour photographier le lancer (performance.now et requestAnimationFrame).
await p.evaluateOnNewDocument(() => { const real = performance.now.bind(performance); const t0 = real(); performance.now = () => t0 + (real() - t0) / 8; const raf = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = (cb) => raf(() => cb(performance.now())); });
await p.goto(url, { waitUntil: 'networkidle2' });
await p.evaluate((fx) => { localStorage.setItem('421.profil', JSON.stringify({ version: 1, xp: 0, coins: 0, owned: [fx, 'dc-dragon'], equipped: { dice: 'dc-dragon' }, fx: { trainee: fx, fete: 'fx-feu-artifice' }, stats: {}, achievements: {} })); }, fx);
await p.goto(url, { waitUntil: 'networkidle2' }); await wait(800);
await p.evaluate(() => [...document.querySelectorAll('button')].find((x) => x.textContent.includes("Bac d'essai"))?.click()); await wait(1500);
await p.evaluate(() => document.querySelector('.btn.primary.big')?.click());
for (let i = 0; i < 8; i++) { await wait(700); await p.screenshot({ path: `${out}/t-${i}.png` }); }
console.log('erreurs', errs);
await b.close();
