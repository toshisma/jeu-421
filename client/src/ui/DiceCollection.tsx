import { titleL } from '../i18n/data';
import { tr } from '../i18n/lang';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { BagIcon } from './BagIcon';
import { getItem, type DiceItem } from '../../../shared/progress/catalog';
import {
  COLLECTION, CRAFT_COST, FX, FX_KIND_LABEL, FX_SHARE, RARITIES, RARITY_COLOR, RARITY_LABEL, RARITY_ODDS, SERIES, SHINY_ODDS, SHINY_SUFFIX,
  collectionDie, fxDef, isInviteDie, isSeasonDie, isShiny, INVITE_DICE, INVITE_SET_FRIENDS, INVITE_SET_GAMES, type FxDef, type Rarity,
} from '../../../shared/progress/dice-collection';
import { BAG_PITY, collectionCount, type BagResult } from '../../../shared/progress/profile';
import type { ProfileApi } from '../account/useProfile';
import { faceImage } from '../three/dieArt';
import { sound } from '../audio/sound';
import { Shell } from './Screens';

const diceItem = (id: string): DiceItem | undefined => { const it = getItem(id); return it && it.category === 'dice' ? it : undefined; };
const pct = (x: number) => `${Math.round(x * 1000) / 10} %`.replace('.', ',');

/** Dé en volume (CSS 3D) avec les mêmes faces que dans le bac. */
export function DieCube({ id, size = 64, spin = false, locked = false }: { id: string; size?: number; spin?: boolean; locked?: boolean }) {
  const it = diceItem(id);
  if (!it || locked) {
    return <span className="die-cube locked" style={{ '--s': `${size}px` } as CSSProperties} aria-hidden><span className="q">?</span></span>;
  }
  const art = { body: it.body, body2: it.body2, pip: it.pip, accent: it.accent, pattern: it.pattern, glow: it.glow, seed: it.id, rarity: it.rarity, shiny: it.shiny };
  const faces: [string, number][] = [['f', 1], ['r', 3], ['t', 2], ['b', 6], ['l', 4], ['d', 5]];
  // Résolution adaptée à la taille affichée (écrans haute densité compris).
  const res = size > 90 ? 256 : size > 50 ? 160 : 112;
  return (
    <span className={`die-cube${spin ? ' spin' : ''}${it.shiny ? ' shiny' : ''}${it.glow ? ' glow' : ''}${it.rarity ? ` r-${it.rarity}` : ''}`}
      style={{ '--s': `${size}px`, ...(it.rarity ? { '--rc': RARITY_COLOR[it.rarity], '--glow': it.accent ?? it.pip } : {}) } as CSSProperties} role="img" aria-label={it.name}>
      <span className="cube">
        {faces.map(([k, v]) => <i key={k} className={`fc ${k}`} style={{ backgroundImage: `url(${faceImage(v, art, res)})` }} />)}
      </span>
      {it.shiny && <span className="glints" aria-hidden><i /><i /><i /><i /></span>}
    </span>
  );
}

/** Petit badge de rareté. */
export function RarityTag({ rarity, shiny }: { rarity: Rarity; shiny?: boolean }) {
  return <span className={`rarity-tag r-${rarity}`} style={{ '--rc': RARITY_COLOR[rarity] } as CSSProperties}>{RARITY_LABEL[rarity]}{shiny ? tr('app.brillant') : ''}</span>;
}

const FETE_ICON: Record<string, string> = { 'fx-bravo': '🎉', 'fx-ballons': '🎈', 'fx-eclair': '⚡', 'fx-pluie-or': '🪙', 'fx-feu-artifice': '🎆' };
/** Aperçu d'un effet de lancer : traînée (points de couleur) ou célébration (icône). */
export function FxBadge({ fx, size = 64, locked = false }: { fx: FxDef; size?: number; locked?: boolean }) {
  if (locked) return <span className="die-cube locked" style={{ '--s': `${size}px` } as CSSProperties} aria-hidden><span className="q">?</span></span>;
  return (
    <span className={`fx-badge k-${fx.kind}`} style={{ '--s': `${size}px`, '--rc': RARITY_COLOR[fx.rarity] } as CSSProperties} role="img" aria-label={fx.name}>
      {fx.kind === 'fete' ? <span className="fx-ico">{FETE_ICON[fx.id] ?? '🎉'}</span>
        : fx.colors.concat(fx.colors).slice(0, 7).map((c, i) => <i key={i} style={{ '--c': c, '--i': i } as CSSProperties} />)}
    </span>
  );
}

