/**
 * Briques communes des écrans de menu (même direction que l'accueil v0.30) : en-tête avec retour,
 * barre d'action collée en bas, sections titrées, onglets en pastilles, interrupteurs, compteurs,
 * choix en cartes, état vide utile et toasts.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';

type IconName = Parameters<typeof Icon>[0]['name'];

/** Écran de menu : en-tête collé en haut (retour + titre), contenu, action principale collée en bas. */
export function Shell({ title, onBack, children, wide, sub, right, foot, icon }: {
  title: string; onBack: () => void; children: React.ReactNode; wide?: boolean;
  /** Petite ligne sous le titre (état, compteur…). */
  sub?: React.ReactNode;
  /** Boutons à droite de l'en-tête. */
  right?: React.ReactNode;
  /** Action principale, toujours visible en bas de l'écran. */
  foot?: React.ReactNode;
  /** Pastille d'icône devant le titre. */
  icon?: IconName;
}) {
  return (
    <div className={`screen scr${foot ? ' has-foot' : ''}`}>
      <header className="scr-head">
        <div className={`scr-head-in${wide ? ' wide' : ''}`}>
          <button className="scr-back" onClick={onBack} aria-label="Retour"><Icon name="back" size={22} /></button>
          {icon && <span className="scr-ic" aria-hidden><Icon name={icon} size={18} /></span>}
          <div className="scr-title"><h2>{title}</h2>{sub && <small>{sub}</small>}</div>
          {right && <div className="scr-right">{right}</div>}
        </div>
      </header>
      <div className={`panel scr-body${wide ? ' wide' : ''}`}>{children}</div>
      {foot && <div className="scr-foot"><div className={`scr-foot-in${wide ? ' wide' : ''}`}>{foot}</div></div>}
    </div>
  );
}

/** Groupe titré (titre en capitales condensées, compteur et lien à droite). */
export function Section({ title, count, aside, children, className, id }: {
  title?: React.ReactNode; count?: React.ReactNode; aside?: React.ReactNode; children: React.ReactNode; className?: string; id?: string;
}) {
  return (
    <section className={`k-sec${className ? ` ${className}` : ''}`} id={id}>
      {(title || aside) && <header className="k-sec-head"><h3>{title}{count !== undefined && count !== null && <em className="k-count">{count}</em>}</h3>{aside}</header>}
      {children}
    </section>
  );
}

/** État vide : une icône, une phrase, et l'action qui le remplit. */
export function Empty({ icon = 'dice', children, action }: { icon?: IconName; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="k-empty">
      <span className="k-empty-ic" aria-hidden><Icon name={icon} size={26} /></span>
      <p>{children}</p>
      {action}
    </div>
  );
}

/** Onglets en pastilles (rôle tablist), avec une pastille de compteur facultative. */
export function Tabs<T extends string>({ value, options, onChange, label }: {
  value: T; options: { v: T; label: string; badge?: number; icon?: IconName }[]; onChange: (v: T) => void; label?: string;
}) {
  return (
    <div className="k-tabs" role="tablist" aria-label={label} style={{ ['--n' as string]: options.length }}>
      {options.map((o) => (
        <button key={o.v} type="button" role="tab" aria-selected={o.v === value} className={o.v === value ? 'on' : ''} onClick={() => onChange(o.v)}>
          {o.icon && <Icon name={o.icon} size={17} />}<span>{o.label}</span>{!!o.badge && <i className="k-tab-badge">{o.badge > 9 ? '9+' : o.badge}</i>}
        </button>
      ))}
    </div>
  );
}

/** Interrupteur : toute la ligne est cliquable (≥ 52 px). */
export function Toggle({ label, hint, checked, onChange, disabled }: {
  label: React.ReactNode; hint?: React.ReactNode; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean;
}) {
  return (
    <label className={`k-toggle${disabled ? ' off' : ''}`}>
      <span className="k-toggle-text"><b>{label}</b>{hint && <small>{hint}</small>}</span>
      <input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <i className="k-switch" aria-hidden />
    </label>
  );
}

/** Compteur − valeur + (remplace les champs numériques, plus simple au doigt). */
export function Stepper({ label, hint, value, min, max, onChange, disabled, unit }: {
  label: React.ReactNode; hint?: React.ReactNode; value: number; min: number; max: number; onChange: (n: number) => void; disabled?: boolean; unit?: string;
}) {
  const set = (n: number) => onChange(Math.min(max, Math.max(min, n)));
  return (
    <div className={`k-row k-stepper${disabled ? ' off' : ''}`}>
      <span className="k-row-text"><b>{label}</b>{hint && <small>{hint}</small>}</span>
      <span className="k-step">
        <button type="button" disabled={disabled || value <= min} onClick={() => set(value - 1)} aria-label="Moins">−</button>
        <input type="number" inputMode="numeric" min={min} max={max} value={value} disabled={disabled} aria-label={typeof label === 'string' ? label : undefined}
          onChange={(e) => { const n = Number(e.target.value); if (Number.isFinite(n)) set(n); }} />
        <button type="button" disabled={disabled || value >= max} onClick={() => set(value + 1)} aria-label="Plus">+</button>
        {unit && <small>{unit}</small>}
      </span>
    </div>
  );
}

