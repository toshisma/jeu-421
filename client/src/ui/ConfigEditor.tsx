import { MODES, modeOf, sanitizeConfig, TURN_CHOICES, TIE_LABELS, VARIANT_LABELS, DEFAULT_CONFIG, type GameConfig, type Variant, type TieRule } from '../../../shared/config';

interface Props {
  config: GameConfig;
  onChange?: (c: GameConfig) => void;
  readOnly?: boolean;
}

/** Écran de configuration des règles (variante, relances, jetons, égalités, valeurs…). */
export function ConfigEditor({ config, onChange, readOnly }: Props) {
  const set = (patch: Partial<GameConfig>) => onChange?.(sanitizeConfig({ ...config, ...patch }));
  const setV = (k: keyof GameConfig['values'], v: number) => set({ values: { ...config.values, [k]: v } });
  const num = (label: string, value: number, min: number, max: number, cb: (n: number) => void, hint?: string) => (
    <label className="field">
      <span>{label}{hint && <small>{hint}</small>}</span>
      <input type="number" min={min} max={max} value={value} disabled={readOnly}
        onChange={(e) => cb(Number(e.target.value))} />
    </label>
  );
  const check = (label: string, value: boolean, cb: (b: boolean) => void) => (
    <label className="field check">
      <input type="checkbox" checked={value} disabled={readOnly} onChange={(e) => cb(e.target.checked)} />
      <span>{label}</span>
    </label>
  );

  return (
    <div className="config">
      {!readOnly && (
        <div className="field modes">
          <span>Format<small>{MODES.find((m) => m.id === modeOf(config))?.hint ?? 'Réglages personnalisés.'}</small></span>
          <div className="seg">
            {MODES.map((m) => <button type="button" key={m.id} className={modeOf(config) === m.id ? 'on' : ''} onClick={() => set(m.patch)}>{m.name}</button>)}
          </div>
        </div>
      )}
      <fieldset disabled={readOnly}>
        <label className="field">
          <span>Variante</span>
          <select value={config.variant} onChange={(e) => set({ variant: e.target.value as Variant })}>
            {Object.entries(VARIANT_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
        {config.variant === 'classique' && num('Jetons dans le pot', config.totalTokens, 5, 99, (n) => set({ totalTokens: n }))}
        {config.variant === 'classique' && num('Lancers pendant la charge', config.chargeThrows, 1, config.maxThrows, (n) => set({ chargeThrows: n }))}
        {config.variant === 'decharge' && num('Jetons par joueur au départ', config.startTokens, 1, 30, (n) => set({ startTokens: n }))}
        {config.variant === 'manches' && num('Nombre de manches', config.rounds, 1, 30, (n) => set({ rounds: n }))}
        {num('Lancers max. par tour', config.maxThrows, 1, 5, (n) => set({ maxThrows: n }), '1er lancer compris')}
        {check('Le premier joueur fixe le nombre de lancers', config.leaderSetsThrows, (b) => set({ leaderSetsThrows: b }))}
        <label className="field">
          <span>Temps pour jouer<small>à chaque décision</small></span>
          <select value={config.turnSeconds} onChange={(e) => set({ turnSeconds: Number(e.target.value) })}>
            {TURN_CHOICES.map((t) => <option key={t} value={t}>{t ? `${t} secondes` : 'Illimité'}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Sens de rotation</span>
          <select value={config.direction} onChange={(e) => set({ direction: e.target.value as GameConfig['direction'] })}>
            <option value="horaire">Horaire</option>
            <option value="antihoraire">Antihoraire</option>
          </select>
        </label>
        {config.variant !== 'manches' && (
          <label className="field">
            <span>Égalité pour la dernière place</span>
            <select value={config.tieRule} onChange={(e) => set({ tieRule: e.target.value as TieRule })}>
              {Object.entries(TIE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </label>
        )}
        {config.variant !== 'manches' && config.tieRule === 'barrage' && (
          <label className="field">
            <span>Barrage départagé</span>
            <select value={config.rolloffMode} onChange={(e) => set({ rolloffMode: e.target.value as GameConfig['rolloffMode'] })}>
              <option value="figure">À la figure (combinaisons)</option>
              <option value="addition">À l'addition (total des dés)</option>
            </select>
          </label>
        )}
        {check('À combinaison égale, le moins de lancers gagne', config.fewerThrowsWins, (b) => set({ fewerThrowsWins: b }))}
        {config.variant !== 'manches' && check('Le perdant commence la manche suivante', config.loserStarts, (b) => set({ loserStarts: b }))}
      </fieldset>
      <details className="values">
        <summary>Valeur des combinaisons</summary>
        <fieldset disabled={readOnly} className="grid2">
          {num('4-2-1', config.values.v421, 1, 50, (n) => setV('v421', n))}
          {num('Trois as', config.values.v111, 1, 50, (n) => setV('v111', n))}
          {num('Suite', config.values.suite, 1, 50, (n) => setV('suite', n))}
          {num('Autre', config.values.autre, 1, 50, (n) => setV('autre', n))}
          {num('Nénette (minimum pris)', config.values.nenetteMin, 1, 50, (n) => setV('nenetteMin', n))}
        </fieldset>
        <p className="muted small">Deux as + x (6-1-1 … 2-1-1) valent toujours x ; un brelan vaut la valeur de son dé (brelan de 5 = 5).</p>
      </details>
      {!readOnly && <button type="button" className="btn ghost small" onClick={() => onChange?.(DEFAULT_CONFIG)}>Règles par défaut</button>}
    </div>
  );
}
