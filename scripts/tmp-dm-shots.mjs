// Captures temporaires du Dix mille (à supprimer). node scripts/tmp-dm-shots.mjs <largeur> <hauteur> <dossier> [cible]
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
const W = Number(process.argv[2] || 390), H = Number(process.argv[3] || 844);
const OUT = process.argv[4] || '/tmp/dm';
const TARGET = process.argv[5] || '2 000';
const URL_ = 'http://localhost:3031';
mkdirSync(OUT, { recursive: true });
const tag = `${W}x${H}`;
const w = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage();
await p.setViewport({ width: W, height: H, deviceScaleFactor: 1, isMobile: W < 800, hasTouch: W < 800 });
p.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
p.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
await p.evaluateOnNewDocument(() => {
  localStorage.setItem('421.settings', JSON.stringify({ name: 'Sam', avatar: '🦊', volume: 0, muted: true }));
});
const click = (t, sel = 'button') => p.evaluate((t, sel) => { const x = [...document.querySelectorAll(sel)].find((x) => x.textContent.includes(t) && !x.disabled); x?.click(); return !!x; }, t, sel);
const overflow = () => p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1 ? `${document.documentElement.scrollWidth}` : '');
await p.goto(URL_, { waitUntil: 'load' }); await w(2500);
const homeScroll = await p.evaluate(() => { const m = document.querySelector('.h2-main'); return m ? m.scrollHeight - m.clientHeight : -1; });
console.log('accueil : défilement interne', homeScroll, 'débordement', await overflow());
await p.screenshot({ path: `${OUT}/1-accueil-${tag}.png` });
console.log('onglet', await click('Dix mille', '.ms-tab'));
await w(1200);
await click(process.env.OPP || '1', '.k-pills button');
await click(TARGET, '.k-choices button');
await click('Débutant', '.k-choices button');
await w(300);
console.log('réglages débordement', await overflow());
await p.screenshot({ path: `${OUT}/2-reglages-${tag}.png` });
await click("S'asseoir");
await w(3500);
await p.screenshot({ path: `${OUT}/3-debut-${tag}.png` });
let shotSel = false, shotRate = false, shotPleine = false, actions = 0;
const t0 = Date.now();
while (Date.now() - t0 < Number(process.env.DUR || 240000)) {
  if (await p.$('.dm-end')) break;
  if (process.env.DBG) { const d = await p.evaluate(() => { const g = document.querySelector('.dm-game'); return g ? JSON.stringify(g.dataset) + ' ' + (document.querySelector('.dm-bottom')?.innerText || '').replace(/\n/g, ' / ') : 'none'; });
  if (d !== globalThis.lastD) { console.log(Math.round((Date.now() - t0) / 100) / 10, d); globalThis.lastD = d; } }
  if (!shotRate && await p.$('.dm-flash.rate')) { await w(150); await p.screenshot({ path: `${OUT}/5-rate-${tag}.png` }); shotRate = true; console.log('raté capturé'); }
  if (!shotPleine && await p.$('.dm-flash.pleine')) { await w(350); await p.screenshot({ path: `${OUT}/6-pleine-${tag}.png` }); shotPleine = true; console.log('main pleine capturée'); }
  if (await click('Lancer les 6 dés')) { actions++; await w(300); continue; }
  if (await p.$('.dm-pickall')) {
    await p.evaluate(() => document.querySelector('.dm-pickall')?.click()); await w(400);
    const tot = await p.evaluate(() => Number((document.querySelector('.dm-total b')?.textContent || '0').replace(/\D/g, '')));
    const n = await p.evaluate(() => Number((document.querySelector('.dm-roll')?.textContent.match(/\((\d)/) || [0, 6])[1]));
    if (!shotSel && tot > 0) { await p.screenshot({ path: `${OUT}/4-selection-${tag}.png` }); shotSel = true; }
    if (tot >= 350 || (n <= 2 && tot >= 200)) await click('Encaisser'); else await click('Relancer');
    actions++;
    await w(300);
    continue;
  }
  await w(150);
}
await w(2600);
await p.screenshot({ path: `${OUT}/7-fin-${tag}.png` });
const endText = await p.evaluate(() => document.querySelector('.dm-end')?.innerText ?? 'PAS DE FIN');
console.log('fin :', endText.replace(/\n/g, ' | '));
console.log('actions', actions, 'durée', Math.round((Date.now() - t0) / 1000), 's', 'débordement', await overflow());
console.log('erreurs', errors);
await b.close();
