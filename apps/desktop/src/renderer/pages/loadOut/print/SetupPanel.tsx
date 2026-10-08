// Panel two: how the page is set up. Paper, way up, scale, order, page breaks, the title and a
// note, and the switches for everything else on the page.

import { printing } from '@loadout/core';
import { useState, type ReactNode } from 'react';
import { Input } from '../../../ui/input';
import { keyFor, labelFor, scaleFromBox } from './logic';

type PrintSpec = printing.PrintSpec;

export interface SetupPanelProps {
  spec: PrintSpec;
  change(next: PrintSpec, typed?: boolean): void;
}

type Flag =
  | 'fitOnePage'
  | 'stretch'
  | 'centerH'
  | 'centerV'
  | 'showTitle'
  | 'showPageNumbers'
  | 'repeatHeader'
  | 'grid'
  | 'stripes';

// The switches, with the old tab's words, in the old tab's order.
const SWITCHES: ReadonlyArray<readonly [Flag, string]> = [
  ['fitOnePage', 'Keep all columns on one page'],
  ['stretch', 'Stretch narrow tables to the full width'],
  ['centerH', 'Centre across the page'],
  ['centerV', 'Centre down the page'],
  ['showTitle', 'Title at the top'],
  ['showPageNumbers', 'Page numbers'],
  ['repeatHeader', 'Repeat the headings on every page'],
  ['grid', 'Boxes round every cell'],
  ['stripes', 'Shade every other row'],
];

const selectClass = 'h-8 w-full rounded-md border border-line-strong bg-sunken px-2 text-sm';

function Row({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <>
      <label htmlFor={htmlFor} className="self-center text-sm">
        {label}
      </label>
      <div className="flex min-w-0 items-center gap-2">{children}</div>
    </>
  );
}

export function SetupPanel({ spec, change }: SetupPanelProps) {
  // What is being typed in the three boxes, against the value it started from.
  const [scaleText, setScaleText] = useState<{ for: number; text: string } | null>(null);
  const [titleText, setTitleText] = useState<{ for: string; text: string } | null>(null);
  const [noteText, setNoteText] = useState<{ for: string; text: string } | null>(null);
  const scaleShown =
    scaleText && scaleText.for === spec.scale ? scaleText.text : String(spec.scale);
  const titleShown = titleText && titleText.for === spec.title.trim() ? titleText.text : spec.title;
  const noteShown = noteText && noteText.for === spec.note.trim() ? noteText.text : spec.note;

  const set = (patch: Partial<PrintSpec>, typed = false) => change({ ...spec, ...patch }, typed);

  function commitScale() {
    const scale = scaleFromBox(scaleShown, spec.scale);
    // 500 becomes 200 and 'abc' becomes what it was; either way the box shows the real scale.
    setScaleText(null);
    if (scale !== spec.scale) set({ scale });
  }

  return (
    <section
      className="flex min-w-0 flex-col rounded-lg border border-line bg-surface p-3"
      aria-labelledby="print-setup-title"
      data-testid="print-setup"
    >
      <h2 id="print-setup-title" className="text-base font-semibold">
        Page Setup
      </h2>
      <p className="mb-2 text-sm text-muted">What Print Page and Print Vans both come out on.</p>
      <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5">
        <Row label="Paper" htmlFor="print-paper">
          <select
            id="print-paper"
            className={selectClass}
            value={labelFor(printing.PAPERS, spec.paper)}
            onChange={(e) => set({ paper: keyFor(printing.PAPERS, e.target.value, 'letter') })}
          >
            {printing.PAPERS.map(([key, label]) => (
              <option key={key} value={label}>
                {label}
              </option>
            ))}
          </select>
        </Row>
        <Row label="Orientation" htmlFor="print-orientation">
          <select
            id="print-orientation"
            className={selectClass}
            value={spec.orientation === printing.LANDSCAPE ? 'Landscape' : 'Portrait'}
            onChange={(e) =>
              set({
                orientation:
                  e.target.value === 'Landscape' ? printing.LANDSCAPE : printing.PORTRAIT,
              })
            }
          >
            <option value="Portrait">Portrait</option>
            <option value="Landscape">Landscape</option>
          </select>
        </Row>
        <Row label="Scale" htmlFor="print-scale">
          <Input
            id="print-scale"
            type="number"
            min={printing.SCALE_MIN}
            max={printing.SCALE_MAX}
            step={5}
            className="w-20"
            value={scaleShown}
            onChange={(e) => setScaleText({ for: spec.scale, text: e.target.value })}
            onBlur={commitScale}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitScale();
            }}
          />
          <span className="text-sm">%</span>
        </Row>
        <Row label="Order by" htmlFor="print-sort">
          <select
            id="print-sort"
            className={selectClass}
            value={labelFor(printing.SORT_CHOICES, spec.sortBy)}
            onChange={(e) =>
              set({ sortBy: keyFor(printing.SORT_CHOICES, e.target.value, 'driver') })
            }
          >
            {printing.SORT_CHOICES.map(([key, label]) => (
              <option key={key} value={label}>
                {label}
              </option>
            ))}
          </select>
          <label className="flex shrink-0 items-center gap-1 text-sm">
            <input
              type="checkbox"
              checked={spec.sortReverse}
              onChange={(e) => set({ sortReverse: e.target.checked })}
            />
            Reverse
          </label>
        </Row>
        <Row label="Page breaks" htmlFor="print-group">
          <select
            id="print-group"
            className={selectClass}
            value={labelFor(printing.GROUP_CHOICES, spec.groupBreak)}
            onChange={(e) =>
              set({ groupBreak: keyFor(printing.GROUP_CHOICES, e.target.value, '') })
            }
          >
            {printing.GROUP_CHOICES.map(([key, label]) => (
              <option key={key} value={label}>
                {label}
              </option>
            ))}
          </select>
        </Row>
        <Row label="Title" htmlFor="print-title">
          <Input
            id="print-title"
            value={titleShown}
            onChange={(e) => {
              const text = e.target.value;
              setTitleText({ for: text.trim(), text });
              set({ title: text.trim() }, true);
            }}
          />
        </Row>
        <Row label="Note" htmlFor="print-note">
          <Input
            id="print-note"
            value={noteShown}
            onChange={(e) => {
              const text = e.target.value;
              setNoteText({ for: text.trim(), text });
              set({ note: text.trim() }, true);
            }}
          />
        </Row>
      </div>
      <div className="mt-3 flex flex-col gap-1">
        {SWITCHES.map(([flag, label]) => (
          <label key={flag} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={spec[flag]}
              onChange={(e) => set({ [flag]: e.target.checked } as Partial<PrintSpec>)}
              data-testid={`print-switch-${flag}`}
            />
            {label}
          </label>
        ))}
      </div>
    </section>
  );
}
