// A place on a page that takes a file dropped on it, for the tabs that bring a file in. While a
// file is dragged over it, it lights up with words ("Drop the load-out sheet here"). The dropped
// file goes to the bridge, which checks it with the main process; the page gets back a token
// that `files:import` reads as if the file had been picked in the file window. The page never
// learns where the file is.
//
//   <FileDrop page="load-out" kind="loadout" onDropped={(token) => importSheet(token)}
//             onProblem={(words) => showIt(words)}>
//     ...the tab...
//   </FileDrop>
//
// A drop anywhere else in the window does nothing (see `useNoStrayDrops`).

import { FileDown } from 'lucide-react';
import { useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { FILE_WORDS, type DropPage, type FileKind } from '../../shared/channels/files';
import { call, explain } from '../lib/channels';

interface FileDropProps {
  page: DropPage;
  kind: FileKind;
  /** The file passed the check: bring it in with this token as the path. */
  onDropped: (token: string) => void;
  /** The file was refused: plain words to show. */
  onProblem: (words: string) => void;
  children: ReactNode;
}

const carriesFiles = (event: DragEvent) => event.dataTransfer?.types?.includes('Files') ?? false;
const questionOpen = () => document.querySelector('dialog[open]') !== null;

export function FileDrop({ page, kind, onDropped, onProblem, children }: FileDropProps) {
  const [over, setOver] = useState(false);
  const busy = useRef(false);

  function onDragOver(event: DragEvent<HTMLDivElement>) {
    if (!carriesFiles(event) || questionOpen()) return;
    // Taken here, so the window's own "do nothing" below never sees it.
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
    event.preventDefault();
    event.stopPropagation();
    setOver(false);
    if (questionOpen() || busy.current) return;
    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    busy.current = true;
    try {
      const reply = await call('files:dropped', { page, kind, file });
      if (!reply.ok) {
        onProblem(explain(reply));
        return;
      }
      onDropped(reply.value.token);
    } finally {
      busy.current = false;
    }
  }

  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col"
      data-drop-kind={kind}
      onDragEnter={onDragOver}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={(event) => void onDrop(event)}
    >
      {children}
      {over ? (
        <div
          className="pointer-events-none absolute inset-2 z-40 flex items-center justify-center rounded-lg border-2 border-dashed border-accent bg-app/85"
          data-testid="drop-highlight"
          aria-hidden="true"
        >
          <p className="flex items-center gap-2 text-lg font-semibold text-fg">
            <FileDown aria-hidden="true" className="size-6" />
            Drop {FILE_WORDS[kind].the} here
          </p>
        </div>
      ) : null}
    </div>
  );
}

/**
 * A file dropped anywhere that does not take one does nothing: the window would otherwise try to
 * open it in place of the app. For the app's root, once.
 */
export function useNoStrayDrops(): void {
  useEffect(() => {
    const stop = (event: globalThis.DragEvent) => {
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'none';
    };
    window.addEventListener('dragover', stop);
    window.addEventListener('drop', stop);
    return () => {
      window.removeEventListener('dragover', stop);
      window.removeEventListener('drop', stop);
    };
  }, []);
}
