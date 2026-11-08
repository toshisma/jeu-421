import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
b.on('disconnected', () => console.log('BROWSER DISCONNECTED'));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const mode = process.argv[2];
let p = await b.newPage();
for (let i = 0; i < 16; i++) {
  if (mode === 'new') { await p.close(); p = await b.newPage(); }
  await p.setViewport({ width: 360, height: 640 });
  await p.goto(mode === 'static' ? 'http://localhost:3081/regles-du-421' : 'http://localhost:3081', { waitUntil: 'networkidle2' }); await wait(800);
  console.log(i);
}
await b.close();
