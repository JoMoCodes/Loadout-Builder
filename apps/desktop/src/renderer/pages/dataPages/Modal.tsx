// The windows the data pages open: a plain question (yes or no), a message, a number to type, and
// the frame the bigger windows (PADs, shared routes, who takes a van) sit in. They are native
// <dialog> elements, as "What's new" is, so Tab stays inside and Esc closes them.

import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Button } from '../../ui/button';
import { cn } from '../../ui/cn';

interface ModalProps {
  title: string;
  /** A line under the title, in plain words. */
  lead?: ReactNode;
  /** Stable name for tests: the window gets `data-dialog`. */
  name: string;
  children?: ReactNode;
  /** Buttons on the left of the button strip (for example "Clear all"). */
  extraButtons?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Leave out for a window with a single "OK". */
  onCancel?: () => void;
  onConfirm: () => void;
  confirmDisabled?: boolean;
  danger?: boolean;
  wide?: boolean;
}

/** The frame: a title, a body that scrolls, and a strip of buttons that stays put. */
export function Modal({
  title,
  lead,
  name,
  children,
  extraButtons,
  confirmLabel = 'OK',
  cancelLabel = 'Cancel',
  onCancel,
  onConfirm,
  confirmDisabled,
  danger,
  wide,
}: ModalProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
  }, []);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!confirmDisabled) onConfirm();
  }

  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      data-dialog={name}
      onCancel={(event) => {
        // Esc: the page decides what closing means, so the browser does not close it by itself.
        event.preventDefault();
        (onCancel ?? onConfirm)();
      }}
      className={cn(
        'm-auto max-h-[90vh] rounded-lg border border-line bg-raised p-0 text-fg shadow-popover',
        'backdrop:bg-black/50',
        wide ? 'w-[min(46rem,calc(100vw-2rem))]' : 'w-[min(34rem,calc(100vw-2rem))]',
      )}
    >
      <form onSubmit={submit} className="flex max-h-[90vh] flex-col">
        <div className="px-5 pt-4 pb-2">
          <h2 id={titleId} className="m-0 text-[1.15rem] font-semibold">
            {title}
          </h2>
          {lead ? <div className="mt-1 text-sm text-muted">{lead}</div> : null}
        </div>
        {children ? <div className="min-h-0 flex-1 overflow-auto px-5 py-2">{children}</div> : null}
        <div className="flex items-center gap-2 border-t border-line px-5 py-3">
          <div className="flex items-center gap-2">{extraButtons}</div>
          <div className="ml-auto flex items-center gap-2">
            {onCancel ? (
              // A red question starts on the way out, so Enter never clears anything by accident.
              <Button type="button" onClick={onCancel} data-action="cancel" autoFocus={danger}>
                {cancelLabel}
              </Button>
            ) : null}
            <Button
              type="submit"
              variant={danger ? 'danger' : 'primary'}
              disabled={confirmDisabled}
              autoFocus={!children && !(danger && onCancel)}
              data-action="confirm"
            >
              {confirmLabel}
            </Button>
          </div>
        </div>
      </form>
    </dialog>
  );
}

interface ConfirmProps {
  title: string;
  /** Paragraphs are separated by a blank line, as in the old windows. */
  body: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onDone: (yes: boolean) => void;
}

/** A yes-or-no question. "No" is the way out (Esc too). */
export function ConfirmDialog({
  title,
  body,
  confirmLabel = 'Yes',
  cancelLabel = 'No',
  danger,
  onDone,
}: ConfirmProps) {
  return (
    <Modal
      name="confirm"
      title={title}
      confirmLabel={confirmLabel}
      cancelLabel={cancelLabel}
      danger={danger}
      onConfirm={() => onDone(true)}
      onCancel={() => onDone(false)}
    >
      {body.split('\n\n').map((paragraph) => (
        <p key={paragraph} className="my-2 text-sm">
          {paragraph}
        </p>
      ))}
    </Modal>
  );
}

/** A message with one button. */
export function MessageDialog({
  title,
  body,
  onDone,
}: {
  title: string;
  body: string;
  onDone: () => void;
}) {
  return (
    <Modal name="message" title={title} onConfirm={onDone}>
      <p className="my-2 text-sm">{body}</p>
    </Modal>
  );
}

interface PromptProps {
  title: string;
  /** The question, in plain words. */
  body: string;
  initial?: string;
  /** Returns words to show when the answer will not do, or null when it will. */
  check?: (answer: string) => string | null;
  onDone: (answer: string | null) => void;
}

/** A question with a line to type the answer on. */
export function PromptDialog({ title, body, initial = '', check, onDone }: PromptProps) {
  const [answer, setAnswer] = useState(initial);
  const [problem, setProblem] = useState<string | null>(null);
  const inputId = useId();

  function confirm() {
    const wrong = check ? check(answer.trim()) : null;
    if (wrong) {
      setProblem(wrong);
      return;
    }
    onDone(answer.trim());
  }

  return (
    <Modal
      name="prompt"
      title={title}
      onConfirm={confirm}
      onCancel={() => onDone(null)}
      confirmLabel="OK"
    >
      {body.split('\n\n').map((paragraph) => (
        <p key={paragraph} className="my-2 text-sm">
          {paragraph}
        </p>
      ))}
      <label htmlFor={inputId} className="sr-only">
        Your answer
      </label>
      <input
        id={inputId}
        value={answer}
        autoFocus
        onChange={(event) => {
          setAnswer(event.target.value);
          setProblem(null);
        }}
        className="mt-1 h-8 w-full rounded-md border border-line-strong bg-sunken px-2 text-sm text-fg"
        data-testid="prompt-answer"
      />
      {problem ? (
        <p
          role="alert"
          className="mt-2 text-sm font-semibold text-bad"
          data-testid="prompt-problem"
        >
          {problem}
        </p>
      ) : null}
    </Modal>
  );
}