/** Choix en cartes (deux à quatre options, avec une ligne d'explication). */
export function Choices<T extends string | number>({ value, options, onChange, disabled, cols }: {
  value: T; options: { v: T; label: string; hint?: string; icon?: IconName; off?: boolean }[]; onChange: (v: T) => void; disabled?: boolean; cols?: number;
}) {
  return (
    <div className="k-choices" role="radiogroup" style={{ ['--cols' as string]: cols ?? options.length }}>
      {options.map((o) => (
        <button key={String(o.v)} type="button" role="radio" aria-checked={o.v === value} disabled={disabled || o.off}
          className={o.v === value ? 'on' : ''} onClick={() => onChange(o.v)}>
          {o.icon && <span className="k-choice-ic" aria-hidden><Icon name={o.icon} size={20} /></span>}
          <b>{o.label}</b>
          {o.hint && <small>{o.hint}</small>}
        </button>
      ))}
    </div>
  );
}

/** Toast commun (en bas de l'écran, disparaît seul). Renvoie [élément à placer, afficher]. */
export function useToast(ms = 2800): [React.ReactNode, (text: string, kind?: 'ok' | 'err') => void] {
  const [t, setT] = useState<{ text: string; kind: 'ok' | 'err'; id: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);
  const show = useCallback((text: string, kind: 'ok' | 'err' = 'ok') => {
    clearTimeout(timer.current);
    setT({ text, kind, id: Date.now() });
    timer.current = setTimeout(() => setT(null), ms);
  }, [ms]);
  const node = t ? <div key={t.id} className={`k-toast ${t.kind}`} role={t.kind === 'err' ? 'alert' : 'status'} onClick={() => setT(null)}>
    <Icon name={t.kind === 'err' ? 'close' : 'check'} size={18} />{t.text}</div> : null;
  return [node, show];
}

/** Pastille de pièces (laiton). */
export function Coins({ n, label }: { n: number; label?: string }) {
  return <span className="k-coins"><i aria-hidden />{n.toLocaleString('fr-BE')}{label && <small> {label}</small>}</span>;
}

/** Initiale dans une pastille ronde (joueurs sans photo dans les listes). */
export function Initial({ name, dot }: { name: string; dot?: 'on' | 'play' | 'off' }) {
  return <span className="k-initial" aria-hidden>{name.slice(0, 1).toUpperCase()}{dot && <i className={`k-dot ${dot}`} />}</span>;
}

/** Feuille glissée depuis le bas (mêmes styles que l'accueil). */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="sheet-back" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grip" aria-hidden />
        <header className="sheet-head"><h2>{title}</h2><button className="icon-btn" onClick={onClose} aria-label="Fermer"><Icon name="close" /></button></header>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}

/** Gros bouton en relief (action principale d'un écran), avec une ligne d'explication. */
export function BigAction({ icon, label, sub, onClick, disabled, tone = 'blue', type = 'button' }: {
  icon?: IconName; label: React.ReactNode; sub?: React.ReactNode; onClick?: () => void; disabled?: boolean; tone?: 'blue' | 'gold' | 'green' | 'red'; type?: 'button' | 'submit';
}) {
  return (
    <button type={type} className={`k-big ${tone}`} onClick={onClick} disabled={disabled}>
      {icon && <span className="k-big-ic" aria-hidden><Icon name={icon} size={24} /></span>}
      <span className="k-big-text"><b>{label}</b>{sub && <small>{sub}</small>}</span>
    </button>
  );
}

/** Tuile secondaire en relief (feutre vert), pour les actions de second rang. */
export function Tile({ icon, label, sub, onClick, disabled, badge }: { icon: IconName; label: string; sub?: string; onClick: () => void; disabled?: boolean; badge?: number }) {
  return (
    <button type="button" className="k-tile" onClick={onClick} disabled={disabled}>
      <span className="k-tile-ic" aria-hidden><Icon name={icon} size={20} /></span>
      <span className="k-tile-text"><b>{label}</b>{sub && <small>{sub}</small>}</span>
      {!!badge && <i className="k-tab-badge">{badge > 9 ? '9+' : badge}</i>}
    </button>
  );
}
