/**
 * « La vie du jeu » sur l'accueil : UNE ligne, à côté de « N sur le site », sur la vitrine 3D (aucune
 * hauteur en plus). Elle mêle les éléments de GET /api/vie (mot du patron, champions de la semaine,
 * dernière mise à jour, sources ajoutées : shared/vie.ts) au fil des parties récentes (GET /api/feed).
 * Défilement calme (6 s), en pause au survol / au toucher / au focus ; « mouvement réduit » : un seul
 * élément, sans animation. Rien à montrer : rien n'est rendu. Toucher un élément de la vie du jeu :
 * l'écran lié (ou une petite fiche, voir Home.tsx). Version autonome (sans serveur) : jamais rendue.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../account/api';
import { getLang, tr, useLang } from '../i18n/lang';
import { STANDALONE } from './Screens';
import { feedAgo, feedText } from './Friends';
import { vieParam, type VieItem } from '../../../shared/vie';

const STEP_MS = 6000;
const VIE_EVERY = 5 * 60_000;
const FEED_EVERY = 60_000;

/** Texte d'un élément dans la langue du joueur. */
export function vieText(it: VieItem): string {
  if (it.text) return it.text;
  if (!it.key) return '';
  const lang = getLang();
  const vars = Object.fromEntries(Object.entries(it.params ?? {}).map(([k, v]) => [k, vieParam(v, lang)]));
  return tr(it.key, vars);
}

type Entry = { kind: 'vie'; item: VieItem } | { kind: 'feed'; text: string; at: number };

/** Ordre : la vie du jeu d'abord (dans l'ordre de priorité), puis un élément de vie toutes les 2 parties récentes. */
export function interleave(vie: VieItem[], feed: { text: string; at: number }[]): Entry[] {
  const out: Entry[] = [];
  const v = vie.map((item) => ({ kind: 'vie' as const, item }));
  const f = feed.map((x) => ({ kind: 'feed' as const, ...x }));
  let i = 0, j = 0;
  while (i < v.length || j < f.length) {
    if (i < v.length) out.push(v[i++]);
    for (let k = 0; k < 2 && j < f.length; k++) out.push(f[j++]);
  }
  return out;
}

const entryKey = (e: Entry) => (e.kind === 'vie' ? `v:${e.item.id}` : `f:${e.at}:${e.text}`);

const reducedMotion = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };

/** Chargement périodique tant que la page est visible. */
function usePoll<T>(path: string, every: number, pick: (r: Record<string, unknown>) => T | null): T | null {
  const [v, setV] = useState<T | null>(null);
  useEffect(() => {
    if (STANDALONE) return;
    let alive = true;
    let timer: ReturnType<typeof setInterval> | null = null;
    const load = () => api<Record<string, unknown>>(path).then((r) => { const x = pick(r); if (alive && x) setV(x); }).catch(() => {});
    const start = () => { if (timer) return; load(); timer = setInterval(load, every); };
    const stop = () => { if (timer) clearInterval(timer); timer = null; };
    const onVis = () => (document.hidden ? stop() : start());
    if (!document.hidden) start();
    document.addEventListener('visibilitychange', onVis);
    return () => { alive = false; stop(); document.removeEventListener('visibilitychange', onVis); };
  }, [path, every]); // eslint-disable-line react-hooks/exhaustive-deps
  return v;
}

export function VieTicker({ onOpen }: { onOpen: (it: VieItem) => void }) {
  useLang();
  const vie = usePoll<VieItem[]>('/vie', VIE_EVERY, (r) => (Array.isArray(r.items) ? r.items as VieItem[] : null));
  const feed = usePoll<{ text: string; at: number }[]>('/feed', FEED_EVERY, (r) => (Array.isArray(r.feed)
    ? (r.feed as { text: string; at: number }[]).filter((f) => Date.now() - f.at < 3 * 86400_000) : null));
  const entries = useMemo(() => interleave(vie ?? [], feed ?? []), [vie, feed]);
  // Élément affiché, repéré par sa clé : une liste rechargée (fil, vie du jeu) ne le change pas sous les yeux du joueur.
  const [cur, setCur] = useState<string | null>(null);
  const list = useRef(entries);
  list.current = entries;
  const [paused, setPaused] = useState(false);
  const resume = useRef<ReturnType<typeof setTimeout> | null>(null);
  const still = reducedMotion();
  useEffect(() => {
    if (entries.length < 2 || paused || still) return;
    const t = setInterval(() => setCur((k) => {
      const l = list.current;
      const at = Math.max(0, l.findIndex((x) => entryKey(x) === k));
      return entryKey(l[(at + 1) % l.length]);
    }), STEP_MS);
    return () => clearInterval(t);
  }, [entries.length, paused, still]);
  useEffect(() => () => { if (resume.current) clearTimeout(resume.current); }, []);
  if (STANDALONE || !entries.length) return null;
  const at = still ? -1 : entries.findIndex((x) => entryKey(x) === cur);
  const e = entries[Math.max(0, at)];
  const hold = () => { if (resume.current) clearTimeout(resume.current); setPaused(true); };
  const release = (ms: number) => { if (resume.current) clearTimeout(resume.current); resume.current = setTimeout(() => setPaused(false), ms); };
  const pause = {
    onPointerEnter: hold, onPointerDown: hold,
    onPointerLeave: (ev: React.PointerEvent) => release(ev.pointerType === 'mouse' ? 0 : 4000),
    onPointerUp: (ev: React.PointerEvent) => { if (ev.pointerType !== 'mouse') release(4000); },
    onFocus: hold, onBlur: () => release(0),
  };
  if (e.kind === 'feed') {
    return <p className="news-ticker vie-tick" aria-live="off" key={`f${e.at}`} {...pause}>{feedText(e.text)} <small>{feedAgo(e.at)}</small></p>;
  }
  const text = vieText(e.item);
  return (
    <button type="button" className={`news-ticker vie-tick vie-${e.item.id}`} key={`v${e.item.id}`} {...pause}
      onClick={() => onOpen(e.item)} aria-label={tr('vie.open', { text })} title={text}>
      <span className="vie-ic" aria-hidden>{e.item.icon}</span>{text}
    </button>
  );
}
