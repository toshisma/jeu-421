/**
 * Audit mobile : ouvre chaque écran à 360 px de large et signale tout ce qui dépasse de l'écran
 * (et ne se trouve pas dans une zone qui défile à l'horizontale), ainsi que les zones bloquées.
 * Usage : node scripts/audit-mobile.mjs [url] [dossier]
 */
import puppeteer from 'puppeteer-core';
const [,, url = 'http://localhost:3001', out = 'captures'] = process.argv;
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const p = await b.newPage();
await p.setViewport({ width: 360, height: 740, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
await p.goto(url, { waitUntil: 'networkidle2' });
const reg = await p.evaluate(async () => (await fetch('/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'Audit' + Math.floor(Math.random() * 1e5), password: 'motdepasse1', guestProfile: { bags: 3, coins: 500 } }) })).json());
await p.evaluate((r) => { localStorage.setItem('421.compte', JSON.stringify({ token: r.token, username: r.user.username })); }, reg);
const home = async () => { await p.goto(url, { waitUntil: 'networkidle2' }); await wait(900); };
const click = (t) => p.evaluate((t) => { const el = [...document.querySelectorAll('button, a')].find((x) => x.textContent.trim().includes(t)); el?.click(); return !!el; }, t);
const audit = (name) => p.evaluate((name) => {
  const W = window.innerWidth;
  const bad = [];
  const scrollsX = (el) => { for (let e = el.parentElement; e; e = e.parentElement) { const s = getComputedStyle(e); if ((s.overflowX === 'auto' || s.overflowX === 'scroll') && e.scrollWidth > e.clientWidth + 1) return true; if (s.textOverflow === 'ellipsis') return true; } return false; };
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height || getComputedStyle(el).visibility === 'hidden') continue;
    if ((r.right > W + 1 || r.left < -1) && !scrollsX(el) && !el.closest('.die-cube, .burst, canvas, .tray-host, .confetti, .fly-token')) {
      bad.push(`${el.tagName.toLowerCase()}.${String(el.className).split(' ').slice(0, 2).join('.')} [${Math.round(r.left)}→${Math.round(r.right)}] « ${(el.textContent || '').trim().slice(0, 30)} »`);
    }
  }
  // On ne garde que les éléments les plus extérieurs.
  return { name, docW: document.documentElement.scrollWidth, W, bad: bad.slice(0, 6), count: bad.length };
}, name);
const report = [];
const shot = async (name) => { await wait(500); report.push(await audit(name)); await p.screenshot({ path: `${out}/m-${name}.png` }); };

const screens = [
  ['accueil', async () => {}],
  ['boutique', async () => { await click('Boutique'); }],
  ['boutique-des', async () => { await click('Boutique'); await wait(800); await click('Dés'); }],
  ['boutique-acc', async () => { await click('Boutique'); await wait(800); await click('Accessoires'); }],
  ['collection', async () => { await click('Collection'); }],
  ['album', async () => { await click('Album'); }],
  ['classement', async () => { await click('Classement'); }],
  ['club', async () => { await click('Club'); }],
  ['recap', async () => { await click('Récap'); }],
  ['regles', async () => { await click('Règles'); }],
  ['reglages', async () => { await click('Réglages'); }],
  ['bac', async () => { await click("Bac d'essai"); }],
  ['stats', async () => { await click('Statistiques'); }],
  ['solo', async () => { await click("Jouer contre l'ordinateur"); }],
  ['en-ligne', async () => { await click('Jouer en ligne'); }],
  ['tournois', async () => { await click('Tournois'); }],
  ['soiree', async () => { await click('Soirée entre amis'); }],
  ['pass', async () => { await p.evaluate(() => document.querySelector('.pass-summary, .pass-card')?.click()); }],
  ['defi', async () => { await click('Jouer le défi'); }],
  ['compte', async () => { await p.evaluate(() => [...document.querySelectorAll('button')].find((x) => /Connecté en tant que/.test(x.textContent))?.click()); }],
  ['profil', async () => { await p.evaluate(() => document.querySelector('.me-btn')?.click()); }],
  ['confidentialite', async () => { await click('Confidentialité'); }],
  ['partie', async () => { await click("Jouer contre l'ordinateur"); await wait(700); await p.evaluate(() => document.querySelector('.btn.primary.big')?.click()); await wait(2500); }],
];
for (const [name, go] of screens) { await home(); await go(); await wait(900); await shot(name); }
for (const r of report) console.log(`${r.count ? '✗' : '✓'} ${r.name.padEnd(16)} page ${r.docW}/${r.W}  ${r.bad.join(' | ')}`);
console.log('erreurs', errs);
await b.close();
