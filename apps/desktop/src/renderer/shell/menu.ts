// The left menu's size, and whether it may change by itself. Two buttons at the top of the menu
// set it, like the side bar in Claude Desktop:
//
//   Hide / Show   the menu shrinks to its icons alone, or opens wide again with the page names
//   Lock / Unlock locked, the menu stays the size it is. Unlocked, it rests as icons and slides
//                 open over the page while the pointer (or the keyboard focus) is on it.
//
// `wide` only matters while the menu is locked: an unlocked menu always rests as icons.

export interface MenuChoice {
  locked: boolean;
  wide: boolean;
}

/** What is on screen: wide with names, icons alone, or icons opened wide by pointing at them. */
export type MenuView = 'wide' | 'icons' | 'peek';

export type MenuAction = 'hide' | 'show' | 'lock' | 'unlock';

/** How the app starts: open and locked, as the menu always was before it had buttons. */
export const DEFAULT_MENU: MenuChoice = { locked: true, wide: true };

export function menuView(choice: MenuChoice, peeking: boolean): MenuView {
  if (choice.locked) return choice.wide ? 'wide' : 'icons';
  return peeking ? 'peek' : 'icons';
}

/** The choice after one of the two buttons is pressed. */
export function menuAfter(choice: MenuChoice, action: MenuAction): MenuChoice {
  switch (action) {
    // Hide tucks the menu away for good: locked, so it does not slide back out when pointed at.
    case 'hide':
      return { locked: true, wide: false };
    // Show and Lock both end with the menu wide and staying that way.
    case 'show':
    case 'lock':
      return { locked: true, wide: true };
    // Unlocked, the menu rests as icons and opens while the pointer is on it.
    case 'unlock':
      return { locked: false, wide: choice.wide };
  }
}

/** The saved choice, from the browser's storage. Anything odd falls back to the usual menu. */
export function parseMenuChoice(raw: string | null): MenuChoice {
  if (raw === null) return DEFAULT_MENU;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return DEFAULT_MENU;
  }
  if (typeof parsed !== 'object' || parsed === null) return DEFAULT_MENU;
  const input = parsed as Record<string, unknown>;
  if (typeof input.locked !== 'boolean' || typeof input.wide !== 'boolean') return DEFAULT_MENU;
  return { locked: input.locked, wide: input.wide };
}
