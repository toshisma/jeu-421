import { cfText } from './i18n';
import { tr } from '../i18n/lang';
/**
 * Coups Fourrés : petites briques d'interface communes aux écrans du mode (thème violet nuit).
 * En-tête avec retour, pastille de capsules, écusson de division, attente d'une partie en ligne.
 */
import { useEffect, useState } from 'react';
import { CF_DIVISIONS, cfDivisionIndex, type CfDivisionId } from '../../../shared/cards/progress';
import { Icon } from '../ui/Icon';
import { CapsuleIcon } from './components';

/** Écran du mode : en-tête collé (retour, titre, à droite), contenu qui défile, pied facultatif. */
export function CfShell({ title, sub, onBack, right, children, foot, className }: {
  title: string; sub?: React.ReactNode; onBack: () => void; right?: React.ReactNode; children: React.ReactNode; foot?: React.ReactNode; className?: string;
}) {
  return (
    <div className={`cf-screen${className ? ` ${className}` : ''}`}>
      <header className="cf-head">
        <button className="cf-ib" onClick={onBack} aria-label={tr('cf.ui.retour')}><Icon name="back" size={22} /></button>
        <div className="cf-head-title"><h2>{title}</h2>{sub && <small>{sub}</small>}</div>
        {right}
      </header>
      <div className="cf-body">{children}</div>
      {foot && <div className="cf-foot">{foot}</div>}
    </div>
  );
}

/** Pastille de capsules (la monnaie du mode). */
export function Capsules({ n, size = 18, className }: { n: number; size?: number; className?: string }) {
  return <span className={`cf-caps${className ? ` ${className}` : ''}`} aria-label={`${n} capsules`}><CapsuleIcon size={size} />{n.toLocaleString('fr-BE')}</span>;
}

const DIV_COLORS: Record<CfDivisionId, [string, string]> = {
  comptoir: ['#6b4a2c', '#c99560'], bistrot: ['#7a4a1c', '#f1cc7d'], brasserie: ['#2f5a7a', '#9fd0ff'],
  cabaret: ['#5a2a6a', '#e7a6ff'], 'grand-cafe': ['#6a4a10', '#ffd36b'],
};
/** Écusson de division (initiale de la division sur un blason). */
export function DivisionShield({ id, size = 40, legend }: { id: CfDivisionId; size?: number; legend?: boolean }) {
  const [bg, ink] = DIV_COLORS[id] ?? DIV_COLORS.comptoir;
  const name = cfText(CF_DIVISIONS.find((d) => d.id === id)?.name ?? '');
  return (
    <svg width={size} height={size * 1.1} viewBox="0 0 40 44" role="img" aria-label={tr('cf.ui.division', { name: name })} className="cf-shield">
      <path d="M20 2 L37 9 L37 24 Q37 36 20 42 Q3 36 3 24 L3 9Z" fill={bg} stroke={ink} strokeWidth="2.5" />
      {legend && <path d="M8 6 L12 1 L16 5 L20 0 L24 5 L28 1 L32 6" fill="none" stroke="#ffd36b" strokeWidth="2" />}
      <text x="20" y="28" fontFamily="'Alfa Slab One', Rockwell, serif" fontSize="16" fill={ink} textAnchor="middle">{name.slice(0, 1)}</text>
    </svg>
  );
}

/** Progression vers la division suivante. */
export function divisionProgress(points: number): { name: string; next: string | null; pct: number; toNext: number } {
  const i = cfDivisionIndex(points);
  const d = CF_DIVISIONS[i];
  const n = CF_DIVISIONS[i + 1];
  if (!n) return { name: cfText(d.name), next: null, pct: 100, toNext: 0 };
  return { name: cfText(d.name), next: cfText(n.name), pct: Math.max(0, Math.min(100, (100 * (points - d.min)) / (n.min - d.min))), toNext: n.min - points };
}

