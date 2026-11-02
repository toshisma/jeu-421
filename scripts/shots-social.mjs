/** Captures : cloche, notifications, défis, saison, collection (effets, séries), traînée. */
import puppeteer from 'puppeteer-core';
const [,, url = 'http://localhost:3001', out = 'captures'] = process.argv;
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const errs = [];
const post = (p, path, body, token) => p.evaluate(async (path, body, token) => (await fetch('/api' + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body) })).json(), path, body, token);
const p = await b.newPage(); await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
p.on('pageerror', (e) => errs.push(e.message));
await p.goto(url, { waitUntil: 'networkidle2' });
const n = Math.floor(Math.random() * 1e5);
const me = await post(p, '/register', { username: 'Sam' + n, password: 'motdepasse1', guestProfile: { bags: 12, coins: 300 } });
const ami = await post(p, '/register', { username: 'Marc' + n, password: 'motdepasse1', guestProfile: { coins: 200 } });
await post(p, '/friends', { username: me.user.username }, ami.token);
const ami2 = await post(p, '/register', { username: 'Julie' + n, password: 'motdepasse1', guestProfile: { coins: 200 } });
await post(p, '/friends', { username: ami2.user.username }, me.token); await post(p, '/friends/accept', { username: me.user.username }, ami2.token);
const d = await post(p, '/duels', { username: me.user.username, stake: 10 }, ami2.token);
await post(p, `/duels/${d.duel.id}/play`, { decisions: [[], [], [], [], []] }, ami2.token);
for (let i = 0; i < 12; i++) await post(p, '/bags/open', {}, me.token);
await p.evaluate((r) => { localStorage.setItem('421.compte', JSON.stringify({ token: r.token, username: r.user.username })); localStorage.setItem('421.reglages', JSON.stringify({ name: r.user.username })); }, me);
const click = (t) => p.evaluate((t) => { const el = [...document.querySelectorAll('button')].find((x) => x.textContent.trim().includes(t)); el?.click(); return !!el; }, t);
const home = async () => { await p.goto(url, { waitUntil: 'networkidle2' }); await wait(1500); };
await home(); await p.screenshot({ path: `${out}/s-home.png` });
await p.evaluate(() => document.querySelector('.bell')?.click()); await wait(1000); await p.screenshot({ path: `${out}/s-notifs.png` });
await home(); await click('Défis'); await wait(1200); await p.screenshot({ path: `${out}/s-duels.png` });
await home(); await click('Classement'); await wait(1500); await p.screenshot({ path: `${out}/s-saison.png` });
await home(); await click('Collection'); await wait(1000); await click('Effets'); await wait(600); await p.screenshot({ path: `${out}/s-effets.png` });
await click('Séries'); await wait(600); await p.screenshot({ path: `${out}/s-series.png` });
// Traînée : équiper la plus belle traînée possédée (ou forcer pour la capture), puis lancer au bac d'essai
const fx = await p.evaluate(async (t) => { const r = await (await fetch('/api/me', { headers: { Authorization: 'Bearer ' + t } })).json(); return r.profile.owned.filter((x) => x.startsWith('fx-')); }, me.token);
console.log('effets possédés', fx);
await home(); await click("Jouer contre l'ordinateur"); await wait(700); await p.evaluate(() => document.querySelector('.btn.primary.big')?.click()); await wait(2500);
await p.evaluate(() => [...document.querySelectorAll('button')].find((x) => /Lancer/.test(x.textContent))?.click());
for (let i = 0; i < 4; i++) { await wait(250); await p.screenshot({ path: `${out}/s-trail${i}.png` }); }
console.log('erreurs', errs);
await b.close();
