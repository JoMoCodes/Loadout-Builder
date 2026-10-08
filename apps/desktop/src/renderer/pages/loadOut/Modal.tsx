// The Load Out page's windows: a question, a note, and the pickers. Each is a native modal
// dialog, so Tab stays inside it and Esc closes it (the old app's dialogs did the same).
//
// `useAsk()` turns a dialog into something the page can wait for:
//
//   const yes = await ask<boolean>((done) => <Confirm title=... onAnswer={done} />);

import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '../../ui/button';
import { cn } from '../../ui/cn';

interface ModalProps {
  title: string;
  /** The window's own title, above the question (the old windows had both, as "Reassign CX1"). */
  caption?: string;
  /** Called on Esc or the window's own close. */
  onCancel: () => void;
  children: ReactNode;
  footer: ReactNode;
  /** Wider windows for the pickers. */
  wide?: boolean;
  /** Enter anywhere but on a button does this (the old dialogs bound Return to confirm). */
  onEnter?: () => void;
  testId?: string;
}

export function Modal({
  title,
  caption,
  onCancel,
  children,
  footer,
  wide,
  onEnter,
  testId,
}: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (element && !element.open) element.showModal();
    return () => {
      if (element?.open) element.close();
    };
  }, []);

  return (
    <dialog
      ref={ref}
      aria-label={title}
      data-testid={testId}
      data-dialog="load-out"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' || !onEnter) return;
        const target = event.target as HTMLElement;
        if (target.closest('button, a, select, [role="menuitem"]')) return;
        event.preventDefault();
        onEnter();
      }}
      className={cn(
        'm-auto max-h-[85vh] flex-col open:flex rounded-lg border border-line bg-raised p-0 text-fg shadow-xl',
        'backdrop:bg-black/50',
        wide ? 'w-[min(60rem,calc(100vw-2rem))]' : 'w-[min(34rem,calc(100vw-2rem))]',
      )}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden px-5 pt-4">
        {caption ? (
          <p className="text-sm font-medium text-muted" data-testid="dialog-caption">
            {caption}
          </p>
        ) : null}
        <h2 className="text-lg font-semibold">{title}</h2>
        {children}
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2 px-5 py-4">{footer}</div>
    </dialog>
  );
}

/** Paragraphs from text with blank lines, the way the old message boxes laid them out. */
export function Paragraphs({ text }: { text: string }) {
  return (
    <div className="flex flex-col gap-2 overflow-y-auto text-sm" data-testid="dialog-text">
      {text.split('\n\n').map((part, index) => (
        <p key={index} className="whitespace-pre-line">
          {part}
        </p>
      ))}
    </div>
  );
}

interface ConfirmProps {
  title: string;
  text: string;
  /** The old message boxes said Yes and No. */
  yes?: string;
  no?: string;
  /** A question about taking something away: the Yes button is red. */
  danger?: boolean;
  onAnswer: (yes: boolean) => void;
}

export function Confirm({ title, text, yes = 'Yes', no = 'No', danger, onAnswer }: ConfirmProps) {
  return (
    <Modal
      title={title}
      onCancel={() => onAnswer(false)}
      testId="confirm-dialog"
      footer={
        <>
          {/* A red question starts on No, so Enter never takes something away by accident. */}
          <Button onClick={() => onAnswer(false)} data-testid="confirm-no" autoFocus={danger}>
            {no}
          </Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            onClick={() => onAnswer(true)}
            data-testid="confirm-yes"
            autoFocus={!danger}
          >
            {yes}
          </Button>
        </>
      }
    >
      <Paragraphs text={text} />
    </Modal>
  );
}

interface InformProps {
  title: string;
  text: string;
  onClose: () => void;
}

export function Inform({ title, text, onClose }: InformProps) {
  return (
    <Modal
      title={title}
      onCancel={onClose}
      testId="inform-dialog"
      footer={
        <Button variant="primary" onClick={onClose} autoFocus data-testid="inform-ok">
          OK
        </Button>
      }
    >
      <Paragraphs text={text} />
    </Modal>
  );
}

type Render<T> = (done: (value: T) => void) => ReactNode;

/** One dialog at a time, which the page can wait for. */
export function useAsk() {
  const [current, setCurrent] = useState<ReactNode>(null);
  const opened = useRef(0);
  const ask = useCallback(
    <T,>(render: Render<T>) =>
      new Promise<T>((resolve) => {
        // Let a right-click menu finish closing first, so it does not take the focus back.
        setTimeout(() => {
          opened.current += 1;
          setCurrent(
            <Fragment key={opened.current}>
              {render((value) => {
                // Close the window before it leaves the page, so the browser hands the focus
                // back cleanly.
                for (const open of document.querySelectorAll<HTMLDialogElement>(
                  'dialog[data-dialog="load-out"][open]',
                ))
                  open.close();
                setCurrent(null);
                resolve(value);
              })}
            </Fragment>,
          );
        }, 0);
      }),
    [],
  );
  const confirm = useCallback(
    (title: string, text: string, options: { danger?: boolean } = {}) =>
      ask<boolean>((done) => (
        <Confirm title={title} text={text} danger={options.danger} onAnswer={done} />
      )),
    [ask],
  );
  const inform = useCallback(
    (title: string, text: string) =>
      ask<void>((done) => <Inform title={title} text={text} onClose={() => done()} />),
    [ask],
  );
  return { ask, confirm, inform, dialog: current ? createPortal(current, document.body) : null };
}
