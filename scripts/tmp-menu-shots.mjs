/** Captures temporaires du menu (à supprimer). Usage : node scripts/tmp-menu-shots.mjs prefix [compte] */
import puppeteer from 'puppeteer-core';
const [,, prefix = 'avant', who = 'invite'] = process.argv;
const OUT = '/tmp/claude-0/-home-claude/2354a900-6617-5b77-aea4-015b57db42fb/scratchpad/menu';
const URL = 'http://localhost:3081';
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const p = await b.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
await p.setViewport({ width: 360, height: 640, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await p.goto(URL, { waitUntil: 'networkidle2' });
if (who !== 'invite') {
  const name = who === 'admin' ? 'MenuAdmin' : 'Testeur' + Math.floor(Math.random() * 1e4);
  let r = await p.evaluate(async (n) => (await fetch('/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: n, password: 'motdepasse1', guestProfile: { bags: 2, coins: 300 } }) })).json(), name);
  if (!r.ok) r = await p.evaluate(async (n) => (await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: n, password: 'motdepasse1' }) })).json(), name);
  await p.evaluate((r) => { localStorage.setItem('421.compte', JSON.stringify({ token: r.token, username: r.user.username })); }, r);
}
for (const [w, h] of [[360, 640], [390, 844], [1280, 800]]) {
  await p.setViewport({ width: w, height: h, deviceScaleFactor: w > 500 ? 1 : 2, isMobile: w < 500, hasTouch: w < 500 });
  for (const path of ['/', 'classic', '/?mode=cartes', '/?mode=courtisan']) {
    if (path === 'classic') { await p.goto(URL, { waitUntil: 'networkidle2' }); await wait(800); await p.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('421 classique'))?.click()); }
    else await p.goto(URL + path, { waitUntil: 'networkidle2' });
    await wait(1500);
    const info = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight, W: innerWidth, H: innerHeight }));
    const n = path === '/' ? 'menu' : path === 'classic' ? '421' : path.includes('cartes') ? 'cf' : 'court';
    console.log(prefix, who, w, h, n, JSON.stringify(info));
    await p.screenshot({ path: `${OUT}/${prefix}-${who}-${n}-${w}.png` });
  }
}
console.log('erreurs', errs);
await b.close();
