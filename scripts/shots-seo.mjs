/**
 * Captures du jeu pour les pages d'aide (client/public/img/*.webp) : une partie contre l'ordinateur et le
 * salon d'une table privée, sur téléphone (390 × 844). À relancer après une refonte de l'interface :
 *   npm run build && npm start   (dans un autre terminal)   puis   node scripts/shots-seo.mjs [url]
 * Conversion en WebP avec ImageMagick (`convert`), qualité 72.
 */
import puppeteer from 'puppeteer-core';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const URL_ = process.argv[2] || 'http://localhost:3001';
const OUT = join(process.cwd(), 'client', 'public', 'img');
mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const click = (p, t) => p.evaluate((t) => { const x = [...document.querySelectorAll('button, a')].find((e) => e.textContent.includes(t) && !e.disabled); x?.click(); return !!x; }, t);
const shot = async (p, name) => {
  const png = join(OUT, `${name}.png`);
  await p.screenshot({ path: png });
  execFileSync('convert', [png, '-quality', '72', '-define', 'webp:method=6', join(OUT, `${name}.webp`)]);
  execFileSync('rm', [png]);
  console.log(`✓ img/${name}.webp`);
};
const page = async () => {
  const ctx = await b.createBrowserContext();
  const p = await ctx.newPage();
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await p.evaluateOnNewDocument(() => { try { localStorage.setItem('421.settings', JSON.stringify({ name: 'Sam', music: 0, muted: true })); } catch { /* */ } });
  return p;
};

// 1. Partie contre l'ordinateur, après un premier lancer.
const p = await page();
await p.goto(URL_, { waitUntil: 'domcontentloaded' });
await wait(3000);
await click(p, "Jouer contre l'ordinateur"); await wait(1200);
await click(p, "S'asseoir"); await wait(6000);
// Lancer si c'est à nous (bouton « Lancer ») ; sinon on garde la vue de la table pendant le tour d'un adversaire.
await click(p, 'Lancer'); await wait(5000);
await shot(p, 'partie-421');

// 2. Salon d'une table privée (code et bouton d'invitation).
const s = await page();
await s.goto(URL_, { waitUntil: 'domcontentloaded' });
await wait(3000);
await click(s, 'En ligne'); await wait(4000); // connexion au serveur : les boutons s'activent ensuite
const nameBox = await s.$('input');
if (nameBox && !(await s.evaluate((i) => i.value, nameBox))) { await nameBox.type('Sam'); await wait(300); }
await click(s, 'Créer une table'); await wait(3000);
await click(s, 'Ouvrir la table'); await wait(3000);
await shot(s, 'salon-421');
await b.close();
