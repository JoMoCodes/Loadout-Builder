// The pieces the three data pages are built from: a heading card with numbers on the right, a
// strip of buttons, a status line at the bottom, and a banner for a file that would not come in.

import { X } from 'lucide-react';
import { useCallback, useState, type ReactNode } from 'react';
import { Button } from '../../ui/button';
import { cn } from '../../ui/cn';

interface HeaderCardProps {
  title: string;
  /** The line under the title (the file's name, when it came in). */
  sub?: string;
  /** The big number on the right, then smaller lines under it. */
  metric: string;
  details?: readonly string[];
  name: string;
  children?: ReactNode;
}

/** What the old pages showed in the card at the top: what is loaded, and how much of it. */
export function HeaderCard({ title, sub, metric, details = [], name, children }: HeaderCardProps) {
  return (
    <div
      className="flex flex-wrap items-start gap-x-6 gap-y-2 border-b border-line bg-surface px-6 py-3"
      data-testid={`${name}-header`}
    >
      <div className="min-w-0 flex-1">
        <h2
          className="m-0 text-[1.15rem] font-semibold whitespace-pre-wrap"
          data-testid={`${name}-title`}
        >
          {title}
        </h2>
        {sub ? (
          <p
            className="m-0 mt-0.5 text-sm whitespace-pre-wrap text-muted"
            data-testid={`${name}-sub`}
          >
            {sub}
          </p>
        ) : null}
        {children}
      </div>
      <div className="text-right">
        <p
          className="m-0 text-[1.15rem] font-semibold whitespace-pre-wrap tabular-nums"
          data-testid={`${name}-metric`}
        >
          {metric}
        </p>
        {details
          .filter((line) => line !== '')
          .map((line, index) => (
            <p
              key={line}
              className="m-0 mt-0.5 text-sm whitespace-pre-wrap text-muted"
              data-testid={`${name}-detail-${index}`}
            >
              {line}
            </p>
          ))}
      </div>
    </div>
  );
}

/** The buttons along the top of a table. */
export function ButtonStrip({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div
      role="toolbar"
      aria-label={label}
      className="flex flex-wrap items-center gap-2 border-b border-line bg-surface px-6 py-2"
    >
      {children}
    </div>
  );
}

/** A small labelled drop-down for the filter bar. */
export function FilterSelect({
  label,
  value,
  options,
  onChange,
  testId,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
  testId: string;
}) {
  return (
    <label className="flex items-center gap-1.5 text-sm text-muted">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        data-testid={testId}
        className="h-8 rounded-md border border-line-strong bg-sunken px-2 text-sm text-fg"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

/** A small labelled tick box for the filter bar. */
export function FilterCheck({
  label,
  checked,
  onChange,
  testId,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  testId: string;
}) {
  return (
    <label className="flex items-center gap-1.5 text-sm text-muted">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        data-testid={testId}
      />
      {label}
    </label>
  );
}

/** What the pages say at the bottom after something is done, like the old status bar. */
export function StatusLine({ text, name }: { text: string; name: string }) {
  return (
    <p
      role="status"
      aria-live="polite"
      data-testid={`${name}-status`}
      className={cn(
        'm-0 min-h-[2rem] border-t border-line bg-surface px-6 py-1.5 text-sm',
        text ? 'text-fg' : 'text-faint',
      )}
    >
      {text || 'Ready.'}
    </p>
  );
}

export interface Problem {
  title: string;
  message: string;
}

/** A file that would not come in, or something that would not go through. */
export function ProblemBanner({
  problem,
  onClose,
  name,
}: {
  problem: Problem | null;
  onClose: () => void;
  name: string;
}) {
  if (!problem) return null;
  return (
    <div
      role="alert"
      data-testid={`${name}-problem`}
      className="flex items-start gap-3 border-b border-bad bg-bad-soft px-6 py-2 text-sm text-bad"
    >
      <div className="min-w-0 flex-1">
        <p className="m-0 font-semibold">{problem.title}</p>
        <p className="m-0 mt-0.5 break-words text-fg">{problem.message}</p>
      </div>
      <Button size="icon" variant="ghost" aria-label="Close this message" onClick={onClose}>
        <X aria-hidden="true" />
      </Button>
    </div>
  );
}

/** The page's status line and problem banner together. */
export function useMessages() {
  const [status, setStatus] = useState('');
  const [problem, setProblem] = useState<Problem | null>(null);
  const clearProblem = useCallback(() => setProblem(null), []);
  return { status, setStatus, problem, setProblem, clearProblem };
}
export type Messages = ReturnType<typeof useMessages>;
