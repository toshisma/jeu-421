/**
 * Serveur Discord du jeu : lien d'invitation et récompense (1 sac de dés, une fois par compte)
 * pour les joueurs qui l'ont VRAIMENT rejoint. La vérification passe par la connexion Discord
 * (OAuth2, droits « identify » et « guilds ») : on lit la liste des serveurs du joueur et on y cherche
 * celui du jeu. Un même compte Discord ne peut servir qu'à un seul compte du jeu.
 *
 * Variables d'environnement (sans elles, le bouton n'apparaît pas) :
 *   DISCORD_INVITE         lien d'invitation (https://discord.gg/…)
 *   DISCORD_GUILD_ID       identifiant du serveur
 *   DISCORD_CLIENT_ID      application Discord (portail développeur)
 *   DISCORD_CLIENT_SECRET
 *   DISCORD_REDIRECT       facultatif, sinon https://<hôte>/api/discord/callback
 */
import type { Router, Request, Response, NextFunction } from 'express';
import { randomBytes } from 'node:crypto';
import type { Store, UserRow } from './db';
import { BAGS_MAX } from '../shared/progress/profile';

interface Ctx {
  router: Router;
  store: Store;
  auth: (req: Request, res: Response, next: NextFunction) => void;
  userOf: (req: Request) => UserRow;
  userFromToken: (token: string) => UserRow | undefined;
  now: () => number;
  /** Pour les tests : remplace l'appel à Discord (code → identifiant Discord et serveurs). */
  discordApi?: (code: string, redirect: string) => Promise<{ id: string; guilds: string[] }>;
  env?: Record<string, string | undefined>;
}

export function discordConfig(env: Record<string, string | undefined> = process.env) {
  const invite = env.DISCORD_INVITE?.trim() || '';
  const guild = env.DISCORD_GUILD_ID?.trim() || '';
  const clientId = env.DISCORD_CLIENT_ID?.trim() || '';
  const secret = env.DISCORD_CLIENT_SECRET?.trim() || '';
  return { invite, guild, clientId, secret, redirect: env.DISCORD_REDIRECT?.trim() || '', verify: !!(invite && guild && clientId && secret) };
}

async function realDiscordApi(code: string, redirect: string, cfg: ReturnType<typeof discordConfig>) {
  const tok = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: cfg.clientId, client_secret: cfg.secret, grant_type: 'authorization_code', code, redirect_uri: redirect }),
  });
  if (!tok.ok) throw new Error(`token ${tok.status}`);
  const { access_token } = await tok.json() as { access_token: string };
  const h = { Authorization: `Bearer ${access_token}` };
  const [me, guilds] = await Promise.all([
    fetch('https://discord.com/api/users/@me', { headers: h }).then((r) => { if (!r.ok) throw new Error(`me ${r.status}`); return r.json() as Promise<{ id: string }>; }),
    fetch('https://discord.com/api/users/@me/guilds', { headers: h }).then((r) => { if (!r.ok) throw new Error(`guilds ${r.status}`); return r.json() as Promise<{ id: string }[]>; }),
  ]);
  return { id: String(me.id), guilds: guilds.map((g) => String(g.id)) };
}

export function createDiscord(c: Ctx) {
  const { router, store, auth, userOf } = c;
  const cfg = () => discordConfig(c.env ?? process.env);
  /** Demandes de vérification en cours : état OAuth → compte du jeu (10 minutes). */
  const states = new Map<string, { userId: string; exp: number }>();
  const redirectOf = (req: Request) => cfg().redirect || `${req.protocol}://${req.get('host')}/api/discord/callback`;
  const claimedBy = (userId: string) => store.getMeta(`discord:user:${userId}`);

  router.get('/discord', (req, res) => {
    const k = cfg();
    res.setHeader('Cache-Control', 'no-store');
    const h = req.headers.authorization ?? '';
    // Compte connecté (facultatif) : sac déjà reçu ?
    const u = h.startsWith('Bearer ') ? c.userFromToken(h.slice(7)) : undefined;
    const claimed = !!(u && claimedBy(u.id));
    res.json({ ok: true, invite: k.invite || null, verify: k.verify, claimed });
  });

  router.post('/discord/start', auth, (req, res) => {
    const k = cfg();
    if (!k.verify) return res.status(503).json({ ok: false, error: 'Vérification Discord indisponible.' });
    const u = userOf(req);
    if (claimedBy(u.id)) return res.status(409).json({ ok: false, error: 'Vous avez déjà reçu votre sac Discord.' });
    const t = c.now();
    for (const [s, v] of states) if (v.exp < t) states.delete(s);
    const state = randomBytes(18).toString('base64url');
    states.set(state, { userId: u.id, exp: t + 10 * 60_000 });
    const url = new URL('https://discord.com/oauth2/authorize');
    url.searchParams.set('client_id', k.clientId);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('redirect_uri', redirectOf(req));
    url.searchParams.set('scope', 'identify guilds');
    url.searchParams.set('state', state);
    res.json({ ok: true, url: url.toString() });
  });

  router.get('/discord/callback', async (req, res) => {
    const back = (r: string) => res.redirect(302, `/?discord=${r}`);
    const state = String(req.query.state ?? '');
    const code = String(req.query.code ?? '');
    const st = states.get(state);
    states.delete(state);
    if (!st || st.exp < c.now()) return back('expire');
    if (!code) return back('annule');
    const k = cfg();
    let d: { id: string; guilds: string[] };
    try { d = await (c.discordApi ? c.discordApi(code, redirectOf(req)) : realDiscordApi(code, redirectOf(req), k)); }
    catch (e) { console.warn('[discord] vérification impossible', e); return back('erreur'); }
    if (!d.guilds.includes(k.guild)) return back('absent');
    if (claimedBy(st.userId)) return back('deja');
    const other = store.getMeta(`discord:id:${d.id}`);
    if (other && other !== st.userId) return back('autre');
    const u = store.userById(st.userId);
    if (!u) return back('erreur');
    const p = store.profileOf(u);
    if ((p.bags ?? 0) >= BAGS_MAX) return back('plein');
    store.saveProfile(u.id, { ...p, bags: Math.min(BAGS_MAX, (p.bags ?? 0) + 1) });
    store.setMeta(`discord:user:${u.id}`, d.id);
    store.setMeta(`discord:id:${d.id}`, u.id);
    back('ok');
  });
}
