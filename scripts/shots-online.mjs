/**
 * Captures de l'interface (accueil, jeu en ligne, tournoi) avec des joueurs simulés.
 * Usage : npm start   puis   node scripts/shots-online.mjs [url] [dossier]
 */
import puppeteer from 'puppeteer-core';
import { io } from 'socket.io-client';
import { mkdirSync } from 'node:fs';
const URL_ = process.argv[2] || 'http://localhost:3001';
const OUT = process.argv[3] || 'captures';
mkdirSync(OUT, { recursive: true });
const w = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];
const b = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
async function page(wd, h, mobile = false) {
  const ctx = await b.createBrowserContext();
  const p = await ctx.newPage();
  await p.setViewport({ width: wd, height: h, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
  p.on('pageerror', (e) => errors.push(e.message));
  await p.evaluateOnNewDocument(() => localStorage.setItem('421.settings', JSON.stringify({ name: 'Sam', avatar: '🦊', volume: 0, muted: true })));
  return p;
}
const click = (p, t) => p.evaluate((t) => { const x = [...document.querySelectorAll('button')].find((x) => x.textContent.includes(t) && !x.disabled); x?.click(); return !!x; }, t);
const bot = (name) => new Promise((res) => { const s = io(URL_, { transports: ['websocket'], forceNew: true }); s.on('connect', () => res(s)); });
const emit = (s, ev, p = {}) => new Promise((r) => s.emit(ev, p, r));

// Une table publique et un tournoi public ouverts par d'autres joueurs.
const host = await bot();
await emit(host, 'room:create', { name: 'Léa', avatar: '🦉', table: { visibility: 'public', maxPlayers: 4 } });
const orga = await bot();
const tc = await emit(orga, 'tournament:create', { name: 'Marco', avatar: '🐻', settings: { title: 'Coupe du jeudi', maxPlayers: 8, tableSize: 4, visibility: 'public', config: { variant: 'manches', rounds: 2, turnSeconds: 15 } } });
const bots = [];
for (const n of ['Inès', 'Paul', 'Zoé']) { const s = await bot(); await emit(s, 'tournament:join', { code: tc.code, name: n, avatar: '🐸' }); bots.push(s); }

for (const [label, wd, h, mob] of [['desktop', 1280, 820, false], ['mobile', 390, 844, true]]) {
  const p = await page(wd, h, mob);
  await p.goto(URL_, { waitUntil: 'networkidle0' });
  await w(500);
  await p.screenshot({ path: `${OUT}/${label}-1-accueil.png`, fullPage: mob });
  await click(p, 'Jouer en ligne'); await w(1500);
  await p.screenshot({ path: `${OUT}/${label}-2-en-ligne.png`, fullPage: true });
  await click(p, 'Tournois'); await w(800);
  await p.screenshot({ path: `${OUT}/${label}-3-tournois.png`, fullPage: true });
  if (label === 'desktop') {
    await click(p, 'Créer un tournoi'); await w(600);
    await p.screenshot({ path: `${OUT}/${label}-4-creer-tournoi.png`, fullPage: true });
    await p.evaluate(() => document.querySelector('.panel-head .icon-btn').click()); await w(600);
    await click(p, 'Tables'); await w(300);
    await click(p, 'Créer une table'); await w(600);
    await p.screenshot({ path: `${OUT}/${label}-5-creer-table.png`, fullPage: true });
    await p.evaluate(() => document.querySelector('.panel-head .icon-btn').click()); await w(600);
    await click(p, 'Tournois'); await w(300);
  }
  await click(p, "S'inscrire"); await w(1500);
  await p.screenshot({ path: `${OUT}/${label}-6-tournoi-inscrits.png`, fullPage: true });
  if (label === 'desktop') {
    // L'organisateur lance : on arrive à sa table, puis on regarde le tableau.
    await emit(orga, 'tournament:start'); await w(4000);
    await p.screenshot({ path: `${OUT}/${label}-7-table-tournoi.png` });
    await p.evaluate(() => document.querySelector('.topbar .icon-btn')?.click()); await w(800);
    await p.screenshot({ path: `${OUT}/${label}-8-tableau.png`, fullPage: true });
  }
  await p.close();
}
console.log(errors.length ? `Erreurs : ${errors.join(' | ')}` : 'Aucune erreur de page');
for (const s of [host, orga, ...bots]) s.disconnect();
await b.close();
