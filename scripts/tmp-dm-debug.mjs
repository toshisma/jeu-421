import puppeteer from 'puppeteer-core';
const w = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage();
await p.setViewport({ width: 390, height: 844 });
p.on('pageerror', (e) => console.log(`pageerror: ${e.message}`));
p.on('console', (m) => console.log(`console: ${m.text()}`));
await p.evaluateOnNewDocument(() => { localStorage.setItem('421.settings', JSON.stringify({ name: 'Sam', avatar: '🦊', volume: 0, muted: true })); });
const click = (t, sel = 'button') => p.evaluate((t, sel) => { const x = [...document.querySelectorAll(sel)].find((x) => x.textContent.includes(t) && !x.disabled); x?.click(); return !!x; }, t, sel);
const dbg = () => p.evaluate(() => { const g = document.querySelector('.dm-game'); return g ? JSON.stringify(g.dataset) : 'none'; });
await p.goto('http://localhost:3031', { waitUntil: 'load' }); await w(2000);
await click('Dix mille', '.ms-tab'); await w(1000);
await click("S'asseoir"); await w(3000);
console.log(await dbg());
console.log(await click('Lancer les 6 dés'));
for (let i = 0; i < 12; i++) { await w(500); console.log(await dbg()); }
await b.close();
