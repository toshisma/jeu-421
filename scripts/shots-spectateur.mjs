/**
 * Captures du mode spectateur à 390 px : deux joueurs en partie et un troisième navigateur qui regarde.
 * Usage : npm start   puis   node scripts/shots-spectateur.mjs [url] [dossier]
 */
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
const URL_ = process.argv[2] || 'http://localhost:3001';
const OUT = process.argv[3] || 'captures';
mkdirSync(OUT, { recursive: true });
const w = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];
// Un navigateur par personne (rendu 3D logiciel : on isole les processus).
const browsers = [];
async function page(name, avatar) {
  const b = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: true,
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  browsers.push(b);
  b.on('disconnected', () => errors.push(`${name}: navigateur fermé`));
  const p = await b.newPage();
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  p.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  await p.evaluateOnNewDocument((n, a) => localStorage.setItem('421.settings', JSON.stringify({ name: n, avatar: a, volume: 0, muted: true, music: 0 })), name, avatar);
  return p;
}
const click = (p, t) => p.evaluate((t) => { const x = [...document.querySelectorAll('button')].find((x) => x.textContent.includes(t) && !x.disabled); x?.click(); return !!x; }, t);
const overflow = (p) => p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);

const alice = await page('Alice', '🦊');
await alice.goto(URL_, { waitUntil: 'load' }); await w(1500);
await click(alice, 'Jouer en ligne'); await w(800);
await click(alice, 'Créer une table'); await w(600);
await click(alice, 'Tout le monde'); await click(alice, '2');
await click(alice, 'Créer la table'); await w(1500);
const code = await alice.$eval('.code', (e) => e.textContent.trim());

const bob = await page('Bob', '🐻');
await bob.goto(`${URL_}/?rejoindre=${code}`, { waitUntil: 'load' }); await w(1500);
await click(bob, 'Rejoindre'); await w(1200);
await click(bob, 'Je suis prêt'); await w(600);
await click(alice, 'Lancer la partie'); await w(3500);
// Premier lancer de celui dont c'est le tour.
if (!(await click(alice, 'Lancer les dés'))) await click(bob, 'Lancer les dés');
await w(500);

const zoe = await page('Zoé', '🐸');
await zoe.goto(URL_, { waitUntil: 'load' }); await w(1500);
await click(zoe, 'Jouer en ligne'); await w(2500);
await zoe.evaluate(() => document.querySelector('.live-games')?.scrollIntoView());
console.log("shot 1-parties-en-cours.png"); await zoe.screenshot({ path: `${OUT}/1-parties-en-cours.png` });
await click(zoe, 'Regarder'); await w(4500);
// Un lancer pendant que Zoé regarde : rejoué dans son bac.
if (!(await click(alice, 'Lancer les dés'))) if (!(await click(bob, 'Lancer les dés'))) { await click(alice, 'Valider mon tour') || await click(bob, 'Valider mon tour'); }
await w(4500);
console.log("shot 2-spectateur.png"); await zoe.screenshot({ path: `${OUT}/2-spectateur.png` });
console.log("shot 3-joueur-alice.png"); await alice.screenshot({ path: `${OUT}/3-joueur-alice.png` });
await bob.screenshot({ path: `${OUT}/4-joueur-bob.png` });
// Tchat du spectateur.
await zoe.evaluate(() => document.querySelector('.chat-fab')?.click()); await w(400);
await zoe.evaluate(() => { const i = document.querySelector('.chat-panel input'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, 'Allez Alice !'); i.dispatchEvent(new Event('input', { bubbles: true })); });
await click(zoe, 'Envoyer'); await w(800);
console.log("shot 5-spectateur-tchat.png"); await zoe.screenshot({ path: `${OUT}/5-spectateur-tchat.png` });
await alice.evaluate(() => document.querySelector('.chat-fab')?.click()); await w(500);
console.log("shot 6-joueur-tchat.png"); await alice.screenshot({ path: `${OUT}/6-joueur-tchat.png` });
await zoe.evaluate(() => document.querySelector('.chat-fab')?.click()); await w(300);
const zoeOver = await overflow(zoe);
// Quitter : retour à l'écran précédent (Jouer en ligne).
await click(zoe, 'Quitter'); await w(1500);
console.log("shot 7-apres-quitter.png"); await zoe.screenshot({ path: `${OUT}/7-apres-quitter.png` });
await alice.evaluate(() => document.querySelector('.chat-panel .icon-btn')?.click()); await w(1200);
console.log("shot 8-joueur-apres-depart.png"); await alice.screenshot({ path: `${OUT}/8-joueur-apres-depart.png` });
console.log(`Code ${code}, débordement horizontal spectateur : ${zoeOver}`);
console.log(errors.length ? `Erreurs : ${errors.join(' | ')}` : 'Aucune erreur de page');
for (const b of browsers) await b.close().catch(() => {});
