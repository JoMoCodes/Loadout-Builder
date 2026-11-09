import {
  CircleHelp,
  ChartLine,
  ClipboardList,
  House,
  LayoutDashboard,
  Lock,
  LockOpen,
  Mails,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Sparkles,
  Truck,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useCallback, useState, type FocusEvent, type MouseEvent } from 'react';
import { OpenInNewWindow } from '../components/OpenInNewWindow';
import { PAGES } from '../pages';
import type { PageId } from '../pages/types';
import { Button } from '../ui/button';
import { menuView } from './menu';
import type { MenuAction, MenuChoice } from './menu';

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

export const HIDE_MENU = 'Hide the menu';
export const SHOW_MENU = 'Show the menu';
export const LOCK_MENU = 'Lock the menu open';
export const UNLOCK_MENU = 'Unlock the menu so it opens when you point at it';

interface NavProps {
  current: PageId;
  onGo(pageId: PageId): void;
  /** Wide or icons, locked or not (see menu.ts). */
  menu: MenuChoice;
  onMenu(action: MenuAction): void;
}

/**
 * The left menu. Plain buttons, so Tab moves between them and Enter opens one. A right-click
 * offers to open the page in a window of its own.
 *
 * Two icon buttons at the top shrink the menu to its icons (Hide) and pin it (Lock). Unlocked,
 * the icons open wide over the page while the pointer or the keyboard focus is on them.
 */
export function Nav({ current, onGo, menu, onMenu }: NavProps) {
  // Whether the pointer (or focus) is on an unlocked menu. Kept even while locked, so unlocking
  // with the pointer already on the menu opens it at once.
  const [peeking, setPeeking] = useState(false);
  const view = menuView(menu, peeking);
  const iconsOnly = view === 'icons';

  const leave = useCallback((event: MouseEvent | FocusEvent) => {
    // Focus moving from one button of the menu to another is not leaving.
    const next = 'relatedTarget' in event ? event.relatedTarget : null;
    if (next instanceof Node && event.currentTarget.contains(next)) return;
    setPeeking(false);
  }, []);

  return (
    <div
      className="sidebar-slot"
      data-menu={view}
      onMouseEnter={() => setPeeking(true)}
      onMouseLeave={leave}
      onFocus={() => setPeeking(true)}
      onBlur={leave}
    >
      <nav className="sidebar" aria-label="Pages">
        <div className="menu-head">
          <div className="menu-buttons" role="group" aria-label="Menu size">
            {view === 'icons' ? (
              <Button
                size="icon"
                variant="ghost"
                className="menu-button"
                aria-label={SHOW_MENU}
                title={SHOW_MENU}
                data-action="menu-show"
                onClick={() => onMenu('show')}
              >
                <PanelLeftOpen aria-hidden="true" />
              </Button>
            ) : (
              <Button
                size="icon"
                variant="ghost"
                className="menu-button"
                aria-label={HIDE_MENU}
                title={HIDE_MENU}
                data-action="menu-hide"
                onClick={() => onMenu('hide')}
              >
                <PanelLeftClose aria-hidden="true" />
              </Button>
            )}
            {menu.locked ? (
              <Button
                size="icon"
                variant="ghost"
                className="menu-button"
                aria-label={UNLOCK_MENU}
                title={UNLOCK_MENU}
                aria-pressed="true"
                data-action="menu-unlock"
                onClick={() => onMenu('unlock')}
              >
                <Lock aria-hidden="true" />
              </Button>
            ) : (
              <Button
                size="icon"
                variant="ghost"
                className="menu-button"
                aria-label={LOCK_MENU}
                title={LOCK_MENU}
                aria-pressed="false"
                data-action="menu-lock"
                onClick={() => onMenu('lock')}
              >
                <LockOpen aria-hidden="true" />
              </Button>
            )}
          </div>
          <div className="brand">
            <span className="brand-mark" aria-hidden="true">
              LB
            </span>
            <span className="brand-words">
              Loadout Builder
              <span className="brand-sub">Daily roster and vans</span>
            </span>
          </div>
        </div>
        <ul className="nav-list">
          {PAGES.map((page) => {
            const Icon = ICONS[page.id];
            return (
              <li key={page.id}>
                <OpenInNewWindow target={{ page: page.id }}>
                  <button
                    type="button"
                    className="nav-item"
                    data-nav={page.id}
                    aria-current={page.id === current ? 'page' : undefined}
                    // With the names out of sight, pointing at an icon says which page it is.
                    title={iconsOnly ? page.label : undefined}
                    onClick={() => onGo(page.id)}
                  >
                    <Icon aria-hidden="true" />
                    <span className="nav-label">{page.label}</span>
                  </button>
                </OpenInNewWindow>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
