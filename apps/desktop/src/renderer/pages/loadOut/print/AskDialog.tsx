// The small questions the Print tab asks (a name, "are you sure?", "this did not work"), as one
// native dialog: Tab stays inside it, Esc closes it, and the answer comes back as a promise.

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from '../../../ui/button';
import { Input } from '../../../ui/input';

type Question =
  | {
      kind: 'ask';
      title: string;
      message: string;
      initial: string;
      done(answer: string | null): void;
    }
  | { kind: 'confirm'; title: string; message: string; done(answer: boolean): void }
  | { kind: 'tell'; title: string; message: string; done(): void };

export interface Asker {
  /** Asks for some words. Null if they cancel. */
  ask(title: string, message: string, initial?: string): Promise<string | null>;
  /** Yes or no. */
  confirm(title: string, message: string): Promise<boolean>;
  /** Says something and waits for OK. */
  tell(title: string, message: string): Promise<void>;
  /** Put this in the page. */
  element: ReactNode;
}

export function useAsker(): Asker {
  const [question, setQuestion] = useState<Question | null>(null);

  const ask = useCallback(
    (title: string, message: string, initial = '') =>
      new Promise<string | null>((done) =>
        setQuestion({ kind: 'ask', title, message, initial, done }),
      ),
    [],
  );
  const confirm = useCallback(
    (title: string, message: string) =>
      new Promise<boolean>((done) => setQuestion({ kind: 'confirm', title, message, done })),
    [],
  );
  const tell = useCallback(
    (title: string, message: string) =>
      new Promise<void>((done) => setQuestion({ kind: 'tell', title, message, done })),
    [],
  );

  const element = question ? (
    <AskDialog
      key={`${question.kind}:${question.title}`}
      question={question}
      onDone={() => setQuestion(null)}
    />
  ) : null;
  return { ask, confirm, tell, element };
}

function AskDialog({ question, onDone }: { question: Question; onDone(): void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [text, setText] = useState(question.kind === 'ask' ? question.initial : '');
  const answered = useRef(false);

  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
  }, []);

  function finish(ok: boolean) {
    if (answered.current) return;
    answered.current = true;
    if (question.kind === 'ask') question.done(ok ? text : null);
    else if (question.kind === 'confirm') question.done(ok);
    else question.done();
    dialog.current?.close();
    onDone();
  }

  return (
    <dialog
      ref={dialog}
      aria-labelledby="print-ask-title"
      data-dialog="print-ask"
      className="m-auto w-[min(32rem,90vw)] rounded-lg border border-line bg-surface p-5 text-fg shadow-popover backdrop:bg-black/50"
      onCancel={(event) => {
        event.preventDefault();
        finish(false);
      }}
    >
      <form
        method="dialog"
        onSubmit={(event) => {
          event.preventDefault();
          finish(true);
        }}
      >
        <h2 id="print-ask-title" className="mb-2 text-lg font-semibold">
          {question.title}
        </h2>
        {question.message.split('\n\n').map((part) => (
          <p key={part} className="mb-2 text-sm whitespace-pre-line">
            {part}
          </p>
        ))}
        {question.kind === 'ask' ? (
          <Input
            aria-label={question.title}
            data-testid="print-ask-input"
            value={text}
            autoFocus
            onChange={(event) => setText(event.target.value)}
            className="mb-3"
          />
        ) : null}
        <div className="mt-3 flex justify-end gap-2">
          {question.kind !== 'tell' ? (
            <Button data-testid="print-ask-cancel" onClick={() => finish(false)}>
              {question.kind === 'confirm' ? 'No' : 'Cancel'}
            </Button>
          ) : null}
          <Button
            type="submit"
            variant="primary"
            data-testid="print-ask-ok"
            autoFocus={question.kind !== 'ask'}
          >
            {question.kind === 'confirm' ? 'Yes' : 'OK'}
          </Button>
        </div>
      </form>
    </dialog>
  );
}