/** Ouverture d'un sac : le sac s'agite, s'ouvre, le dé apparaît dans la couleur de sa rareté. */
const TIER: Record<Rarity, number> = { commun: 0, rare: 1, epique: 2, legendaire: 3 };
/** Étincelles projetées à la révélation (positions tirées une fois). */
const SPARKS = Array.from({ length: 28 }, (_, i) => {
  const a = (i / 28) * Math.PI * 2 + Math.random() * 0.3, d = 120 + Math.random() * 110;
  return { '--dx': `${Math.cos(a) * d}px`, '--dy': `${Math.sin(a) * d}px`, animationDelay: `${Math.random() * 0.15}s` } as CSSProperties;
});

function BagOpening({ pa, onClose }: { pa: ProfileApi; onClose: () => void }) {
  const [phase, setPhase] = useState<'shake' | 'flash' | 'reveal' | 'error'>('shake');
  const [res, setRes] = useState<BagResult | null>(null);
  const [err, setErr] = useState('');
  const [tint, setTint] = useState<string | null>(null);
  const go = async () => {
    setPhase('shake'); setRes(null); setTint(null);
    sound.unlock(); sound.rattle();
    const r = await pa.openBag();
    if (r.error || !r.result) { setErr(r.error ?? tr('app.ouverture_impossible')); setPhase('error'); return; }
    // Montée de tension : plus le dé est rare, plus elle dure ; la lueur prend la couleur de la rareté à mi-chemin.
    const tier = r.result.shiny ? 3 : TIER[r.result.rarity];
    const build = 1.6 + tier * 0.45;
    sound.bagBuild(build);
    setTimeout(() => setTint(RARITY_COLOR[r.result!.rarity]), build * 500);
    await new Promise((ok) => setTimeout(ok, build * 1000));
    setPhase('flash');
    sound.bagReveal(tier);
    navigator.vibrate?.(tier >= 2 ? [60, 40, 120] : 40);
    await new Promise((ok) => setTimeout(ok, 180));
    setRes(r.result); setPhase('reveal');
  };
  const started = useRef(false);
  useEffect(() => { if (!started.current) { started.current = true; void go(); } }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const it = res ? diceItem(res.id) : undefined;
  const fx = res ? fxDef(res.id) : undefined;
  const left = pa.profile.bags ?? 0;
  const series = res?.series ? SERIES.find((x) => x.id === res.series) : undefined;
  return (
    <div className="bag-open" role="dialog" aria-label={tr('app.ouverture_d_un_sac_de_des')} style={res || tint ? ({ '--rc': res ? RARITY_COLOR[res.rarity] : tint } as CSSProperties) : undefined}>
      {phase === 'flash' && <div className="bag-flash" aria-hidden />}
      <div className={`bag-stage ${phase}${res ? ` r-${res.rarity}` : ''}${res?.shiny ? ' is-shiny' : ''}`}>
        {phase === 'shake' && (
          <div className={`bag-build${tint ? ' tinted' : ''}`} aria-hidden>
            <div className="bag-aura" />
            <div className="bag"><BagIcon size="1em" /></div>
          </div>
        )}
        {phase === 'error' && <p className="error">{err}</p>}
        {phase === 'reveal' && res && (it || fx) && (
          <>
            <div className="burst" aria-hidden />
            <div className="bag-sparks" aria-hidden>{SPARKS.map((sp, i) => <i key={i} style={sp} />)}</div>
            {fx ? <FxBadge fx={fx} size={150} /> : <DieCube id={res.id} size={150} spin />}
            <RarityTag rarity={res.rarity} shiny={res.shiny} />
            <h2>{fx?.name ?? it!.name}</h2>
            {fx && <p className="fx-kind">{FX_KIND_LABEL[fx.kind]}</p>}
            <p className="muted">{fx?.flavor ?? collectionDie(res.id)?.flavor}</p>
            <p className="bag-note">{res.duplicate ? tr('app.deja_dans_votre_collection_eclats', { shards: res.shards }) : res.shiny ? tr('app.un_de_brillant_seul_1_sac_sur') : tr('app.nouveau_dans_votre_collection')}</p>
            {series && <p className="bag-series">{tr('app.serie_completee_titre_et_tapis_exclu', { name: series.name, title: series.title })}</p>}
          </>
        )}
      </div>
      <div className="bag-actions">
        {phase === 'reveal' && res && !res.duplicate && (
          <button className="btn secondary" onClick={() => { void (fx ? pa.equipFx(fx.kind, fx.id) : pa.equipItem(res.id)); onClose(); }}>{fx ? tr('app.utiliser') : tr('app.jouer_avec')}</button>
        )}
        {(phase === 'reveal' || phase === 'error') && left > 0 && <button className="btn primary" onClick={() => void go()}>{tr('app.ouvrir_le_suivant', { left })}</button>}
        {(phase === 'reveal' || phase === 'error') && <button className="btn ghost" onClick={onClose}>{tr('app.fermer')}</button>}
      </div>
    </div>
  );
}

/** Fiche d'un dé : aperçu, rareté, histoire, actions. */
function DieSheet({ pa, id, onClose }: { pa: ProfileApi; id: string; onClose: () => void }) {
  const c = collectionDie(id)!;
  const it = diceItem(id)!;
  const p = pa.profile;
  const owned = p.owned.includes(id);
  const equipped = p.equipped.dice === id;
  const show = p.showcase ?? [];
  const inShow = show.includes(id);
  const cost = CRAFT_COST[c.rarity];
  const [err, setErr] = useState<string | null>(null);
  const run = async (f: () => Promise<string | null>) => { setErr(await f()); };
  return (
    <div className="sheet-back" onClick={onClose}>
      <div className="sheet die-sheet" role="dialog" aria-label={it.name} onClick={(e) => e.stopPropagation()} style={{ '--rc': RARITY_COLOR[c.rarity] } as CSSProperties}>
        <DieCube id={id} size={130} spin locked={!owned && isShiny(id)} />
        <RarityTag rarity={c.rarity} shiny={isShiny(id)} />
        <h2>{it.name}</h2>
        <p className="muted">{c.flavor}</p>
        {owned ? (
          <div className="row">
            <button className="btn primary" disabled={equipped} onClick={() => void run(() => pa.equipItem(id))}>{equipped ? tr('app.vos_des_actuels') : tr('app.jouer_avec')}</button>
            <button className="btn secondary" disabled={!inShow && show.length >= 3}
              onClick={() => void run(() => pa.setVitrine(inShow ? show.filter((x) => x !== id) : [...show, id]))}>
              {inShow ? tr('app.retirer_de_la_vitrine') : show.length >= 3 ? tr('app.vitrine_pleine_3') : tr('app.mettre_en_vitrine')}
            </button>
          </div>
        ) : isShiny(id) || isSeasonDie(id) || isInviteDie(id) ? (
          <p className="muted">{isInviteDie(id) ? tr('app.set_feu_et_glace_offert_quand_amis', { INVITE_SET_FRIENDS, INVITE_SET_GAMES }) : isSeasonDie(id) ? tr('app.les_des_de_saison_se_gagnent_seuleme') : tr('app.les_des_brillants_ne_se_fabriquent_p')}</p>
        ) : (
          <div className="row">
            <button className="btn primary" disabled={(p.shards ?? 0) < cost || !pa.isAccount} onClick={() => void run(() => pa.craft(id))}>{tr('app.fabriquer_pour_eclats', { cost })}</button>
            <span className="muted small">{tr('app.vous_avez')} {p.shards ?? 0} {tr('app.eclats')}</span>
          </div>
        )}
        {err && <p className="error">{err}</p>}
        <button className="btn ghost" onClick={onClose}>{tr('app.fermer')}</button>
      </div>
    </div>
  );
}

/** Fiche d'un effet de lancer. */
function FxSheet({ pa, fx, onClose, onTry }: { pa: ProfileApi; fx: FxDef; onClose: () => void; onTry?: (id: string) => void }) {
  const p = pa.profile;
  const owned = p.owned.includes(fx.id);
  const on = p.fx?.[fx.kind] === fx.id;
  const cost = CRAFT_COST[fx.rarity];
  const [err, setErr] = useState<string | null>(null);
  const run = async (f: () => Promise<string | null>) => { setErr(await f()); };
  return (
    <div className="sheet-back" onClick={onClose}>
      <div className="sheet die-sheet" role="dialog" aria-label={fx.name} onClick={(e) => e.stopPropagation()} style={{ '--rc': RARITY_COLOR[fx.rarity] } as CSSProperties}>
        <FxBadge fx={fx} size={120} locked={!owned} />
        <RarityTag rarity={fx.rarity} />
        <h2>{owned ? fx.name : '???'}</h2>
        <p className="fx-kind">{FX_KIND_LABEL[fx.kind]}</p>
        {owned && <p className="muted">{fx.flavor}</p>}
        <p className="muted small">{fx.kind === 'trainee' ? tr('app.laisse_une_trainee_derriere_vos_des_') : tr('app.eclate_a_l_ecran_quand_vous_faites')} {tr('app.les_autres_joueurs_la_voient_en_lign')}</p>
        {owned ? (
          <div className="row">
            <button className="btn primary" onClick={() => void run(() => pa.equipFx(fx.kind, on ? null : fx.id))}>{on ? tr('app.retirer') : tr('app.utiliser')}</button>
            {onTry && <button className="btn secondary" onClick={() => onTry(fx.id)}>{tr('app.essayer_dans_le_bac')}</button>}
          </div>
        ) : (
          <div className="row">
            <button className="btn primary" disabled={(p.shards ?? 0) < cost || !pa.isAccount} onClick={() => void run(() => pa.craft(fx.id))}>{tr('app.fabriquer_pour_eclats', { cost })}</button>
            <span className="muted small">{tr('app.vous_avez')} {p.shards ?? 0} {tr('app.eclats')}</span>
          </div>
        )}
        {err && <p className="error">{err}</p>}
        <button className="btn ghost" onClick={onClose}>{tr('app.fermer')}</button>
      </div>
    </div>
  );
}

export function CollectionScreen({ pa, onBack, onAccount, onTry, openNow }: {
  pa: ProfileApi; onBack: () => void; onAccount: () => void; onTry?: (fxId: string) => void;
  /** Ouvrir un sac dès l'arrivée (bouton « Ouvrir » d'une fin de partie ou du menu du Courtisan). */
  openNow?: boolean;
}) {
  const p = pa.profile;
  const [filter, setFilter] = useState<Rarity | 'tous'>('tous');
  const [tab, setTab] = useState<'des' | 'effets' | 'series'>('des');
  const [openFx, setOpenFx] = useState<FxDef | null>(null);
  const seasonDice = p.owned.filter(isSeasonDie);
  const [open, setOpen] = useState<string | null>(null);
  const [opening, setOpening] = useState(() => !!openNow && pa.isAccount && (pa.profile.bags ?? 0) > 0);
  const count = collectionCount(p);
  const bags = p.bags ?? 0;
  // Les dés possédés d'abord (du plus rare au plus commun), puis ceux qui restent à trouver.
  const list = useMemo(() => {
    const rank = (c: (typeof COLLECTION)[number]) => (p.owned.includes(c.id) || p.owned.includes(c.id + SHINY_SUFFIX) ? 0 : 10) + (3 - RARITIES.indexOf(c.rarity));
    return COLLECTION.filter((c) => filter === 'tous' || c.rarity === filter).map((c, i) => ({ c, i })).sort((a, b) => rank(a.c) - rank(b.c) || a.i - b.i).map((x) => x.c);
  }, [filter, p.owned]);
  const owns = (id: string) => p.owned.includes(id);
  return (
    <Shell title={tr('app.collection_de_des')} onBack={onBack} wide>
      <section className="coll-head">
        <div className="bag-box">
          <span className="bag-ico" aria-hidden><BagIcon size="1em" /></span>
          <div>
            <b>{bags} {tr(bags > 1 ? 'app.sac_a_ouvrir.p' : 'app.sac_a_ouvrir')}</b>
            <small>{tr('app.on_en_trouve_dans_les_trois_jeux', { BAG_PITY })}</small>
          </div>
          {pa.isAccount
            ? <button className="btn primary" disabled={bags < 1} onClick={() => setOpening(true)}>{tr('app.ouvrir_un_sac')}</button>
            : <button className="btn primary" onClick={onAccount}>{tr('app.creer_un_compte_pour_ouvrir')}</button>}
        </div>
        <div className="coll-stats">
          <span><b>{count.owned}</b>{tr('app.des', { total: count.total })}</span>
          <span><b>{count.shiny}</b> {tr(count.shiny > 1 ? 'app.brillant_2.p' : 'app.brillant_2')}</span>
          <span><b>{count.fx}</b>{tr('app.effets_2', { fxTotal: count.fxTotal })}</span>
          <span><b>{p.shards ?? 0}</b> {tr('app.eclats_2')}</span>
        </div>
        {!pa.isAccount && <p className="note">{tr('app.vos_sacs_sont_gardes_avec_un_compte')}</p>}
      </section>

      <div className="seg wide-seg coll-tabs">
        <button className={tab === 'des' ? 'on' : ''} onClick={() => setTab('des')}>{tr('app.des_2')}</button>
        <button className={tab === 'effets' ? 'on' : ''} onClick={() => setTab('effets')}>{tr('app.effets')}</button>
        <button className={tab === 'series' ? 'on' : ''} onClick={() => setTab('series')}>{tr('app.series')}</button>
      </div>

      {tab === 'des' && (<>
      <div className="seg wide-seg coll-filter">
        <button className={filter === 'tous' ? 'on' : ''} onClick={() => setFilter('tous')}>{tr('app.tous')}</button>
        {RARITIES.map((r) => <button key={r} className={filter === r ? 'on' : ''} onClick={() => setFilter(r)} style={{ '--rc': RARITY_COLOR[r] } as CSSProperties}>{RARITY_LABEL[r]}</button>)}
      </div>

      <ul className="coll-grid">
        {INVITE_DICE.map((c) => (
          <li key={c.id}>
            <button className={`coll-card r-legendaire${owns(c.id) ? '' : ' locked'}`} style={{ '--rc': RARITY_COLOR.legendaire } as CSSProperties} onClick={() => setOpen(c.id)}>
              <DieCube id={c.id} size={56} />
              <b>{c.name}</b>
              <span className="rarity-tag" style={{ '--rc': '#ff6a2b' } as CSSProperties}>{owns(c.id) ? tr('app.feu_et_glace') : tr('app.parrainage_2')}</span>
            </button>
          </li>
        ))}
        {seasonDice.map((id) => (
          <li key={id}>
            <button className="coll-card r-epique season" style={{ '--rc': RARITY_COLOR.epique } as CSSProperties} onClick={() => setOpen(id)}>
              <DieCube id={id} size={56} />
              <b>{diceItem(id)?.name}</b>
              <span className="rarity-tag" style={{ '--rc': '#f2b632' } as CSSProperties}>{tr('app.saison')}</span>
            </button>
          </li>
        ))}
        {list.map((c) => {
          const has = owns(c.id), shiny = owns(c.id + SHINY_SUFFIX);
          return (
            <li key={c.id}>
              <button className={`coll-card r-${c.rarity}${has ? '' : ' missing'}${p.equipped.dice === c.id || p.equipped.dice === c.id + SHINY_SUFFIX ? ' equipped' : ''}`}
                style={{ '--rc': RARITY_COLOR[c.rarity] } as CSSProperties} onClick={() => setOpen(shiny && !has ? c.id + SHINY_SUFFIX : c.id)}>
                <DieCube id={c.id} size={56} locked={!has} />
                <b>{has ? c.name : '???'}</b>
                <RarityTag rarity={c.rarity} />
                {shiny && <span className="shiny-badge" title={tr('app.version_brillante_possedee')} onClick={(e) => { e.stopPropagation(); setOpen(c.id + SHINY_SUFFIX); }}>✦</span>}
              </button>
            </li>
          );
        })}
      </ul>

      </>)}

      {tab === 'effets' && (
        <>
          <p className="muted">{tr('app.les_effets_s_ajoutent_a_vos_lancers')}</p>
          {(['trainee', 'fete'] as const).map((k) => (
            <section key={k}>
              <h3>{k === 'trainee' ? tr('app.trainees_derriere_les_des') : tr('app.celebrations_du_4_2_1')}</h3>
              <ul className="coll-grid">
                {FX.filter((f) => f.kind === k).map((f) => {
                  const has = owns(f.id);
                  return (
                    <li key={f.id}>
                      <button className={`coll-card r-${f.rarity}${has ? '' : ' missing'}${p.fx?.[k] === f.id ? ' equipped' : ''}`} style={{ '--rc': RARITY_COLOR[f.rarity] } as CSSProperties} onClick={() => setOpenFx(f)}>
                        <FxBadge fx={f} size={56} locked={!has} />
                        <b>{has ? f.name : '???'}</b>
                        <RarityTag rarity={f.rarity} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </>
      )}

      {tab === 'series' && (
        <ul className="series-list">
          {SERIES.map((se) => {
            const got = se.dice.filter((d) => owns(d) || owns(d + SHINY_SUFFIX)).length;
            const done = (p.titles ?? []).includes(`serie:${se.id}`);
            return (
              <li key={se.id} className={done ? 'done' : ''}>
                <div className="series-head"><b>{se.name}</b><span>{got}/{se.dice.length}</span></div>
                <div className="series-dice">
                  {se.dice.map((d) => <DieCube key={d} id={d} size={40} locked={!(owns(d) || owns(d + SHINY_SUFFIX))} />)}
                </div>
                <small className="muted">{done ? tr('app.completee_titre_et_tapis_exclusif_de', { v: titleL(`serie:${se.id}`) }) : tr('app.recompense_le_titre_et_un_tapis_excl', { title: se.title })}</small>
              </li>
            );
          })}
        </ul>
      )}

      <details className="odds">
        <summary>{tr('app.chances_dans_un_sac')}</summary>
        <p>{tr('app.un_sac_contient_un_de')} {pct(1 - FX_SHARE)} {tr('app.du_temps_un_effet_de_lancer')} {pct(FX_SHARE)} {tr('app.du_temps')}</p>
        <p>{RARITIES.map((r) => `${RARITY_LABEL[r]} : ${pct(RARITY_ODDS[r])}`).join(' ; ')}{tr('app.de_brillant_1_sur')} {Math.round(1 / SHINY_ODDS)}.</p>
        <p>{tr('app.un_doublon_se_transforme_en_eclats_q')}</p>
      </details>

      {open && <DieSheet pa={pa} id={open} onClose={() => setOpen(null)} />}
      {openFx && <FxSheet pa={pa} fx={openFx} onClose={() => setOpenFx(null)} onTry={onTry} />}
      {opening && <BagOpening pa={pa} onClose={() => setOpening(false)} />}
    </Shell>
  );
}

/** Carte de l'accueil : « Collectionne des dés super rares ! » */
export function CollectionPromo({ pa, onOpen }: { pa: ProfileApi; onOpen: () => void }) {
  const bags = pa.profile.bags ?? 0;
  const count = collectionCount(pa.profile);
  return (
    <button className="coll-promo" onClick={onOpen}>
      <span className="promo-dice" aria-hidden>
        <DieCube id="dc-paillettes" size={44} spin />
        <DieCube id="dc-dragon" size={58} spin />
        <DieCube id="dc-galaxie" size={44} spin />
      </span>
      <span className="promo-text">
        <b>{tr('app.collectionne_des_des_super_rares')}</b>
        <span>{count.owned > 0 ? `${count.owned}/${count.total} dés dans votre collection.` : tr('app.25_des_a_trouver_du_commun_au')} {tr('app.les_autres_les_voient_quand_vous_lan')}</span>
      </span>
      {bags > 0 && <span className="promo-bags"><BagIcon size="1em" /> {bags} {tr(bags > 1 ? 'app.sac_a_ouvrir.p' : 'app.sac_a_ouvrir')}</span>}
    </button>
  );
}

/** Vitrine d'un joueur (profil). */
export function Showcase({ ids, count }: { ids: string[]; count?: { owned: number; total: number; shiny: number } }) {
  if (!ids.length && !count?.owned) return null;
  return (
    <div className="showcase">
      <div className="showcase-dice">
        {ids.map((id) => { const c = collectionDie(id); return c ? (
          <figure key={id} style={{ '--rc': RARITY_COLOR[c.rarity] } as CSSProperties}>
            <DieCube id={id} size={56} spin={c.rarity === 'legendaire' || isShiny(id)} />
            <figcaption>{diceItem(id)?.name}</figcaption>
          </figure>
        ) : null; })}
      </div>
      {count && <small className="muted">{tr('app.collection_des', { owned: count.owned, total: count.total })}{count.shiny ? tr(count.shiny > 1 ? 'app.brillant_3.p' : 'app.brillant_3', { shiny: count.shiny }) : ''}</small>}
    </div>
  );
}
