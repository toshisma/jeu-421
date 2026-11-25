/**
 * Administration, onglet « Vie du jeu » (admins seulement, en français) :
 * - le mot du patron : une ligne (140 caractères au plus) montrée telle quelle sur l'accueil de tous, avec une date de fin ;
 * - la publication de la semaine : texte prêt à poster (champions, parties jouées, lien) + image carrée 1080×1080
 *   dessinée ici (tapis vert, or, dés), à copier / télécharger. Visuels originaux uniquement.
 * Serveur : server/vie.ts (GET /api/admin/vie, POST /api/admin/vie/patron).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../account/api';
import { PATRON_DAYS, PATRON_MAX } from '../../../shared/vie';

interface AdminVie {
  patron: { text: string; until: number; by: string; at: number } | null;
  champions: { week: string; solo?: string | null; soloPoints?: number; bistrot?: string | null; tournoi?: { name: string; wins: number } | null };
  games7: Record<string, number>;
}

const SITE = 'https://421online.com';
const GAME_NAMES: [string, string][] = [['421', '421'], ['cf', 'Coups Fourrés'], ['courtisan', 'Le Courtisan'], ['poker', 'Poker menteur']];
const nf = (n: number) => Math.round(n).toLocaleString('fr-BE');
const dateFr = (t: number) => new Date(t).toLocaleString('fr-BE', { timeZone: 'Europe/Brussels', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
const weekFr = (w: string) => {
  const f = (d: number) => new Date(Date.parse(`${w}T12:00:00Z`) + d * 86400_000).toLocaleDateString('fr-BE', { day: 'numeric', month: 'long', timeZone: 'UTC' });
  return `du ${f(0)} au ${f(6)}`;
};

/** Lignes des champions (texte et image). */
function championLines(c: AdminVie['champions']): string[] {
  const out: string[] = [];
  if (c.solo) out.push(`Classement solo : ${c.solo}${c.soloPoints ? ` (${c.soloPoints} points)` : ''}`);
  if (c.bistrot) out.push(`Bistrots entre amis : ${c.bistrot}`);
  if (c.tournoi) out.push(`Tournois de 11 h et 21 h : ${c.tournoi.name}${c.tournoi.wins > 1 ? ` (${c.tournoi.wins} victoires)` : ''}`);
  return out;
}
const total = (g: Record<string, number>) => Object.values(g).reduce((a, b) => a + (b || 0), 0);

/** Texte prêt à poster (réseaux sociaux, Discord…). */
export function publicationText(d: AdminVie): string {
  const lines = ['🎲 La semaine sur 421 online', ''];
  const ch = championLines(d.champions);
  if (ch.length) lines.push(`🏆 Champions de la semaine (${weekFr(d.champions.week)}) :`, ...ch.map((l) => `• ${l}`), '');
  const n = total(d.games7);
  if (n > 0) {
    const per = GAME_NAMES.filter(([k]) => d.games7[k]).map(([k, name]) => `${name} : ${nf(d.games7[k])}`).join(', ');
    lines.push(`🎯 ${nf(n)} parties jouées ces 7 derniers jours${per ? ` (${per})` : ''}.`, '');
  }
  if (d.patron) lines.push(`📣 ${d.patron.text}`, '');
  lines.push(`À vous de jouer ! 421, Coups Fourrés, Le Courtisan et Poker menteur, gratuits et sans téléchargement : ${SITE}`);
  return lines.join('\n');
}

