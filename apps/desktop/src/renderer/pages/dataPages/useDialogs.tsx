// Opens a window and waits for the answer, the way the old app's `wait_window` did:
//
//   const { ask, host } = useDialogs();
//   const yes = await ask<boolean>((done) => <ConfirmDialog title="..." body="..." onDone={done} />);
//   return <>{...page}{host}</>;
//
// One window is open at a time. If the page goes away while one is open, the question is answered
// with `null`.

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

type Render<T> = (done: (answer: T | null) => void) => ReactNode;

export function useDialogs() {
  const [open, setOpen] = useState<{ key: number; node: ReactNode } | null>(null);
  const waiting = useRef<((answer: unknown) => void) | null>(null);
  const counter = useRef(0);

  const ask = useCallback(<T,>(render: Render<T>): Promise<T | null> => {
    // A second question replaces the first, which is answered with nothing.
    waiting.current?.(null);
    return new Promise<T | null>((resolve) => {
      const key = (counter.current += 1);
      const done = (answer: T | null) => {
        if (waiting.current !== done) return;
        waiting.current = null;
        setOpen(null);
        resolve(answer);
      };
      waiting.current = done as (answer: unknown) => void;
      setOpen({ key, node: render(done) });
    });
  }, []);

  useEffect(
    () => () => {
      waiting.current?.(null);
    },
    [],
  );

  const host = open ? <div key={open.key}>{open.node}</div> : null;
  return { ask, host };
}

/** Asks a yes-or-no question. `true` only if the person said yes. */
export type Asker = ReturnType<typeof useDialogs>['ask'];
