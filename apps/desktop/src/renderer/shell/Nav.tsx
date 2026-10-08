import {
  CircleHelp,
  ClipboardList,
  History,
  House,
  Route,
  Settings,
  Sparkles,
  Truck,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { PAGES } from '../pages';
import type { PageId } from '../pages/types';

const ICONS: Record<PageId, LucideIcon> = {
  home: House,
  'load-out': ClipboardList,
  'route-data': Route,
  'vehicle-data': Truck,
  associates: Users,
  'previous-roster': History,
  'how-to-use': CircleHelp,
  'features-log': Sparkles,
  settings: Settings,
};

interface NavProps {
  current: PageId;
  onGo(pageId: PageId): void;
}

/** The left menu. Plain buttons, so Tab moves between them and Enter opens one. */
export function Nav({ current, onGo }: NavProps) {
  return (
    <nav className="sidebar" aria-label="Pages">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">
          LB
        </span>
        <span>
          Loadout Builder
          <span className="brand-sub">Daily roster and vans</span>
        </span>
      </div>
      <ul className="nav-list">
        {PAGES.map((page) => {
          const Icon = ICONS[page.id];
          return (
            <li key={page.id}>
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
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
