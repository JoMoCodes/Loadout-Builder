import {
  CircleHelp,
  ChartLine,
  ClipboardList,
  House,
  LayoutDashboard,
  Mails,
  Settings,
  Sparkles,
  Truck,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import type { DataSourceInfo } from '../../shared/shell';
import { OpenInNewWindow } from '../components/OpenInNewWindow';
import { PAGES } from '../pages';
import type { PageId } from '../pages/types';
import { UpdatePill } from './controls';

const ICONS: Record<PageId, LucideIcon> = {
  home: House,
  dashboard: LayoutDashboard,
  'load-out': ClipboardList,
  'route-sheets': Mails,
  'vehicle-data': Truck,
  associates: Users,
  scorecards: ChartLine,
  'how-to-use': CircleHelp,
  'features-log': Sparkles,
  settings: Settings,
};

/**
 * The pages about the app itself, not the day's work. They sit at the bottom of the menu, under
 * a line, so the pages used every day stay together at the top.
 */
export const UTILITY_PAGES: readonly PageId[] = ['how-to-use', 'features-log', 'settings'];

/** The counts the menu's small box shows, in order: the table they come from and their words. */
export const SAVED_COUNTS = [
  { table: 'driver_rows', label: 'Drivers on the roster' },
  { table: 'associates', label: 'Drivers in your list' },
  { table: 'vehicles', label: 'Vans in your list' },
] as const;

interface NavProps {
  current: PageId;
  onGo(pageId: PageId): void;
  /** What is saved (counts only), for the small box above the bottom pages. */
  dataSource: DataSourceInfo | null;
  /** The text size buttons, on their own line at the bottom. */
  textSize: ReactNode;
  /** The Help button, on the last line. The update note sits beside it. */
  help: ReactNode;
}

/**
 * The left menu. The everyday pages are at the top. At the bottom: a small box with what is
 * saved, then How to use, Features log and Settings, then the text size and Help. The pages are
 * plain buttons, so Tab moves between them and Enter opens one. A right-click offers to open
 * the page in a window of its own.
 */
export function Nav({ current, onGo, dataSource, textSize, help }: NavProps) {
  const item = (page: (typeof PAGES)[number]) => {
    const Icon = ICONS[page.id];
    return (
      <li key={page.id}>
        <OpenInNewWindow target={{ page: page.id }}>
          <button
            type="button"
            className="nav-item"
            data-nav={page.id}
            aria-current={page.id === current ? 'page' : undefined}
            onClick={() => onGo(page.id)}
          >
            <Icon aria-hidden="true" />
            {page.label}
          </button>
        </OpenInNewWindow>
      </li>
    );
  };
  const counts = dataSource?.counts ?? {};

  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">
          LB
        </span>
        <span>
          Loadout Builder
          <span className="brand-sub">Daily roster and vans</span>
        </span>
      </div>
      <nav className="menu-pages" aria-label="Pages">
        <ul className="nav-list nav-main">
          {PAGES.filter((page) => !UTILITY_PAGES.includes(page.id)).map(item)}
        </ul>
        {dataSource ? (
          <div className="menu-saved" data-testid="menu-saved" data-mode={dataSource.mode}>
            <div className="menu-saved-title">
              {dataSource.mode === 'demo' ? 'In the demo data' : 'Saved on this computer'}
            </div>
            {dataSource.ok ? (
              <dl>
                {SAVED_COUNTS.map(({ table, label }) => (
                  <div key={table}>
                    <dt>{label}</dt>
                    <dd>{counts[table] ?? 0}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="problem">The saved data could not be opened.</p>
            )}
          </div>
        ) : null}
        <ul className="nav-list nav-utility">
          {PAGES.filter((page) => UTILITY_PAGES.includes(page.id)).map(item)}
        </ul>
      </nav>
      <div className="menu-tools" data-testid="menu-tools">
        {textSize}
        <div className="menu-tools-row">
          {help}
          <UpdatePill />
        </div>
      </div>
    </aside>
  );
}
