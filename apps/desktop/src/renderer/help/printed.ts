// The first-day checklist's last step ticks when a roster has been printed or saved as a file.
// The Print tab and the export buttons need no change for that: every call the page makes goes
// through `call`, which passes the outcome here, and the shell listens for the note.

export const PRINTED_EVENT = 'loadout:printed';

const WRITING_CHANNELS = new Set(['print:print', 'print:export']);

/** Says "a roster was printed" when a print or export call wrote a file. */
export function notePrinted(name: string, reply: unknown): void {
  if (!WRITING_CHANNELS.has(name)) return;
  const value = (reply as { ok?: boolean; value?: { status?: string } } | null) ?? null;
  if (value?.ok !== true || value.value?.status !== 'written') return;
  window.dispatchEvent(new Event(PRINTED_EVENT));
}
