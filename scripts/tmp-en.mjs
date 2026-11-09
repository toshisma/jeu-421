import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const BASE = process.argv[2];
const SHOT = process.argv[3];
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--no-sandbox'] });
const FR = /\b(Vous|vous|votre|Jouer|Partie|partie|Relancer|Encaisser|Lancer|Retour|Quitter|Réglages|Règles|Accueil|Amis|Boutique|Adversaires|Niveau|Mise|gratuit|Gratuit|ordinateur|Ordinateur|Ouvrir|Rejoindre|Connexion|Pseudo|Compte|compte|Tour|Rejouer|Plus tard|dés|joueurs|Lire|Statistiques|Historique|gagne|manche|prêt)\b/;
const OK = /Coups Fourrés|Dédé|Gégé|Le Courtisan|Courtisan|Groschen|Kingdom/;
function frenchLines(text) {
  return text.split('\n').map((l) => l.trim()).filter(Boolean).filter((l) => FR.test(l.replace(OK, '')));
}
async function dump(page, label, sink) {
  await page.waitForTimeout(250);
  const t = await page.evaluate(() => document.body.innerText);
  const bad = frenchLines(t);
  if (bad.length) sink.push(`[${label}] ` + bad.join(' | '));
  const of = await page.evaluate(() => ({ w: document.documentElement.scrollWidth, cw: innerWidth, bw: document.body.scrollWidth }));
  if (of.w > of.cw + 1 || of.bw > of.cw + 1) sink.push(`[${label}] DEBORDEMENT ${JSON.stringify(of)}`);
  return t;
}
const ctx = (locale, extra = {}) => browser.newContext({ locale, viewport: { width: 360, height: 640 }, hasTouch: true, isMobile: true, ...extra });
const results = [];
const issues = [];
const log = (...a) => { const s = a.join(' '); results.push(s); console.log(s); };

