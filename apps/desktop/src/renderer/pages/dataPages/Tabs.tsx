import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '../../ui/cn';

export interface TabItem {
  id: string;
  label: string;
}

interface TabsProps {
  /** Read out as the tabs' name. */
  label: string;
  tabs: readonly TabItem[];
  value: string;
  onChange: (id: string) => void;
  /** Prefix for the ids and `data-testid`s, for example "route-data". */
  name: string;
}

/** Tabs along the top of a page. Arrow keys move between them; the page draws the open one. */
export function Tabs({ label, tabs, value, onChange, name }: TabsProps) {
  const refs = useRef(new Map<string, HTMLButtonElement>());

  function move(event: KeyboardEvent, at: number) {
    const steps: Record<string, number> = {
      ArrowRight: (at + 1) % tabs.length,
      ArrowLeft: (at - 1 + tabs.length) % tabs.length,
      Home: 0,
      End: tabs.length - 1,
    };
    const next = steps[event.key];
    if (next === undefined) return;
    event.preventDefault();
    const target = tabs[next];
    if (!target) return;
    onChange(target.id);
    refs.current.get(target.id)?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label={label}
      className="flex flex-wrap gap-1 border-b border-line bg-surface px-6 pt-2"
    >
      {tabs.map((tab, index) => {
        const on = tab.id === value;
        return (
          <button
            key={tab.id}
            ref={(element) => {
              if (element) refs.current.set(tab.id, element);
              else refs.current.delete(tab.id);
            }}
            type="button"
            role="tab"
            id={`${name}-tab-${tab.id}`}
            aria-selected={on}
            aria-controls={`${name}-panel-${tab.id}`}
            tabIndex={on ? 0 : -1}
            data-testid={`${name}-tab-${tab.id}`}
            onClick={() => onChange(tab.id)}
            onKeyDown={(event) => move(event, index)}
            className={cn(
              '-mb-px rounded-t-md border border-b-0 px-4 py-1.5 text-sm font-medium',
              on
                ? 'border-line bg-app text-fg'
                : 'border-transparent text-muted hover:text-fg hover:bg-raised',
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

/** The open tab's content. */
export function TabPanel({
  name,
  id,
  children,
}: {
  name: string;
  id: string;
  children: ReactNode;
}) {
  return (
    <div
      role="tabpanel"
      id={`${name}-panel-${id}`}
      aria-labelledby={`${name}-tab-${id}`}
      className="flex min-h-0 flex-1 flex-col"
      data-testid={`${name}-panel-${id}`}
    >
      {children}
    </div>
  );
}
