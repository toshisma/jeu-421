import { tr } from '../i18n/lang';
import { useEffect, useRef, useState } from 'react';
import { FloatingPop } from './FloatingPop';
import { isNativeApp } from '../platform';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// L'événement peut arriver avant que l'accueil soit affiché : on le garde de côté.
let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    listeners.forEach((l) => l());
  });
  window.addEventListener('appinstalled', () => { deferred = null; listeners.forEach((l) => l()); });
}

const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/**
 * « Installer l'application » :
 *  - Android / Chrome / Edge : bouton qui ouvre la fenêtre d'installation du navigateur ;
 *  - iPhone / iPad (Safari) : pas d'API d'installation, on explique le geste (Partager → Sur l'écran d'accueil) ;
 *  - déjà installée ou application native : rien.
 */
/** Bouton d'installation : `compact` dans la barre du haut de l'accueil, complet dans les Réglages. */
export function InstallPrompt({ compact = false }: { compact?: boolean }) {
  const [, force] = useState(0);
  const [iosHelp, setIosHelp] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);
  if (isNativeApp() || isStandalone() || location.protocol === 'file:') return null;

  if (deferred) {
    return (
      <button className={compact ? 'install-chip' : 'btn'} onClick={async () => {
        const d = deferred!;
        await d.prompt();
        await d.userChoice.catch(() => null);
        deferred = null;
        force((n) => n + 1);
      }}>📲 {compact ? tr('plus.install') : "Installer l'application"}</button>
    );
  }
  if (isIos()) {
    return (
      <span className={compact ? 'install-wrap' : undefined} ref={wrap}>
        <button className={compact ? 'install-chip' : 'btn ghost'} aria-expanded={iosHelp} onClick={() => setIosHelp((v) => !v)}>📲 {compact ? tr('plus.install') : "Installer sur l'iPhone"}</button>
        {iosHelp && (compact
          ? <FloatingPop anchor={wrap} onClose={() => setIosHelp(false)} className="install-pop" label="Installer"><p>Dans Safari, touchez <b>Partager</b> (le carré avec une flèche), puis <b>Sur l'écran d'accueil</b>.</p></FloatingPop>
          : <p className="muted small center">Dans Safari, touchez <b>Partager</b> (le carré avec une flèche), puis <b>Sur l'écran d'accueil</b>.</p>)}
      </span>
    );
  }
  return null;
}
