/**
 * Parcours : phrases rapides, soirée (un téléphone + arbitre), album, récap, patron de la semaine, club.
 * Usage : npm start   puis   node scripts/shots-batch3.mjs [url] [dossier]
 */
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
const URL_ = process.argv[2] || 'http://localhost:3001';
const OUT = process.argv[3] || 'captures';
mkdirSync(OUT, { recursive: true });
const w = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];
const ok = (c, l) => { console.log(`${c ? '✓' : '✗'} ${l}`); if (!c) errors.push(l); };
const b = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await b.createBrowserContext();
const p = await ctx.newPage();
await p.setViewport({ width: 1280, height: 860 });
p.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
await p.evaluateOnNewDocument(() => { if (!localStorage.getItem('421.settings')) localStorage.setItem('421.settings', JSON.stringify({ name: 'Sam', avatar: '🦊', volume: 0, muted: true })); });
const click = (t, sel = 'button') => p.evaluate((t, sel) => { const x = [...document.querySelectorAll(sel)].find((x) => x.textContent.includes(t) && !x.disabled); x?.click(); return !!x; }, t, sel);
const text = () => p.evaluate(() => document.body.innerText);
async function until(fn, ms = 20000) { const t = Date.now(); while (Date.now() - t < ms) { if (await p.evaluate(fn)) return true; await w(200); } return false; }
const home = async () => { await p.goto(URL_, { waitUntil: 'networkidle0' }); await w(400); };

// Compte avec quelques pièces
await home();
await click('Créer un compte'); await w(300);
const uniq = Date.now().toString(36).slice(-4);
await p.type('input[placeholder="3 à 20 caractères"]', `Sam${uniq}`);
await p.type('input[placeholder="8 caractères minimum"]', 'motdepasse1');
await click('Créer mon compte');
await until(() => document.body.innerText.includes('code de récupération'));
await click("C'est noté"); await w(300);
await home();
ok((await text()).includes('Patron de la semaine'), 'patron de la semaine à l’accueil');
await p.screenshot({ path: `${OUT}/d1-accueil.png`, fullPage: true });

// Patron : partie lancée, phrase rapide
await click('Défier');
ok(await until(() => document.body.innerText.includes('Historique')), 'partie contre le patron');
await w(1500);
await p.click('button[aria-label="Réagir"]'); await w(300);
await p.screenshot({ path: `${OUT}/d2-phrases.png` });
await click('Belle main !', '.phrase-list button'); await w(400);
ok(await p.evaluate(() => [...document.querySelectorAll('.bubble')].some((x) => x.textContent.includes('Belle main'))), 'phrase rapide affichée en bulle');
await w(1500);
await p.screenshot({ path: `${OUT}/d3-patron.png` });

// Soirée : un seul téléphone
await home();
await click('Soirée entre amis'); await w(500);
await p.screenshot({ path: `${OUT}/d4-soiree.png`, fullPage: true });
await click('Commencer la soirée'); await w(1500);
ok(await p.evaluate(() => !!document.querySelector('.handoff')), 'écran « passez le téléphone »');
await p.screenshot({ path: `${OUT}/d5-passez.png` });
await click("C'est moi, je joue"); await w(500);
await click('Lancer les dés'); await w(4500);
if (!(await p.$('.handoff'))) await click('Valider mon tour');
ok(await until(() => !!document.querySelector('.handoff'), 8000), 'au joueur suivant');

// Soirée : arbitre
await home();
await click('Soirée entre amis'); await w(500);
await click('Vrais dés'); await w(200);
await click('Commencer la soirée'); await w(500);
for (const v of [4, 2, 1]) await p.evaluate((v, i) => document.querySelectorAll('.ref-slot')[i].querySelectorAll('button')[v - 1].click(), v, [4, 2, 1].indexOf(v));
await w(200);
await p.screenshot({ path: `${OUT}/d6-arbitre.png`, fullPage: true });
await click('Valider le coup'); await w(300);
ok((await text()).includes('de jouer'), 'l’arbitre passe au joueur suivant');

// Album, récap
await home();
await click('Album'); await w(400);
await p.screenshot({ path: `${OUT}/d7-album.png`, fullPage: true });
await home();
await click('Récap'); await w(400);
await p.screenshot({ path: `${OUT}/d8-recap.png`, fullPage: true });

// Club : pas assez de pièces au départ, on regarde l'écran
await home();
await click('Club'); await w(1200);
ok((await text()).includes('Fonder un club'), 'écran des clubs');
await p.screenshot({ path: `${OUT}/d9-clubs.png`, fullPage: true });

console.log(errors.length ? `Problèmes : ${errors.join(' | ')}` : 'Tout est bon.');
await b.close();
process.exit(errors.length ? 1 : 0);
