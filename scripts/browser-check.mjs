/**
 * Vérification dans un vrai navigateur (Chrome headless, WebGL logiciel).
 * Usage : node scripts/browser-check.mjs [url] [dossier_captures]
 * Le serveur doit tourner (npm run build && npm start).
 */
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';

const URL_ = process.argv[2] || 'http://localhost:3001';
const OUT = process.argv[3] || 'captures';
mkdirSync(OUT, { recursive: true });
const CHROME = process.env.CHROME_PATH || '/usr/bin/google-chrome';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const errors = [];
async function newPage(w = 1440, h = 900, name = 'p') {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: w, height: h });
  page.on('pageerror', (e) => errors.push(`[${name}] ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${name}] console: ${m.text()}`); });
  return page;
}
const clickText = async (page, text) => {
  const ok = await page.evaluate((t) => {
    const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes(t) && !x.disabled);
    if (b) { b.click(); return true; }
    return false;
  }, text);
  if (!ok) throw new Error(`Bouton introuvable : ${text}`);
};
const hasText = (page, t) => page.evaluate((t) => document.body.innerText.includes(t), t);
async function waitText(page, t, ms = 30000) {
  const t0 = Date.now();
  while (!(await hasText(page, t))) { if (Date.now() - t0 > ms) { console.log("PAGE:", (await page.evaluate(() => document.body.innerText)).slice(0, 300)); throw new Error(`Texte absent : ${t}`); } await wait(100); }
}

const ONLY_MULTI = process.env.ONLY_MULTI === '1';
if (!ONLY_MULTI) {
// 1. Accueil
const p = await newPage(1440, 900, 'solo');
await p.goto(URL_, { waitUntil: 'networkidle0' });
await p.screenshot({ path: `${OUT}/01-accueil.png` });

// 2. Bac d'essai : lancer, capture en plein vol puis au repos
await clickText(p, "Bac d'essai");
await wait(1500);
await p.screenshot({ path: `${OUT}/02-bac-repos.png` });
await clickText(p, 'Lancer les dés');
await wait(550);
await p.screenshot({ path: `${OUT}/03-bac-en-vol.png` });
await wait(500);
await p.screenshot({ path: `${OUT}/04-bac-rebonds.png` });
await waitText(p, 'cliquez un dé', 10000);
await wait(4000);
await p.screenshot({ path: `${OUT}/05-bac-resultat.png` });
// Vérifie que les faces affichées dans l'interface = faces calculées par le moteur
const shownLabel = await p.evaluate(() => document.querySelector('.turn-line b')?.textContent);
console.log('Bac d’essai — combinaison affichée :', shownLabel);

// 3. Partie solo contre 3 IA
await p.click('.icon-btn');
await wait(300);
await clickText(p, "Jouer contre l'ordinateur");
await wait(300);
await p.screenshot({ path: `${OUT}/06-solo-config.png` });
await clickText(p, "S'asseoir à la table");
let myTurns = 0;
let shotKeep = false;
const t0 = Date.now();
while (Date.now() - t0 < 150000) {
  if (await hasText(p, 'Victoire !') || await hasText(p, 'Perdu…') || await hasText(p, 'Partie terminée')) break;
  const state = await p.evaluate(() => {
    const btns = [...document.querySelectorAll('.buttons button')].filter((b) => !b.disabled).map((b) => b.textContent);
    return { btns };
  });
  if (state.btns.some((b) => b.includes('Lancer les dés'))) { await clickText(p, 'Lancer les dés'); myTurns++; }
  else if (state.btns.some((b) => b.includes('Relancer'))) {
    // Conserver le premier dé (clic dans l'interface), puis relancer les autres
    await p.evaluate(() => document.querySelector('.keep-die')?.click());
    await wait(300);
    if (!shotKeep) { await p.screenshot({ path: `${OUT}/08-solo-selection.png` }); shotKeep = true; }
    await clickText(p, 'Relancer');
  } else if (state.btns.some((b) => b.includes('Valider'))) await clickText(p, 'Valider mon tour');
  if (myTurns === 2 && !(await p.$('.toast'))) await p.screenshot({ path: `${OUT}/07-solo-partie.png` });
  await wait(400);
}
await p.screenshot({ path: `${OUT}/09-solo-fin.png` });
console.log('Solo : tours joués par l’humain =', myTurns, '— fin atteinte :', await hasText(p, 'Accueil'));

// 4. Mobile
const m = await newPage(390, 844, 'mobile');
await m.goto(URL_, { waitUntil: 'networkidle0' });
await clickText(m, "Jouer contre l'ordinateur");
await clickText(m, "S'asseoir à la table");
await wait(6000);
await m.screenshot({ path: `${OUT}/10-mobile.png` });
await m.close();
await p.close();
}

// 5. Multijoueur : deux navigateurs séparés
const host = await newPage(1280, 800, 'hôte');
await host.goto(URL_, { waitUntil: 'networkidle0' });
await clickText(host, 'Jouer en ligne');
await host.type('input[placeholder="Votre nom"]', 'Sam');
await clickText(host, 'Créer une table');
await new Promise((r) => setTimeout(r, 300));
await clickText(host, 'Créer la table');
await waitText(host, 'Copier le code');
const code = await host.evaluate(() => document.querySelector('.code').textContent);
const guest = await newPage(1280, 800, 'invité');
await guest.goto(`${URL_}/?rejoindre=${code}`, { waitUntil: 'networkidle0' });
await guest.type('input[placeholder="Votre nom"]', 'Léa');
await clickText(guest, 'Rejoindre');
await waitText(guest, 'Je suis prêt');
await clickText(guest, 'Je suis prêt');
await waitText(host, 'Lancer la partie');
await host.screenshot({ path: `${OUT}/11-salon.png` });
await clickText(host, 'Lancer la partie');
await waitText(host, 'Historique');
await waitText(guest, 'Historique');
let rolls = 0;
const t1 = Date.now();
while (rolls < 6 && Date.now() - t1 < 60000) {
  for (const pg of [host, guest]) {
    const btns = await pg.evaluate(() => [...document.querySelectorAll('.buttons button')].filter((b) => !b.disabled).map((b) => b.textContent));
    if (btns.some((b) => b.includes('Lancer les dés'))) { await clickText(pg, 'Lancer les dés'); rolls++; }
    else if (btns.some((b) => b.includes('Valider'))) await clickText(pg, 'Valider mon tour');
  }
  await wait(500);
}
await wait(3500);
await host.screenshot({ path: `${OUT}/12-multi-hote.png` });
await guest.screenshot({ path: `${OUT}/13-multi-invite.png` });
const feeds = await Promise.all([host, guest].map((pg) => pg.evaluate(() => [...document.querySelectorAll('.f-roll')].map((li) => li.innerText.replace(/\s+/g, ' ')).join(' | '))));
console.log('Multijoueur — lancers :', rolls, '— historiques identiques :', feeds[0] === feeds[1] && feeds[0].length > 0);

console.log(errors.length ? `ERREURS:\n${errors.join('\n')}` : 'Aucune erreur JavaScript.');
await browser.close();
