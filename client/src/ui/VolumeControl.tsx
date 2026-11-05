import { useCallback, useRef, useState, useSyncExternalStore } from 'react';
import { FloatingPop } from './FloatingPop';
import { Icon } from './Icon';
import { sound } from '../audio/sound';
import { music } from '../audio/music';
import type { Settings } from '../settings';

/** Bouton volume : ouvre un curseur 0–100 %, avec « couper » d'un geste. */
export function VolumeControl({ settings, onSettings }: { settings: Settings; onSettings: (s: Settings) => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const pct = settings.muted ? 0 : Math.round(settings.volume * 100);
  const icon = pct === 0 ? 'mute' : pct < 50 ? 'soundLow' : 'sound';

  const close = useCallback(() => setOpen(false), []);

  const setPct = (v: number) => {
    sound.unlock();
    onSettings({ ...settings, volume: v / 100, muted: v === 0 });
  };
  // Petit « toc » de contrôle quand on relâche le curseur, au nouveau volume.
  const preview = () => { if (!settings.muted && settings.volume > 0) sound.impact('feutre', 8); };

  return (
    <div className="volume" ref={box}>
      <button className="icon-btn" title={`Volume : ${pct} %`} aria-label={`Volume ${pct} %`} onClick={() => { sound.unlock(); setOpen((o) => !o); }}><Icon name={icon} /></button>
      {open && (
        <FloatingPop anchor={box} onClose={close} className="volume-pop" label="Volume">
          <button className="icon-btn small" title={pct === 0 ? 'Remettre le son' : 'Couper le son'}
            onClick={() => (pct === 0 ? setPct(Math.max(10, Math.round(settings.volume * 100) || 60)) : onSettings({ ...settings, muted: true }))}>
            <Icon name={pct === 0 ? 'mute' : 'sound'} size={18} />
          </button>
          <input type="range" min={0} max={100} step={1} value={pct} aria-label="Volume"
            onChange={(e) => setPct(Number(e.target.value))} onPointerUp={preview} onKeyUp={preview} />
          <span className="vol-pct">{pct} %</span>
        </FloatingPop>
      )}
    </div>
  );
}

/** Bouton musique d'ambiance : curseur 0–100 %. */
export function MusicControl({ settings, onSettings }: { settings: Settings; onSettings: (s: Settings) => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const pct = Math.round(settings.music * 100);
  const close = useCallback(() => setOpen(false), []);
  const set = (v: number) => onSettings({ ...settings, music: v / 100, ...(v > 0 && settings.muted ? { muted: false } : {}) });
  return (
    <div className="volume" ref={box}>
      <button className={`icon-btn music-btn${pct === 0 ? ' off' : ''}`} title={`Musique : ${pct} %`} aria-label={`Musique ${pct} %`} onClick={() => setOpen((o) => !o)}>
        <span aria-hidden>♫</span>
      </button>
      {open && (
        <FloatingPop anchor={box} onClose={close} className="volume-pop" label="Musique">
          <button className="icon-btn small" title={pct === 0 ? 'Remettre la musique' : 'Couper la musique'} onClick={() => set(pct === 0 ? 40 : 0)}>
            <span aria-hidden>{pct === 0 ? '♫' : '⏸'}</span>
          </button>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <input type="range" min={0} max={100} step={1} value={pct} aria-label="Musique" style={{ flex: 1, minWidth: 0 }} onChange={(e) => set(Number(e.target.value))} />
              <span className="vol-pct">{pct} %</span>
            </div>
            <NowPlaying />
          </div>
        </FloatingPop>
      )}
    </div>
  );
}

/** Titre du morceau en cours et bouton « Morceau suivant ». */
function NowPlaying() {
  useSyncExternalStore((fn) => music.subscribe(fn), () => music.info().id, () => music.info().id);
  const t = music.info();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }} aria-live="polite">
      <b style={{ lineHeight: 1.2 }}>{t.title}</b>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <small style={{ flex: 1, minWidth: 0, opacity: 0.7, lineHeight: 1.25 }}>{t.mood}</small>
        <button className="btn small" style={{ flex: 'none', whiteSpace: 'nowrap' }} onClick={() => { music.unlock(); music.next(); }}>Morceau suivant ⏭</button>
      </div>
    </div>
  );
}
