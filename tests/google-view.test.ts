/**
 * ALARME RÉFÉRENCEMENT : l'accueil `/` et les pages d'aide françaises doivent rester en français pour Google,
 * quelle que soit la langue du navigateur qui les visite (Googlebot visite en anglais, en-US).
 * En 0.52–0.54, la détection automatique de la langue lui montrait l'accueil en anglais et le site a perdu
 * sa place sur « 421 en ligne ». Ce test simule la visite de Googlebot (navigateur en-US, puis de-DE) sur la
 * logique de langue du jeu, et vérifie le HTML servi. Contrôle complet dans un vrai navigateur :
 * `npm run check:seo` (scripts/check-google-view.mjs).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
// @ts-expect-error script Node sans déclaration de types
import { I18N_GROUPS } from '../scripts/seo-i18n-common.mjs';

const GOOGLEBOT = 'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.6478.126 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
/** Mots anglais (ou allemands) qui n'ont rien à faire dans un titre ou une description en français. */
const FOREIGN = /\b(the|free|games?|play|with|friends|multiplayer|dice game|kostenlos|Würfelspiel|spielen|gratis dobbel)\b/i;

const indexHtml = readFileSync(join(process.cwd(), 'client', 'index.html'), 'utf8');
const attr = (h: string, re: RegExp) => re.exec(h)?.[1] ?? '';

describe('accueil `/` tel que le reçoit Google', () => {
  it('HTML servi : lang fr, titre et h1 « 421 en ligne », description française, canonique', () => {
    expect(attr(indexHtml, /<html lang="([^"]+)"/)).toBe('fr');
    const title = attr(indexHtml, /<title>([^<]+)<\/title>/);
    expect(title).toContain('421 en ligne');
    const h1 = attr(indexHtml, /<h1[^>]*>([^<]+)<\/h1>/);
    expect(h1).toContain('421 en ligne');
    expect(h1).not.toMatch(FOREIGN);
    const desc = attr(indexHtml, /<meta name="description" content="([^"]+)"/);
    expect(desc).toMatch(/Jouez|jeu de dés|gratuit/);
    expect(desc).not.toMatch(FOREIGN);
    expect(attr(indexHtml, /<link rel="canonical" href="([^"]+)"/)).toBe('https://421online.com/');
    expect(attr(indexHtml, /<meta property="og:locale" content="([^"]+)"/)).toMatch(/^fr_/);
    // Aucune redirection ni balise qui enverrait Google vers une autre langue depuis l'accueil.
    expect(indexHtml).not.toMatch(/http-equiv="refresh"|hreflang=/i);
  });

  it('écran de chargement : le script n’écrit rien sans choix explicite (?lang= ou Réglages), même navigateur en anglais', () => {
    const script = [...indexHtml.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).find((s) => s.includes('421.lang'))!;
    expect(script).toBeTruthy();
    expect(script).not.toMatch(/navigator\.language/);
    for (const search of ['', '?jouer=1', '?lang=xx']) {
      let touched = 0;
      runInNewContext(script, {
        location: { search }, localStorage: { getItem: () => null },
        document: new Proxy({}, { get: () => { touched++; return () => null; } }),
        navigator: { language: 'en-US', userAgent: GOOGLEBOT },
      });
      expect(touched, search).toBe(0);
    }
  });
});

describe('langue du jeu chez Googlebot (navigateur en-US, de-DE, nl-NL)', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });
  async function visit(ua: string, language: string, search = '') {
    vi.resetModules();
    const root = { lang: '' };
    vi.stubGlobal('window', {});
    vi.stubGlobal('navigator', { language, languages: [language], userAgent: ua });
    vi.stubGlobal('location', { search, pathname: '/' });
    vi.stubGlobal('document', { documentElement: root });
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {} });
    const m = await import('../client/src/i18n/lang');
    return { m, root };
  }
  for (const language of ['en-US', 'de-DE', 'nl-NL']) {
    it(`Googlebot ${language} : français, h1 de l'accueil en français, aucun bandeau de langue`, async () => {
      const { m, root } = await visit(GOOGLEBOT, language);
      expect(m.getLang()).toBe('fr');
      expect(root.lang).toBe('fr');
      expect(m.langSuggestion()).toBeNull();
      const h1 = m.tr('app.421_en_ligne_jeux_de_des_et');
      expect(h1).toContain('421 en ligne');
      expect(h1).not.toMatch(FOREIGN);
    });
  }
  it('un visiteur humain en-US voit aussi le français (la langue est seulement proposée)', async () => {
    const { m } = await visit(CHROME, 'en-US');
    expect(m.getLang()).toBe('fr');
    expect(m.langSuggestion()).toBe('en');
  });
  it('seul un choix explicite (?lang=en) change la langue', async () => {
    const { m } = await visit(GOOGLEBOT, 'fr-FR', '?lang=en');
    expect(m.getLang()).toBe('en');
  });
  it('le h1 de l’accueil React est bien ce texte, et le bandeau de langue se cache aux robots', () => {
    const home = readFileSync(join(process.cwd(), 'client', 'src', 'ui', 'Home.tsx'), 'utf8');
    expect(home).toMatch(/<h1 className="mm-brand">[\s\S]*?tr\('app\.421_en_ligne_jeux_de_des_et'\)[\s\S]*?<\/h1>/);
    const lang = readFileSync(join(process.cwd(), 'client', 'src', 'i18n', 'lang.ts'), 'utf8');
    expect(lang).toMatch(/isCrawler\(navigator\.userAgent\)/);
  });
});

describe('pages d’aide françaises', () => {
  const pub = join(process.cwd(), 'client', 'public');
  const foreign = new Set(I18N_GROUPS.flatMap((g: Record<string, string>) => [g.en, g.de, g.nl]));
  const frPages = readdirSync(pub).filter((f) => f.endsWith('.html') && !foreign.has(f.replace(/\.html$/, '')));
  it('lang fr, canonique propre, titre et description en français, aucun script de langue', () => {
    expect(frPages.length).toBeGreaterThanOrEqual(25);
    for (const f of frPages) {
      const h = readFileSync(join(pub, f), 'utf8');
      const slug = f.replace(/\.html$/, '');
      expect(attr(h, /<html lang="([^"]+)"/), f).toBe('fr');
      expect(attr(h, /<link rel="canonical" href="([^"]+)"/), f).toBe(`https://421online.com/${slug}`);
      expect(attr(h, /<title>([^<]+)<\/title>/), f).not.toMatch(/\b(the|free|with|friends)\b/i);
      expect(attr(h, /<meta name="description" content="([^"]+)"/), f).not.toMatch(/\b(the|free|with|friends|kostenlos|spielen)\b/i);
      expect(h, f).not.toMatch(/navigator\.language[^|]*\.replace|location\.(href|replace)\s*=/);
      expect(h, f).not.toMatch(/http-equiv="refresh"/i);
    }
    expect(frPages).toContain('regles-du-421.html');
    expect(frPages).toContain('le-421-en-chiffres.html');
  });
});
