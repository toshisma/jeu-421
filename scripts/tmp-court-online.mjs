// Essai navigateur du Courtisan en ligne (temporaire) : node scripts/tmp-court-online.mjs URL DOSSIER [largeur hauteur]
import puppeteer from 'puppeteer-core';
const URL_ = process.argv[2] || 'http://localhost:3041';
const OUT = process.argv[3];
const W = Number(process.argv[4] || 360), H = Number(process.argv[5] || 640);
const tag = `${W}x${H}`;
const w = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];
const log = (...a) => console.log(...a);
async function register(name) {
  const r = await fetch(`${URL_}/api/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: name, password: 'motdepasse1' }) });
  const j = await r.json();
  if (!j.token) throw new Error(JSON.stringify(j));
  return { token: j.token, username: name };
}
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
async function page(acc, avatar) {
  const ctx = await b.createBrowserContext();
  const p = await ctx.newPage();
  await p.setViewport({ width: W, height: H, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  p.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|WebGL/.test(m.text())) errors.push(`console: ${m.text()}`); });
  await p.evaluateOnNewDocument((acc, avatar) => {
    localStorage.setItem('421.settings', JSON.stringify({ name: acc ? acc.username : 'Invité', avatar, volume: 0, muted: true, quality: 'low' }));
    if (acc) localStorage.setItem('421.compte', JSON.stringify(acc));
  }, acc, avatar);
  return p;
}
const click = (p, t, sel = 'button') => p.evaluate((t, sel) => { const x = [...document.querySelectorAll(sel)].find((x) => x.textContent.includes(t) && !x.disabled && x.offsetParent !== null); x?.click(); return !!x; }, t, sel);
const text = (p) => p.evaluate(() => document.body.innerText);
async function until(p, fn, ms = 20000, arg) { const t = Date.now(); while (Date.now() - t < ms) { if (await p.evaluate(fn, arg)) return true; await w(150); } return false; }
const overflow = (p) => p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
const shot = async (p, name) => { await p.screenshot({ path: `${OUT}/${tag}-${name}.png` }); if (await overflow(p)) errors.push(`débordement horizontal : ${name}`); };

/** Joue mon tour s'il le faut. Renvoie true si quelque chose a été cliqué. */
async function play(p) {
  return p.evaluate(() => {
    const btn = (t) => [...document.querySelectorAll('button')].find((x) => x.textContent.includes(t) && !x.disabled && x.offsetParent !== null);
    const go = btn('Lancer les 6 dés');
    if (go) { go.click(); return 'lancer'; }
    const all = btn('Tout ce qui rapporte');
    if (all) { all.click(); return 'choix'; }
    const bank = btn('Encaisser');
    const roll = btn('Relancer') || btn('Main pleine');
    if (bank && roll) {
      const total = Number((bank.textContent.match(/\+([\d\s  ]+)/)?.[1] ?? '0').replace(/\D/g, ''));
      const dice = Number(roll.textContent.match(/\((\d)/)?.[1] ?? 6);
      if (total >= 350 && dice <= 3 || total >= 1000) bank.click(); else roll.click();
      return 'action';
    }
    return null;
  });
}
const ended = (p) => p.evaluate(() => !!document.querySelector('.dm-end'));

try {
  const uniq = Date.now().toString(36).slice(-4);
  const A = await register(`Alice${uniq}`), B = await register(`Bruno${uniq}`);
  const pa = await page(A, '🦊'), pb = await page(B, '🐻');
  await pa.goto(URL_, { waitUntil: 'domcontentloaded' }); await w(3000);
  await shot(pa, '01-accueil');
  log('accueil défile ?', await pa.evaluate(() => document.querySelector('.h2-main')?.scrollHeight > document.querySelector('.h2-main')?.clientHeight));
  await click(pa, 'Courtisan', '.ms-tab');
  await until(pa, () => !!document.querySelector('.gr-gift'), 8000);
  await w(700);
  await shot(pa, '02-cadeau');
  await pa.evaluate(() => document.querySelector('.gr-gift')?.click()); await w(300);
  await shot(pa, '03-mode-solo');
  await click(pa, 'En ligne');
  await w(300);
  await shot(pa, '04-mode-en-ligne');
  // Mise tapée : 5 Groschen, puis ouvrir la table.
  await pa.evaluate(() => { const i = [...document.querySelectorAll('.dm-stake-input input')].pop(); i.scrollIntoView(); });
  const inputs = await pa.$$('.dm-stake-input input');
  await inputs[inputs.length - 1].type('5');
  await w(200);
  await pa.evaluate(() => { const b = [...document.querySelectorAll('button')].filter((x) => x.textContent.includes('2 000')); b[b.length - 1].click(); });
  await w(200);
  await click(pa, 'Ouvrir la table');
  await until(pa, () => /code [A-Z0-9]{5}/.test(document.body.innerText));
  const code = (await text(pa)).match(/code ([A-Z0-9]{5})/)[1];
  log('table', code);
  await w(500);
  await shot(pa, '05-salon-hote');
  await pb.goto(`${URL_}/?courtisan=${code}`, { waitUntil: 'domcontentloaded' });
  await until(pb, () => document.body.innerText.includes('Je suis prêt'), 15000);
  await w(800);
  await pb.evaluate(() => document.querySelector('.gr-gift')?.click()); await w(300);
  await shot(pb, '06-salon-invite');
  await click(pb, 'Je suis prêt');
  await until(pa, () => [...document.querySelectorAll('button')].some((x) => x.textContent.includes('Lancer la partie') && !x.disabled));
  await shot(pa, '07-salon-pret');
  await click(pa, 'Lancer la partie');
  await until(pa, () => !!document.querySelector('.dm-game'), 15000);
  await until(pb, () => !!document.querySelector('.dm-game'), 15000);
  await w(2500);
  await shot(pa, '08-partie-2');
  // Partie jusqu'au bout (objectif 4 000).
  let k = 0, shotMid = false;
  const t0 = Date.now();
  while (!(await ended(pa) && await ended(pb)) && Date.now() - t0 < 600_000) {
    const ra = await play(pa), rb = await play(pb);
    if ((ra || rb) && ++k === 12 && !shotMid) { await w(900); await shot(pa, '09-partie-2-milieu'); await shot(pb, '09b-partie-2-autre'); shotMid = true; }
    await w(ra || rb ? 350 : 250);
  }
  await w(800);
  log('fin à 2 :', await ended(pa), await ended(pb), `${k} actions`);
  await shot(pa, '10-fin-2');
  await shot(pb, '10b-fin-2');
  log((await pa.evaluate(() => document.querySelector('.dm-end')?.innerText)).replace(/\n/g, ' | '));

  // Table à 6 : revanche, l'hôte ajoute 4 ordinateurs.
  await click(pa, 'Revanche');
  await until(pa, () => document.body.innerText.includes('Ajouter un ordinateur'), 10000);
  // Mise remise à gratuit pour aller vite, objectif 2 000.
  await click(pa, 'Gratuit'); await w(300);
  await click(pa, '2 000'); await w(300);
  for (let i = 0; i < 4; i++) { await click(pa, 'Ajouter un ordinateur'); await w(300); }
  await until(pb, () => document.body.innerText.includes('Je suis prêt'), 8000);
  await click(pb, 'Je suis prêt');
  await w(500);
  await shot(pa, '11-salon-6');
  await until(pa, () => [...document.querySelectorAll('button')].some((x) => x.textContent.includes('Lancer la partie') && !x.disabled));
  await click(pa, 'Lancer la partie');
  await until(pa, () => !!document.querySelector('.dm-game'), 15000);
  await w(3000);
  await shot(pa, '12-partie-6');
  k = 0;
  const t1 = Date.now();
  let shot6 = false;
  while (!(await ended(pa)) && Date.now() - t1 < 900_000) {
    const ra = await play(pa), rb = await play(pb);
    if (!shot6 && Date.now() - t1 > 25_000) { await shot(pa, '13-partie-6-milieu'); await shot(pb, '13b-partie-6-autre'); shot6 = true; }
    if (ra || rb) k++;
    await w(300);
  }
  await w(1500);
  log('fin à 6 :', await ended(pa), `${k} actions`);
  await shot(pa, '14-fin-6');
  const bal = async (acc) => (await (await fetch(`${URL_}/api/dixmille/wallet`, { headers: { Authorization: `Bearer ${acc.token}` } })).json()).balance;
  log('soldes', await bal(A), await bal(B));
  // Contre l'ordinateur avec mise (jouée par le serveur), puis gratuite (sur l'appareil).
  await pa.goto(URL_, { waitUntil: 'domcontentloaded' }); await w(2500);
  await click(pa, 'Courtisan', '.ms-tab'); await w(1500);
  await pa.evaluate(() => document.querySelector('.gr-gift')?.click()); await w(300);
  await click(pa, 'Contre l’ordinateur'); await w(300);
  await click(pa, '2 000'); await w(200);
  const si = await pa.$$('.dm-stake-input input');
  await si[0].type('5'); await w(300);
  await shot(pa, '15-solo-mise');
  await click(pa, 'Miser 5');
  await until(pa, () => !!document.querySelector('.dm-game'), 15000);
  await w(2500);
  await shot(pa, '16-solo-mise-partie');
  const t2 = Date.now();
  while (!(await ended(pa)) && Date.now() - t2 < 600_000) { await play(pa); await w(300); }
  await w(1500);
  await shot(pa, '17-solo-mise-fin');
  log('solo avec mise :', (await pa.evaluate(() => document.querySelector('.dm-end')?.innerText ?? '')).replace(/\n/g, ' | '));
  log('solde après solo', await bal(A));
  await click(pa, 'Rejouer'); await w(800);
  await click(pa, 'Gratuit'); await w(300);
  await click(pa, 'S’asseoir à la table');
  await until(pa, () => !!document.querySelector('.dm-game'), 15000);
  for (let i = 0; i < 12; i++) { await play(pa); await w(700); }
  await shot(pa, '18-solo-gratuit');
} catch (e) { errors.push(`exception: ${e.stack}`); }
log(errors.length ? `ERREURS:\n${errors.join('\n')}` : 'aucune erreur');
await b.close();
