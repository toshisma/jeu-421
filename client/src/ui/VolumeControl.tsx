import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';
import { sound } from '../audio/sound';
import type { Settings } from '../settings';

/** Bouton volume : ouvre un curseur 0–100 %, avec « couper » d'un geste. */
export function VolumeControl({ settings, onSettings }: { settings: Settings; onSettings: (s: Settings) => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const pct = settings.muted ? 0 : Math.round(settings.volume * 100);
  const icon = pct === 0 ? 'mute' : pct < 50 ? 'soundLow' : 'sound';

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [open]);

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
        <div className="volume-pop" role="dialog" aria-label="Volume">
          <button className="icon-btn small" title={pct === 0 ? 'Remettre le son' : 'Couper le son'}
            onClick={() => (pct === 0 ? setPct(Math.max(10, Math.round(settings.volume * 100) || 60)) : onSettings({ ...settings, muted: true }))}>
            <Icon name={pct === 0 ? 'mute' : 'sound'} size={18} />
          </button>
          <input type="range" min={0} max={100} step={1} value={pct} aria-label="Volume"
            onChange={(e) => setPct(Number(e.target.value))} onPointerUp={preview} onKeyUp={preview} />
          <span className="vol-pct">{pct} %</span>
        </div>
      )}
    </div>
  );
}
