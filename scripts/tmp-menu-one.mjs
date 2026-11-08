/** Reprise de partie : 421 en ligne et Courtisan en ligne quittés, puis bannière « Reprendre » (à supprimer). */
import puppeteer from 'puppeteer-core';
const OUT = '/tmp/claude-0/-home-claude/2354a900-6617-5b77-aea4-015b57db42fb/scratchpad/menu';
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const p = await b.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
p.on('dialog', (d) => void d.accept().catch(() => {}));
await p.setViewport({ width: 360, height: 640, deviceScaleFactor: 2 });
await p.goto('http://localhost:3081', { waitUntil: 'networkidle2' });
const r = await p.evaluate(async () => (await fetch('/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'Repreneur' + Math.floor(Math.random() * 1e4), password: 'motdepasse1' }) })).json());
await p.evaluate((r) => localStorage.setItem('421.compte', JSON.stringify({ token: r.token, username: r.user.username })), r);
const click = (t, s) => p.evaluate((t, s) => { const el = [...document.querySelectorAll((s ?? '') + ' button')].find((x) => (x.getAttribute('aria-label') || '').includes(t) || x.textContent.includes(t)); el?.click(); return !!el; }, t, s);
const txt = () => p.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 260));
// Courtisan : partie rapide en ligne, quittée.
await p.goto('http://localhost:3081/?mode=courtisan', { waitUntil: 'networkidle2' }); await wait(1200);
await click('Partie rapide', '.dm-menu'); await wait(44000);
console.log('courtisan en ligne :', (await txt()).slice(0, 120));
await click('Quitter la partie'); await wait(600); await click('Quitter', '.confirm-modal'); await wait(1500);
await click('Retour au menu principal'); await wait(1500);
console.log('menu principal :', await txt());
await p.screenshot({ path: `${OUT}/reprise-menu-courtisan.png` });
console.log('bannière reprise :', await p.evaluate(() => document.querySelector('.home-banner.resume')?.textContent));
await click('Partie du Courtisan en cours'); await wait(3000);
console.log('après Reprendre :', (await txt()).slice(0, 140));
console.log('erreurs', errs);
await b.close();
