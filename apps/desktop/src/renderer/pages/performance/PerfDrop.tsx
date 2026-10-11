// A place on the Imports tab that takes a dropped file or folder: one per card (that kind), and
// the tab itself (kind null: the app sorts the files by their names). Like FileDrop, but for the
// weekly exports: the file goes to the bridge, which turns it into a token per kind found. The
// page never learns where the file is.

import { FileDown } from 'lucide-react';
import { useRef, useState, type DragEvent, type ReactNode } from 'react';
import type { PerfKind } from '../../../shared/performance';
import { PERF_KIND_WORDS } from '../../../shared/performance';
import { call, explain } from '../../lib/channels';
import { cn } from '../../ui/cn';

export interface DroppedToken {
  kind: PerfKind;
  token: string;
  files: number;
}

interface PerfDropProps {
  kind: PerfKind | null;
  /** Nothing is taken while an import runs. */
  disabled?: boolean;
  onDropped: (tokens: DroppedToken[]) => void;
  onProblem: (words: string) => void;
  className?: string;
  children: ReactNode;
}

const carriesFiles = (event: DragEvent) => event.dataTransfer?.types?.includes('Files') ?? false;
const questionOpen = () => document.querySelector('dialog[open]') !== null;

export function PerfDrop({
  kind,
  disabled,
  onDropped,
  onProblem,
  className,
  children,
}: PerfDropProps) {
  const [over, setOver] = useState(false);
  const busy = useRef(false);

  function onDragOver(event: DragEvent<HTMLDivElement>) {
    if (!carriesFiles(event) || questionOpen() || disabled) return;
    // Taken here, so the tab (or the window) underneath never sees it.
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'copy';
    if (!over) setOver(true);
  }

  function onDragLeave(event: DragEvent<HTMLDivElement>) {
    const next = event.relatedTarget as Node | null;
    if (next && event.currentTarget.contains(next)) return;
    setOver(false);
  }

  async function onDrop(event: DragEvent<HTMLDivElement>) {
    if (!carriesFiles(event)) return;
    event.preventDefault();
    event.stopPropagation();
    setOver(false);
    if (questionOpen() || busy.current || disabled) return;
    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    busy.current = true;
    try {
      const reply = await call('performance:dropped', { kind, file });
      if (!reply.ok) {
        onProblem(explain(reply));
        return;
      }
      onDropped(reply.value ?? []);
    } finally {
      busy.current = false;
    }
  }

  return (
    <div
      className={cn('relative', className)}
      data-drop-kind={kind ?? 'any'}
      onDragEnter={onDragOver}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={(event) => void onDrop(event)}
    >
      {children}
      {over ? (
        <div
          className="pointer-events-none absolute inset-1 z-40 flex items-center justify-center rounded-lg border-2 border-dashed border-accent bg-app/85 p-2 text-center"
          data-testid="perf-drop-highlight"
          aria-hidden="true"
        >
          <p className="flex items-center gap-2 font-semibold text-fg">
            <FileDown aria-hidden="true" className="size-5 shrink-0" />
            {kind
              ? `Drop ${PERF_KIND_WORDS[kind].the} here`
              : 'Drop export files or a folder here. The app sorts them by name.'}
          </p>
        </div>
      ) : null}
    </div>
  );
}
