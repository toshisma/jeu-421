import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { BagIcon } from './BagIcon';
import { getItem, type DiceItem } from '../../../shared/progress/catalog';
import {
  COLLECTION, CRAFT_COST, FX, FX_KIND_LABEL, FX_SHARE, RARITIES, RARITY_COLOR, RARITY_LABEL, RARITY_ODDS, SERIES, SHINY_ODDS, SHINY_SUFFIX,
  collectionDie, fxDef, isInviteDie, isSeasonDie, isShiny, INVITE_DICE, INVITE_SET_FRIENDS, INVITE_SET_GAMES, type FxDef, type Rarity,
} from '../../../shared/progress/dice-collection';
import { titleLabel } from '../../../shared/progress/profile';
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
  return <span className={`rarity-tag r-${rarity}`} style={{ '--rc': RARITY_COLOR[rarity] } as CSSProperties}>{RARITY_LABEL[rarity]}{shiny ? ' ✦ brillant' : ''}</span>;
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
    if (r.error || !r.result) { setErr(r.error ?? 'Ouverture impossible.'); setPhase('error'); return; }
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
    <div className="bag-open" role="dialog" aria-label="Ouverture d'un sac de dés" style={res || tint ? ({ '--rc': res ? RARITY_COLOR[res.rarity] : tint } as CSSProperties) : undefined}>
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
            <p className="bag-note">{res.duplicate ? `Déjà dans votre collection : +${res.shards} éclats` : res.shiny ? 'Un dé brillant ! Seul 1 sac sur 150 en contient un.' : 'Nouveau dans votre collection !'}</p>
            {series && <p className="bag-series">Série « {series.name} » complétée : titre « {series.title} » et tapis exclusif débloqués !</p>}
          </>
        )}
      </div>
      <div className="bag-actions">
        {phase === 'reveal' && res && !res.duplicate && (
          <button className="btn secondary" onClick={() => { void (fx ? pa.equipFx(fx.kind, fx.id) : pa.equipItem(res.id)); onClose(); }}>{fx ? 'Utiliser' : 'Jouer avec'}</button>
        )}
        {(phase === 'reveal' || phase === 'error') && left > 0 && <button className="btn primary" onClick={() => void go()}>Ouvrir le suivant ({left})</button>}
        {(phase === 'reveal' || phase === 'error') && <button className="btn ghost" onClick={onClose}>Fermer</button>}
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
            <button className="btn primary" disabled={equipped} onClick={() => void run(() => pa.equipItem(id))}>{equipped ? 'Vos dés actuels' : 'Jouer avec'}</button>
            <button className="btn secondary" disabled={!inShow && show.length >= 3}
              onClick={() => void run(() => pa.setVitrine(inShow ? show.filter((x) => x !== id) : [...show, id]))}>
              {inShow ? 'Retirer de la vitrine' : show.length >= 3 ? 'Vitrine pleine (3)' : 'Mettre en vitrine'}
            </button>
          </div>
        ) : isShiny(id) || isSeasonDie(id) || isInviteDie(id) ? (
          <p className="muted">{isInviteDie(id) ? `Set « Feu et Glace » : offert quand ${INVITE_SET_FRIENDS} amis invités avec votre lien ont créé leur compte et joué ${INVITE_SET_GAMES} parties chacun.` : isSeasonDie(id) ? 'Les dés de saison se gagnent seulement en fin de saison classée.' : 'Les dés brillants ne se fabriquent pas : on les trouve seulement dans les sacs.'}</p>
        ) : (
          <div className="row">
            <button className="btn primary" disabled={(p.shards ?? 0) < cost || !pa.isAccount} onClick={() => void run(() => pa.craft(id))}>Fabriquer pour {cost} éclats</button>
            <span className="muted small">Vous avez {p.shards ?? 0} éclats.</span>
          </div>
        )}
        {err && <p className="error">{err}</p>}
        <button className="btn ghost" onClick={onClose}>Fermer</button>
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
        <p className="muted small">{fx.kind === 'trainee' ? 'Laisse une traînée derrière vos dés quand ils roulent.' : 'Éclate à l’écran quand vous faites un 4-2-1 ou trois as.'} Les autres joueurs la voient en ligne.</p>
        {owned ? (
          <div className="row">
            <button className="btn primary" onClick={() => void run(() => pa.equipFx(fx.kind, on ? null : fx.id))}>{on ? 'Retirer' : 'Utiliser'}</button>
            {onTry && <button className="btn secondary" onClick={() => onTry(fx.id)}>🎲 Essayer dans le bac</button>}
          </div>
        ) : (
          <div className="row">
            <button className="btn primary" disabled={(p.shards ?? 0) < cost || !pa.isAccount} onClick={() => void run(() => pa.craft(fx.id))}>Fabriquer pour {cost} éclats</button>
            <span className="muted small">Vous avez {p.shards ?? 0} éclats.</span>
          </div>
        )}
        {err && <p className="error">{err}</p>}
        <button className="btn ghost" onClick={onClose}>Fermer</button>
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
    <Shell title="Collection de dés" onBack={onBack} wide>
      <section className="coll-head">
        <div className="bag-box">
          <span className="bag-ico" aria-hidden><BagIcon size="1em" /></span>
          <div>
            <b>{bags} sac{bags > 1 ? 's' : ''} à ouvrir</b>
            <small>On en trouve en jouant au 421 et au Courtisan : environ 1 partie gagnée sur 5, et au plus tard toutes les {BAG_PITY} parties. Aussi au 7e jour de la série et contre le patron de la semaine.</small>
          </div>
          {pa.isAccount
            ? <button className="btn primary" disabled={bags < 1} onClick={() => setOpening(true)}>Ouvrir un sac</button>
            : <button className="btn primary" onClick={onAccount}>Créer un compte pour ouvrir</button>}
        </div>
        <div className="coll-stats">
          <span><b>{count.owned}</b>/{count.total} dés</span>
          <span><b>{count.shiny}</b> brillant{count.shiny > 1 ? 's' : ''}</span>
          <span><b>{count.fx}</b>/{count.fxTotal} effets</span>
          <span><b>{p.shards ?? 0}</b> éclats</span>
        </div>
        {!pa.isAccount && <p className="note">Vos sacs sont gardés. Avec un compte gratuit, vous les ouvrez, vos dés sont sauvegardés, et les autres joueurs les voient quand vous lancez.</p>}
      </section>

      <div className="seg wide-seg coll-tabs">
        <button className={tab === 'des' ? 'on' : ''} onClick={() => setTab('des')}>Dés</button>
        <button className={tab === 'effets' ? 'on' : ''} onClick={() => setTab('effets')}>Effets</button>
        <button className={tab === 'series' ? 'on' : ''} onClick={() => setTab('series')}>Séries</button>
      </div>

      {tab === 'des' && (<>
      <div className="seg wide-seg coll-filter">
        <button className={filter === 'tous' ? 'on' : ''} onClick={() => setFilter('tous')}>Tous</button>
        {RARITIES.map((r) => <button key={r} className={filter === r ? 'on' : ''} onClick={() => setFilter(r)} style={{ '--rc': RARITY_COLOR[r] } as CSSProperties}>{RARITY_LABEL[r]}</button>)}
      </div>

      <ul className="coll-grid">
        {INVITE_DICE.map((c) => (
          <li key={c.id}>
            <button className={`coll-card r-legendaire${owns(c.id) ? '' : ' locked'}`} style={{ '--rc': RARITY_COLOR.legendaire } as CSSProperties} onClick={() => setOpen(c.id)}>
              <DieCube id={c.id} size={56} />
              <b>{c.name}</b>
              <span className="rarity-tag" style={{ '--rc': '#ff6a2b' } as CSSProperties}>{owns(c.id) ? 'Feu et Glace' : '🔒 Parrainage'}</span>
            </button>
          </li>
        ))}
        {seasonDice.map((id) => (
          <li key={id}>
            <button className="coll-card r-epique season" style={{ '--rc': RARITY_COLOR.epique } as CSSProperties} onClick={() => setOpen(id)}>
              <DieCube id={id} size={56} />
              <b>{diceItem(id)?.name}</b>
              <span className="rarity-tag" style={{ '--rc': '#f2b632' } as CSSProperties}>Saison</span>
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
                {shiny && <span className="shiny-badge" title="Version brillante possédée" onClick={(e) => { e.stopPropagation(); setOpen(c.id + SHINY_SUFFIX); }}>✦</span>}
              </button>
            </li>
          );
        })}
      </ul>

      </>)}

      {tab === 'effets' && (
        <>
          <p className="muted">Les effets s'ajoutent à vos lancers : une traînée derrière les dés, et une célébration quand vous faites un 4-2-1. Les autres joueurs les voient en ligne.</p>
          {(['trainee', 'fete'] as const).map((k) => (
            <section key={k}>
              <h3>{k === 'trainee' ? 'Traînées derrière les dés' : 'Célébrations du 4-2-1'}</h3>
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
                <small className="muted">{done ? `Complétée : titre « ${titleLabel(`serie:${se.id}`)} » et tapis exclusif débloqués.` : `Récompense : le titre « ${se.title} » et un tapis exclusif.`}</small>
              </li>
            );
          })}
        </ul>
      )}

      <details className="odds">
        <summary>Chances dans un sac</summary>
        <p>Un sac contient un dé {pct(1 - FX_SHARE)} du temps, un effet de lancer {pct(FX_SHARE)} du temps.</p>
        <p>{RARITIES.map((r) => `${RARITY_LABEL[r]} : ${pct(RARITY_ODDS[r])}`).join(' ; ')}. Dé brillant : 1 sur {Math.round(1 / SHINY_ODDS)}.</p>
        <p>Un doublon se transforme en éclats, qui servent à fabriquer le dé de votre choix. Les sacs ne s'achètent pas : ils se gagnent seulement en jouant. Les dés de collection sont purement décoratifs, ils ne changent jamais le hasard des lancers.</p>
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
        <b>Collectionne des dés super rares !</b>
        <span>{count.owned > 0 ? `${count.owned}/${count.total} dés dans votre collection.` : '25 dés à trouver, du commun au légendaire, et leurs versions brillantes.'} Les autres les voient quand vous lancez.</span>
      </span>
      {bags > 0 && <span className="promo-bags"><BagIcon size="1em" /> {bags} sac{bags > 1 ? 's' : ''} à ouvrir</span>}
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
      {count && <small className="muted">Collection : {count.owned}/{count.total} dés{count.shiny ? `, ${count.shiny} brillant${count.shiny > 1 ? 's' : ''}` : ''}</small>}
    </div>
  );
}
