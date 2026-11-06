/**
 * Images des pages d'aide « Coups Fourrés » (client/public/img/cartes/*.webp et og-coups-fourres.jpg),
 * rendues avec les vrais composants du jeu (planche de relecture ?cf-gallery=1, servie seulement par
 * le serveur de développement) :
 *   npx vite --port 5180      (dans un autre terminal)   puis   node scripts/shots-cf-seo.mjs [url]
 * *  - une image par carte, fond transparent, 345 × 483 (1,5 × la taille de référence 230 × 322) ;
 *  - l'image de partage (Open Graph) 1200 × 630, en JPEG ;
 *  - une partie contre l'ordinateur sur téléphone (390 × 844), ouverte par le lien /?mode=cartes.
 * Conversion avec ImageMagick (`convert`). À relancer si une carte ou son illustration change.
 */
import puppeteer from 'puppeteer-core';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const URL_ = process.argv[2] || 'http://localhost:5180';
const PUB = join(process.cwd(), 'client', 'public');
const OUT = join(PUB, 'img', 'cartes');
mkdirSync(OUT, { recursive: true });
const TMP = join(process.cwd(), '.shots-tmp');
mkdirSync(TMP, { recursive: true });

const b = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const p = await b.newPage();
await p.setViewport({ width: 1400, height: 900, deviceScaleFactor: 1.5 });
await p.goto(`${URL_}/?cf-gallery=1&vue=cartes`, { waitUntil: 'networkidle0' });
await p.addStyleTag({ content: 'html,body,#root,.cf-gallery{background:transparent!important} .cf-card,.cf-card *{animation:none!important;transition:none!important}' });
await p.evaluate(() => document.fonts.ready);
await new Promise((r) => setTimeout(r, 500));

const boxes = await p.$$('#cf-g-cartes .cf-card-box');
const ids = await p.evaluate(() => [...document.querySelectorAll('#cf-g-cartes .cf-card-box article')].map((a) => a.getAttribute('aria-label')));
const { CARDS } = await import('../shared/cards/catalog.ts').catch(() => ({ CARDS: null }));
if (!CARDS) throw new Error('Lancez avec : node --import tsx scripts/shots-cf-seo.mjs');
if (boxes.length !== CARDS.length) throw new Error(`${boxes.length} cartes affichées, ${CARDS.length} attendues`);
for (let i = 0; i < boxes.length; i++) {
  const id = CARDS[i].id;
  if (!ids[i]?.startsWith(CARDS[i].name)) throw new Error(`Ordre inattendu : ${ids[i]} ≠ ${CARDS[i].name}`);
  const png = join(TMP, `${id}.png`);
  await boxes[i].screenshot({ path: png, omitBackground: true });
  execFileSync('convert', [png, '-quality', '80', '-define', 'webp:method=6', '-define', 'webp:alpha-quality=90', join(OUT, `${id}.webp`)]);
}
console.log(`✓ ${boxes.length} cartes dans img/cartes/`);

// Image de partage 1200 × 630 : titre, sous-titre et 4 cartes (une par famille) en éventail.
const font = readFileSync(join(process.cwd(), 'node_modules/@fontsource/alfa-slab-one/files/alfa-slab-one-latin-400-normal.woff2')).toString('base64');
const pick = ['patron', 'tournee-generale', 'retournement-veste', 'grand-enchainement'];
const img = (id) => `data:image/png;base64,${readFileSync(join(TMP, `${id}.png`)).toString('base64')}`;
const og = await b.newPage();
await og.setViewport({ width: 1200, height: 630, deviceScaleFactor: 1 });
await og.setContent(`<!doctype html><html><head><style>
@font-face { font-family: Slab; src: url(data:font/woff2;base64,${font}) format('woff2'); }
html,body { margin:0; width:1200px; height:630px; overflow:hidden; }
body { background: radial-gradient(90% 90% at 75% 40%, #5a3b85 0%, #2a1a46 45%, #120a20 100%); font-family: system-ui, sans-serif; color:#fbf6e9; position:relative; }
.t { position:absolute; left:64px; top:150px; width:520px; }
.k { font: 700 22px/1 system-ui, sans-serif; letter-spacing:.14em; text-transform:uppercase; color:#e3c060; }
h1 { font: 400 92px/0.98 Slab, serif; margin: 18px 0 22px; text-shadow: 0 4px 0 #120a20; }
p { font: 600 30px/1.3 system-ui, sans-serif; margin:0; color:#e8dcff; }
.u { position:absolute; left:64px; bottom:56px; font: 800 26px/1 system-ui, sans-serif; color:#fbf6e9; }
.u b { display:inline-block; padding:4px 12px; margin-right:10px; border-radius:8px; background:#1d3c8f; box-shadow: inset 0 0 0 2px #1d3c8f, inset 0 0 0 4px #fbf6e9; }
.c { position:absolute; width:250px; filter: drop-shadow(0 18px 24px rgba(0,0,0,.55)); }
</style></head><body>
<div class="t"><div class="k">Le 421 aux cartes</div><h1>Coups Fourrés</h1><p>Jeu de cartes et de dés, gratuit dans le navigateur</p></div>
<div class="u"><b>421</b>421online.com</div>
${pick.map((id, i) => `<img class="c" src="${img(id)}" style="left:${600 + i * 130}px;top:${110 + [40, 0, 0, 40][i]}px;transform:rotate(${[-12, -4, 4, 12][i]}deg)">`).join('')}
</body></html>`, { waitUntil: 'load' });
await og.evaluate(() => document.fonts.ready);
const ogPng = join(TMP, 'og.png');
await og.screenshot({ path: ogPng });
execFileSync('convert', [ogPng, '-quality', '84', '-sampling-factor', '4:2:0', '-strip', join(PUB, 'og-coups-fourres.jpg')]);
console.log('✓ og-coups-fourres.jpg');

// Partie contre l'ordinateur (Dédé du comptoir), sur téléphone, au deuxième lancer.
const g = await b.newPage();
await g.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
await g.evaluateOnNewDocument(() => { try { localStorage.setItem('421.settings', JSON.stringify({ name: 'Sam', music: 0, muted: true })); } catch { /* */ } });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const click = (t, exact = false) => g.evaluate((t, exact) => { const x = [...document.querySelectorAll('button')].filter((e) => (exact ? e.textContent.trim() === t : e.textContent.includes(t)) && !e.disabled).pop(); x?.click(); return !!x; }, t, exact);
await g.goto(`${URL_}/?mode=cartes`, { waitUntil: 'load' });
await wait(5000);
await click('Contre l’ordinateur'); await wait(1200);
await click('Habitué'); await wait(600);
await click('Jouer', true); await wait(1200);
await click('Jouer directement'); await wait(6000);
await click('Garder ma main'); await wait(5000);
// On lance quand c'est à nous, jusqu'à pouvoir garder des dés (boutons « Relancer » et « M'arrêter »).
const canStop = () => g.evaluate(() => [...document.querySelectorAll('button')].some((e) => e.textContent.includes('M’arrêter')));
for (let k = 0; k < 8 && !(await canStop()); k++) { await click('Lancer les dés'); await wait(4000); }
await wait(1000);
const gPng = join(TMP, 'partie.png');
await g.screenshot({ path: gPng });
execFileSync('convert', [gPng, '-quality', '74', '-define', 'webp:method=6', join(PUB, 'img', 'partie-coups-fourres.webp')]);
console.log('✓ img/partie-coups-fourres.webp');

await b.close();
rmSync(TMP, { recursive: true, force: true });
