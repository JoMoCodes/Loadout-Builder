import { useEffect, useRef } from 'react';
import type { ReleaseNote } from '@loadout/core';
import { Button } from '../ui/button';

interface WhatsNewDialogProps {
  notes: readonly ReleaseNote[];
  onClose(): void;
}

/** Shown once after the app updates. A native dialog, so Tab stays inside it and Esc closes it. */
export function WhatsNewDialog({ notes, onClose }: WhatsNewDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
  }, []);

  const newest = notes[0];
  if (!newest) return null;

  return (
    <dialog
      ref={dialog}
      className="whats-new"
      aria-labelledby="whats-new-title"
      onClose={onClose}
      data-dialog="whats-new"
    >
      <h2 id="whats-new-title">What&apos;s new in version {newest.version}</h2>
      {notes.map((note) => (
        <div key={note.version} className="release">
          {notes.length > 1 ? <h3>Version {note.version}</h3> : null}
          <ul>
            {note.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ))}
      <form method="dialog">
        <Button type="submit" variant="primary" autoFocus data-action="close-whats-new">
          Got it
        </Button>
      </form>
    </dialog>
  );
}
