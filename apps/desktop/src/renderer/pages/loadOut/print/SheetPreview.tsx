// The live preview: the pages the writer will write, drawn on screen from the very same marks
// (shared/print/sheet.ts) the PDF is made of. Same places, same boxes, same trimming; only the
// type is the screen's Helvetica (or Arial, which has the same widths) instead of the printer's.

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import type { Rgb, SheetDoc } from '../../../../shared/print/sheet';
import { Button } from '../../../ui/button';

const rgb = (color: Rgb) => `rgb(${color[0]},${color[1]},${color[2]})`;

export function SheetPreview({ doc }: { doc: SheetDoc | null }) {
  const [wanted, setWanted] = useState(0);
  const count = doc?.pages.length ?? 0;
  const index = Math.min(wanted, Math.max(0, count - 1));
  const page = doc?.pages[index];

  return (
    <section
      className="rounded-lg border border-line bg-surface p-3"
      aria-labelledby="print-preview-title"
      data-testid="print-preview"
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h2 id="print-preview-title" className="text-base font-semibold">
          How the page will look
        </h2>
        <span className="text-sm text-muted" data-testid="print-preview-page">
          {count ? `Page ${index + 1} of ${count}` : 'Nothing to show yet'}
        </span>
        <span className="ml-auto flex gap-1">
          <Button
            size="sm"
            aria-label="Previous page"
            disabled={index <= 0}
            onClick={() => setWanted(index - 1)}
            data-testid="print-preview-back"
          >
            <ChevronLeft aria-hidden="true" />
          </Button>
          <Button
            size="sm"
            aria-label="Next page"
            disabled={index >= count - 1}
            onClick={() => setWanted(index + 1)}
            data-testid="print-preview-next"
          >
            <ChevronRight aria-hidden="true" />
          </Button>
        </span>
      </div>
      {doc && page ? (
        <div className="overflow-auto rounded bg-sunken p-3">
          <svg
            viewBox={`0 0 ${doc.width} ${doc.height}`}
            className="mx-auto block w-full max-w-[56rem] bg-white shadow-popover"
            role="img"
            aria-label={`Page ${index + 1} of ${count} as it will print`}
            data-testid="print-preview-sheet"
            data-width={doc.width}
            data-height={doc.height}
          >
            {page.marks.map((mark, at) =>
              mark.kind === 'rect' ? (
                <rect
                  key={at}
                  x={mark.x}
                  y={mark.y}
                  width={mark.w}
                  height={mark.h}
                  fill={mark.fill ? rgb(mark.fill) : 'none'}
                  stroke={mark.stroke ? rgb(mark.stroke) : 'none'}
                  strokeWidth={doc.lineWidth}
                />
              ) : (
                <text
                  key={at}
                  x={mark.x}
                  y={mark.y}
                  fontFamily="Helvetica, Arial, 'Liberation Sans', sans-serif"
                  fontSize={mark.size}
                  fontWeight={mark.bold ? 700 : 400}
                  fill={rgb(mark.color)}
                  style={{ whiteSpace: 'pre' }}
                  data-mark="text"
                >
                  {mark.text}
                </text>
              ),
            )}
          </svg>
        </div>
      ) : null}
    </section>
  );
}
