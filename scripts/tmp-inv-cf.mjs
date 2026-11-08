import puppeteer from 'puppeteer-core';
const w = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-proxy-server'] });
const p = await b.newPage();
await p.setViewport({ width: 390, height: 844 });
await p.evaluateOnNewDocument(() => { localStorage.setItem('421.settings', JSON.stringify({ name: 'Sam', avatar: '🦊', volume: 0, muted: true })); });
const click = (t) => p.evaluate((t) => { const x = [...document.querySelectorAll('button')].find((x) => x.offsetParent && x.textContent.includes(t) && !x.disabled); x?.click(); return !!x; }, t);
await p.goto('http://localhost:3101/?mode=cartes', { waitUntil: 'domcontentloaded' }); await w(1500);
for (const s of ['Contre l', 'Débutant', 'Jouer avec', 'Jouer directement']) { await click(s); await w(1200); }
await click('×2');
const t0 = Date.now(); let last = '';
while (Date.now() - t0 < 240000) {
  if (await p.$('.cf-end')) break;
  const btns = await p.evaluate(() => [...document.querySelectorAll('button')].filter(b=>b.offsetParent && !b.disabled).map((b) => b.textContent.trim().slice(0, 30)));
  const pref = ['Garder ma main', 'Passer la visite', 'Lancer', 'Relancer', 'Terminer mon tour', 'Fin du tour', 'Finir', 'Passer', 'Valider', 'Continuer', 'Ne rien faire', 'Laisser', 'OK', 'Compris'];
  let done = false;
  for (const t of pref) { const hit = btns.find((x) => x.startsWith(t)); if (hit) { await click(hit); done = true; break; } }
  const sig = btns.join('|');
  if (!done && sig !== last) { console.log(Math.round((Date.now()-t0)/1000), 'BTNS', sig.slice(0, 400)); last = sig; }
  await w(700);
}
console.log('end', !!(await p.$('.cf-end')), Math.round((Date.now()-t0)/1000));
await p.screenshot({ path: '/tmp/claude-0/-home-claude/2354a900-6617-5b77-aea4-015b57db42fb/scratchpad/invite/cf-probe.png' });
await b.close();
