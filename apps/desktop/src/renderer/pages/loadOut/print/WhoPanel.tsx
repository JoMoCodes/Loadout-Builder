// Panel three: who is on the sheet. Two lists to click people off, which hold who is LEFT OFF, not
// who is on, so a shift type or driver turning up for the first time tomorrow prints by default.

import { printing } from '@loadout/core';
import { useMemo, useState } from 'react';
import type { PrintRowsView } from '../../../../shared/channels/print';
import { Button } from '../../../ui/button';
import { Input } from '../../../ui/input';
import {
  OFF,
  ON,
  allOff,
  allOn,
  driverItems,
  forcedOff,
  inverted,
  searched,
  shiftItems,
  toggled,
  type ListItem,
} from './logic';

type PrintSpec = printing.PrintSpec;

interface CheckListProps {
  name: string;
  headings: string[];
  items: readonly ListItem[];
  /** What the search leaves showing (all of them when there is no search). */
  showing: readonly ListItem[];
  off: readonly string[];
  /** Why a row is off whatever its own switch says, or ''. */
  why(key: string): string;
  setOff(next: string[]): void;
  say(words: string): void;
}

function CheckList({ name, headings, items, showing, off, why, setOff, say }: CheckListProps) {
  const offSet = new Set(off);
  function flip(key: string) {
    // A row that is off for a reason of its own has no switch to throw: say why instead.
    const reason = why(key);
    if (reason) return say(reason);
    setOff(toggled(off, key));
  }
  return (
    <div className="flex min-h-0 flex-col">
      <div className="max-h-56 min-h-24 overflow-auto rounded border border-line">
        <table className="w-full text-sm" aria-label={name} data-testid={`print-list-${name}`}>
          <thead className="sticky top-0 bg-raised text-left text-muted">
            <tr>
              <th className="w-10 px-2 py-1 text-center font-medium">On</th>
              {headings.map((heading) => (
                <th key={heading} className="px-2 py-1 font-medium">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {showing.map((item) => {
              const on = !offSet.has(item.key) && !why(item.key);
              return (
                <tr
                  key={item.key}
                  tabIndex={0}
                  role="row"
                  aria-checked={on}
                  data-key={item.key}
                  data-on={on ? 'yes' : 'no'}
                  className={
                    'cursor-pointer border-t border-line outline-none hover:bg-row-hover focus-visible:ring-2 focus-visible:ring-focus ' +
                    (on ? '' : 'text-faint')
                  }
                  onClick={() => flip(item.key)}
                  onKeyDown={(event) => {
                    if (event.key === ' ' || event.key === 'Enter') {
                      event.preventDefault();
                      flip(item.key);
                    }
                  }}
                >
                  <td className="px-2 py-0.5 text-center">{on ? ON : OFF}</td>
                  {item.values.map((value, at) => (
                    <td key={at} className="px-2 py-0.5">
                      {value}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <Button size="sm" onClick={() => setOff(allOn())} data-testid={`print-${name}-all`}>
          All
        </Button>
        <Button size="sm" onClick={() => setOff(allOff(items))} data-testid={`print-${name}-none`}>
          None
        </Button>
        <Button
          size="sm"
          onClick={() => setOff(inverted(items, off))}
          data-testid={`print-${name}-invert`}
        >
          Invert
        </Button>
      </div>
    </div>
  );
}

export interface WhoPanelProps {
  spec: PrintSpec;
  view: PrintRowsView;
  change(next: PrintSpec): void;
  say(words: string): void;
}

export function WhoPanel({ spec, view, change, say }: WhoPanelProps) {
  const [query, setQuery] = useState('');
  const shifts = useMemo(() => shiftItems(view.shiftCounts), [view.shiftCounts]);
  const drivers = useMemo(() => driverItems(view.rows), [view.rows]);
  const byKey = useMemo(() => new Map(view.rows.map((row) => [row.key, row])), [view.rows]);

  return (
    <section
      className="flex min-w-0 flex-col gap-1 rounded-lg border border-line bg-surface p-3"
      aria-labelledby="print-who-title"
      data-testid="print-who"
    >
      <h2 id="print-who-title" className="text-base font-semibold">
        Who Prints
      </h2>
      <p className="mb-1 text-sm text-muted">
        Click a row to take it off the sheet. Anyone new prints by default.
      </p>
      <h3 className="text-sm font-medium">Shift types</h3>
      <CheckList
        name="shifts"
        headings={['Shift Type', 'Drivers']}
        items={shifts}
        showing={shifts}
        off={spec.excludedShifts}
        why={() => ''}
        setOff={(excludedShifts) => change({ ...spec, excludedShifts })}
        say={say}
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-medium">Drivers</h3>
        <label htmlFor="print-driver-search" className="ml-2 text-sm">
          Search
        </label>
        <Input
          id="print-driver-search"
          className="w-44"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          data-testid="print-driver-search"
        />
      </div>
      <CheckList
        name="drivers"
        headings={['Driver', 'Shift Type', 'Van']}
        items={drivers}
        showing={searched(drivers, query)}
        off={spec.excludedDrivers}
        why={(key) => forcedOff(spec, byKey.get(key))}
        setOff={(excludedDrivers) => change({ ...spec, excludedDrivers })}
        say={say}
      />
      <label className="mt-1 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={spec.vansOnly}
          onChange={(event) => change({ ...spec, vansOnly: event.target.checked })}
          data-testid="print-vans-only"
        />
        Only drivers holding a van
      </label>
    </section>
  );
}