/** « fin dans 25 jours » à partir de la date de fin (AAAA-MM-JJ). */
export function seasonEndsIn(endsOn: string, now = Date.now()): string {
  const end = new Date(`${endsOn}T00:00:00+01:00`).getTime();
  const days = Math.ceil((end - now) / 86_400_000);
  return days <= 0 ? tr('cf.ui.se_termine_aujourd_hui') : days === 1 ? tr('cf.ui.fin_demain') : tr('cf.ui.fin_dans_jours', { days: days });
}
const MONTHS = ['janvier', tr('cf.enigme.fevrier'), 'mars', 'avril', 'mai', 'juin', 'juillet', tr('cf.enigme.aout'), 'septembre', 'octobre', 'novembre', tr('cf.enigme.decembre')];
export const seasonName = (season: string) => { const m = Number(season.slice(5, 7)); return tr('cf.ui.saison_de', { a: MONTHS[m - 1] ?? season }); };

/** Attente d'une partie en ligne (recherche d'adversaire, table à code…). */
export function WaitingOverlay({ title, status, code, onCancel, extra }: { title: string; status: string; code?: string; onCancel: () => void; extra?: React.ReactNode }) {
  const [t, setT] = useState(0);
  useEffect(() => { const i = setInterval(() => setT((x) => x + 1), 1000); return () => clearInterval(i); }, []);
  return (
    <div className="cf-wait" role="dialog" aria-modal="true" aria-label={title}>
      <div className="cf-wait-card">
        <span className="cf-wait-spin" aria-hidden><i /><i /><i /></span>
        <h3>{title}</h3>
        {code && <p className="cf-wait-code">{tr('cf.ui.code_de_la_table')}<b>{code}</b></p>}
        <p>{status}</p>
        <small>{Math.floor(t / 60)}:{String(t % 60).padStart(2, '0')}</small>
        {extra}
        <button className="cf-btn ghost" onClick={onCancel}>{tr('cf.game.annuler')}</button>
      </div>
    </div>
  );
}

/** Petite bannière « Bientôt disponible » / message, qui disparaît seule. */
export function useCfToast(ms = 3200): [React.ReactNode, (text: string, kind?: 'ok' | 'err') => void] {
  const [t, setT] = useState<{ text: string; kind: 'ok' | 'err'; id: number } | null>(null);
  useEffect(() => { if (!t) return; const i = setTimeout(() => setT(null), ms); return () => clearTimeout(i); }, [t, ms]);
  return [t ? <div key={t.id} className={`cf-toast is-${t.kind}`} role={t.kind === 'err' ? 'alert' : 'status'} onClick={() => setT(null)}>{t.text}</div> : null,
    (text, kind = 'ok') => setT({ text, kind, id: Date.now() })];
}

/** Petit dé dessiné (journal, combinaisons, choix d'un dé). */
export function Pip({ v, size = 18, on, className }: { v: number; size?: number; on?: boolean; className?: string }) {
  const P: Record<number, [number, number][]> = {
    1: [[50, 50]], 2: [[28, 28], [72, 72]], 3: [[26, 26], [50, 50], [74, 74]], 4: [[28, 28], [72, 28], [28, 72], [72, 72]],
    5: [[27, 27], [73, 27], [50, 50], [27, 73], [73, 73]], 6: [[28, 24], [72, 24], [28, 50], [72, 50], [28, 76], [72, 76]],
  };
  return (
    <svg className={`cf-pip${on ? ' on' : ''}${className ? ` ${className}` : ''}`} width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={v ? tr('cf.ui.de', { v: v }) : tr('cf.ui.de_2')}>
      <rect x="4" y="4" width="92" height="92" rx="20" fill="#fbf6e9" stroke={on ? '#f1cc7d' : 'rgba(0,0,0,.25)'} strokeWidth={on ? 8 : 3} />
      {(P[v] ?? []).map(([x, y], i) => <circle key={i} cx={x} cy={y} r="10" fill={v === 1 ? '#c8312b' : '#2a1d12'} />)}
    </svg>
  );
}
