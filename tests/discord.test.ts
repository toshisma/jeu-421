/** Discord : récompense (1 sac) seulement si le joueur est vraiment sur le serveur, une fois par compte et par compte Discord. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startServer } from '../server/app';

let srv: Awaited<ReturnType<typeof startServer>>;
let base = '';
// code OAuth simulé « <idDiscord>:<serveurs séparés par des virgules> »
const api_ = async (code: string) => { const [id, g] = code.split(':'); return { id, guilds: g ? g.split(',') : [] }; };
beforeAll(async () => {
  srv = await startServer({ port: 0, dbPath: ':memory:', accounts: { authAttempts: 1000, discord: {
    env: { DISCORD_INVITE: 'https://discord.gg/test', DISCORD_GUILD_ID: 'G421', DISCORD_CLIENT_ID: 'cid', DISCORD_CLIENT_SECRET: 'sec' }, api: api_ } } });
  base = `http://localhost:${srv.port}`;
});
afterAll(async () => { await srv.close(); });
const api = async (path: string, body?: object, token?: string) => {
  const r = await fetch(`${base}/api${path}`, { method: body ? 'POST' : 'GET', body: body ? JSON.stringify(body) : undefined,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
  return { code: r.status, ...(await r.json()) };
};
const reg = async (u: string) => (await api('/register', { username: u, password: 'motdepasse1' })).token as string;
const bags = async (t: string) => (await api('/me', undefined, t)).profile.bags ?? 0;
/** Lance la vérification et simule le retour de Discord avec ce code. */
const verify = async (t: string, code: string) => {
  const s = await api('/discord/start', {}, t);
  if (!s.ok) return `refus ${s.code}`;
  const state = new URL(s.url).searchParams.get('state')!;
  const r = await fetch(`${base}/api/discord/callback?state=${state}&code=${encodeURIComponent(code)}`, { redirect: 'manual' });
  return r.headers.get('location');
};

describe('Discord', () => {
  it('configuration publique et état', async () => {
    expect(await api('/discord')).toMatchObject({ invite: 'https://discord.gg/test', verify: true, claimed: false });
    expect((await api('/discord/start', {})).code).toBe(401); // invité
  });

  it('pas sur le serveur : rien ; sur le serveur : un sac, une seule fois', async () => {
    const a = await reg('Remi');
    const b0 = await bags(a);
    expect(await verify(a, 'd1:AUTRE')).toBe('/?discord=absent');
    expect(await bags(a)).toBe(b0);
    expect(await verify(a, 'd1:AUTRE,G421')).toBe('/?discord=ok');
    expect(await bags(a)).toBe(b0 + 1);
    expect((await api('/discord', undefined, a)).claimed).toBe(true);
    expect(await verify(a, 'd1:G421')).toBe('refus 409');
    expect(await bags(a)).toBe(b0 + 1);
  });

  it('un compte Discord ne sert qu’à un compte du jeu ; état inconnu refusé', async () => {
    const c = await reg('Nina');
    expect(await verify(c, 'd1:G421')).toBe('/?discord=autre');
    const r = await fetch(`${base}/api/discord/callback?state=faux&code=d9:G421`, { redirect: 'manual' });
    expect(r.headers.get('location')).toBe('/?discord=expire');
    expect(await verify(c, 'd2:G421')).toBe('/?discord=ok');
  });
});
