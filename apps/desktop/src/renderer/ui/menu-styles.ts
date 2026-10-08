// Shared look for right-click menus and drop-down menus, so both read the same.

export const menuContentClass =
  'z-50 min-w-[12rem] overflow-hidden rounded-md border border-line bg-raised p-1 text-sm text-fg ' +
  'shadow-popover';

export const menuItemClass =
  'relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 outline-none select-none ' +
  'data-[highlighted]:bg-accent-soft data-[highlighted]:text-fg ' +
  'data-[disabled]:pointer-events-none data-[disabled]:text-faint ' +
  'data-[variant=danger]:text-bad [&_svg]:size-[1.1em] [&_svg]:shrink-0';

export const menuSeparatorClass = '-mx-1 my-1 h-px bg-line';

export const menuLabelClass = 'px-2 py-1 text-[0.857rem] font-semibold text-muted';
