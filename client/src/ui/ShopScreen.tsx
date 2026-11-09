import { shortDateL } from '../i18n/data';
import { loc, tr } from '../i18n/lang';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Icon } from './Icon';
import {
  CATEGORY_LABELS, getItem, itemsOf, resolveAppearance, type Appearance, type Category, type Item,
} from '../../../shared/progress/catalog';
import { canBuy, levelInfo, type Profile } from '../../../shared/progress/profile';
import { sound } from '../audio/sound';
import type { Settings } from '../settings';
import { DiceTray, type DiceTrayHandle } from './DiceTray';
import { DieCube } from './DiceCollection';
import { useThumb, useThumbHost } from '../three/shopThumbs';
import { ProfileChip } from './Screens';
import { Avatar } from './Avatar';
import { activeEvent, eventEnd } from '../../../shared/progress/events';
import { today } from '../../../shared/progress/quests';

const CATS: Category[] = ['decor', 'felt', 'rim', 'shape', 'dice', 'accessoire'];

/** Cadrage de la vignette 3D selon la catégorie : la salle pour un décor, le drap pour un tapis… */
const VIEW: Partial<Record<Category, { elev: number; fit: number }>> = {
  decor: { elev: 40, fit: 1.55 },
  felt: { elev: 62, fit: 0.62 },
  rim: { elev: 34, fit: 0.92 },
  shape: { elev: 72, fit: 1.05 },
};
const THUMB_W = 344, THUMB_H = 200; // pixels rendus (affichés à moitié : nets sur écran haute densité)

/** Vignette d'un objet : vrai rendu du bac avec l'objet installé, ou dé en volume, ou accessoire. */
function Thumb({ item, base }: { item: Item; base: Appearance }) {
  const view = VIEW[item.category];
  // Rendu seulement quand la carte approche de l'écran : pas de travail pour les cartes jamais vues.
  const ref = useRef<HTMLSpanElement>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || !view || near) return;
    if (typeof IntersectionObserver === 'undefined') { setNear(true); return; }
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { setNear(true); io.disconnect(); } }, { rootMargin: '200px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [view, near]);
  const look = view && near ? { ...base, [item.category]: item.id } : null;
  const url = useThumb(look && view ? { look, w: THUMB_W, h: THUMB_H, elev: view.elev, fit: view.fit } : null);
  if (item.category === 'dice') {
    return <span className="shop-thumb shop-thumb-dice" style={feltBg(base)}><DieCube id={item.id} size={44} /></span>;
  }
  if (item.category === 'accessoire') {
    return <span className="shop-thumb shop-thumb-acc" style={feltBg(base)}><span>{item.emoji || '–'}</span></span>;
  }
  return (
    <span ref={ref} className={`shop-thumb${url ? ' ready' : ''}`} style={thumbBg({ ...base, [item.category]: item.id })}>
      {url ? <img src={url} alt="" draggable={false} /> : <i className="shop-thumb-wait" aria-hidden />}
    </span>
  );
}

/** Tapis installé, éclairé par la lampe : fond des dés et accessoires. */
function feltBg(a: Appearance): CSSProperties {
  return { backgroundColor: resolveAppearance(a).felt.color };
}

/** Fond d'attente fidèle aux couleurs (salle, tapis) pendant le rendu de la vignette. */
function thumbBg(a: Appearance): CSSProperties {
  const L = resolveAppearance(a);
  return { backgroundColor: L.felt.color, boxShadow: `inset 0 0 0 9px ${L.rim.base}, inset 0 0 0 22px ${L.decor.table.base}, inset 0 0 0 23px ${L.decor.background}` };
}

interface Props {
  profile: Profile;
  settings: Settings;
  onBuy: (id: string) => Promise<string | null>;
  onEquip: (id: string) => Promise<string | null>;
  onBack: () => void;
}

