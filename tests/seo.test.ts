/** Référencement : adresses uniques (redirections), vraies erreurs 404, domaine officiel, pages d'aide. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { request } from 'node:http';
import { canonicalHostRedirect, canonicalPath, isAppPath, serveClient } from '../server/static';
import { cfModeParam } from '../client/src/cfLink';
import { CARDS } from '../shared/cards/catalog';
import { DM_TARGETS, kindValue } from '../shared/dixmille/engine';
import { CARDS as CF_CARDS, CF_RULES, DECK_RULES } from '../shared/cards/catalog';
import { DEFAULT_CONFIG } from '../shared/config';
// @ts-expect-error script Node sans déclaration de types
import { DISCLAIMERS, I18N_GROUPS, V421 } from '../scripts/seo-i18n-common.mjs';
// @ts-expect-error script Node sans déclaration de types
import { POKER, POKER_GROUPS, POKER_HAND_IDS, POKER_HANDS_FR, POKER_ODDS, pokerCategory } from '../scripts/seo-poker-pages.mjs';

describe('adresses canoniques', () => {
  const exists = (n: string) => n === 'regles-du-421.html';
  it('.html et barre finale → adresse propre ; le reste inchangé', () => {
    expect(canonicalPath('/regles-du-421.html', exists)).toBe('/regles-du-421');
    expect(canonicalPath('/regles-du-421/', exists)).toBe('/regles-du-421');
    expect(canonicalPath('/index.html', exists)).toBe('/');
    expect(canonicalPath('/regles-du-421', exists)).toBeNull();
    expect(canonicalPath('/inconnue.html', exists)).toBeNull();
    expect(canonicalPath('/', exists)).toBeNull();
    expect(isAppPath('/')).toBe(true);
    expect(isAppPath('/confidentialite')).toBe(true);
    expect(isAppPath('/nimporte')).toBe(false);
  });
});

describe('serveur de fichiers', () => {
  let base = '';
  let close: () => void;
  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), 'seo-'));
    writeFileSync(join(dir, 'index.html'), '<!doctype html><title>jeu</title>');
    writeFileSync(join(dir, 'regles-du-421.html'), '<!doctype html><title>règles</title>');
    writeFileSync(join(dir, 'coups-fourres.html'), '<!doctype html><title>Coups Fourrés</title>');
    const app = express();
    canonicalHostRedirect(app, '421online.com');
    app.get('/api/ping', (_q, r) => r.json({ ok: true }));
    serveClient(app, dir);
    const srv = app.listen(0);
    await new Promise((r) => srv.once('listening', r));
    base = `http://localhost:${(srv.address() as AddressInfo).port}`;
    close = () => srv.close();
  });
  afterAll(() => close());
  // fetch() ne laisse pas changer l'en-tête Host : requête HTTP brute.
  const get = (p: string, host?: string) => new Promise<{ status: number; headers: Map<string, string>; text: () => Promise<string> }>((ok, ko) => {
    const u = new URL(base + p);
    const r = request({ hostname: u.hostname, port: u.port, path: u.pathname + u.search, headers: host ? { Host: host } : {} }, (res) => {
      let body = ''; res.setEncoding('utf8'); res.on('data', (c) => { body += c; });
      res.on('end', () => ok({ status: res.statusCode ?? 0, headers: new Map(Object.entries(res.headers).map(([k, v]) => [k, String(v)])), text: async () => body }));
    });
    r.on('error', ko); r.end();
  });

  it('redirige les doublons et garde la requête', async () => {
    let r = await get('/regles-du-421.html?utm_source=x');
    expect(r.status).toBe(301);
    expect(r.headers.get('location')).toBe('/regles-du-421?utm_source=x');
    r = await get('/regles-du-421/');
    expect(r.headers.get('location')).toBe('/regles-du-421');
    expect((await get('/regles-du-421')).status).toBe(200);
  });

  it('adresse inconnue : 404 (le jeu s’affiche quand même), accueil et confidentialité : 200', async () => {
    const r = await get('/page-qui-n-existe-pas');
    expect(r.status).toBe(404);
    expect(await r.text()).toContain('<title>jeu</title>');
    expect((await get('/')).status).toBe(200);
    expect((await get('/?rejoindre=ABCDE')).status).toBe(200);
    expect((await get('/confidentialite')).status).toBe(200);
  });

  it('pages Coups Fourrés : servies, sans cache figé, doublons redirigés ; /?mode=cartes ouvre le jeu', async () => {
    const r = await get('/coups-fourres');
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toBe('no-cache');
    expect(await r.text()).toContain('Coups Fourrés');
    expect((await get('/coups-fourres.html')).headers.get('location')).toBe('/coups-fourres');
    expect((await get('/coups-fourres/')).headers.get('location')).toBe('/coups-fourres');
    const play = await get('/?mode=cartes');
    expect(play.status).toBe(200);
    expect(await play.text()).toContain('<title>jeu</title>');
    expect((await get('/coups-fourres-inconnue')).status).toBe(404);
  });

  it('domaine technique et www → domaine officiel, sauf API', async () => {
    let r = await get('/regles-du-421?a=1', 'jeu-421.onrender.com');
    expect(r.status).toBe(301);
    expect(r.headers.get('location')).toBe('https://421online.com/regles-du-421?a=1');
    r = await get('/', 'www.421online.com');
    expect(r.headers.get('location')).toBe('https://421online.com/');
    expect((await get('/api/ping', 'jeu-421.onrender.com')).status).toBe(200);
    expect((await get('/', '421online.com')).status).toBe(200);
  });
});

describe('pages d’aide générées', () => {
  const pub = join(process.cwd(), 'client', 'public');
  const pages = readdirSync(pub).filter((f) => f.endsWith('.html'));
  const html = Object.fromEntries(pages.map((f) => [f, readFileSync(join(pub, f), 'utf8')]));
  const one = (h: string, re: RegExp) => [...h.matchAll(re)].map((m) => m[1]);
  it('titre, description, canonique et h1 uniques ; JSON-LD valide ; liens internes existants', () => {
    expect(pages.length).toBeGreaterThanOrEqual(8);
    const seen = { title: new Set<string>(), desc: new Set<string>(), h1: new Set<string>() };
    for (const [f, h] of Object.entries(html)) {
      const [title] = one(h, /<title>([^<]+)<\/title>/g);
      const [desc] = one(h, /<meta name="description" content="([^"]+)"/g);
      const h1s = one(h, /<h1>([\s\S]*?)<\/h1>/g);
      expect(h1s).toHaveLength(1);
      expect(one(h, /<link rel="canonical" href="([^"]+)"/g)).toEqual([`https://421online.com/${f.replace(/\.html$/, '')}`]);
      for (const [k, v] of [['title', title], ['desc', desc], ['h1', h1s[0]]] as const) { expect(seen[k].has(v)).toBe(false); seen[k].add(v); }
      expect(desc.length).toBeLessThanOrEqual(165);
      for (const j of one(h, /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) expect(() => JSON.parse(j)).not.toThrow();
      for (const l of one(h, /href="\/([a-z0-9-]+)(?:#[^"]*)?"/g)) expect(l === 'confidentialite' || pages.includes(`${l}.html`)).toBe(true);
      for (const img of one(h, /<img ([^>]+)>/g)) { expect(img).toMatch(/alt="[^"]{10,}"/); expect(img).toMatch(/width="\d+" height="\d+"/); }
    }
    const sitemap = readFileSync(join(pub, 'sitemap.xml'), 'utf8');
    for (const f of pages) expect(sitemap).toContain(`<loc>https://421online.com/${f.replace(/\.html$/, '')}</loc>`);
  });
});

describe('pages Coups Fourrés', () => {
  const pub = join(process.cwd(), 'client', 'public');
  const read = (slug: string) => readFileSync(join(pub, `${slug}.html`), 'utf8');
  const ld = (h: string) => [...h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].flatMap((m) => JSON.parse(m[1])['@graph']);
  const slugs = ['coups-fourres', 'regles-coups-fourres', 'cartes-coups-fourres'];

  it('lien d’ouverture du mode : ?mode=cartes (et ?mode=coups-fourres)', () => {
    expect(cfModeParam('?mode=cartes')).toBe(true);
    expect(cfModeParam('?utm_source=x&mode=cartes')).toBe(true);
    expect(cfModeParam('?mode=coups-fourres')).toBe(true);
    expect(cfModeParam('?mode=solo')).toBe(false);
    expect(cfModeParam('')).toBe(false);
  });

  it('dans le plan du site, boutons « Jouer » vers le mode, image de partage dédiée, fil d’Ariane', () => {
    const sitemap = readFileSync(join(pub, 'sitemap.xml'), 'utf8');
    for (const slug of slugs) {
      const h = read(slug);
      expect(sitemap).toContain(`<loc>https://421online.com/${slug}</loc>`);
      expect(h).toContain('<a class="cta small" href="/?jouer=cartes" data-play>Jouer</a>');
      expect(h).toMatch(/class="cta" href="\/\?jouer=cartes" data-play>/);
      expect(h).toContain('<meta property="og:image" content="https://421online.com/og-coups-fourres.jpg">');
      const crumbs = ld(h).find((x) => x['@type'] === 'BreadcrumbList').itemListElement;
      expect(crumbs[0].item).toBe('https://421online.com/');
      expect(crumbs.at(-1).item).toBe(`https://421online.com/${slug}`);
      if (slug !== 'coups-fourres') expect(crumbs[1].item).toBe('https://421online.com/coups-fourres');
      // Toutes les images citées existent.
      for (const m of h.matchAll(/(?:src|content)="(?:https:\/\/421online\.com)?(\/(?:img|og-)[^"]+\.(?:webp|jpg|png))"/g)) expect(existsSync(join(pub, m[1]))).toBe(true);
    }
    // Les pages existantes renvoient vers le mode (maillage).
    for (const slug of ['jouer-au-421-en-ligne', 'jeu-multijoueur-navigateur', 'jeux-entre-amis-a-distance', 'jeux-de-des']) expect(read(slug)).toContain('href="/coups-fourres"');
  });

  it('données structurées exactes : jeu gratuit, navigateur, 1 à 4 joueurs ; FAQ identique au texte visible', () => {
    const h = read('coups-fourres');
    const game = ld(h).find((x) => x['@type'] === 'VideoGame');
    expect(game).toMatchObject({ name: 'Coups Fourrés', isAccessibleForFree: true, offers: { price: '0' }, numberOfPlayers: { minValue: 1, maxValue: 4 }, gamePlatform: ['Navigateur web'] });
    expect(game.aggregateRating).toBeUndefined(); // aucune note inventée
    for (const slug of slugs) {
      const page = read(slug);
      const g = ld(page);
      expect(g.find((x) => x['@type'] === 'Article').about['@id']).toBe('https://421online.com/coups-fourres#jeu');
      for (const q of g.find((x) => x['@type'] === 'FAQPage').mainEntity) expect(page).toContain(`<summary>${q.name}</summary>`);
    }
  });

  it('galerie : toutes les cartes, chacune avec son image, son texte alternatif et son effet', () => {
    const h = read('cartes-coups-fourres');
    for (const c of CARDS) {
      expect(existsSync(join(pub, 'img', 'cartes', `${c.id}.webp`))).toBe(true);
      expect(h).toContain(`<img src="/img/cartes/${c.id}.webp" width="230" height="322" alt="Carte « ${c.name} »`);
      expect(h).toContain(c.text);
    }
    expect([...h.matchAll(/<img /g)]).toHaveLength(CARDS.length);
    expect([...h.matchAll(/loading="lazy"/g)].length).toBeGreaterThanOrEqual(CARDS.length - 2);
  });
});

describe('pages Le Courtisan (Dix mille)', () => {
  const pub = join(process.cwd(), 'client', 'public');
  const read = (slug: string) => readFileSync(join(pub, `${slug}.html`), 'utf8');
  const ld = (h: string) => [...h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].flatMap((m) => JSON.parse(m[1])['@graph']);
  const slugs = ['dix-mille-en-ligne', 'regles-du-dix-mille', 'strategie-dix-mille', 'jeu-de-des-kingdom-come-deliverance-2'];

  it('valeurs recopiées dans les pages identiques au moteur', async () => {
    // @ts-expect-error script Node sans déclaration de types
    const page: { DM_TARGETS: number[]; kindValue: (f: number, n: number) => number } = await import('../scripts/seo-courtisan-pages.mjs');
    expect(page.DM_TARGETS).toEqual([...DM_TARGETS]);
    for (let f = 1; f <= 6; f++) for (let n = 1; n <= 6; n++) expect(page.kindValue(f, n)).toBe(kindValue(f, n));
  });

  it('plan du site, boutons « Jouer » vers le mode, image de partage, fil d’Ariane, titres courts', () => {
    const sitemap = readFileSync(join(pub, 'sitemap.xml'), 'utf8');
    for (const slug of slugs) {
      const h = read(slug);
      expect(sitemap).toContain(`<loc>https://421online.com/${slug}</loc>`);
      expect(h).toContain('<a class="cta small" href="/?jouer=courtisan" data-play>Jouer</a>');
      expect(h).toMatch(/class="cta" href="\/\?jouer=courtisan" data-play>/);
      expect(h).toContain('<meta property="og:image" content="https://421online.com/og-courtisan.jpg">');
      expect(h.match(/<title>([^<]+)<\/title>/)![1].length).toBeLessThanOrEqual(62);
      const crumbs = ld(h).find((x) => x['@type'] === 'BreadcrumbList').itemListElement;
      if (slug !== 'dix-mille-en-ligne') expect(crumbs[1].item).toBe('https://421online.com/dix-mille-en-ligne');
      expect(ld(h).find((x) => x['@type'] === 'Article').about['@id']).toBe('https://421online.com/dix-mille-en-ligne#jeu');
      for (const q of ld(h).find((x) => x['@type'] === 'FAQPage').mainEntity) expect(h).toContain(`<summary>${q.name}</summary>`);
      for (const m of h.matchAll(/(?:src|content)="(?:https:\/\/421online\.com)?(\/(?:img|og-)[^"]+\.(?:webp|jpg|png))"/g)) expect(existsSync(join(pub, m[1]))).toBe(true);
    }
    for (const slug of ['jeux-de-des', 'jeux-entre-amis-a-distance', 'jouer-au-421-en-ligne']) expect(read(slug)).toContain('href="/dix-mille-en-ligne"');
    const game = ld(read('dix-mille-en-ligne')).find((x) => x['@type'] === 'VideoGame');
    expect(game).toMatchObject({ name: 'Le Courtisan', isAccessibleForFree: true, offers: { price: '0' } });
    expect(game.aggregateRating).toBeUndefined();
  });

  it('page Kingdom Come: mention d’indépendance visible, aucune image, pas de dernier tour', () => {
    const h = read('jeu-de-des-kingdom-come-deliverance-2');
    expect(h).toContain('421online.com est un site indépendant, sans lien avec Warhorse Studios, Deep Silver ou Plaion ; Kingdom Come: Deliverance est une marque de ses propriétaires.');
    expect(h.indexOf('class="disclaimer"')).toBeLessThan(h.indexOf('<h2'));
    expect(h).not.toMatch(/<img /);
    for (const slug of slugs) expect(read(slug)).not.toMatch(/chacun des autres joue/);
  });
});

describe('pages anglaises', () => {
  const pub = join(process.cwd(), 'client', 'public');
  const read = (slug: string) => readFileSync(join(pub, `${slug}.html`), 'utf8');
  const ld = (h: string) => [...h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].flatMap((m) => JSON.parse(m[1])['@graph']);
  const pairs = [['dix-mille-en-ligne', 'play-farkle-online'], ['regles-du-dix-mille', 'farkle-rules'], ['jeu-de-des-kingdom-come-deliverance-2', 'kingdom-come-deliverance-2-dice-game']];
  const site = 'https://421online.com';
  const NOTICE = '421online.com is an independent website, not affiliated with Warhorse Studios, Deep Silver or Plaion; Kingdom Come: Deliverance is a trademark of its owners.';

  it('hreflang réciproques, x-default vers le français, sur les deux versions', () => {
    for (const [fr, en] of pairs) {
      for (const h of [read(fr), read(en)]) {
        expect(h).toContain(`<link rel="alternate" hreflang="fr" href="${site}/${fr}">`);
        expect(h).toContain(`<link rel="alternate" hreflang="en" href="${site}/${en}">`);
        expect(h).toContain(`<link rel="alternate" hreflang="x-default" href="${site}/${fr}">`);
      }
    }
    const home = readFileSync(join(process.cwd(), 'client', 'index.html'), 'utf8');
    expect(home).not.toContain('hreflang');
    expect(home).toContain('<link rel="canonical" href="https://421online.com/" />');
  });

  it('le HTML français ne contient de nouveau que les hreflang', () => {
    for (const [fr] of pairs) {
      const h = read(fr);
      expect(h.startsWith('<!doctype html>\n<html lang="fr">')).toBe(true);
      expect(h).toContain('<meta property="og:locale" content="fr_BE">');
      expect(h).not.toContain('og:locale" content="en_US');
      expect(h).toContain('Mis à jour le');
    }
    // Les pages françaises sans version anglaise n'ont aucun hreflang, et leur pied ne cite pas les pages anglaises.
    const other = read('strategie-421');
    expect(other).not.toContain('hreflang');
    expect(other).not.toContain('play-farkle-online');
    expect(other).toContain('<html lang="fr">');
  });

  it('lang, og:locale, boutons Jouer, navigation anglaise, données structurées', () => {
    for (const [, en] of pairs) {
      const h = read(en);
      expect(h.startsWith('<!doctype html>\n<html lang="en">')).toBe(true);
      expect(h).toContain('<meta property="og:locale" content="en_US">');
      expect(h).toContain('href="/?jouer=courtisan&amp;lang=en" data-play>Play</a>');
      expect(h).toContain('<h2 id="questions">Frequently asked questions</h2>');
      expect(h).toContain('aria-label="Breadcrumb"');
      expect(h).toContain('Updated <time');
      expect(h).not.toMatch(/Mis à jour|Questions fréquentes|À lire aussi/);
      const g = ld(h);
      expect(g.find((x) => x['@type'] === 'Article').inLanguage).toBe('en');
      for (const q of g.find((x) => x['@type'] === 'FAQPage').mainEntity) expect(h).toContain(`<summary>${q.name}</summary>`);
      expect(g.flatMap((x) => (x.aggregateRating || x.review ? [x] : []))).toHaveLength(0);
    }
    const game = ld(read('play-farkle-online')).find((x) => x['@type'] === 'VideoGame');
    expect(game).toMatchObject({ inLanguage: 'en', isAccessibleForFree: true, offers: { price: '0' }, numberOfPlayers: { minValue: 1, maxValue: 6 } });
    expect(game.aggregateRating).toBeUndefined();
  });

  it('valeurs conformes au moteur, mention d’indépendance, aucun nom du jeu vidéo', () => {
    const h = read('farkle-rules');
    for (const t of DM_TARGETS) expect(h).toContain(t.toLocaleString('en-US'));
    for (let f = 1; f <= 6; f++) for (const n of [3, 4, 5, 6]) expect(h).toContain(`<td>${kindValue(f, n).toLocaleString('en-US')}</td>`);
    expect(h).toContain('Straight 1–5');
    expect(h).toContain('>500<');
    expect(h).toContain('>750<');
    expect(h).toContain('1,500');
    for (const [, en] of pairs) expect(read(en)).toContain(NOTICE);
    const kcd = read('kingdom-come-deliverance-2-dice-game');
    expect(kcd).not.toMatch(/Henry|Ottokar|Trosky|Kuttenberg|Hans Capon|Holy Trinity|Painted Die|Weighted Die/);
    expect(kcd).toMatch(/not an official/);
  });

  it('plan du site : alternates', () => {
    const sitemap = readFileSync(join(pub, 'sitemap.xml'), 'utf8');
    for (const [fr, en] of pairs) {
      expect(sitemap).toContain(`<loc>${site}/${en}</loc>`);
      expect(sitemap).toContain(`<xhtml:link rel="alternate" hreflang="en" href="${site}/${en}"/>`);
      expect(sitemap).toContain(`<xhtml:link rel="alternate" hreflang="x-default" href="${site}/${fr}"/>`);
    }
  });
});

describe('pages traduites (en, de, nl)', () => {
  const pub = join(process.cwd(), 'client', 'public');
  const site = 'https://421online.com';
  const read = (slug: string) => readFileSync(join(pub, `${slug}.html`), 'utf8');
  const ld = (h: string) => [...h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].flatMap((m) => JSON.parse(m[1])['@graph']);
  const LANGS = ['en', 'de', 'nl'] as const;
  type Lang = (typeof LANGS)[number];
  const groups = I18N_GROUPS as Array<Record<'fr' | Lang, string>>;
  const OG = { en: 'en_US', de: 'de_DE', nl: 'nl_BE' };
  const LOC = { en: 'en-US', de: 'de-DE', nl: 'nl-NL' };
  const FAQ = { en: 'Frequently asked questions', de: 'Häufige Fragen', nl: 'Veelgestelde vragen' };
  const NOT_OFFICIAL = { en: /not an official/, de: /keine offizielle/, nl: /geen officiële/ };
  const FARKLE_RULES = { en: 'farkle-rules', de: 'zehntausend-wuerfelspiel-regeln', nl: 'farkle-spelregels' };
  const STRAIGHT = { en: '1,500', de: '1.500', nl: '1.500' };
  const slugs = groups.flatMap((g) => LANGS.map((l) => [l, g[l]] as const));

  it('slugs simples, un par langue, uniques ; 8 groupes minimum', () => {
    expect(groups.length).toBeGreaterThanOrEqual(8);
    const all = groups.flatMap((g) => Object.values(g));
    expect(new Set(all).size).toBe(all.length);
    for (const s of all) expect(s).toMatch(/^[a-z0-9-]+$/);
  });

  it('hreflang réciproques (fr, en, de, nl), x-default vers le français, et plan du site', () => {
    const sitemap = readFileSync(join(pub, 'sitemap.xml'), 'utf8');
    for (const g of groups) {
      const langs = ['fr', 'en', 'de', 'nl'] as const;
      for (const l of langs) {
        const h = read(g[l]);
        for (const m of langs) expect(h, `${g[l]}→${m}`).toContain(`<link rel="alternate" hreflang="${m}" href="${site}/${g[m]}">`);
        expect(h).toContain(`<link rel="alternate" hreflang="x-default" href="${site}/${g.fr}">`);
        expect(sitemap).toContain(`<loc>${site}/${g[l]}</loc>`);
        expect(sitemap).toContain(`<xhtml:link rel="alternate" hreflang="${l}" href="${site}/${g[l]}"/>`);
      }
    }
  });

  it('titre, description (≤ 165), h1 et canonique uniques, par langue', () => {
    for (const lang of LANGS) {
      const seen = { t: new Set<string>(), d: new Set<string>(), h: new Set<string>(), c: new Set<string>() };
      for (const [l, slug] of slugs) {
        if (l !== lang) continue;
        const h = read(slug);
        const t = /<title>([^<]+)<\/title>/.exec(h)![1]; const d = /name="description" content="([^"]+)"/.exec(h)![1];
        const h1 = /<h1>([\s\S]*?)<\/h1>/.exec(h)![1]; const c = /rel="canonical" href="([^"]+)"/.exec(h)![1];
        expect(c).toBe(`${site}/${slug}`); expect(d.length).toBeLessThanOrEqual(165); expect(t.length).toBeLessThanOrEqual(70);
        for (const [k, v] of [['t', t], ['d', d], ['h', h1], ['c', c]] as const) { expect(seen[k].has(v), v).toBe(false); seen[k].add(v); }
      }
    }
  });

  it('lang, og:locale, JSON-LD inLanguage, FAQ visible, boutons Jouer avec lang, gabarit dans la langue', () => {
    for (const [lang, slug] of slugs) {
      const h = read(slug); const g = ld(h);
      expect(h.startsWith(`<!doctype html>\n<html lang="${lang}">`)).toBe(true);
      expect(h).toContain(`<meta property="og:locale" content="${OG[lang]}">`);
      expect(g.find((x) => x['@type'] === 'Article').inLanguage).toBe(lang);
      expect(h).toContain(`<h2 id="questions">${FAQ[lang]}</h2>`);
      expect(h).toMatch(new RegExp(`class="cta" href="/\\?jouer=(1|courtisan|cartes|amis|poker)&amp;lang=${lang}" data-play>`));
      expect(h).toContain(`<a href="/?lang=${lang}">421online</a>`);
      for (const q of g.find((x) => x['@type'] === 'FAQPage').mainEntity) expect(h).toContain(`<summary>${q.name}</summary>`);
      expect(g.flatMap((x) => (x.aggregateRating || x.review ? [x] : []))).toHaveLength(0);
      expect(h).not.toMatch(/Mis à jour|Questions fréquentes|À lire aussi|Sommaire/);
      expect(h).not.toMatch(/Board\s?Game\s?Arena|CrazyGames|cardgames\.io|Kniffel LIVE/i);
      if (lang !== 'en') expect(h).not.toMatch(/Frequently asked|Read also/);
    }
  });

  it('valeurs Farkle, 421 et Coups Fourrés conformes au moteur', () => {
    expect(V421).toMatchObject({ pot: DEFAULT_CONFIG.totalTokens, v421: DEFAULT_CONFIG.values.v421, v111: DEFAULT_CONFIG.values.v111, suite: DEFAULT_CONFIG.values.suite, autre: DEFAULT_CONFIG.values.autre, nenette: DEFAULT_CONFIG.values.nenetteMin, throws: DEFAULT_CONFIG.maxThrows, chargeThrows: DEFAULT_CONFIG.chargeThrows });
    for (const lang of LANGS) {
      const h = read(FARKLE_RULES[lang]); const loc = LOC[lang];
      for (const t of DM_TARGETS) expect(h).toContain(t.toLocaleString(loc));
      for (let f = 1; f <= 6; f++) for (const n of [3, 4, 5, 6]) expect(h).toContain(`<td>${kindValue(f, n).toLocaleString(loc)}</td>`);
      expect(h).toContain('>500<'); expect(h).toContain('>750<'); expect(h).toContain(STRAIGHT[lang]);
    }
    for (const g of groups.filter((x) => x.fr === 'regles-coups-fourres')) for (const lang of LANGS) {
      const h = read(g[lang]);
      for (const v of [CF_RULES.startTokens, CF_RULES.startTokensMulti, CF_RULES.deckSize, CF_RULES.maxRounds, DECK_RULES.maxFamilies]) expect(h).toContain(String(v));
    }
    expect(CF_CARDS.length).toBeGreaterThan(0);
  });

  it('Kingdom Come : mention d’indépendance dans la langue partout, aucune image, jamais officiel, aucun nom du jeu vidéo', () => {
    for (const [lang, slug] of slugs) expect(read(slug)).toContain(DISCLAIMERS[lang]);
    for (const g of groups.filter((x) => x.fr === 'jeu-de-des-kingdom-come-deliverance-2')) for (const lang of LANGS) {
      const h = read(g[lang]);
      expect(h.indexOf('class="disclaimer"')).toBeLessThan(h.indexOf('<h2'));
      expect(h).not.toMatch(/<img /);
      expect(h).toMatch(NOT_OFFICIAL[lang]);
      expect(h).not.toMatch(/Henry|Ottokar|Trosky|Kuttenberg|Hans Capon|Holy Trinity|Painted Die|Weighted Die/);
    }
    expect(read('jeu-de-des-kingdom-come-deliverance-2')).not.toContain('French only');
    expect(read('jeu-de-des-kingdom-come-deliverance-2')).toContain('also available in English, German and Dutch');
  });
});

describe('pages Poker menteur (fr, en, de, nl)', () => {
  const pub = join(process.cwd(), 'client', 'public');
  const site = 'https://421online.com';
  const read = (slug: string) => readFileSync(join(pub, `${slug}.html`), 'utf8');
  const ld = (h: string) => [...h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].flatMap((m) => JSON.parse(m[1])['@graph']);
  const LANGS = ['fr', 'en', 'de', 'nl'] as const;
  type Lang = (typeof LANGS)[number];
  const groups = POKER_GROUPS as Array<Record<Lang, string>>;
  const [online, rules] = groups;
  // Combinaisons du fichier de règles du mode (docs : « Poker menteur — règles retenues »), de la plus faible à la plus forte.
  const RULES_ORDER = ['Rien', 'Paire', 'Double paire', 'Brelan', 'Petite suite', 'Grande suite', 'Full', 'Carré', 'Poker'];
  it('l’ordre des combinaisons des pages est celui du moteur du jeu', async () => {
    const { CAT_IDS } = await import('../shared/pokermenteur/hands');
    const fr = (await import('../shared/i18n/zones/poker.fr')) as Record<string, any>;
    const dict = (Object.values(fr).find((v) => v && typeof v === 'object' && 'pm.cat.rien' in v) ?? {}) as Record<string, string>;
    expect(CAT_IDS.length).toBe(RULES_ORDER.length);
    if (dict['pm.cat.rien']) expect(CAT_IDS.map((id) => dict[`pm.cat.${id}`].toLowerCase())).toEqual(RULES_ORDER.map((x) => x.toLowerCase()));
  });
  const NAMES: Record<Lang, string[]> = {
    fr: RULES_ORDER,
    en: ['Nothing', 'Pair', 'Two pair', 'Three of a kind', 'Low straight', 'High straight', 'Full house', 'Four of a kind', 'Five of a kind'],
    de: ['Nichts', 'Paar', 'Zwei Paare', 'Drilling', 'Kleine Straße', 'Große Straße', 'Full House', 'Vierling', 'Fünf Gleiche (Poker)'],
    nl: ['Niets', 'Paar', 'Twee paar', 'Drie gelijke', 'Kleine straat', 'Grote straat', 'Full house', 'Carré', 'Poker (vijf gelijke)'],
  };
  const play = (l: Lang) => (l === 'fr' ? '/?jouer=poker' : `/?jouer=poker&amp;lang=${l}`);
  const menu = (l: Lang) => (l === 'fr' ? '/?mode=poker' : `/?mode=poker&amp;lang=${l}`);

  it('slugs plats, groupes hreflang déclarés, hreflang réciproques + x-default français, plan du site', () => {
    const sitemap = readFileSync(join(pub, 'sitemap.xml'), 'utf8');
    for (const g of groups) {
      expect((I18N_GROUPS as Array<Record<Lang, string>>)).toContainEqual(g);
      for (const l of LANGS) {
        expect(g[l]).toMatch(/^[a-z0-9]+(-[a-z0-9]+)+$/);
        const h = read(g[l]);
        expect(h.startsWith(`<!doctype html>\n<html lang="${l}">`)).toBe(true);
        for (const m of LANGS) expect(h, `${g[l]}→${m}`).toContain(`<link rel="alternate" hreflang="${m}" href="${site}/${g[m]}">`);
        expect(h).toContain(`<link rel="alternate" hreflang="x-default" href="${site}/${g.fr}">`);
        expect(sitemap).toContain(`<loc>${site}/${g[l]}</loc>`);
        for (const m of LANGS) expect(sitemap).toContain(`<xhtml:link rel="alternate" hreflang="${m}" href="${site}/${g[m]}"/>`);
      }
    }
  });

  it('titres (≤ 70) et descriptions (≤ 165) uniques par langue, toutes pages confondues', () => {
    const files = readdirSync(pub).filter((f) => f.endsWith('.html') && f !== 'index.html');
    const byLang: Record<string, { t: Set<string>; d: Set<string> }> = {};
    for (const f of files) {
      const h = readFileSync(join(pub, f), 'utf8');
      if (!h.includes('/seo.css')) continue;
      const lang = /<html lang="(\w+)">/.exec(h)![1];
      const t = /<title>([^<]+)<\/title>/.exec(h)![1]; const d = /name="description" content="([^"]+)"/.exec(h)![1];
      const seen = (byLang[lang] ??= { t: new Set(), d: new Set() });
      expect(seen.t.has(t), `${f} : titre en double`).toBe(false); seen.t.add(t);
      expect(seen.d.has(d), `${f} : description en double`).toBe(false); seen.d.add(d);
    }
    for (const g of groups) for (const l of LANGS) {
      const h = read(g[l]);
      expect(/<title>([^<]+)<\/title>/.exec(h)![1].length, g[l]).toBeLessThanOrEqual(70);
      expect(/name="description" content="([^"]+)"/.exec(h)![1].replace(/&[a-z]+;/g, '_').length, g[l]).toBeLessThanOrEqual(165);
    }
  });

  it('combinaisons : tableau dans l’ordre exact du fichier de règles, noms traduits dans le même ordre', () => {
    expect(POKER_HANDS_FR).toEqual(RULES_ORDER);
    expect(POKER_HAND_IDS).toHaveLength(RULES_ORDER.length);
    for (const l of LANGS) {
      const h = read(rules[l]);
      const rows = [...h.matchAll(/<tr data-hand="([a-z-]+)"><td>(\d+)\. <b>([^<]+)<\/b>/g)];
      expect(rows.map((r) => r[1]), l).toEqual(POKER_HAND_IDS);
      expect(rows.map((r) => Number(r[2]))).toEqual(RULES_ORDER.map((_, i) => i + 1));
      expect(rows.map((r) => r[3]), l).toEqual(NAMES[l]);
    }
  });

  it('probabilités exactes (7 776 tirages) et classement du moteur de la page', () => {
    const sum = POKER_ODDS.oneRoll.reduce((a: number, b: number) => a + b, 0);
    expect(sum).toBeCloseTo(1, 12);
    expect(POKER_ODDS.oneRoll.map((x: number) => Math.round(x * 7776))).toEqual([480, 3600, 1800, 1200, 120, 120, 300, 150, 6]);
    expect(Math.round(POKER_ODDS.nothingNoStraights * 7776)).toBe(720);
    expect(POKER_ODDS.twoPairToFull).toBeCloseTo(1 / 3, 12);
    expect(POKER_ODDS.tripsToFullOrBetter).toBeCloseTo(16 / 36, 12);
    // 9 = 0 … As = 5
    expect(pokerCategory([0, 1, 2, 3, 4])).toBe(4); expect(pokerCategory([1, 2, 3, 4, 5])).toBe(5);
    expect(pokerCategory([0, 1, 2, 3, 4], false)).toBe(0); expect(pokerCategory([5, 5, 5, 5, 5])).toBe(8);
    expect(pokerCategory([4, 4, 4, 1, 1])).toBe(6); expect(pokerCategory([0, 1, 2, 3, 5])).toBe(0);
    expect(read(rules.fr)).toContain('46,3&nbsp;%');
    expect(read(rules.en)).toContain('46.3%');
  });

  it('boutons Jouer (haut, bas, en-tête) vers ?jouer=poker, lien vers le menu ?mode=poker, dans la langue', () => {
    for (const g of groups) for (const l of LANGS) {
      const h = read(g[l]);
      expect(h).toContain(`</h1>\n<p class="play-box top"><a class="cta" href="${play(l)}" data-play>`);
      expect(h).toContain(`<p class="play-box end"><a class="cta" href="${play(l)}" data-play>`);
      expect(h).toContain(`<a class="cta small" href="${play(l)}" data-play>`);
      expect(h).toContain(`<a href="${menu(l)}">`);
      expect(h).not.toMatch(/class="cta( small)?" href="\/\?mode=/);
    }
  });

  it('JSON-LD : fiche de jeu gratuite sans note dans chaque langue, FAQ visible, fil d’Ariane', () => {
    for (const l of LANGS) {
      const g = ld(read(online[l]));
      const game = g.find((x) => x['@type'] === 'VideoGame');
      expect(game, l).toMatchObject({ inLanguage: l, isAccessibleForFree: true, offers: { price: '0' }, numberOfPlayers: { minValue: 1, maxValue: POKER.maxPlayers } });
      expect(game.aggregateRating).toBeUndefined(); expect(game.review).toBeUndefined();
      expect(g.find((x) => x['@type'] === 'Article').about['@id']).toBe(game['@id']);
      const r = ld(read(rules[l]));
      expect(r.find((x) => x['@type'] === 'Article').about['@id']).toBe(game['@id']);
      const crumbs = r.find((x) => x['@type'] === 'BreadcrumbList').itemListElement;
      expect(crumbs).toHaveLength(3);
      expect(crumbs[1].item).toBe(`${site}/${online[l]}`);
      for (const page of [read(online[l]), read(rules[l])]) for (const q of ld(page).find((x) => x['@type'] === 'FAQPage').mainEntity) expect(page).toContain(`<summary>${q.name}</summary>`);
    }
    const home = readFileSync(join(process.cwd(), 'client', 'index.html'), 'utf8');
    const homeLd = JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(home)![1]);
    const parts = homeLd['@graph'].find((x: { '@id': string }) => x['@id'] === `${site}/#jeu`).hasPart.map((x: { '@id': string }) => x['@id']);
    expect(parts).toContain(ld(read(online.fr)).find((x) => x['@type'] === 'VideoGame')['@id']);
  });

  it('ne décrit que la règle retenue : 5 dés 9 à As, une relance, vies 3 ou 5, 2 à 6, 3 niveaux, rien d’inventé', () => {
    expect(POKER).toMatchObject({ dice: 5, lives: [3, 5], defaultLives: 3, minPlayers: 2, maxPlayers: 6, turnSeconds: 30, aiLevels: 3, rerolls: 1 });
    const fr = read(rules.fr);
    expect(fr).toContain('9, 10, Valet, Dame, Roi, As');
    expect(fr).toMatch(/Poker d’As/);
    expect(fr).toMatch(/sans suites/);
    for (const g of groups) for (const l of LANGS) {
      const h = read(g[l]);
      expect(h).not.toMatch(/aggregateRating|ratingValue|"review"/);
      expect(h).not.toMatch(/Board\s?Game\s?Arena|CrazyGames|cardgames\.io|Kniffel LIVE|Pokerist|Zynga/i);
      expect(h).not.toMatch(/télécharg(?:ez|er) l’application|App Store|Google Play/);
    }
    // Honnêteté : jamais présenté comme le Perudo (version à gobelets multiples).
    expect(read(online.en)).toMatch(/Not the Perudo version/);
    expect(read(online.de)).toMatch(/nicht Perudo/);
    expect(read(online.nl)).toMatch(/geen Perudo/);
    expect(read(online.fr)).toMatch(/Ce n’est pas le <a href="\/jeux-de-des#perudo">Perudo/);
  });

  it('pages de jeux existantes : liens vers le Poker menteur et plus aucune mention de « trois jeux »', () => {
    const LINKS: Array<[string, string]> = [
      ['jeux-de-des-en-ligne', online.fr], ['jeu-de-des-entre-amis', online.fr], ['jeu-de-bistrot-en-ligne', online.fr], ['jeux-de-des', online.fr],
      ['jouer-au-421-en-ligne', online.fr], ['online-dice-game-with-friends', online.en], ['online-wuerfelspiel-mit-freunden', online.de], ['online-dobbelspel-met-vrienden', online.nl],
    ];
    for (const [page, target] of LINKS) expect(read(page), page).toContain(`href="/${target}"`);
    const files = readdirSync(pub).filter((f) => f.endsWith('.html'));
    const home = readFileSync(join(process.cwd(), 'client', 'index.html'), 'utf8');
    expect(home).toContain('href="/poker-menteur-en-ligne"');
    for (const [f, h] of [...files.map((f) => [f, readFileSync(join(pub, f), 'utf8')]), ['index.html (client)', home]]) {
      expect(h, f).not.toMatch(/\btrois (?:jeux|modes)\b|\bthree (?:games|modes)\b|\bdrei (?:Spiele|Modi)\b|\bdrie (?:spellen|modi)\b/i);
    }
    expect(read('jeux-de-des-en-ligne')).toMatch(/quatre jeux/i);
  });
});
