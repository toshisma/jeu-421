/**
 * ALARME RÉFÉRENCEMENT, dans un vrai navigateur : l'accueil et les pages d'aide françaises tels que les voit Google.
 * Usage : npm run check:seo           (construit le jeu, lance un serveur local, vérifie, s'arrête)
 *         node scripts/check-google-view.mjs --no-build   (sans reconstruire)
 *         node scripts/check-google-view.mjs --url https://421online.com   (site en ligne, sans serveur local)
 * Sort en erreur (code 1) si un critère échoue. Chrome : /usr/bin/google-chrome (ou CHROME_PATH).
 *
 * Critères (Googlebot, navigateur en anglais puis en allemand, après exécution du JavaScript) :
 *  - <html lang="fr">, titre et h1 contenant « 421 en ligne », aucun mot anglais/allemand dans le h1 ;
 *  - meta description française, canonique https://421online.com/ ;
 *  - aucun bandeau de langue, et l'accueil du jeu affiché en français (« 421 classique ») ;
 *  - pages d'aide : lang fr, canonique, h1, description française ; « Le 421 en chiffres » rempli par le serveur
 *    dans le HTML lui-même (lisible sans JavaScript).
 * Contrôle rapide de la même logique sans navigateur : tests/google-view.test.ts (dans npx vitest run).
 */
