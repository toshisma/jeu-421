import { CHANGELOG } from '../../../shared/changelog';
import { Shell } from './Screens';

const fmt = (d: string) => new Date(d).toLocaleString('fr-BE', { timeZone: 'Europe/Brussels', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/** Nouveautés : toutes les mises à jour, la plus récente en haut. */
export function ChangelogScreen({ onBack }: { onBack: () => void }) {
  try { localStorage.setItem('421.version-vue', CHANGELOG[0].version); } catch { /* */ }
  return (
    <Shell title="Nouveautés" onBack={onBack}>
      <ol className="changelog">
        {CHANGELOG.map((e) => (
          <li key={e.version}>
            <header><b>Version {e.version}</b><time dateTime={e.date}>{fmt(e.date)}</time></header>
            <h3>{e.title}</h3>
            <ul>{e.items.map((t) => <li key={t}>{t}</li>)}</ul>
          </li>
        ))}
      </ol>
    </Shell>
  );
}
export const changelogUnseen = () => { try { return localStorage.getItem('421.version-vue') !== CHANGELOG[0].version; } catch { return false; } };
