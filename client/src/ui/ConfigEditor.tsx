import { MODES, modeOf, sanitizeConfig, TURN_CHOICES, TIE_LABELS, DEFAULT_CONFIG, type GameConfig, type Variant, type TieRule } from '../../../shared/config';
import { Choices, Stepper, Toggle } from './kit';
import { tr } from '../i18n/lang';
import { trCombo } from '../i18n/g421';
import type { MessageKey } from '../../../shared/i18n';

interface Props {
  config: GameConfig;
  onChange?: (c: GameConfig) => void;
  readOnly?: boolean;
}

const VARIANTS: () => { v: Variant; label: string; hint: string }[] = () => [
  { v: 'classique', label: tr('g421.variant.classique'), hint: tr('g421.cfgE.hintClassic') },
  { v: 'decharge', label: tr('g421.cfgE.dech'), hint: tr('g421.cfgE.hintDech') },
  { v: 'manches', label: tr('g421.variant.manches'), hint: tr('g421.cfgE.hintManches') },
];
const modeT = (id: string, f: 'name' | 'hint') => tr(`g421.mode.${id}.${f}` as MessageKey);

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
            options={MODES.map((m) => ({ v: m.id, label: modeT(m.id, 'name'), icon: m.id === 'blitz' ? 'timer' : m.id === 'mort-subite' ? 'target' : 'dice' }))} />
          <small className="k-hint">{mode ? modeT(mode, 'hint') : tr('g421.cfgE.custom')}</small>
        </div>
      )}
      <details className="k-details" open={custom || readOnly}>
        <summary><span>{tr('g421.cfgE.customize')}<small>{tr(custom ? 'g421.cfgE.modified' : 'g421.cfgE.summary')}</small></span></summary>
        <div className="k-details-body">
          <div className="k-field"><span className="k-label">{tr('g421.cfgE.variant')}</span>
            <Choices value={config.variant} disabled={off} onChange={(v) => set({ variant: v })} options={VARIANTS()} />
          </div>
          {config.variant === 'classique' && <Stepper label={tr('g421.cfgE.tokensPot')} value={config.totalTokens} min={5} max={99} disabled={off} onChange={(n) => set({ totalTokens: n })} />}
          {config.variant === 'classique' && <Stepper label={tr('g421.cfgE.chargeThrows')} value={config.chargeThrows} min={1} max={config.maxThrows} disabled={off} onChange={(n) => set({ chargeThrows: n })} />}
          {config.variant === 'decharge' && <Stepper label={tr('g421.cfgE.startTokens')} value={config.startTokens} min={1} max={30} disabled={off} onChange={(n) => set({ startTokens: n })} />}
          {config.variant === 'manches' && <Stepper label={tr('g421.cfgE.rounds')} value={config.rounds} min={1} max={30} disabled={off} onChange={(n) => set({ rounds: n })} />}
          <Stepper label={tr('g421.cfgE.maxThrows')} hint={tr('g421.cfgE.firstIncl')} value={config.maxThrows} min={1} max={5} disabled={off} onChange={(n) => set({ maxThrows: n })} />
          <div className="k-field"><span className="k-label">{tr('g421.timeToPlay')} <small>{tr('g421.cfgE.eachDecision')}</small></span>
            {pills(config.turnSeconds, TURN_CHOICES.map((t) => ({ v: t, label: t ? `${t} s` : tr('g421.cfgE.unlimited') })), (v) => set({ turnSeconds: v }), tr('g421.timeToPlay'))}
          </div>
          <div className="k-field"><span className="k-label">{tr('g421.cfgE.direction')}</span>
            {pills(config.direction, [{ v: 'horaire', label: tr('g421.cfgE.cw') }, { v: 'antihoraire', label: tr('g421.cfgE.ccw') }], (v) => set({ direction: v }), tr('g421.cfgE.direction'))}
          </div>
          <Toggle label={tr('g421.cfgE.leaderSets')} checked={config.leaderSetsThrows} disabled={off} onChange={(b) => set({ leaderSetsThrows: b })} />
          {config.variant !== 'manches' && (
            <label className="k-field"><span className="k-label">{tr('g421.cfgE.tieLast')}</span>
              <select className="k-select" value={config.tieRule} disabled={off} onChange={(e) => set({ tieRule: e.target.value as TieRule })}>
                {Object.entries(TIE_LABELS).map(([k]) => <option key={k} value={k}>{tr(`g421.tie.${k}` as MessageKey)}</option>)}
              </select></label>
          )}
          {config.variant !== 'manches' && config.tieRule === 'barrage' && (
            <div className="k-field"><span className="k-label">{tr('g421.cfgE.barMode')}</span>
              {pills(config.rolloffMode, [{ v: 'figure', label: tr('g421.cfgE.byFig') }, { v: 'addition', label: tr('g421.cfgE.byAdd') }], (v) => set({ rolloffMode: v }), tr('g421.cfgE.barMode'))}
            </div>
          )}
          {config.variant !== 'manches' && (
            <label className="k-field"><span className="k-label">{tr('g421.cfgE.tieBest')} <small>{tr('g421.cfgE.dechLow')}</small></span>
              <select className="k-select" value={config.bestTieRule} disabled={off} onChange={(e) => set({ bestTieRule: e.target.value as GameConfig['bestTieRule'] })}>
                <option value="barrage">{tr('g421.cfgE.optBarrage')}</option>
                <option value="premier">{tr('g421.cfgE.optFirst')}</option>
              </select></label>
          )}
          <Toggle label={tr('g421.cfgE.fewer')} checked={config.fewerThrowsWins} disabled={off} onChange={(b) => set({ fewerThrowsWins: b })} />
          {config.variant !== 'manches' && <Toggle label={tr('g421.cfgE.loserStarts')} checked={config.loserStarts} disabled={off} onChange={(b) => set({ loserStarts: b })} />}
          <details className="k-details inner">
            <summary><span>{tr('g421.cfgE.values')}</span></summary>
            <div className="k-details-body">
              <Stepper label="4-2-1" value={config.values.v421} min={1} max={50} disabled={off} onChange={(n) => setV('v421', n)} />
              <Stepper label={trCombo('Trois as')} value={config.values.v111} min={1} max={50} disabled={off} onChange={(n) => setV('v111', n)} />
              <Stepper label={tr('g421.cfgE.straight')} value={config.values.suite} min={1} max={50} disabled={off} onChange={(n) => setV('suite', n)} />
              <Stepper label={tr('g421.cfgE.other')} value={config.values.autre} min={1} max={50} disabled={off} onChange={(n) => setV('autre', n)} />
              <Stepper label="Nénette" hint={tr('g421.cfgE.minTaken')} value={config.values.nenetteMin} min={1} max={50} disabled={off} onChange={(n) => setV('nenetteMin', n)} />
              <p className="k-hint">{tr('g421.cfgE.note')}</p>
            </div>
          </details>
          {!readOnly && <button type="button" className="btn ghost small" onClick={() => onChange?.(DEFAULT_CONFIG)}>{tr('g421.cfgE.reset')}</button>}
        </div>
      </details>
    </div>
  );
}
