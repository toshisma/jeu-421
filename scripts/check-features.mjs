/**
 * Parcours complet dans Chrome : comptes, défis, solo (geste, temps limité, règles, suivi,
 * réactions, volume), récompense serveur, multijoueur entre deux comptes, classement, suppression.
 * Usage : MIN_SOLO_MS=2000 npm start   puis   node scripts/check-features.mjs [url] [captures]
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
const ok = (cond, label) => { console.log(`${cond ? '✓' : '✗'} ${label}`); if (!cond) errors.push(label); };
async function page(wd = 1280, h = 800) {
  const ctx = await b.createBrowserContext();
  const p = await ctx.newPage();
  await p.setViewport({ width: wd, height: h });
  p.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  return p;
}
const click = (p, t, sel = 'button') => p.evaluate((t, sel) => {
  const x = [...document.querySelectorAll(sel)].find((x) => x.textContent.includes(t) && !x.disabled); x?.click(); return !!x;
}, t, sel);
const text = (p) => p.evaluate(() => document.body.innerText);
async function until(p, fn, ms = 20000, arg) { const t = Date.now(); while (Date.now() - t < ms) { if (await p.evaluate(fn, arg)) return true; await w(200); } return false; }
const typeIn = async (p, placeholder, v) => { await p.click(`input[placeholder="${placeholder}"]`, { clickCount: 3 }); await p.type(`input[placeholder="${placeholder}"]`, v); };
const me = (p) => p.evaluate(async () => { const s = JSON.parse(localStorage.getItem('421.compte')); const r = await fetch('/api/me', { headers: { Authorization: `Bearer ${s.token}` } }); return r.json(); });
const uniq = Date.now().toString(36).slice(-4);

// --- 1. Accueil, création de compte ---------------------------------------------------------
const A = await page();
await A.goto(URL_, { waitUntil: 'networkidle0' });
ok((await text(A)).includes('Défis du jour'), 'défis du jour affichés à l’accueil');
await A.screenshot({ path: `${OUT}/f1-accueil.png` });
await click(A, 'Créer un compte'); await w(400);
await typeIn(A, '3 à 20 caractères', `Sam${uniq}`);
await typeIn(A, '8 caractères minimum', 'motdepasse1');
await click(A, 'Créer mon compte');
ok(await until(A, () => document.body.innerText.includes('code de récupération')), 'code de récupération affiché');
await A.screenshot({ path: `${OUT}/f2-code-recuperation.png` });
await click(A, "C'est noté"); await w(300);
ok((await text(A)).includes('Mon compte'), 'écran « Mon compte »');
await A.screenshot({ path: `${OUT}/f3-compte.png` });
await A.click('.panel-head .icon-btn'); await w(300);
// Profil : argent et XP séparés, succès, photo
await A.click('.me-btn'); await w(500);
const pv = await text(A);
ok(pv.includes('Argent du jeu') && pv.includes('Expérience') && pv.includes('Succès'), 'profil : argent, XP et succès affichés séparément');
const photo = process.env.PHOTO;
if (photo) {
  const input = await A.$('.profile-card input[type=file]');
  await input.uploadFile(photo);
  ok(await until(A, () => !!document.querySelector('.pv-head .avatar img'), 8000), 'photo de profil envoyée et affichée');
}
await A.screenshot({ path: `${OUT}/f3b-profil.png` });
await A.click('.profile-card .panel-head .icon-btn'); await w(300);

// --- 2. Solo connecté : temps limité, geste, règles, suivi, réactions, volume -----------------
await click(A, "Jouer contre l'ordinateur"); await w(300);
await A.evaluate(() => [...document.querySelectorAll('.seg button')].find((x) => x.textContent === '1').click());
await A.select('.config select', 'manches'); await w(150);
await A.evaluate(() => { const i = document.querySelectorAll('.config input[type=number]')[0]; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, '2'); i.dispatchEvent(new Event('input', { bubbles: true })); });
const turnSel = await A.$$eval('.config select', (ss) => ss.findIndex((s) => [...s.options].some((o) => o.value === '15')));
const sels = await A.$$('.config select');
await sels[turnSel].select('15');
await click(A, "S'asseoir");
await until(A, () => document.body.innerText.includes('Historique'));
// Attendre notre tour sans jouer : le temps doit s'écouler et le jeu jouer pour nous.
ok(await until(A, () => document.body.innerText.includes('À vous de jouer'), 30000), 'notre tour arrive');
ok(await until(A, () => !!document.querySelector('.timer')), 'compte à rebours affiché');
await A.screenshot({ path: `${OUT}/f4-temps-et-suivi.png` });
const before = await A.evaluate(() => document.querySelectorAll('.f-roll').length);
ok(await until(A, (n) => document.querySelectorAll('.f-roll').length > n, 25000, before) || await A.evaluate((n) => document.querySelectorAll('.f-roll').length > n, before), 'temps écoulé : le jeu a lancé pour nous');
// Règles en partie
await A.click('button[aria-label="Règles du jeu"]'); await w(500);
ok((await text(A)).includes('Règles de cette partie'), 'règles consultables en partie, avec les réglages en cours');
await A.screenshot({ path: `${OUT}/f5-regles-en-partie.png` });
await A.click('.modal-card .icon-btn'); await w(300);
// Réaction
await A.click('button[aria-label="Réagir"]'); await w(200);
await click(A, '🍺', '.emote-pop button');
ok(await until(A, () => !!document.querySelector('.emote-float'), 3000), 'réaction affichée sur la carte du joueur');
// Volume
await A.click('.volume .icon-btn'); await w(200);
ok(!!(await A.$('.volume-pop input[type=range]')), 'curseur de volume 0–100 % en jeu');
await A.screenshot({ path: `${OUT}/f6-volume-reaction.png` });
await A.mouse.click(5, 400);
// Lancer au geste : glisser rapidement sur le bac quand c'est notre tour
let swiped = false;
const t0 = Date.now();
while (Date.now() - t0 < 120000 && !(await A.$('.end-overlay'))) {
  const st = await A.evaluate(() => ({
    mine: document.body.innerText.includes('À vous de jouer'),
    canLaunch: [...document.querySelectorAll('.buttons button')].some((x) => x.textContent.includes('Lancer les dés') && !x.disabled),
    canStop: [...document.querySelectorAll('.buttons button')].some((x) => x.textContent.includes('Valider') && !x.disabled),
    rolls: document.querySelectorAll('.f-roll').length,
  }));
  if (st.mine && st.canLaunch && !swiped) {
    await A.mouse.move(380, 420); await A.mouse.down();
    for (let i = 1; i <= 6; i++) { await A.mouse.move(380 + i * 70, 420 - i * 8); await w(12); }
    await A.mouse.up();
    // Le lancer démarre (« Les dés roulent… ») ou apparaît déjà dans l'historique.
    swiped = await until(A, (n) => document.body.innerText.includes('Les dés roulent') || document.querySelectorAll('.f-roll').length > n, 8000, st.rolls);
    ok(swiped, 'lancer au geste (glisser sur le bac)');
  } else if (st.canLaunch) await click(A, 'Lancer les dés');
  else if (st.canStop) await click(A, 'Valider mon tour');
  await w(400);
}
await w(2500);
ok(!!(await A.$('.reward')), 'récompense affichée en fin de partie');
await A.screenshot({ path: `${OUT}/f7-fin-solo.png` });
const m1 = await me(A);
ok(m1.profile.stats.played >= 1 && m1.profile.coins > 0, `progression enregistrée sur le serveur (🪙 ${m1.profile.coins})`);

// --- 3. Multijoueur entre deux comptes, classement ----------------------------------------------
const B = await page();
await B.goto(URL_, { waitUntil: 'networkidle0' });
await click(B, 'Créer un compte'); await w(300);
await typeIn(B, '3 à 20 caractères', `Lea${uniq}`);
await typeIn(B, '8 caractères minimum', 'motdepasse2');
await click(B, 'Créer mon compte'); await until(B, () => document.body.innerText.includes('code de récupération'));
await click(B, "C'est noté"); await w(200); await B.click('.panel-head .icon-btn'); await w(300);

await A.goto(URL_, { waitUntil: 'networkidle0' });
await click(A, 'Jouer en ligne'); await w(300);
await typeIn(A, 'Votre nom', 'Sam');
await click(A, 'Créer une table'); await w(300);
await click(A, 'Créer la table');
await until(A, () => !!document.querySelector('.code'));
await A.select('.config select', 'manches'); await w(300);
await A.evaluate(() => { const i = document.querySelectorAll('.config input[type=number]')[0]; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, '2'); i.dispatchEvent(new Event('input', { bubbles: true })); });
await w(300);
const code = await A.evaluate(() => document.querySelector('.code').textContent);
await B.goto(`${URL_}/?rejoindre=${code}`, { waitUntil: 'networkidle0' });
await typeIn(B, 'Votre nom', 'Léa');
await click(B, 'Rejoindre');
await until(B, () => document.body.innerText.includes('Je suis prêt'));
await click(B, 'Je suis prêt');
await until(A, () => [...document.querySelectorAll('button')].some((x) => x.textContent.includes('Lancer la partie') && !x.disabled));
await click(A, 'Lancer la partie');
const t1 = Date.now();
while (Date.now() - t1 < 90000 && !((await A.$('.end-overlay')) && (await B.$('.end-overlay')))) {
  for (const P of [A, B]) {
    if (!(await click(P, 'Lancer les dés'))) await click(P, 'Valider mon tour');
  }
  await w(500);
}
await w(3000);
ok(!!(await A.$('.reward')) && !!(await B.$('.reward')), 'récompenses en ligne envoyées par le serveur aux deux comptes');
await B.screenshot({ path: `${OUT}/f8-fin-en-ligne.png` });
await A.goto(URL_, { waitUntil: 'networkidle0' });
await click(A, 'Classement'); await w(1200);
const board = await A.evaluate(() => [...document.querySelectorAll('.board li')].map((li) => li.innerText.replace(/\s+/g, ' ')));
ok(board.length >= 2, `classement : ${board.join(' | ')}`);
await A.evaluate(() => [...document.querySelectorAll('.board li')].find((li) => !li.classList.contains('me'))?.click());
ok(await until(A, () => document.body.innerText.includes('victoires en ligne') && !!document.querySelector('.profile-card'), 6000), 'profil public d’un autre joueur');
await A.screenshot({ path: `${OUT}/f9b-profil-autre.png` });
await A.click('.profile-card .panel-head .icon-btn'); await w(300);
await click(A, 'Mes amis'); await w(300);
await typeIn(A, "Pseudo d'un ami", `Lea${uniq}`);
await click(A, 'Ajouter'); await w(1000);
const friends = await A.evaluate(() => document.querySelectorAll('.board li').length);
ok(friends === 2, 'ami ajouté par son pseudo');
await A.screenshot({ path: `${OUT}/f9-classement-amis.png` });

// --- 4. Suppression du compte ---------------------------------------------------------------
await B.goto(URL_, { waitUntil: 'networkidle0' });
await click(B, 'Connecté en tant que'); await w(400);
await click(B, 'Supprimer mon compte'); await w(200);
await B.type('.danger-zone input[type=password]', 'motdepasse2');
await click(B, 'Supprimer définitivement');
ok(await until(B, () => document.body.innerText.includes('Créer un compte'), 5000), 'compte supprimé depuis l’application');
const gone = await B.evaluate(async (n) => (await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: n, password: 'motdepasse2' }) })).status, `Lea${uniq}`);
ok(gone === 401, 'le compte supprimé ne peut plus se connecter');

// --- 5. Mobile ---------------------------------------------------------------------------------
const M = await page(390, 844);
await M.goto(URL_, { waitUntil: 'networkidle0' });
await M.screenshot({ path: `${OUT}/f10-mobile-accueil.png`, fullPage: true });

console.log(errors.length ? `ÉCHECS :\n${errors.join('\n')}` : 'Tout est bon.');
await b.close();
