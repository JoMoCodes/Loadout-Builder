// Small pieces the Route Sheets tabs share: a section with its heading, a plain table, the chips
// for a route's state and a driver's status, and the words for a missing original PDF.

import type { ReactNode } from 'react';
import type { RouteState } from '@loadout/route-sheets';
import { Chip } from '../../ui/chip';
import { cn } from '../../ui/cn';
import { STATE_INFO } from './words';

/** Why the buttons that cut a page out of the PDF are off. */
export const PDF_MISSING_WORDS =
  "The route sheet PDF for this day is no longer in the app's data folder. You can still see the emails, but you can't save or attach single pages.";

export function StateChip({ state }: { state: RouteState }) {
  const info = STATE_INFO[state];
  return (
    <Chip tone={info.tone} data-state={state}>
      {info.label}
    </Chip>
  );
}

/** ACTIVE in green, any other status in red, and red for someone not on the driver list. */
export function StatusChip({ found, status }: { found: boolean; status: string | null }) {
  if (!found) return <Chip tone="bad">Not on the driver list</Chip>;
  return <Chip tone={status === 'ACTIVE' ? 'ok' : 'bad'}>{status || 'No status'}</Chip>;
}

/** A part of a tab, with its heading (h2), a line under it, and buttons on the right. */
export function Section({
  id,
  title,
  sub,
  action,
  children,
}: {
  id: string;
  title: string;
  sub?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      className="mt-6 first:mt-0"
      data-testid={`route-sheets-section-${id}`}
      aria-labelledby={`route-sheets-heading-${id}`}
    >
      <div className="mb-2 flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <h2 id={`route-sheets-heading-${id}`} className="m-0 text-[1.15rem] font-semibold">
            {title}
          </h2>
          {sub ? <p className="m-0 mt-0.5 text-sm text-muted">{sub}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** A plain table of a few rows, in the app's colours. */
export function PlainTable({
  headings,
  children,
  testId,
}: {
  headings: readonly string[];
  children: ReactNode;
  testId?: string;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-surface">
      <table className="w-full border-collapse text-sm" data-testid={testId}>
        <thead>
          <tr className="border-b border-line text-left text-muted">
            {headings.map((heading) => (
              <th key={heading} scope="col" className="px-3 py-1.5 font-semibold">
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Cell({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <td className={cn('border-t border-line/60 px-3 py-1.5 align-top', className)}>{children}</td>
  );
}

/** A card in the strip at the top of the page. */
export function TopCard({
  title,
  testId,
  children,
}: {
  title: string;
  testId: string;
  children: ReactNode;
}) {
  return (
    <div
      className="min-w-[14rem] flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm"
      data-testid={testId}
    >
      <p className="m-0 text-xs font-semibold tracking-wide text-muted uppercase">{title}</p>
      {children}
    </div>
  );
}

/** A route code that opens the route's sheet on the Sheets tab. */
export function RouteLink({
  routeCode,
  onOpen,
  testId,
}: {
  routeCode: string;
  onOpen?: (routeCode: string) => void;
  testId?: string;
}) {
  if (!onOpen) return <span className="font-semibold">{routeCode}</span>;
  return (
    <button
      type="button"
      className="font-semibold text-accent underline-offset-2 hover:underline"
      onClick={() => onOpen(routeCode)}
      title={`Open the route sheet for ${routeCode}`}
      data-testid={testId}
    >
      {routeCode}
    </button>
  );
}
