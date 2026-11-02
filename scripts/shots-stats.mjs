import puppeteer from 'puppeteer-core';
const [,, url, out] = process.argv;
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errs = [];
for (const [w, h, tag] of [[390, 844, 'mobile'], [1280, 900, 'desktop']]) {
  const p = await b.newPage(); await p.setViewport({ width: w, height: h });
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(url, { waitUntil: 'networkidle2' });
  await new Promise((r) => setTimeout(r, 2500));
  await p.screenshot({ path: `${out}/home-${tag}.png` });
  await p.evaluate(() => [...document.querySelectorAll('button')].find((x) => x.textContent.includes('Statistiques'))?.click());
  await new Promise((r) => setTimeout(r, 1500));
  await p.screenshot({ path: `${out}/stats-${tag}.png`, fullPage: true });
  await p.close();
}
// Admin
const p = await b.newPage(); await p.setViewport({ width: 1280, height: 900 });
const reg = await p.evaluate(async (u) => (await fetch(u + '/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'Patron', password: 'motdepasse1' }) })).json(), url);
await p.goto(url); await p.evaluate((t) => localStorage.setItem('421.compte', JSON.stringify({ token: t, username: 'Patron' })), reg.token);
await p.goto(url, { waitUntil: 'networkidle2' }); await new Promise((r) => setTimeout(r, 1500));
await p.evaluate(() => [...document.querySelectorAll('button')].find((x) => x.textContent.includes('Statistiques'))?.click());
await new Promise((r) => setTimeout(r, 1500));
await p.evaluate(() => [...document.querySelectorAll('button')].find((x) => x.textContent.includes('Tableau de bord'))?.click());
await new Promise((r) => setTimeout(r, 1500));
await p.screenshot({ path: `${out}/admin.png`, fullPage: true });
console.log('errors', errs);
await b.close();
