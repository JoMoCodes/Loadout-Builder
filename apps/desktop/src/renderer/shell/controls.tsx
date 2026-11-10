// The controls every window carries beside its pages: the note about app updates and the text
// size buttons. The main window shows them at the bottom of the left menu; a page-only window
// ("Open in new window") has no left menu, so it shows them in a bar across its top.

import { Download, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { UpdateStatus } from '../../shared/shell';
import { FONT_SCALE_DEFAULT, FONT_SCALE_MAX, FONT_SCALE_MIN } from '../../shared/settings';
import { call, listen, signal } from '../lib/channels';
import { Button } from '../ui/button';
import { Chip, type Tone } from '../ui/chip';

/** What the update pill says, in plain words. Null means say nothing at all. */
export function updatePillText(status: UpdateStatus): string | null {
  switch (status.state) {
    case 'checking':
      return 'Checking for updates';
    case 'current':
      return 'Up to date';
    case 'downloading':
      return status.percent === null
        ? 'Getting the new version'
        : `Getting the new version (${status.percent}%)`;
    case 'ready':
      return 'Update ready';
    case 'error':
      return 'Could not check for updates';
    // In a development run or the portable app there is nothing to check, so stay quiet.
    default:
      return null;
  }
}

export function UpdatePill() {
  const [status, setStatus] = useState<UpdateStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    void call('updates:get-status').then((reply) => {
      if (!cancelled && reply.ok) setStatus(reply.value);
    });
    const stop = listen('updates:status-changed', setStatus);
    return () => {
      cancelled = true;
      stop();
    };
  }, []);

  const text = status ? updatePillText(status) : null;
  if (!status || !text) return null;
  const tone: Tone =
    status.state === 'ready'
      ? 'ok'
      : status.state === 'error'
        ? 'warn'
        : status.state === 'current'
          ? 'neutral'
          : 'info';

  return (
    <div className="update-area" data-update-state={status.state}>
      <Chip
        tone={tone}
        className="update-pill"
        role="status"
        title={status.message ?? undefined}
        icon={status.state === 'downloading' || status.state === 'checking' ? Download : undefined}
      >
        {text}
      </Chip>
      {status.state === 'ready' ? (
        <Button size="sm" variant="primary" onClick={() => signal('updates:install')}>
          Restart to update
        </Button>
      ) : null}
      {status.state === 'error' ? (
        <Button size="sm" onClick={() => void call('updates:check')}>
          <RefreshCw aria-hidden="true" />
          Try again
        </Button>
      ) : null}
    </div>
  );
}

export interface TextSizeProps {
  fontScale: number;
  onSmaller(): void;
  onBigger(): void;
  onReset(): void;
}

/** A-, the size as a percentage (click to go back to normal), and A+. */
export function TextSize({ fontScale, onSmaller, onBigger, onReset }: TextSizeProps) {
  return (
    <div className="text-size" role="group" aria-label="Text size">
      <span className="text-size-label" aria-hidden="true">
        Text size
      </span>
      <Button
        size="sm"
        aria-label="Make the text smaller"
        title="Make the text smaller"
        disabled={fontScale <= FONT_SCALE_MIN}
        onClick={onSmaller}
        data-action="font-smaller"
      >
        A-
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="min-w-14 tabular-nums"
        aria-label="Put the text size back to normal"
        title="Put the text size back to normal"
        disabled={fontScale === FONT_SCALE_DEFAULT}
        onClick={onReset}
        data-action="font-reset"
      >
        {Math.round(fontScale * 100)}%
      </Button>
      <Button
        size="sm"
        aria-label="Make the text bigger"
        title="Make the text bigger"
        disabled={fontScale >= FONT_SCALE_MAX}
        onClick={onBigger}
        data-action="font-bigger"
      >
        A+
      </Button>
    </div>
  );
}
