// Panel one: what goes on the page. The printed columns, top to bottom being left to right, with
// the width each one will really come out at.

import { printing } from '@loadout/core';
import { useState } from 'react';
import { Button } from '../../../ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../../ui/dropdown-menu';
import { Input } from '../../../ui/input';
import type { Asker } from './AskDialog';
import {
  WIDTH_MAX,
  WIDTH_MIN,
  WIDTH_STEP,
  columnName,
  copySpec,
  keyFor,
  labelFor,
  layoutLines,
  weightFromBox,
  widthShown,
} from './logic';

type PrintSpec = printing.PrintSpec;
type PrintRow = printing.PrintRow;
type PrintColumn = printing.PrintColumn;

export interface ColumnsPanelProps {
  spec: PrintSpec;
  rows: readonly PrintRow[];
  selected: number | null;
  select(index: number | null): void;
  change(next: PrintSpec): void;
  say(words: string): void;
  asker: Asker;
}

export function ColumnsPanel({
  spec,
  rows,
  selected,
  select,
  change,
  say,
  asker,
}: ColumnsPanelProps) {
  const lines = layoutLines(spec, rows);
  const index = selected !== null && selected < spec.columns.length ? selected : null;
  const shown = index === null ? '' : widthShown(spec, rows, index);
  // What somebody has typed in the Width box, against the number it was showing when they did.
  const [typed, setTyped] = useState<{ for: string; text: string } | null>(null);
  const boxText = typed && typed.for === `${index}:${shown}` ? typed.text : shown;

  function withColumns(update: (columns: PrintColumn[]) => void): PrintSpec {
    const next = copySpec(spec);
    update(next.columns);
    return next;
  }

  function add(column: PrintColumn) {
    const place = index === null ? spec.columns.length : index + 1;
    change(withColumns((columns) => columns.splice(place, 0, column)));
    select(place);
    say(`Added ${columnName(column)} to the printed sheet.`);
  }

  async function addTickBox() {
    const heading = await asker.ask(
      'Tick box column',
      'What is this column of tick boxes for?\n\n' +
        "The heading prints above the boxes - 'Keys', 'Badge', 'Checked In'. Leave it empty " +
        'for boxes with nothing over them.',
    );
    if (heading === null) return;
    add(printing.createPrintColumn({ kind: printing.CHECKBOX, heading: heading.trim() }));
  }

  function remove() {
    if (index === null) return say('Select a column to take off the sheet first.');
    const column = spec.columns[index] as PrintColumn;
    change(withColumns((columns) => columns.splice(index, 1)));
    select(spec.columns.length > 1 ? Math.min(index, spec.columns.length - 2) : null);
    say(`Took ${columnName(column)} off the printed sheet.`);
  }

  function move(step: number) {
    if (index === null) return say('Select a column to move first.');
    const target = index + step;
    if (target < 0 || target >= spec.columns.length) return;
    const moving = spec.columns[index] as PrintColumn;
    change(
      withColumns((columns) => {
        [columns[index], columns[target]] = [columns[target] as PrintColumn, moving];
      }),
    );
    select(target);
    say(`Moved ${printing.columnLabel(moving) || 'that column'} ${step < 0 ? 'left' : 'right'}.`);
  }

  async function rename(at: number) {
    const column = spec.columns[at];
    if (!column) return;
    const original =
      column.kind === printing.FIELD ? (printing.FIELD_HEADINGS.get(column.field) ?? '') : '';
    const answer = await asker.ask(
      'Rename column',
      'What should this column be called on the page?\n\n' +
        (original
          ? `Leave it empty to go back to '${original}'.`
          : 'Leave it empty for no heading at all.'),
      column.heading || original,
    );
    if (answer === null) return;
    const heading = answer.trim() === original ? '' : answer.trim();
    change(
      withColumns((columns) => {
        (columns[at] as PrintColumn).heading = heading;
      }),
    );
  }

  function commitWidth() {
    if (index === null) return;
    const column = spec.columns[index] as PrintColumn;
    const weight = weightFromBox(spec, column, boxText, shown);
    setTyped(null);
    if (weight === null) return;
    change(
      withColumns((columns) => {
        (columns[index] as PrintColumn).weight = weight;
      }),
    );
  }

  function auto() {
    if (index === null) return;
    setTyped(null);
    change(
      withColumns((columns) => {
        (columns[index] as PrintColumn).weight = 0;
      }),
    );
  }

  function setAlign(label: string) {
    if (index === null) return;
    const chosen = keyFor(printing.ALIGN_CHOICES, label, '');
    if (chosen === (spec.columns[index] as PrintColumn).alignOverride) return;
    change(
      withColumns((columns) => {
        (columns[index] as PrintColumn).alignOverride = chosen;
      }),
    );
  }

  const used = new Set(spec.columns.filter((c) => c.kind === printing.FIELD).map((c) => c.field));

  return (
    <section
      className="flex min-w-0 flex-col rounded-lg border border-line bg-surface p-3"
      aria-labelledby="print-columns-title"
      data-testid="print-columns"
    >
      <h2 id="print-columns-title" className="text-base font-semibold">
        Columns
      </h2>
      <p className="mb-2 text-sm text-muted">
        Top of the list prints leftmost. Double-click one to rename it.
      </p>
      <div className="max-h-72 min-h-32 overflow-auto rounded border border-line">
        <table className="w-full text-sm" role="grid" aria-label="Printed columns">
          <thead className="sticky top-0 bg-raised text-left text-muted">
            <tr>
              <th className="px-2 py-1 font-medium">Column</th>
              <th className="px-2 py-1 font-medium">Type</th>
              <th className="px-2 py-1 text-center font-medium">Align</th>
              <th className="px-2 py-1 text-center font-medium">Width</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, at) => (
              <tr
                key={at}
                tabIndex={0}
                aria-selected={at === index}
                data-testid="print-column-row"
                className={
                  'cursor-default border-t border-line outline-none focus-visible:ring-2 focus-visible:ring-focus ' +
                  (at === index ? 'bg-row-selected ' : 'hover:bg-row-hover ') +
                  (line.ghost ? 'text-muted' : '')
                }
                onClick={() => select(at)}
                onDoubleClick={() => void rename(at)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === 'F2') void rename(at);
                  else if (event.key === 'ArrowDown' && at + 1 < lines.length) select(at + 1);
                  else if (event.key === 'ArrowUp' && at > 0) select(at - 1);
                  else return;
                  event.preventDefault();
                }}
              >
                <td className="px-2 py-1">{line.column}</td>
                <td className="px-2 py-1">{line.kind}</td>
                <td className="px-2 py-1 text-center">{line.align}</td>
                <td className="px-2 py-1 text-center tabular-nums" data-testid="print-column-width">
                  {line.width}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button data-testid="print-add-column">Add...</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {printing.PRINT_FIELDS.map(([key, heading]) => (
              <DropdownMenuItem
                key={key}
                disabled={used.has(key)}
                onSelect={() => add(printing.createPrintColumn({ field: key }))}
              >
                {heading}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => add(printing.createPrintColumn({ kind: printing.BLANK }))}
            >
              Write-in column (blank, to fill in by hand)
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void addTickBox()}>
              Tick box column...
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button onClick={remove} data-testid="print-remove-column">
          Remove
        </Button>
        <Button onClick={() => move(-1)} data-testid="print-move-up">
          Move Up
        </Button>
        <Button onClick={() => move(1)} data-testid="print-move-down">
          Move Down
        </Button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-sm">
        <label htmlFor="print-width">Width</label>
        <Input
          id="print-width"
          type="number"
          min={WIDTH_MIN}
          max={WIDTH_MAX}
          step={WIDTH_STEP}
          className="w-20"
          value={boxText}
          disabled={index === null}
          data-testid="print-width"
          onChange={(event) => setTyped({ for: `${index}:${shown}`, text: event.target.value })}
          onBlur={commitWidth}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commitWidth();
          }}
        />
        <Button size="sm" onClick={auto} disabled={index === null} data-testid="print-width-auto">
          Auto
        </Button>
        <label htmlFor="print-align" className="ml-3">
          Align
        </label>
        <select
          id="print-align"
          className="h-8 rounded-md border border-line-strong bg-sunken px-2 text-sm"
          disabled={index === null}
          value={
            index === null
              ? ''
              : labelFor(printing.ALIGN_CHOICES, (spec.columns[index] as PrintColumn).alignOverride)
          }
          onChange={(event) => setAlign(event.target.value)}
          data-testid="print-align"
        >
          {index === null ? <option value="" /> : null}
          {printing.ALIGN_CHOICES.map(([key, label]) => (
            <option key={key} value={label}>
              {label}
            </option>
          ))}
        </select>
      </div>
    </section>
  );
}
