import { MODES, modeOf, sanitizeConfig, TURN_CHOICES, TIE_LABELS, DEFAULT_CONFIG, type GameConfig, type Variant, type TieRule } from '../../../shared/config';
import { Choices, Stepper, Toggle } from './kit';

interface Props {
  config: GameConfig;
  onChange?: (c: GameConfig) => void;
  readOnly?: boolean;
}

const VARIANTS: { v: Variant; label: string; hint: string }[] = [
  { v: 'classique', label: 'Classique', hint: 'Charge puis décharge' },
  { v: 'decharge', label: 'Décharge', hint: 'Jetons distribués' },
  { v: 'manches', label: 'Aux points', hint: 'Manches fixes' },
];

/**
 * Règles de la partie : un format prêt à jouer en un geste (Classique, Blitz, Mort subite),
 * et tout le détail (variante, lancers, jetons, temps, égalités, valeurs) dans « Personnaliser ».
 */
export function ConfigEditor({ config, onChange, readOnly }: Props) {
  const set = (patch: Partial<GameConfig>) => onChange?.(sanitizeConfig({ ...config, ...patch }));
  const setV = (k: keyof GameConfig['values'], v: number) => set({ values: { ...config.values, [k]: v } });
  const mode = modeOf(config);
  const custom = mode === null;
  const off = readOnly;
  const pills = <T extends string | number>(value: T, opts: { v: T; label: string }[], cb: (v: T) => void, label: string) => (
    <div className="k-pills" role="radiogroup" aria-label={label}>
      {opts.map((o) => <button type="button" key={String(o.v)} role="radio" aria-checked={o.v === value} disabled={off} className={o.v === value ? 'on' : ''} onClick={() => cb(o.v)}>{o.label}</button>)}
    </div>
  );
  return (
    <div className="config k-config">
      {!readOnly && (
        <div className="k-field">
          <Choices value={(mode ?? '') as string} onChange={(id) => set(MODES.find((m) => m.id === id)!.patch)}
            options={MODES.map((m) => ({ v: m.id, label: m.name, icon: m.id === 'blitz' ? 'timer' : m.id === 'mort-subite' ? 'target' : 'dice' }))} />
          <small className="k-hint">{MODES.find((m) => m.id === mode)?.hint ?? 'Règles personnalisées.'}</small>
        </div>
      )}
      <details className="k-details" open={custom || readOnly}>
        <summary><span>Personnaliser les règles<small>{custom ? 'Règles modifiées' : 'Variante, lancers, temps, égalités…'}</small></span></summary>
        <div className="k-details-body">
          <div className="k-field"><span className="k-label">Variante</span>
            <Choices value={config.variant} disabled={off} onChange={(v) => set({ variant: v })} options={VARIANTS} />
          </div>
          {config.variant === 'classique' && <Stepper label="Jetons dans le pot" value={config.totalTokens} min={5} max={99} disabled={off} onChange={(n) => set({ totalTokens: n })} />}
          {config.variant === 'classique' && <Stepper label="Lancers pendant la charge" value={config.chargeThrows} min={1} max={config.maxThrows} disabled={off} onChange={(n) => set({ chargeThrows: n })} />}
          {config.variant === 'decharge' && <Stepper label="Jetons par joueur au départ" value={config.startTokens} min={1} max={30} disabled={off} onChange={(n) => set({ startTokens: n })} />}
          {config.variant === 'manches' && <Stepper label="Nombre de manches" value={config.rounds} min={1} max={30} disabled={off} onChange={(n) => set({ rounds: n })} />}
          <Stepper label="Lancers max. par tour" hint="1er lancer compris" value={config.maxThrows} min={1} max={5} disabled={off} onChange={(n) => set({ maxThrows: n })} />
          <div className="k-field"><span className="k-label">Temps pour jouer <small>à chaque décision</small></span>
            {pills(config.turnSeconds, TURN_CHOICES.map((t) => ({ v: t, label: t ? `${t} s` : 'Illimité' })), (v) => set({ turnSeconds: v }), 'Temps pour jouer')}
          </div>
          <div className="k-field"><span className="k-label">Sens de rotation</span>
            {pills(config.direction, [{ v: 'horaire', label: 'Horaire' }, { v: 'antihoraire', label: 'Antihoraire' }], (v) => set({ direction: v }), 'Sens de rotation')}
          </div>
          <Toggle label="Le premier joueur fixe le nombre de lancers" checked={config.leaderSetsThrows} disabled={off} onChange={(b) => set({ leaderSetsThrows: b })} />
          {config.variant !== 'manches' && (
            <label className="k-field"><span className="k-label">Égalité pour la dernière place</span>
              <select className="k-select" value={config.tieRule} disabled={off} onChange={(e) => set({ tieRule: e.target.value as TieRule })}>
                {Object.entries(TIE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select></label>
          )}
          {config.variant !== 'manches' && config.tieRule === 'barrage' && (
            <div className="k-field"><span className="k-label">Barrage départagé</span>
              {pills(config.rolloffMode, [{ v: 'figure', label: 'À la figure' }, { v: 'addition', label: "À l'addition" }], (v) => set({ rolloffMode: v }), 'Barrage départagé')}
            </div>
          )}
          {config.variant !== 'manches' && (
            <label className="k-field"><span className="k-label">Égalité pour la meilleure combinaison <small>décharge</small></span>
              <select className="k-select" value={config.bestTieRule} disabled={off} onChange={(e) => set({ bestTieRule: e.target.value as GameConfig['bestTieRule'] })}>
                <option value="barrage">Barrage pour savoir qui donne</option>
                <option value="premier">Le premier à l'avoir faite donne</option>
              </select></label>
          )}
          <Toggle label="À combinaison égale, le moins de lancers gagne" checked={config.fewerThrowsWins} disabled={off} onChange={(b) => set({ fewerThrowsWins: b })} />
          {config.variant !== 'manches' && <Toggle label="Le perdant commence la manche suivante" checked={config.loserStarts} disabled={off} onChange={(b) => set({ loserStarts: b })} />}
          <details className="k-details inner">
            <summary><span>Valeur des combinaisons</span></summary>
            <div className="k-details-body">
              <Stepper label="4-2-1" value={config.values.v421} min={1} max={50} disabled={off} onChange={(n) => setV('v421', n)} />
              <Stepper label="Trois as" value={config.values.v111} min={1} max={50} disabled={off} onChange={(n) => setV('v111', n)} />
              <Stepper label="Suite" value={config.values.suite} min={1} max={50} disabled={off} onChange={(n) => setV('suite', n)} />
              <Stepper label="Autre" value={config.values.autre} min={1} max={50} disabled={off} onChange={(n) => setV('autre', n)} />
              <Stepper label="Nénette" hint="minimum pris" value={config.values.nenetteMin} min={1} max={50} disabled={off} onChange={(n) => setV('nenetteMin', n)} />
              <p className="k-hint">Deux as + x (6-1-1 … 2-1-1) valent toujours x ; un brelan vaut la valeur de son dé (brelan de 5 = 5).</p>
            </div>
          </details>
          {!readOnly && <button type="button" className="btn ghost small" onClick={() => onChange?.(DEFAULT_CONFIG)}>Revenir aux règles par défaut</button>}
        </div>
      </details>
    </div>
  );
}
