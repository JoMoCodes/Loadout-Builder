import type { ReactNode } from 'react';
import { UpdatePill } from './controls';

interface TopBarProps {
  /** The Help button and the text size buttons. */
  children?: ReactNode;
}

/**
 * The bar across the top of a page-only window ("Open in new window"). Such a window has no
 * left menu, so the update note, Help and the text size sit here. The main window has no bar:
 * the same controls are at the bottom of its left menu.
 */
export function TopBar({ children }: TopBarProps) {
  return (
    <header className="topbar">
      <UpdatePill />
      {children}
    </header>
  );
}
