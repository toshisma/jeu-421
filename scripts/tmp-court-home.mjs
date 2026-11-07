import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage();
await p.setViewport({ width: 360, height: 640, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
await p.evaluateOnNewDocument(() => localStorage.setItem('421.settings', JSON.stringify({ name: 'Sam', avatar: '🦊', muted: true })));
await p.goto(process.argv[2], { waitUntil: 'domcontentloaded' });
await new Promise((r) => setTimeout(r, 4000));
console.log(await p.evaluate(() => { const m = document.querySelector('.h2-main'); const s = getComputedStyle(m); return { sh: m.scrollHeight, ch: m.clientHeight, ov: s.overflowY, doc: document.documentElement.scrollHeight, win: innerHeight, docW: document.documentElement.scrollWidth }; }));
await b.close();
