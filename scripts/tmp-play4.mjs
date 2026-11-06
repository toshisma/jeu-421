// TEMPORAIRE : partie Coups Fourrés à 4 (table à code) ; le navigateur joue un des 4 sièges. Captures.
import puppeteer from 'puppeteer-core';
import { io } from 'socket.io-client';
const URL = 'http://localhost:3012', OUT = process.argv[2], H = Number(process.argv[3] ?? 740), SEC = Number(process.argv[4] ?? 150);
const api = async (path, body, token) => { const r = await fetch(`${URL}/api${path}`, { method: body ? 'POST' : 'GET', body: body ? JSON.stringify(body) : undefined, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) } }); return r.json(); };
const sfx = Math.floor(Math.random() * 1e4);
const reg = async (u) => { const r = await api('/register', { username: u + sfx, password: 'motdepasse1' }); await api('/cf/discover', {}, r.token); return { token: r.token, name: u + sfx }; };
const accs = [await reg('Moi'), await reg('Mado'), await reg('Louis'), await reg('Bebert')];
const sock = (acc) => new Promise((res) => { const s = io(`${URL}/cf`, { transports: ['websocket'], auth: { token: acc.token } }); s.on('cf:hello', () => res(s)); });
const emit = (s, ev, p = {}) => new Promise((r) => s.emit(ev, p, r));
const S = [];
for (const a of accs) S.push(await sock(a));
const t = await emit(S[1], 'cf:table:create');
for (const i of [0, 2, 3]) await emit(S[i], 'cf:table:join', { code: t.code });
for (const s of S.slice(1)) s.on('cf:state', (m) => { if (m.you && m.snap.legal.length && !m.snap.finished) setTimeout(() => { const L = m.snap.legal; const pref = L.filter((a) => a.type !== 'play' || Math.random() < 0.5); const pick = pref.length ? pref : L; s.emit('cf:act', { id: m.id, action: pick[Math.floor(Math.random() * pick.length)] }, () => {}); }, 900); });
console.log('start', (await emit(S[1], 'cf:table:start')).ok);
S[0].disconnect();
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage();
await p.setViewport({ width: 360, height: H, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const errors = []; p.on('pageerror', (e) => errors.push(String(e)));
await p.evaluateOnNewDocument((s) => localStorage.setItem('421.compte', JSON.stringify(s)), { token: accs[0].token, username: accs[0].name });
await p.goto(URL + '/?mode=cartes', { waitUntil: 'load' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const click = (re) => p.evaluate((src) => { const r = new RegExp(src); const x = [...document.querySelectorAll('button')].find((e) => !e.disabled && r.test((e.innerText || '').replace(/\s+/g, ' '))); if (x) { x.click(); return true; } return false; }, re.source);
await sleep(5000);
await click(/Reprendre|Rejoindre la partie|Revenir/);
await p.waitForSelector('.cfn-board', { timeout: 30000 }).catch(() => console.log('pas de plateau'));
let n = 0; const t0 = Date.now(); let shotSheet = false;
while (Date.now() - t0 < SEC * 1000) {
  const st = await p.evaluate(() => ({ end: !!document.querySelector('.cf-end, .cfn-end'), mull: !!document.querySelector('.cfn-mull, [aria-label*="Main de départ"]'), roll: !!document.querySelector('.cfn-act.roll:not(:disabled)'), stop: [...document.querySelectorAll('button')].some((e) => !e.disabled && /M’arrêter/.test(e.innerText)), resp: !!document.querySelector('.cfn-resp'), pass: [...document.querySelectorAll('button')].some((e) => !e.disabled && /^Passer$/.test(e.innerText.trim())) }));
  if (n % 6 === 0) await p.screenshot({ path: `${OUT}/p4-${H}-${n}.png` });
  if (!shotSheet && n === 8) { await p.evaluate(() => document.querySelector('.cfn-pbox')?.click()); await sleep(500); await p.screenshot({ path: `${OUT}/p4-${H}-fiche.png` }); await p.evaluate(() => document.querySelector('.sheet-close, [aria-label="Fermer"]')?.click()); shotSheet = true; await sleep(300); }
  n++;
  if (st.end) { await sleep(1200); await p.screenshot({ path: `${OUT}/p4-${H}-fin.png` }); break; }
  await click(/Garder ma main/);
  if (st.resp) { await click(/Laisser faire/); }
  else if (st.roll && Math.random() < 0.7) await p.evaluate(() => [...document.querySelectorAll('.cfn-act.roll')].find((e) => !e.disabled)?.click());
  else if (st.stop) await click(/M’arrêter/);
  else if (st.pass) await click(/^Passer$/);
  await sleep(900);
}
console.log('erreurs', errors.slice(0, 5));
await b.close(); for (const s of S) s.disconnect(); process.exit(0);
