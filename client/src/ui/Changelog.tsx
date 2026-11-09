import { getLang, loc, tr } from '../i18n/lang';
import { CHANGELOG_I18N } from '../../../shared/i18n/zones/changelog';
import { CHANGELOG, type ChangelogEntry } from '../../../shared/changelog';
import { Shell } from './kit';

const fmt = (d: string) => new Date(d).toLocaleString(loc(), { timeZone: 'Europe/Brussels', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(/(\d{1,2}):(\d{2})/, (m, h, mi) => (getLang() === 'fr' ? `${h} h ${mi}` : m));

const localized = (e: ChangelogEntry) => { const l = getLang(); const t = l === 'fr' ? undefined : CHANGELOG_I18N[l]?.[e.version]; return t ? { ...e, ...t } : e; };

/** Nouveautés : toutes les mises à jour, la plus récente en haut. */
export function ChangelogScreen({ onBack }: { onBack: () => void }) {
  try { localStorage.setItem('421.version-vue', CHANGELOG[0].version); } catch { /* */ }
  return (
    <Shell title={tr('app.nouveautes')} onBack={onBack} icon="bell" sub={tr('app.version_la_plus_recente_en_haut', { version: CHANGELOG[0].version })}>
      <ol className="changelog">
        {CHANGELOG.map((e0, i) => { const e = localized(e0); return (
          <li key={e.version} className={i === 0 ? 'latest' : ''}>
            <header><b>{tr('app.version')} {e.version}</b>{i === 0 && <em className="k-count">{tr('app.nouveau')}</em>}<time dateTime={e.date}>{fmt(e.date)}</time></header>
            <h3>{e.title}</h3>
            <ul>{e.items.map((t) => <li key={t}>{t}</li>)}</ul>
          </li>
        ); })}
      </ol>
    </Shell>
  );
}
export const changelogUnseen = () => { try { return localStorage.getItem('421.version-vue') !== CHANGELOG[0].version; } catch { return false; } };
