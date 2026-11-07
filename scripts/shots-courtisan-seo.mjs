/**
 * Images des pages d'aide « Le Courtisan » (le Dix mille) :
 *  - img/partie-courtisan.webp : une partie contre l'ordinateur sur téléphone (390 × 844), après le premier
 *    lancer, avec « tout ce qui rapporte » sélectionné ;
 *  - og-courtisan.jpg : l'image de partage 1200 × 630 (titre + la capture de la partie).
 *   npx vite --port 5181   (dans un autre terminal)   puis   node scripts/shots-courtisan-seo.mjs [url]
 * Le mode s'ouvre par /?mode=courtisan quand ce lien est branché dans le jeu ; sinon par l'onglet du
 * sélecteur de mode de l'accueil. Conversion avec ImageMagick (`convert`).
 * À relancer après un changement visible de l'écran de partie (et après le renommage de l'onglet).
 */
import puppeteer from 'puppeteer-core';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const URL_ = process.argv[2] || 'http://localhost:5181';
const PUB = join(process.cwd(), 'client', 'public');
const TMP = join(process.cwd(), '.shots-tmp-courtisan');
mkdirSync(TMP, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const b = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const g = await b.newPage();
await g.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
await g.evaluateOnNewDocument(() => {
  try {
    localStorage.setItem('421.settings', JSON.stringify({ name: 'Sam', music: 0, muted: true }));
    localStorage.setItem('421.dixmille', JSON.stringify({ opponents: 2, level: 'habitue', target: 4000 }));
  } catch { /* */ }
});
const click = (t, exact = false) => g.evaluate((t, exact) => { const x = [...document.querySelectorAll('button')].filter((e) => (exact ? e.textContent.trim() === t : e.textContent.includes(t)) && !e.disabled).pop(); x?.click(); return !!x; }, t, exact);
const has = (t) => g.evaluate((t) => [...document.querySelectorAll('button')].some((e) => e.textContent.includes(t) && !e.disabled), t);

await g.goto(`${URL_}/?mode=courtisan`, { waitUntil: 'load' });
await wait(5000);
if (!(await has('S’asseoir')) && !(await has("S'asseoir"))) {
  // Lien pas encore branché : onglet du sélecteur de mode.
  const ok = await g.evaluate(() => { const x = document.querySelector('.ms-tab.dixmille'); x?.click(); return !!x; });
  if (!ok) throw new Error('Onglet du mode introuvable');
  await wait(2500);
}
await click('asseoir'); await wait(5000);
// On attend notre tour (les ordinateurs peuvent commencer), puis on lance jusqu'à un lancer qui rapporte.
for (let k = 0; k < 30; k++) {
  if (await has('Tout ce qui rapporte')) break;
  if (await has('Lancer les 6 dés')) { await click('Lancer les 6 dés'); await wait(4500); } else await wait(1500);
}
await click('Tout ce qui rapporte'); await wait(1200);
const gPng = join(TMP, 'partie.png');
await g.screenshot({ path: gPng });
execFileSync('convert', [gPng, '-quality', '74', '-define', 'webp:method=6', join(PUB, 'img', 'partie-courtisan.webp')]);
console.log('✓ img/partie-courtisan.webp');

// Image de partage 1200 × 630 : titre à gauche, la capture dans un cadre de téléphone à droite.
const font = readFileSync(join(process.cwd(), 'node_modules/@fontsource/alfa-slab-one/files/alfa-slab-one-latin-400-normal.woff2')).toString('base64');
const shot = `data:image/png;base64,${readFileSync(gPng).toString('base64')}`;
const die = (n) => {
  const pos = { 1: [[50, 50]], 2: [[28, 28], [72, 72]], 3: [[25, 25], [50, 50], [75, 75]], 4: [[28, 28], [72, 28], [28, 72], [72, 72]], 5: [[25, 25], [75, 25], [50, 50], [25, 75], [75, 75]], 6: [[28, 22], [72, 22], [28, 50], [72, 50], [28, 78], [72, 78]] }[n];
  return `<span class="die">${pos.map(([x, y]) => `<i style="left:${x}%;top:${y}%;${n === 1 ? 'background:#b3261e;width:16px;height:16px' : ''}"></i>`).join('')}</span>`;
};
const og = await b.newPage();
await og.setViewport({ width: 1200, height: 630, deviceScaleFactor: 1 });
await og.setContent(`<!doctype html><html><head><style>
@font-face { font-family: Slab; src: url(data:font/woff2;base64,${font}) format('woff2'); }
html,body { margin:0; width:1200px; height:630px; overflow:hidden; }
body { background: radial-gradient(90% 100% at 30% 30%, #2b5a44 0%, #1a3a2c 45%, #0d1c15 100%); font-family: system-ui, sans-serif; color:#fbf6e9; position:relative; }
.t { position:absolute; left:64px; top:96px; width:640px; }
.k { font: 700 22px/1 system-ui, sans-serif; letter-spacing:.14em; text-transform:uppercase; color:#f6d36b; }
h1 { font: 400 96px/0.98 Slab, serif; margin: 18px 0 22px; text-shadow: 0 4px 0 #0d1c15; }
p { font: 600 30px/1.3 system-ui, sans-serif; margin:0; color:#dfeee6; }
.dice { display:flex; gap:14px; margin-top:34px; }
.die { position:relative; width:56px; height:56px; border-radius:12px; background:#f4ead5; box-shadow: inset 0 -4px 0 rgba(0,0,0,.18), 0 8px 16px rgba(0,0,0,.35); }
.die i { position:absolute; width:12px; height:12px; border-radius:50%; background:#1b1b1b; transform:translate(-50%,-50%); }
.u { position:absolute; left:64px; bottom:52px; font: 800 26px/1 system-ui, sans-serif; }
.u b { display:inline-block; padding:4px 12px; margin-right:10px; border-radius:8px; background:#1d3c8f; box-shadow: inset 0 0 0 2px #1d3c8f, inset 0 0 0 4px #fbf6e9; }
.phone { position:absolute; right:70px; top:40px; width:290px; height:627px; border-radius:36px; overflow:hidden; border:8px solid #0b0f11; box-shadow: 0 30px 60px rgba(0,0,0,.55); transform: rotate(3deg); }
.phone img { width:100%; display:block; }
</style></head><body>
<div class="t"><div class="k">Le Dix mille · Farkle</div><h1>Le Courtisan</h1><p>Le jeu de dés à six dés,<br>gratuit dans le navigateur</p>
<div class="dice">${[1, 5, 5, 3, 3, 3].map(die).join('')}</div></div>
<div class="u"><b>421</b>421online.com</div>
<div class="phone"><img src="${shot}"></div>
</body></html>`, { waitUntil: 'load' });
await og.evaluate(() => document.fonts.ready);
const ogPng = join(TMP, 'og.png');
await og.screenshot({ path: ogPng });
execFileSync('convert', [ogPng, '-quality', '84', '-sampling-factor', '4:2:0', '-strip', join(PUB, 'og-courtisan.jpg')]);
console.log('✓ og-courtisan.jpg');

await b.close();
rmSync(TMP, { recursive: true, force: true });
