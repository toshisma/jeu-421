/** Parcours temporaire de toutes les entrées des menus (à supprimer). Usage : node scripts/tmp-menu-walk.mjs invite|compte|admin [largeur] [hauteur] */
import puppeteer from 'puppeteer-core';
const [,, who = 'invite', SECTION = 'tout', W = '360', H = '640'] = process.argv;
const on = (x) => SECTION === 'tout' || SECTION === x;
const OUT = '/tmp/claude-0/-home-claude/2354a900-6617-5b77-aea4-015b57db42fb/scratchpad/menu';
const URL = 'http://localhost:3081';
const launch = () => puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'] });
let b = await launch();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const errs = [];
let p = await b.newPage();
const setup = async () => {
p.on('pageerror', (e) => errs.push(`[page] ${e.message}`));
p.on('error', (e) => console.log(`  !! onglet planté : ${e.message}`));
p.on('dialog', (d) => void d.accept().catch(() => {}));
p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource.*(401|404|409|429)/.test(m.text())) errs.push(m.text()); });
await p.setViewport({ width: +W, height: +H, deviceScaleFactor: 1, isMobile: +W < 500, hasTouch: +W < 500 });
};
await setup();
await p.goto(URL, { waitUntil: 'networkidle2' });
if (who !== 'invite') {
  const name = who === 'admin' ? 'MenuAdmin' : 'Marcheur' + Math.floor(Math.random() * 1e4);
  let r = await p.evaluate(async (n) => (await fetch('/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: n, password: 'motdepasse1', guestProfile: { bags: 2, coins: 300 } }) })).json(), name);
  if (!r.ok) r = await p.evaluate(async (n) => (await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: n, password: 'motdepasse1' }) })).json(), name);
  await p.evaluate((r) => { localStorage.setItem('421.compte', JSON.stringify({ token: r.token, username: r.user.username })); }, r);
  // Coups Fourrés : découverte faite (sinon l'écran de bienvenue s'ouvre d'abord).
  await p.evaluate(async (t) => { await fetch('/api/cf/discover', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` }, body: '{}' }); }, r.token);
}
const report = { push: (l) => console.log(l), join: () => '' };
const state = () => p.evaluate(() => ({
  heads: [...document.querySelectorAll('h1, h2, .scr-title b, .sheet-head h2, [role=dialog][aria-label]')].map((e) => e.getAttribute('aria-label') || e.textContent.trim()).filter(Boolean).slice(0, 4).join(' | ').slice(0, 120),
  over: document.documentElement.scrollWidth > innerWidth + 1,
  main: !!document.querySelector('.main-menu'),
}));
/** Clique le premier bouton/lien dont le texte ou l'aria-label contient `t` (dans `scope` si donné). */
const click = (t, scope) => p.evaluate((t, scope) => {
  const root = scope ? document.querySelector(scope) : document;
  if (!root) return false;
  const el = [...root.querySelectorAll('button, a, [role=tab]')].find((x) => (x.getAttribute('aria-label') || '').includes(t) || x.textContent.trim().includes(t));
  if (!el) return false; el.scrollIntoView({ block: 'center' }); el.click(); return true;
}, t, scope);
let navs = 0;
const home = async () => {
  await p.goto(URL, { waitUntil: 'networkidle2' }); await wait(700);
};
async function step(name, actions, opts = {}) {
  try { return await step0(name, actions, opts); }
  catch (e) { console.log(`✗ ${name} : ${e.message.slice(0, 80)}`); return { heads: '', over: false, main: false }; }
}
async function step0(name, actions, { shot } = {}) {
  let ok = true;
  for (const a of actions) {
    if (typeof a === 'number') { await wait(a); continue; }
    if (typeof a === 'function') { await a(); continue; }
    const [t, scope] = Array.isArray(a) ? a : [a];
    if (!(await click(t, scope))) { ok = false; report.push(`✗ ${name} : « ${t} » introuvable`); break; }
    await wait(600);
  }
  await wait(500);
  const s = await state();
  report.push(`${ok ? '✓' : '✗'} ${name} → ${s.heads}${s.over ? '  ⚠ DÉBORDE' : ''}`);
  if (shot) await p.screenshot({ path: `${OUT}/walk-${who}-${shot}.png` });
  return s;
}
const acc = who !== 'invite';

if (on('menu')) {
// --- Menu principal -----------------------------------------------------------------------------
await home();
await step('menu principal', [], { shot: `menu-${W}` });
await step('profil (avatar)', ['Mon profil'], { shot: 'profil' }); await home();
if (!acc) { await step('Connexion', ['Connexion']); await home(); }
if (acc) { await step('Messages', [['Messages', '.h2-bar']]); await home(); await step('Notifications', [['otifications', '.h2-bar']]); await home(); }
await step('Cadeau du jour', [['Cadeau', '.mm-shelf']], { shot: 'cadeau' }); await home();
await step('Coffre', [['Coffre', '.mm-shelf']]); await home();
await step('Défis du jour', [['Défis', '.mm-shelf']], { shot: 'defis' }); await home();
await step('Pass', [['Pass', '.mm-shelf']]); await step('  ← retour', ['Retour']); await home();
await step('Amis (barre)', [['Amis', '.h2-tabs']], { shot: 'amis' }); await step('  ← retour', ['Retour']); await home();
await step('Collection (barre)', [['Collection', '.h2-tabs']], { shot: 'collection' }); await step('  ← retour', ['Retour']); await home();
await step('Boutique (barre)', [['Boutique', '.h2-tabs']], { shot: 'boutique' }); await step('  ← retour', ['Retour']); await home();
await step('Plus', [['Plus', '.h2-tabs']], { shot: 'plus' });
for (const t of ['Profil et succès', 'Pass du mois', 'Défis du jour', 'Récap du mois', 'Parrainage', "Bac d'essai", 'Messages', 'Club', 'Défis entre amis', 'Statistiques', 'Réglages', acc ? 'Mon compte' : 'Compte', 'Administration', '421 classique', 'Coups Fourrés', 'Le Courtisan', 'Nouveautés', 'Confidentialité']) {
  if (!acc && ['Messages'].includes(t)) continue;
  if (t === 'Administration' && who !== 'admin') continue;
  await home(); await click('Plus', '.h2-tabs'); await wait(500);
  await step(`Plus › ${t}`, [[t, '.sheet']], t === 'Réglages' ? { shot: 'reglages' } : t === 'Administration' ? { shot: 'admin' } : {});
}
await home(); await click('Plus', '.h2-tabs'); await wait(400);
await p.type('.plus-search input', 'regles'); await wait(400);
report.push(`  recherche « regles » → ${await p.evaluate(() => [...document.querySelectorAll('.plus-grid button')].map((b) => b.textContent).join(', '))}`);
await p.screenshot({ path: `${OUT}/walk-${who}-plus-recherche.png` });

}
if (on('421')) {
// --- 421 classique --------------------------------------------------------------------------------
await home();
await step('421 classique', [['421 classique', '.mm-modes']], { shot: `421-${W}` });
const in421 = async () => { await home(); await click('421 classique', '.mm-modes'); await wait(900); };
for (const [t, sc] of [['Jouer contre l', null], ['Partie rapide', null], ['Tables en ligne', null], ['Tournoi', '.v2-events'], ['Patron', '.v2-events'], ['Défi du jour', '.v2-events'], ['Entre amis', '.cm-links'], ['Classement', '.cm-links'], ['Album', '.cm-links'], ['Partie guidée', '.cm-links'], ['Règles du 421', null]]) {
  await in421();
  await step(`421 › ${t}`, [sc ? [t, sc] : t]);
  if (t === 'Partie rapide') { await click('Quitter'); await wait(400); await click('Quitter'); }
}
// Partie contre l'ordinateur, puis retour au menu du 421.
await in421();
await step('421 › partie solo lancée', ['Jouer contre l', 900, "S'asseoir à la table", 2500], { shot: 'partie-421' });
await step('  quitter la partie', ['Quitter la partie', 600, ['Quitter', '.confirm-modal'], 1200]);
report.push(`  après la partie : menu du 421 ${await p.evaluate(() => !!document.querySelector('.classic-menu')) ? 'oui' : 'NON'}`);
await in421(); await step('421 › ← Menu', ['Retour au menu principal']);
report.push(`  menu principal : ${(await state()).main ? 'oui' : 'NON'}`);

}
if (on('cf')) {
// --- Coups Fourrés ----------------------------------------------------------------------------------
const inCf = async () => { await home(); await click('Coups Fourrés', '.mm-modes'); await wait(1500); };
await inCf(); await step('Coups Fourrés', [], { shot: `cf-${W}` });
for (const t of ['Partie classée', 'Contre l’ordinateur', 'Entre amis', 'L’énigme du jour', 'Tournoi du samedi', 'Mes decks', 'Boosters', 'Mes cartes', 'Missions', 'Classement', 'Apprendre', 'Règles de Coups Fourrés']) {
  await inCf(); await step(`CF › ${t}`, [[t, '.cf-menu']], t === 'Apprendre' ? { shot: 'cf-apprendre' } : {});
}
await inCf();
await step('CF › partie contre l’ordinateur', [['Contre l’ordinateur', '.cf-menu'], 700, ['Jouer avec', '.sheet'], 1200, () => click('Jouer directement', '.confirm-modal'), 3500], { shot: 'partie-cf' });
await step('  quitter la partie', ['Quitter la partie', 600, ['Quitter', '.confirm-modal'], 1500]);
report.push(`  après la partie : menu de Coups Fourrés ${await p.evaluate(() => !!document.querySelector('.cf-menu')) ? 'oui' : 'NON'}`);
await inCf(); await step('CF › ← Menu', ['Retour au menu principal']);
report.push(`  menu principal : ${(await state()).main ? 'oui' : 'NON'}`);

}
if (on('court')) {
// --- Le Courtisan -----------------------------------------------------------------------------------
const inCo = async () => { await home(); await click('Le Courtisan', '.mm-modes'); await wait(1200); };
await inCo(); await step('Courtisan', [], { shot: `court-${W}` });
for (const t of ['Contre l’ordinateur', 'Partie rapide', 'Ouvrir une table', 'Statistiques', 'Règles du Courtisan', acc ? 'Historique' : 'Sacs de dés']) {
  await inCo(); await step(`Courtisan › ${t}`, [[t, '.dm-menu']]);
}
await inCo();
await step('Courtisan › partie lancée', [['Contre l’ordinateur', '.dm-menu'], 800, ['S’asseoir à la table'], 2500], { shot: 'partie-court' });
await step('  quitter la partie', ['Quitter la partie', 600, ['Quitter', '.confirm-modal'], 1500, 'Retour']);
report.push(`  après la partie : menu du Courtisan ${await p.evaluate(() => !!document.querySelector('.dm-menu')) ? 'oui' : 'NON'}`);
await inCo(); await step('Courtisan › ← Menu', ['Retour au menu principal']);
report.push(`  menu principal : ${(await state()).main ? 'oui' : 'NON'}`);

}
if (on('liens')) {
// --- Liens directs ----------------------------------------------------------------------------------
for (const l of ['/?mode=cartes', '/?mode=courtisan', '/?defi', '/?tournois', '/?notifs', '/?rejoindre=ZZZZZ', '/?courtisan=ZZZZZ', '/?cf-tournoi']) {
  await p.goto(URL + l, { waitUntil: 'networkidle2' }); await wait(1500);
  report.push(`lien ${l} → ${(await state()).heads}`);
}

}
console.log('ERREURS', errs.length ? errs : 'aucune');
await b.close();
