/** Vérifie au doigt (écran tactile simulé) que les zones qui défilent répondent. */
import puppeteer from 'puppeteer-core';
const [,, url = 'http://localhost:3001'] = process.argv;
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const p = await b.newPage();
await p.setViewport({ width: 360, height: 740, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const click = (t) => p.evaluate((t) => { const el = [...document.querySelectorAll('button')].find((x) => x.textContent.trim().includes(t)); el?.click(); return !!el; }, t);
async function swipe(sel, dx, dy) {
  const box = await p.evaluate((sel) => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + Math.min(r.height / 2, 60), sl: e.scrollLeft, st: e.scrollTop }; }, sel);
  if (!box) return `${sel} : introuvable`;
  await p.touchscreen.touchStart(box.x, box.y);
  for (let i = 1; i <= 12; i++) { await p.touchscreen.touchMove(box.x + (dx * i) / 12, box.y + (dy * i) / 12); await wait(16); }
  await p.touchscreen.touchEnd();
  await wait(600);
  const after = await p.evaluate((sel) => { const e = document.querySelector(sel); return { sl: e.scrollLeft, st: e.scrollTop }; }, sel);
  const moved = Math.abs(after.sl - box.sl) + Math.abs(after.st - box.st);
  return `${moved > 5 ? '✓' : '✗'} ${sel} : défilé de ${Math.round(moved)} px`;
}
await p.goto(url, { waitUntil: 'networkidle2' }); await wait(800);
await click('Boutique'); await wait(1200);
console.log(await swipe('.tabs', -250, 0));
console.log(await swipe('.items', 0, -300));
await p.goto(url, { waitUntil: 'networkidle2' }); await wait(800);
await click('Collection'); await wait(1000);
console.log(await swipe('.coll-filter', -250, 0));
console.log(await swipe('.screen', 0, -300));
await p.goto(url, { waitUntil: 'networkidle2' }); await wait(800);
await click("Jouer contre l'ordinateur"); await wait(600);
await p.evaluate(() => { [...document.querySelectorAll('.seg button')].find((x) => x.textContent.trim() === '5')?.click(); });
await wait(300);
await p.evaluate(() => document.querySelector('.btn.primary.big')?.click()); await wait(2500);
console.log(await swipe('.players', -250, 0));
await b.close();