// --- fr-BE
{
  const c = await ctx('fr-BE'); const p = await c.newPage();
  await p.goto(BASE + '/'); await p.waitForTimeout(1200);
  const t = await p.evaluate(() => document.body.innerText);
  const of = await p.evaluate(() => [document.documentElement.scrollWidth, innerWidth, document.documentElement.scrollHeight, innerHeight]);
  log('fr-BE / lang=', await p.evaluate(() => document.documentElement.lang), 'overflow', of.join(','), 'Accueil:', /Accueil/.test(t), 'Courtisan:', /Courtisan/.test(t), 'pas de note EN:', !/English/.test(t));
  await p.screenshot({ path: `${SHOT}/fr-home.png` });
  await p.goto(BASE + '/?mode=courtisan'); await p.waitForTimeout(1000);
  const t2 = await p.evaluate(() => document.body.innerText);
  log('fr-BE courtisan francais:', /Contre l’ordinateur/.test(t2) && /Partie rapide/.test(t2), 'EN absent:', !/Against the computer/.test(t2), 'switch visible:', await p.locator('.lang-switch').first().isVisible(), 'html', await p.evaluate(() => document.documentElement.lang));
  // navigateur allemand
  await c.close();
  const d = await ctx('de-DE'); const dp = await d.newPage();
  await dp.goto(BASE + '/?mode=courtisan'); await dp.waitForTimeout(800);
  log('de-DE courtisan francais:', /Contre l’ordinateur/.test(await dp.evaluate(() => document.body.innerText)));
  await d.close();
}
// --- en-US a l'accueil : francais ; puis Courtisan : anglais
{
  const c = await ctx('en-US'); const p = await c.newPage();
  await p.goto(BASE + '/'); await p.waitForTimeout(1200);
  const t = await p.evaluate(() => document.body.innerText);
  log('en-US / accueil fr:', /Accueil/.test(t) && !/Against/.test(t), 'html', await p.evaluate(() => document.documentElement.lang));
  await p.getByText(/Courtisan/).first().click().catch(() => {});
  await p.waitForTimeout(1000);
  const t2 = await p.evaluate(() => document.body.innerText);
  log('en-US entre dans le Courtisan => anglais:', /Against the computer/.test(t2), 'url', p.url());
  await c.close();
}
// --- ?lang=fr sur en-US
{
  const c = await ctx('en-US'); const p = await c.newPage();
  await p.goto(BASE + '/?mode=courtisan&lang=fr'); await p.waitForTimeout(800);
  log('en-US ?lang=fr francais:', /Contre l’ordinateur/.test(await p.evaluate(() => document.body.innerText)));
  await p.goto(BASE + '/?rejoindre=ABCDE&lang=en'); await p.waitForTimeout(800);
  log('?rejoindre + lang ne casse rien:', await p.evaluate(() => document.body.innerText.length > 20));
  await c.close();
}
// --- partie complete en anglais
{
  const c = await ctx('en-US'); const p = await c.newPage();
  const errors = []; p.on('pageerror', (e) => errors.push(String(e)));
  await p.goto(BASE + '/?mode=courtisan&lang=en'); await p.waitForTimeout(1500);
  log('url apres lien', p.url());
  await dump(p, 'menu', issues); await p.screenshot({ path: `${SHOT}/en-menu.png` });
  await p.getByRole('button', { name: /Rules/ }).first().click(); await p.waitForTimeout(400);
  await dump(p, 'regles', issues); await p.screenshot({ path: `${SHOT}/en-rules.png` });
  await p.locator('.sheet-head button').click(); await p.waitForTimeout(300);
  await p.getByRole('button', { name: /Against the computer/ }).click(); await p.waitForTimeout(500);
  await dump(p, 'setup', issues); await p.screenshot({ path: `${SHOT}/en-setup.png` });
  await p.getByRole('button', { name: /^2,000/ }).first().click().catch(() => {}); await p.waitForTimeout(150);
  await p.getByRole('button', { name: /Take a seat/ }).click(); await p.waitForTimeout(1500);
  let quitShown = false;
  const t0 = Date.now(); let iter = 0;
  while (Date.now() - t0 < 400000) {
    iter++;
    if (await p.locator('.dm-end').count()) break;
    await p.waitForTimeout(250);
    const roll = p.getByRole('button', { name: /Roll all 6 dice/ });
    if (await roll.count()) { await dump(p, 'partie', issues); if (iter > 2 && !quitShown) {
        // confirmation de quitter
        await p.locator('.dm-top .icon-btn').first().click(); await p.waitForTimeout(250); await dump(p, 'quitter', issues); await p.screenshot({ path: `${SHOT}/en-quit.png` });
        await p.locator('.confirm-card button').first().click(); await p.waitForTimeout(200); quitShown = true; }
      await roll.click().catch(() => {}); await p.waitForTimeout(400); continue; }
    const all = p.getByRole('button', { name: /All scoring dice/ });
    if (await all.count()) { await p.screenshot({ path: `${SHOT}/en-game.png` }); await dump(p, 'partie2', issues); await all.click().catch(() => {}); await p.waitForTimeout(250); await p.getByRole('button', { name: /^Bank/ }).click({ timeout: 2000 }).catch(() => {}); await p.waitForTimeout(400); continue; }
  }
  await p.waitForTimeout(1200);
  log('fin de partie atteinte:', !!(await p.locator('.dm-end').count()), 'apres', Math.round((Date.now() - t0) / 1000), 's');
  await dump(p, 'fin', issues); await p.screenshot({ path: `${SHOT}/en-end.png` });
  await p.waitForTimeout(4200); // fenetre invite
  const invited = await p.locator('.gi-card').count();
  log('invitation compte:', invited);
  if (invited) { await dump(p, 'invite', issues); await p.screenshot({ path: `${SHOT}/en-invite.png` }); await p.getByRole('button', { name: /Later/ }).click(); await p.waitForTimeout(300); }
  await p.getByRole('button', { name: /^Back/ }).first().click().catch(() => {}); await p.waitForTimeout(600);
  // barre du bas + Plus
  await p.getByRole('button', { name: /^More/ }).first().click(); await p.waitForTimeout(500);
  await dump(p, 'plus', issues); await p.screenshot({ path: `${SHOT}/en-plus.png` });
  await p.locator('.sheet-head button').click(); await p.waitForTimeout(300);
  // compte : inscription / connexion / erreur
  await p.locator('.dm-play').first().waitFor({ timeout: 3000 }).catch(() => {});
  const cta = p.locator('.dm-gr-cta');
  if (await cta.count()) { await cta.first().click(); await p.waitForTimeout(600); await dump(p, 'inscription', issues); await p.screenshot({ path: `${SHOT}/en-register.png` });
    await p.getByRole('tab', { name: /I have an account/ }).click(); await p.waitForTimeout(250);
    await p.locator('input[autocomplete="username"]').fill('nobodyhere12'); await p.locator('input[type="password"]').fill('wrongpassword1');
    await p.keyboard.press('Enter'); await p.waitForTimeout(800);
    const t = await dump(p, 'connexion', issues); log('erreur connexion anglaise:', /Wrong username/.test(t)); await p.screenshot({ path: `${SHOT}/en-login.png` });
    await p.getByLabel('Back').first().click(); await p.waitForTimeout(500);
    log('retour compte -> Courtisan:', /Against the computer/.test(await p.evaluate(() => document.body.innerText)));
  }
  // table en ligne
  await p.getByRole('button', { name: /Open a table/ }).first().click(); await p.waitForTimeout(500);
  await dump(p, 'setup-ligne', issues);
  await p.getByRole('button', { name: /Open the table/ }).click(); await p.waitForTimeout(1500);
  const lobby = await dump(p, 'salon', issues); await p.screenshot({ path: `${SHOT}/en-lobby.png` });
  log('salon anglais:', /Invite only|Waiting|Start the game/.test(lobby));
  await p.getByRole('button', { name: /Add a computer/ }).click().catch(() => {}); await p.waitForTimeout(800);
  await dump(p, 'salon2', issues);
  await p.getByRole('button', { name: /Start the game/ }).click().catch(() => {}); await p.waitForTimeout(2500);
  await dump(p, 'partie en ligne', issues); await p.screenshot({ path: `${SHOT}/en-online.png` });
  // réglages
  await p.goto(BASE + '/?lang=en'); await p.waitForTimeout(1000);
  const h = await dump(p, 'accueil-en', issues); await p.screenshot({ path: `${SHOT}/en-home.png` });
  log('accueil en: note', /Play The Courtier/.test(h), 'scrollH', await p.evaluate(() => [document.documentElement.scrollHeight, innerHeight].join('/')));
  log('erreurs JS:', errors.length, errors.slice(0, 3).join(' ; '));
  await c.close();
}
// --- choix enregistre
{
  const c = await ctx('fr-BE'); const p = await c.newPage();
  await p.goto(BASE + '/?mode=courtisan'); await p.waitForTimeout(800);
  await p.locator('.lang-switch button', { hasText: 'EN' }).first().click(); await p.waitForTimeout(300);
  log('fr-BE, clic EN => anglais:', /Against the computer/.test(await p.evaluate(() => document.body.innerText)));
  await p.goto(BASE + '/?lang=fr'); await p.waitForTimeout(600); await p.goto(BASE + '/?mode=courtisan'); await p.waitForTimeout(800);
  log('choix enregistre garde EN:', /Against the computer/.test(await p.evaluate(() => document.body.innerText)));
  await c.close();
}
log('--- texte francais residuel ---');
for (const i of [...new Set(issues)]) log(i);
await browser.close();