import puppeteer from 'puppeteer-core';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
const remote = args.includes('--url') ? args[args.indexOf('--url') + 1] : null;
const PORT = Number(process.env.CHECK_SEO_PORT) || 3601;
const BASE = remote ?? `http://localhost:${PORT}`;
const CHROME = process.env.CHROME_PATH || '/usr/bin/google-chrome';
const GOOGLEBOT = 'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.6478.126 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const HUMAN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const FOREIGN = /\b(the|free|games?|play|with|friends|multiplayer|dice game|kostenlos|Würfelspiel|spielen)\b/i;
const PAGES = ['regles-du-421', 'jouer-au-421-en-ligne', 'combinaisons-du-421', 'variantes-du-421', 'le-421-en-chiffres'];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
/** Libellé « 421 classique » de l'accueil dans chaque langue (lu dans les fichiers de traduction). */
const homeLabel = Object.fromEntries(['fr', 'en', 'de', 'nl'].map((l) => [l,
  /"app\.421_classique":\s*"([^"]+)"/.exec(readFileSync(join(process.cwd(), 'shared', 'i18n', 'zones', `commun.${l}.ts`), 'utf8'))?.[1]]));

const failures = [];
const check = (ok, what) => { console.log(`${ok ? '  ok ' : '  ÉCHEC'}  ${what}`); if (!ok) failures.push(what); };

let server = null;
let dbDir = null;
async function startLocal() {
  if (!args.includes('--no-build')) {
    console.log('Construction du jeu (npm run build)…');
    const b = spawnSync('npm', ['run', 'build'], { stdio: 'inherit' });
    if (b.status !== 0) { console.error('La construction a échoué.'); process.exit(1); }
  }
  dbDir = mkdtempSync(join(tmpdir(), 'check-seo-'));
  server = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', '--import', 'tsx', 'server/index.ts'], {
    env: { ...process.env, PORT: String(PORT), DATABASE_PATH: join(dbDir, 'seo.sqlite'), NODE_ENV: 'development' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', () => {});
  server.stderr.on('data', (d) => { if (/EADDRINUSE/.test(String(d))) { console.error(`Port ${PORT} déjà pris (CHECK_SEO_PORT=… pour en choisir un autre).`); } });
  for (let i = 0; i < 120; i++) {
    try { if ((await fetch(`${BASE}/`)).ok) return; } catch { /* pas encore prêt */ }
    await wait(250);
  }
  throw new Error('Le serveur local ne répond pas.');
}
function stopLocal() {
  if (server && server.exitCode === null) server.kill('SIGTERM'); // tué par son PID, jamais pkill
  if (dbDir) rmSync(dbDir, { recursive: true, force: true });
}

async function main() {
  if (!remote) await startLocal();
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: true,
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  const open = async (ua, language) => {
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    await page.setUserAgent(ua);
    await page.setExtraHTTPHeaders({ 'Accept-Language': `${language},${language.slice(0, 2)};q=0.9` });
    await page.evaluateOnNewDocument((l) => {
      Object.defineProperty(navigator, 'language', { get: () => l });
      Object.defineProperty(navigator, 'languages', { get: () => [l, l.slice(0, 2)] });
    }, language);
    await page.setViewport({ width: 412, height: 915, isMobile: true });
    return { page, ctx };
  };
  const facts = (page) => page.evaluate(() => ({
    lang: document.documentElement.lang,
    title: document.title,
    h1: [...document.querySelectorAll('h1')].map((h) => h.textContent.replace(/\s+/g, ' ').trim()),
    desc: document.querySelector('meta[name="description"]')?.getAttribute('content') ?? '',
    canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? '',
    hint: document.querySelectorAll('.lang-hint').length,
    text: document.body.innerText,
  }));

  try {
    // 1. Accueil, rendu complet du jeu, comme Googlebot (navigateur en anglais, puis en allemand).
    for (const language of ['en-US', 'de-DE']) {
      console.log(`\nAccueil / — Googlebot, navigateur ${language}`);
      const raw = await (await fetch(`${BASE}/`, { headers: { 'User-Agent': GOOGLEBOT, 'Accept-Language': language } })).text();
      check(/<html lang="fr">/.test(raw), 'HTML reçu : <html lang="fr">');
      const { page, ctx } = await open(GOOGLEBOT, language);
      await page.goto(`${BASE}/`, { waitUntil: 'load', timeout: 60000 });
      let rendered = false;
      try { await page.waitForSelector('h1.mm-brand', { timeout: 30000 }); rendered = true; } catch { /* vérifié ci-dessous */ }
      await wait(1500);
      const f = await facts(page);
      check(rendered, 'le jeu s’affiche (accueil React rendu)');
      check(f.lang === 'fr', `lang="fr" après rendu (trouvé : "${f.lang}")`);
      check(f.title.includes('421 en ligne'), `titre avec « 421 en ligne » (${f.title})`);
      check(f.h1.length > 0 && f.h1.every((h) => h.includes('421 en ligne')), `h1 avec « 421 en ligne » (${f.h1.join(' | ')})`);
      check(f.h1.every((h) => !FOREIGN.test(h.replace(/421online/g, ''))), 'aucun mot étranger dans le h1');
      check(/Jouez|jeu de dés|gratuit/.test(f.desc) && !FOREIGN.test(f.desc), 'meta description française');
      check(f.canonical === 'https://421online.com/', `canonique https://421online.com/ (${f.canonical})`);
      check(f.hint === 0, 'aucun bandeau de langue');
      check(f.text.includes(homeLabel.fr) && !['en', 'de', 'nl'].some((l) => homeLabel[l] !== homeLabel.fr && f.text.includes(homeLabel[l])),
        `accueil du jeu en français (« ${homeLabel.fr} »)`);
      await ctx.close();
    }

    // 2. Un visiteur humain anglophone : toujours le français, la langue lui est seulement proposée.
    console.log('\nAccueil / — visiteur humain, navigateur en-US');
    {
      const { page, ctx } = await open(HUMAN, 'en-US');
      await page.goto(`${BASE}/`, { waitUntil: 'load', timeout: 60000 });
      try { await page.waitForSelector('h1.mm-brand', { timeout: 30000 }); } catch { /* */ }
      const f = await facts(page);
      check(f.lang === 'fr', `reste en français (lang="${f.lang}")`);
      await ctx.close();
    }

    // 3. Pages d'aide françaises.
    for (const slug of PAGES) {
      console.log(`\n/${slug} — Googlebot, navigateur en-US`);
      const raw = await (await fetch(`${BASE}/${slug}`, { headers: { 'User-Agent': GOOGLEBOT, 'Accept-Language': 'en-US' } })).text();
      check(/<html lang="fr">/.test(raw), 'HTML reçu : <html lang="fr">');
      if (slug === 'le-421-en-chiffres') check(raw.includes('<h2 id="parties">') && !raw.includes('Les chiffres sont calculés par le serveur du jeu.'), 'chiffres présents dans le HTML (sans JavaScript)');
      const { page, ctx } = await open(GOOGLEBOT, 'en-US');
      await page.goto(`${BASE}/${slug}`, { waitUntil: 'load', timeout: 60000 });
      const f = await facts(page);
      check(f.lang === 'fr', 'lang="fr"');
      check(f.canonical === `https://421online.com/${slug}`, `canonique (${f.canonical})`);
      check(f.h1.length === 1 && !FOREIGN.test(f.h1[0]), `un h1 en français (${f.h1.join(' | ')})`);
      check(f.desc.length > 50 && !FOREIGN.test(f.desc), 'meta description française');
      check(f.hint === 0, 'aucun bandeau de langue');
      await ctx.close();
    }
  } finally {
    await browser.close();
    stopLocal();
  }
  if (failures.length) {
    console.error(`\n✗ ${failures.length} critère(s) en échec : Google ne verrait pas le site en français.`);
    process.exit(1);
  }
  console.log('\n✓ Google voit l’accueil et les pages d’aide en français.');
}

main().catch((e) => { console.error(e); stopLocal(); process.exit(1); });
