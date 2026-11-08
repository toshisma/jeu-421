// Captures temporaires (planche de l'écran de partie) : node scripts/tmp-cfui-stage.mjs <url vite> <dossier>
import puppeteer from 'puppeteer-core';
const URL_ = process.argv[2] || 'http://localhost:5181';
const OUT = process.argv[3];
const only = process.argv[4] || '';
const w = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [];
async function page(wd, h, mobile) {
  const ctx = await b.createBrowserContext();
  const p = await ctx.newPage();
  await p.setViewport({ width: wd, height: h, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await p.evaluateOnNewDocument(() => { localStorage.setItem('421.settings', JSON.stringify({ name: 'Sam', avatar: '🦊', volume: 0, muted: true })); localStorage.setItem('421.cf.parcours', '9'); });
  return p;
}
const overflow = (p) => p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const sizes = [['360', 360, 640, true], ['390', 390, 844, true], ['1280', 1280, 800, false]];
for (const [lab, wd, h, mob] of sizes) {
  if (only && !only.split(',').includes(lab)) continue;
  // 1. Main de 12 cartes
  let p = await page(wd, h, mob);
  await p.goto(`${URL_}/?cf-gallery=1&vue=plateau&scene=main&adv=3`, { waitUntil: 'load', timeout: 60000 });
  await p.waitForSelector('.cfn-board', { timeout: 30000 }); await w(2500);
  await p.screenshot({ path: `${OUT}/${lab}-main-12.png` });
  console.log(lab, 'débordement', await overflow(p), 'flèches', await p.evaluate(() => [...document.querySelectorAll('.cfn-hand-arrow')].map((x) => x.textContent)));
  // flèche droite
  await p.evaluate(() => document.querySelector('.cfn-hand-arrow.r')?.click());
  await w(900);
  await p.screenshot({ path: `${OUT}/${lab}-main-12-fleche.png` });
  console.log(lab, 'après flèche', await p.evaluate(() => [...document.querySelectorAll('.cfn-hand-arrow')].map((x) => x.textContent)));
  // glisser / molette : tout au bout
  await p.evaluate(() => { const h = document.querySelector('.cfn-hand'); h.scrollLeft = h.scrollWidth; });
  await w(600);
  await p.screenshot({ path: `${OUT}/${lab}-main-12-fin.png` });
  // toucher long sur une carte -> en grand
  const box = await p.evaluate(() => { const r = [...document.querySelectorAll('.cfn-hand .cfn-hc')].map((e) => e.getBoundingClientRect()).find((r) => r.x > 50 && r.right < window.innerWidth - 50); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  await p.mouse.move(box.x, box.y); await p.mouse.down(); await w(700); await p.mouse.up();
  await w(400);
  await p.screenshot({ path: `${OUT}/${lab}-zoom-main.png` });
  console.log(lab, 'zoom ouvert', await p.evaluate(() => !!document.querySelector('.cf-bigzoom')), 'fiche ouverte', await p.evaluate(() => !!document.querySelector('.cfn-fiche')));
  await p.close();
  // 2. Calcul mental
  p = await page(wd, h, mob);
  await p.goto(`${URL_}/?cf-gallery=1&vue=plateau&scene=calcul&adv=1`, { waitUntil: 'load', timeout: 60000 });
  await p.waitForSelector('.cfn-board', { timeout: 30000 }); await w(2500);
  await p.screenshot({ path: `${OUT}/${lab}-calcul.png` });
  console.log(lab, 'calcul débordement', await overflow(p));
  await p.evaluate(() => document.querySelector('.cf-pick-card')?.click());
  await w(500);
  await p.screenshot({ path: `${OUT}/${lab}-calcul-zoom.png` });
  await p.close();
  // 3. Début de manche + carte adverse + cartes devant les adversaires
  for (const adv of [3, 1]) {
    p = await page(wd, h, mob);
    await p.goto(`${URL_}/?cf-gallery=1&vue=plateau&scene=adverse&adv=${adv}`, { waitUntil: 'load', timeout: 60000 });
    await w(1200);
    await p.screenshot({ path: `${OUT}/${lab}-a${adv}-1-manche.png` });
    await w(2600);
    await p.screenshot({ path: `${OUT}/${lab}-a${adv}-2-commande.png` });
    const t0 = Date.now();
    await p.waitForFunction(() => !!document.querySelector('.cfn-ann-big.has-card'), { timeout: 15000 }).catch(() => {});
    console.log(lab, adv, 'commande affichée ~', Date.now() - t0 + 3800, 'ms avant la carte');
    await w(900);
    await p.screenshot({ path: `${OUT}/${lab}-a${adv}-3-carte.png` });
    await p.waitForFunction(() => !document.querySelector('.cfn-ann-wrap'), { timeout: 15000 }).catch(() => {});
    await w(800);
    await p.screenshot({ path: `${OUT}/${lab}-a${adv}-4-table.png` });
    console.log(lab, adv, 'débordement', await overflow(p), 'mini-cartes', await p.evaluate(() => document.querySelectorAll('.cfn-mc').length));
    await p.close();
  }
}
console.log('erreurs', errors.slice(0, 10));
await b.close();
