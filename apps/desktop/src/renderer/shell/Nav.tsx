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

interface NavProps {
  current: PageId;
  onGo(pageId: PageId): void;
  /** The text size buttons, on their own line at the bottom. */
  textSize: ReactNode;
  /** The Help button, on the last line. The update note sits beside it. */
  help: ReactNode;
}

/**
 * The left menu. The everyday pages are at the top. At the bottom: How to use, Features
 * log and Settings, then the text size and Help. The pages are
 * plain buttons, so Tab moves between them and Enter opens one. A right-click offers to open
 * the page in a window of its own.
 */
export function Nav({ current, onGo, textSize, help }: NavProps) {
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
