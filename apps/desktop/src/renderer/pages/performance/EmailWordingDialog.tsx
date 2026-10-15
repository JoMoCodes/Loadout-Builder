// The "Email wording" window: the subject and the opening of an email, with placeholders. The
// Scorecards page opens it for the weekly reports (Performance and Reports tabs) and the Route
// Sheets page for the route sheets, each with its own words. The address and server stay in
// Settings > Email. Opened the way the other questions are (useDialogs), so Esc closes it.

import { Settings } from 'lucide-react';
import { useState } from 'react';
import { BODY_MAX, SUBJECT_MAX } from '../../../shared/settings';
import { Button } from '../../ui/button';
import { cn } from '../../ui/cn';
import { Input } from '../../ui/input';
import { Modal } from '../dataPages/Modal';

export interface EmailWordingDialogProps {
  /** Stable name for tests: the window gets `data-dialog`. */
  name: string;
  /** The line under the title, in plain words. */
  lead: string;
  /** The placeholders, as written under the subject ("{name} {from} {to}"). */
  placeholders: string;
  subject: string;
  body: string;
  /** The start of the fields' test ids ("perf-email" gives perf-email-subject and so on). */
  testPrefix: string;
  /** Saves the wording. The window stays open and says it was saved. */
  onSave(subject: string, body: string): Promise<void>;
  onDone(): void;
}

export function EmailWordingDialog({
  name,
  lead,
  placeholders,
  subject: savedSubject,
  body: savedBody,
  testPrefix,
  onSave,
  onDone,
}: EmailWordingDialogProps) {
  // What is saved, as this window knows it: the page behind it is not drawn again while it is open.
  const [saved, setSaved] = useState({ subject: savedSubject, body: savedBody });
  const [subject, setSubject] = useState(savedSubject);
  const [body, setBody] = useState(savedBody);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const changed = subject !== saved.subject || body !== saved.body;

  async function save() {
    if (subject.length > SUBJECT_MAX) {
      setNote({ ok: false, text: `The subject can be up to ${SUBJECT_MAX} letters long.` });
      return;
    }
    if (body.length > BODY_MAX) {
      setNote({ ok: false, text: `The message can be up to ${BODY_MAX} letters long.` });
      return;
    }
    await onSave(subject, body);
    setSaved({ subject, body });
    setNote({ ok: true, text: 'Email wording saved.' });
  }

  function undo() {
    setSubject(saved.subject);
    setBody(saved.body);
    setNote(null);
  }

  return (
    <Modal
      name={name}
      title="Email wording"
      lead={lead}
      confirmLabel="Save wording"
      confirmTestId={`${testPrefix}-save`}
      confirmDisabled={!changed}
      cancelLabel="Close"
      onConfirm={() => void save()}
      onCancel={onDone}
      extraButtons={
        <Button type="button" disabled={!changed} onClick={undo} data-testid={`${testPrefix}-undo`}>
          Undo
        </Button>
      }
      wide
    >
      <label className="my-2 block">
        <span className="mb-1 block text-sm font-medium">Subject</span>
        <Input
          value={subject}
          autoFocus
          onChange={(event) => {
            setSubject(event.target.value);
            setNote(null);
          }}
          data-testid={`${testPrefix}-subject`}
        />
      </label>
      <p className="m-0 mb-3 text-sm text-muted">Placeholders: {placeholders}</p>
      <label className="my-2 block">
        <span className="mb-1 block text-sm font-medium">Message</span>
        <textarea
          value={body}
          onChange={(event) => {
            setBody(event.target.value);
            setNote(null);
          }}
          rows={7}
          className="w-full rounded-md border border-line-strong bg-sunken px-2.5 py-1.5 text-sm text-fg focus-visible:border-focus"
          data-testid={`${testPrefix}-body`}
        />
      </label>
      {note ? (
        <p
          role={note.ok ? 'status' : 'alert'}
          className={cn('my-2 text-sm', note.ok ? 'text-ok' : 'font-semibold text-bad')}
          data-testid={`${testPrefix}-note`}
        >
          {note.text}
        </p>
      ) : null}
    </Modal>
  );
}

/** The Settings button with the gear that opens the window, at the right end of a button row. */
export function WordingSettingsButton({
  onClick,
  testId,
  className,
}: {
  onClick: () => void;
  testId: string;
  className?: string;
}) {
  return (
    <Button
      onClick={onClick}
      className={className}
      aria-haspopup="dialog"
      title="The subject and message of the emails"
      data-testid={testId}
    >
      <Settings aria-hidden="true" />
      Settings
    </Button>
  );
}