// --- Image 1080×1080 ----------------------------------------------------------------------------------
const PIPS: Record<number, [number, number][]> = {
  1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]],
  4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
};
function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
function die(g: CanvasRenderingContext2D, cx: number, cy: number, s: number, v: number, rot: number) {
  g.save(); g.translate(cx, cy); g.rotate(rot);
  g.shadowColor = 'rgba(0,0,0,0.45)'; g.shadowBlur = 24; g.shadowOffsetY = 10;
  const grad = g.createLinearGradient(-s / 2, -s / 2, s / 2, s / 2);
  grad.addColorStop(0, '#fffdf6'); grad.addColorStop(1, '#e6dcc4');
  g.fillStyle = grad; roundRect(g, -s / 2, -s / 2, s, s, s * 0.18); g.fill();
  g.shadowColor = 'transparent';
  for (const [px, py] of PIPS[v]) {
    g.fillStyle = v === 1 || (v === 4) ? '#b3261e' : '#1d1a16';
    g.beginPath(); g.arc(px * s * 0.26, py * s * 0.26, s * (v === 1 ? 0.12 : 0.085), 0, Math.PI * 2); g.fill();
  }
  g.restore();
}
/** Texte coupé pour tenir dans `w` pixels (points de suspension). */
function fit(g: CanvasRenderingContext2D, t: string, w: number) {
  if (g.measureText(t).width <= w) return t;
  let s = t;
  while (s.length > 1 && g.measureText(`${s}…`).width > w) s = s.slice(0, -1);
  return `${s}…`;
}
export function drawPublication(c: HTMLCanvasElement, d: AdminVie) {
  const S = 1080;
  c.width = S; c.height = S;
  const g = c.getContext('2d');
  if (!g) return;
  // Tapis vert (feutre) avec vignettage et grain.
  const felt = g.createRadialGradient(S / 2, S * 0.42, 80, S / 2, S / 2, S * 0.75);
  felt.addColorStop(0, '#2f8a55'); felt.addColorStop(0.6, '#1d6339'); felt.addColorStop(1, '#0c2f1b');
  g.fillStyle = felt; g.fillRect(0, 0, S, S);
  let seed = 421;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 9000; i++) { g.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.05)'; g.fillRect(rnd() * S, rnd() * S, 2, 2); }
  // Cadre doré.
  g.strokeStyle = '#e0b552'; g.lineWidth = 10; roundRect(g, 34, 34, S - 68, S - 68, 38); g.stroke();
  g.strokeStyle = 'rgba(241,204,125,0.45)'; g.lineWidth = 3; roundRect(g, 56, 56, S - 112, S - 112, 26); g.stroke();
  // Plaque « 421 online ».
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const plate = g.createLinearGradient(0, 110, 0, 220);
  plate.addColorStop(0, '#ffd56a'); plate.addColorStop(1, '#d59a22');
  g.fillStyle = plate; roundRect(g, S / 2 - 250, 104, 300, 120, 22); g.fill();
  g.fillStyle = '#2a1a06'; g.font = "800 104px 'Barlow Condensed', 'Arial Narrow', sans-serif"; g.fillText('421', S / 2 - 100, 168);
  g.fillStyle = '#fbf3df'; g.font = "700 76px 'Barlow Condensed', 'Arial Narrow', sans-serif"; g.textAlign = 'left'; g.fillText('online', S / 2 + 68, 170);
  // Titre.
  g.textAlign = 'center';
  g.fillStyle = '#f1cc7d'; g.font = "800 64px 'Barlow Condensed', 'Arial Narrow', sans-serif";
  g.fillText('CHAMPIONS DE LA SEMAINE', S / 2, 300);
  g.fillStyle = 'rgba(251,243,223,0.8)'; g.font = "500 34px Barlow, Arial, sans-serif";
  g.fillText(weekFr(d.champions.week), S / 2, 352);
  // Champions.
  const rows: [string, string][] = [];
  if (d.champions.solo) rows.push(['Classement solo', d.champions.solo]);
  if (d.champions.bistrot) rows.push(['Bistrots entre amis', d.champions.bistrot]);
  if (d.champions.tournoi) rows.push(['Tournois 11 h / 21 h', d.champions.tournoi.name]);
  let y = 440;
  if (!rows.length) {
    g.fillStyle = '#fbf3df'; g.font = "600 44px Barlow, Arial, sans-serif"; g.fillText('La place est libre : à vous !', S / 2, y + 30); y += 110;
  }
  for (const [label, name] of rows) {
    g.fillStyle = 'rgba(0,0,0,0.32)'; roundRect(g, 150, y - 46, S - 300, 92, 46); g.fill();
    g.fillStyle = '#f1cc7d'; g.font = "700 30px Barlow, Arial, sans-serif"; g.textAlign = 'left'; g.fillText('🏆', 180, y + 2);
    g.fillStyle = 'rgba(251,243,223,0.85)'; g.font = "600 28px Barlow, Arial, sans-serif"; g.fillText(label, 236, y - 14);
    g.fillStyle = '#ffffff'; g.font = "800 40px 'Barlow Condensed', 'Arial Narrow', sans-serif"; g.fillText(fit(g, name, S - 300 - 120), 236, y + 22);
    y += 116;
  }
  g.textAlign = 'center';
  const n = total(d.games7);
  if (n > 0) { g.fillStyle = '#fbf3df'; g.font = "700 38px Barlow, Arial, sans-serif"; g.fillText(`${nf(n)} parties jouées cette semaine`, S / 2, Math.max(y + 10, 800)); }
  // Les dés : 4, 2, 1.
  die(g, S / 2 - 150, 905, 110, 4, -0.18); die(g, S / 2, 915, 110, 2, 0.08); die(g, S / 2 + 150, 900, 110, 1, 0.22);
  g.fillStyle = '#f1cc7d'; g.font = "800 40px 'Barlow Condensed', 'Arial Narrow', sans-serif"; g.fillText('421online.com', S / 2, 1000);
}

