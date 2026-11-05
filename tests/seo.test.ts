/** Référencement : adresses uniques (redirections), vraies erreurs 404, domaine officiel, pages d'aide. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { request } from 'node:http';
import { canonicalHostRedirect, canonicalPath, isAppPath, serveClient } from '../server/static';

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
