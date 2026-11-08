import puppeteer from 'puppeteer-core';
const [,, url, ...steps] = process.argv;
const w = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-proxy-server'] });
const p = await b.newPage();
await p.setViewport({ width: 390, height: 844 });
await p.evaluateOnNewDocument(() => { localStorage.setItem('421.settings', JSON.stringify({ name: 'Sam', avatar: '🦊', volume: 0, muted: true })); });
await p.goto(url, { waitUntil: 'domcontentloaded' }); await w(1500);
for (const s of steps) {
  const ok = await p.evaluate((t) => { const x = [...document.querySelectorAll('button, [role=button], a')].find((x) => x.textContent.includes(t) && !x.disabled); x?.click(); return !!x; }, s);
  console.log('click', s, ok); await w(1500);
}
console.log(await p.evaluate(() => [...document.querySelectorAll('button')].filter(b=>b.offsetParent).map((b) => (b.textContent.trim() || b.getAttribute('aria-label')).slice(0, 50)).join(' | ')));
await p.screenshot({ path: '/tmp/claude-0/-home-claude/2354a900-6617-5b77-aea4-015b57db42fb/scratchpad/invite/explore.png' });
await b.close();