export function VieAdminTab({ token }: { token: string | null }) {
  const [data, setData] = useState<AdminVie | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [days, setDays] = useState(PATRON_DAYS);
  const [msg, setMsg] = useState<string | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const load = useCallback(() => {
    api<AdminVie>('/admin/vie', { token }).then((d) => { setData(d); setError(null); }).catch((e) => setError((e as Error).message));
  }, [token]);
  useEffect(load, [load]);
  useEffect(() => { if (data && canvas.current) { drawPublication(canvas.current, data); void document.fonts?.ready.then(() => canvas.current && drawPublication(canvas.current, data)); } }, [data]);
  if (error) return <p className="error">{error}</p>;
  if (!data) return <p className="muted">Chargement…</p>;
  const save = async (t: string) => {
    try {
      await api('/admin/vie/patron', { token, body: { text: t, days } });
      setMsg(t ? 'Mot du patron publié.' : 'Mot du patron effacé.'); setText(''); load();
    } catch (e) { setMsg((e as Error).message); }
  };
  const pub = publicationText(data);
  const copy = async () => {
    try { await navigator.clipboard.writeText(pub); setMsg('Texte copié.'); } catch { setMsg('Copie impossible : sélectionnez le texte à la main.'); }
  };
  const download = () => canvas.current?.toBlob((b) => {
    if (!b) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b); a.download = `421online-semaine-${data.champions.week}.png`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }, 'image/png');
  return (
    <div className="adm-vie">
      <section className="adm-card">
        <h3>Le mot du patron</h3>
        <p className="muted">Une ligne montrée telle quelle, sur l’accueil de tout le monde (dans le fil, à côté de « sur le site »). Écrite en français, elle n’est pas traduite.</p>
        {data.patron
          ? <p>En ce moment : <b>« {data.patron.text} »</b><br /><small className="muted">jusqu’au {dateFr(data.patron.until)} (par {data.patron.by})</small></p>
          : <p className="muted">Aucun mot du patron en ce moment.</p>}
        <textarea value={text} maxLength={PATRON_MAX} onChange={(e) => setText(e.target.value)} placeholder="Ex. : Merci d’être de plus en plus nombreux ! Tournoi spécial samedi à 21 h." />
        <div className="adm-vie-row">
          <small className="muted">{text.length}/{PATRON_MAX}</small>
          <label>Pendant <select value={days} onChange={(e) => setDays(Number(e.target.value))}>{[1, 3, 7, 14, 30].map((n) => <option key={n} value={n}>{n} jour{n > 1 ? 's' : ''}</option>)}</select></label>
          <button className="btn small primary" disabled={!text.trim()} onClick={() => void save(text)}>Publier</button>
          {data.patron && <button className="btn small ghost" onClick={() => void save('')}>Effacer</button>}
        </div>
      </section>
      <section className="adm-card">
        <h3>Publication de la semaine</h3>
        <p className="muted">Texte et image prêts à poster (réseaux sociaux, Discord…). Champions de la semaine passée, parties des 7 derniers jours.</p>
        <pre>{pub}</pre>
        <div className="adm-vie-row"><button className="btn small primary" onClick={() => void copy()}>Copier</button></div>
        <canvas ref={canvas} width={1080} height={1080} aria-label="Image de la publication de la semaine" />
        <div className="adm-vie-row"><button className="btn small primary" onClick={download}>Télécharger l’image</button></div>
      </section>
      {msg && <p className="muted" role="status">{msg}</p>}
    </div>
  );
}
