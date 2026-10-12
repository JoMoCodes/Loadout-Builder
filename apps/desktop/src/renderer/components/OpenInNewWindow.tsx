// The right-click menu on a page in the left menu and on a tab: "Open in new window". The main
// process opens the window (a page may not open one itself); it shows that page or tab on its
// own, with the same saved data as every other window.

import { AppWindow } from 'lucide-react';
import type { ReactNode } from 'react';
import type { WindowTarget } from '../../shared/windows';
import { call } from '../lib/channels';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '../ui/context-menu';

export const OPEN_IN_NEW_WINDOW = 'Open in new window';

/** Asks the main process for a window on this page and tab. Nothing is said if it does not open. */
export function openInNewWindow(target: WindowTarget): void {
  void call('app:open-window', target);
}

interface OpenInNewWindowProps {
  target: WindowTarget;
  /** One element (a button) that takes the right-click. */
  children: ReactNode;
}

export function OpenInNewWindow({ target, children }: OpenInNewWindowProps) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent data-testid="open-in-window-menu" aria-label="Window">
        <ContextMenuItem onSelect={() => openInNewWindow(target)}>
          <AppWindow aria-hidden="true" />
          {OPEN_IN_NEW_WINDOW}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
