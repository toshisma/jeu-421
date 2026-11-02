/**
 * Vérification dans Chrome : application installable (manifeste, service worker, hors ligne),
 * boutique (achat, installation, formes), récompenses de fin de partie.
 * Usage : node scripts/check-app.mjs [url] [dossier_captures]   (serveur lancé : npm start)
 */
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
const URL_ = process.argv[2] || 'http://localhost:3001';
const OUT = process.argv[3] || 'captures';
mkdirSync(OUT, { recursive: true });
const w = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [];
const page = async (wd, h) => {
  const ctx = await b.createBrowserContext();
  const p = await ctx.newPage();
  await p.setViewport({ width: wd, height: h });
  p.on('pageerror', (e) => errors.push(e.message));
  return p;
};
const click = (p, t) => p.evaluate((t) => { const x = [...document.querySelectorAll('button')].find((x) => x.textContent.includes(t) && !x.disabled); x?.click(); return !!x; }, t);
const text = (p) => p.evaluate(() => document.body.innerText);
const ok = (cond, label) => { console.log(`${cond ? '✓' : '✗'} ${label}`); if (!cond) errors.push(label); };

// 1. Application installable
const p = await page(1280, 800);
await p.goto(URL_, { waitUntil: 'networkidle0' });
await p.screenshot({ path: `${OUT}/a1-accueil.png` });
const manifest = await p.evaluate(async () => (await fetch(document.querySelector('link[rel=manifest]').href)).json());
ok(manifest.display === 'standalone' && manifest.icons.length >= 3, 'manifeste valide (standalone, icônes)');
const swReady = await p.evaluate(async () => { const r = await navigator.serviceWorker.ready; return !!r.active; });
ok(swReady, 'service worker actif');
await p.reload({ waitUntil: 'networkidle0' });
await w(500);
await p.setOfflineMode(true);
await p.reload({ waitUntil: 'domcontentloaded' });
await w(2500);
const off = await text(p);
ok(off.includes("Jouer contre l'ordinateur"), 'le jeu se charge hors connexion');
ok(off.includes('Hors connexion'), 'multijoueur signalé indisponible hors connexion');
await click(p, "Jouer contre l'ordinateur"); await w(300); await click(p, "S'asseoir"); await w(4000);
ok((await text(p)).includes('Historique'), 'partie solo lancée hors connexion');
await p.screenshot({ path: `${OUT}/a2-hors-ligne.png` });
await p.setOfflineMode(false);

// 2. Boutique
const s = await page(1280, 800);
await s.goto(URL_, { waitUntil: 'networkidle0' });
await s.evaluate(() => localStorage.setItem('421.profil', JSON.stringify({ xp: 6000, coins: 5000 })));
await s.reload({ waitUntil: 'networkidle0' });
await click(s, 'Personnaliser'); await w(1500);
await click(s, 'Formes'); await w(300);
for (const name of ['Octogone', 'Hexagone', 'Rond']) {
  await click(s, name); await w(1200);
  await s.screenshot({ path: `${OUT}/a3-forme-${name.toLowerCase()}.png` });
}
ok(await click(s, 'Acheter'), 'achat du plateau rond');
await w(300);
await click(s, 'Dés'); await w(300); await click(s, 'Or massif'); await w(300); await click(s, 'Acheter');
await click(s, 'Tapis'); await w(300); await click(s, 'Bordeaux'); await w(300); await click(s, 'Acheter');
await click(s, 'Décors'); await w(300); await click(s, 'Nuit à Monte-Carlo'); await w(300); await click(s, 'Acheter');
await click(s, 'Rebords'); await w(300); await click(s, 'Laque ivoire'); await w(300); await click(s, 'Acheter');
await w(800);
await click(s, 'Lancer pour essayer'); await w(9000);
await s.screenshot({ path: `${OUT}/a4-boutique-achats.png` });
const prof = await s.evaluate(() => JSON.parse(localStorage.getItem('421.profil')));
ok(prof.equipped.shape === 'shape-rond' && prof.equipped.dice === 'dice-or' && prof.equipped.decor === 'decor-nuit', 'objets achetés et installés');
// 5000 − 1000 − 2000 − 150 − 1500 + 300 (succès « Vétéran », niveau 10, débloqué au premier achat) = 650 :
// la laque (700) n'est plus abordable et doit être refusée.
ok(prof.coins === 650 && !!prof.achievements['niveau-10'] && !prof.owned.includes('rim-laque'), `pièces débitées, succès versé, achat trop cher refusé (${prof.coins})`);
const poor = await s.evaluate(() => [...document.querySelectorAll('.item')].map((x) => x.innerText).join(' | '));
ok(/Installé/.test(poor), 'état « Installé » affiché');

// 3. Récompense de fin de partie (1 adversaire, 1 manche aux points pour aller vite)
await s.evaluate(() => localStorage.setItem('421.profil', JSON.stringify({ xp: 0, coins: 0 })));
await s.goto(URL_, { waitUntil: 'networkidle0' });
await click(s, "Jouer contre l'ordinateur"); await w(300);
await s.evaluate(() => [...document.querySelectorAll('.seg button')].find((x) => x.textContent === '1').click());
await s.select('.config select', 'manches'); await w(200);
await s.evaluate(() => { const i = document.querySelectorAll('.config input[type=number]')[0]; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, '2'); i.dispatchEvent(new Event('input', { bubbles: true })); });
await click(s, "S'asseoir");
const t0 = Date.now();
while (Date.now() - t0 < 90000 && !(await s.$('.reward'))) {
  if (!(await click(s, 'Lancer les dés'))) await click(s, 'Valider mon tour');
  await w(500);
}
await w(2500);
await s.screenshot({ path: `${OUT}/a5-recompense.png` });
const after = await s.evaluate(() => JSON.parse(localStorage.getItem('421.profil')));
ok(after.xp > 0 && after.coins > 0 && after.stats.played === 1, `récompense enregistrée (+${after.xp} XP, +${after.coins} pièces)`);
await click(s, 'Rejouer'); await w(3000);
const again = await s.evaluate(() => JSON.parse(localStorage.getItem('421.profil')));
ok(again.stats.played === 1, 'pas de double récompense en relançant');

// 4. Mobile
const m = await page(390, 844);
await m.goto(URL_, { waitUntil: 'networkidle0' });
await m.screenshot({ path: `${OUT}/a6-mobile-accueil.png` });
await click(m, 'Personnaliser'); await w(1500);
await m.screenshot({ path: `${OUT}/a7-mobile-boutique.png` });

console.log(errors.length ? `ÉCHECS / ERREURS :\n${errors.join('\n')}` : 'Tout est bon.');
await b.close();