export function ShopScreen({ profile, settings, onBuy, onEquip, onBack }: Props) {
  const [cat, setCat] = useState<Category>('decor');
  const [selected, setSelected] = useState<string>(profile.equipped.decor);
  const [msg, setMsg] = useState<string | null>(null);
  const [rolling, setRolling] = useState(false);
  const tray = useRef<DiceTrayHandle>(null);
  const level = levelInfo(profile.xp).level;

  // Changer d'onglet sélectionne l'objet équipé de cette catégorie.
  useEffect(() => { setSelected(profile.equipped[cat]); setMsg(null); }, [cat]); // eslint-disable-line react-hooks/exhaustive-deps

  const item = getItem(selected)!;
  // Aperçu : l'apparence équipée, avec l'objet sélectionné essayé par-dessus.
  const preview: Appearance = useMemo(() => ({ ...profile.equipped, [item.category]: item.id }), [profile.equipped, item]);
  const owned = profile.owned.includes(item.id);
  const equipped = profile.equipped[item.category] === item.id;
  const day = today();
  const event = activeEvent(day);
  const check = canBuy(profile, item, day);
  // Objets d'événement visibles pendant l'événement (ou s'ils sont possédés) ; objets du pass si possédés.
  const visible = (it: Item) => !(it.category === 'dice' && it.rarity) && (profile.owned.includes(it.id) || (it.event ? it.event === event?.id : !it.pass));

  const [busy, setBusy] = useState(false);
  const doBuy = async () => {
    sound.unlock();
    setBusy(true);
    const err = await onBuy(item.id);
    setBusy(false);
    if (err) { setMsg(err); return; }
    sound.chips(4);
    setMsg(tr('app.achete_et_installe', { name: item.name }));
  };
  const doEquip = async () => {
    sound.unlock();
    setBusy(true);
    const err = await onEquip(item.id);
    setBusy(false);
    if (err) { setMsg(err); return; }
    sound.click();
    setMsg(tr('app.installe', { name: item.name }));
  };
  const tryRoll = async () => {
    if (rolling) return;
    sound.unlock();
    setRolling(true);
    const r = crypto.getRandomValues(new Uint32Array(4));
    await tray.current?.roll([1 + (r[0] % 6), 1 + (r[1] % 6), 1 + (r[2] % 6)], [false, false, false], r[3] >>> 1);
    setRolling(false);
  };

  useThumbHost();
  const items = itemsOf(cat).filter(visible);
  const action = equipped ? <button className="btn shop-buy" disabled>{tr('app.installe_2')}</button>
    : owned ? <button className="btn primary shop-buy" disabled={busy} onClick={doEquip}>{tr('app.installer')}</button>
      : check.ok ? <button className="btn shop-buy shop-buy-gold" disabled={busy} onClick={doBuy}>{item.price === 0 ? tr('app.prendre') : tr('app.acheter', { v: item.price.toLocaleString(loc()) })}</button>
        : <button className="btn shop-buy" disabled>
          {check.reason === 'level' ? tr('app.niveau_requis', { level: item.level }) : check.reason === 'pass' ? tr('app.se_gagne_avec_le_pass') : check.reason === 'event' ? tr('app.evenement_termine') : tr('app.il_manque_pieces', { v: item.price - profile.coins })}
        </button>;

  return (
    <div className="shop shop-v2">
      <header className="shop-head">
        <button className="icon-btn" onClick={onBack} aria-label={tr('app.retour')}><Icon name="back" /></button>
        <h2>{tr('app.boutique')}</h2>
        <ProfileChip profile={profile} />
      </header>

      <div className="shop-main">
        <section className="shop-hero">
          <DiceTray ref={tray} appearance={preview} quality={settings.quality} cup={settings.cup} insets={{ top: 6, bottom: 6, left: 0, right: 0 }} />
          {cat === 'accessoire' && (
            <div className="acc-preview"><Avatar emoji={settings.avatar} size={120} accessory={item.category === 'accessoire' ? item.emoji : undefined} /></div>
          )}
          <span className="shop-hero-tag">{tr('app.apercu')}</span>
          {cat !== 'accessoire' && <button className="shop-hero-roll" disabled={rolling} onClick={tryRoll}><Icon name="dice" size={18} /> {tr('app.lancer')}</button>}
        </section>

        <nav className="shop-tabs" aria-label={tr('app.categories')}>
          {CATS.map((c) => <button key={c} className={c === cat ? 'on' : ''} aria-pressed={c === cat} onClick={(e) => { setCat(c); e.currentTarget.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' }); }}>{CATEGORY_LABELS[c]}</button>)}
        </nav>

        <div className="shop-grid">
          {items.map((it) => {
            const own = profile.owned.includes(it.id);
            const eq = profile.equipped[cat] === it.id;
            const locked = !own && level < it.level;
            const tag = it.event && !own ? tr('app.jusqu_au_2', { v: shortDateL(eventEnd(event!, day)) }) : it.pass ? tr('app.pass_de_saison') : '';
            return (
              <button key={it.id} className={`shop-card${it.id === selected ? ' sel' : ''}${locked ? ' locked' : ''}`} onClick={() => { setSelected(it.id); setMsg(null); }}>
                <Thumb item={it} base={profile.equipped} />
                <b className="shop-card-name">{it.name}</b>
                <span className={`shop-card-state${eq ? ' eq' : own ? ' own' : locked ? ' lock' : ' price'}`}>
                  {locked && <Icon name="lock" size={13} />}
                  {eq ? tr('app.installe_3') : own ? tr('app.possede') : locked ? tr('app.niveau_4', { level: it.level }) : it.price === 0 ? tr('app.gratuit') : tr('app.pieces_6', { v: it.price.toLocaleString(loc()) })}
                </span>
                {tag && <span className="shop-card-tag">{tag}</span>}
              </button>
            );
          })}
          <p className="shop-fine">{tr('app.les_pieces_sont_la_monnaie_de_tout')}</p>
        </div>

        <footer className="shop-foot">
          <span className="shop-foot-text">
            <b>{item.name}</b>
            {msg ? <span className="ok small">{msg}</span> : item.description ? <span>{item.description}</span> : null}
          </span>
          {action}
        </footer>
      </div>
    </div>
  );
}
