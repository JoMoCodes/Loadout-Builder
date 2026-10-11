// One driver's safety events for the chosen weeks: the list behind a red count on the Drivers
// tab. The old app opened each video in the browser; this app only opens its own help pages, so
// the video link is shown as text with a Copy button, to paste into the browser.

import { Copy } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { SafetyEventView, WeekRange } from '../../../shared/performance';
import { call, explain } from '../../lib/channels';
import { Button } from '../../ui/button';
import { plural } from '../dataPages/format';
import { Modal } from '../dataPages/Modal';
import { rangeWords } from './perfText';

interface SafetyDialogProps {
  driver: { transporterId: string; name: string };
  range: WeekRange;
  /** One kind of event ("Speeding"), or null for every kind that counts. */
  metricType: string | null;
  onDone: () => void;
}

type Load =
  | { state: 'loading' }
  | { state: 'ready'; events: SafetyEventView[] }
  | { state: 'problem'; words: string };

export function SafetyDialog({ driver, range, metricType, onDone }: SafetyDialogProps) {
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [copied, setCopied] = useState<number | null>(null);

  useEffect(() => {
    let off = false;
    void call('performance:safety-events', {
      transporterId: driver.transporterId,
      range,
      metricType,
    }).then((reply) => {
      if (off) return;
      if (!reply.ok) setLoad({ state: 'problem', words: explain(reply) });
      else {
        // Newest first, as the old window listed them.
        const events = [...(reply.value ?? [])].sort((a, b) =>
          `${b.eventDate ?? ''}${b.week}`.localeCompare(`${a.eventDate ?? ''}${a.week}`),
        );
        setLoad({ state: 'ready', events });
      }
    });
    return () => {
      off = true;
    };
  }, [driver.transporterId, range, metricType]);

  async function copyLink(event: SafetyEventView) {
    if (!event.videoLink) return;
    try {
      await navigator.clipboard.writeText(event.videoLink);
      setCopied(event.id);
    } catch {
      setCopied(null);
    }
  }

  const what = metricType ?? 'All kinds that count';
  let summary = '';
  if (load.state === 'ready') {
    const withVideo = load.events.filter((event) => event.videoLink).length;
    summary =
      load.events.length === 0
        ? `${driver.name} has no ${metricType ? `${metricType} ` : ''}events that count in these weeks.`
        : `${plural(load.events.length, 'event')}, ${withVideo} with a video. Events with no program impact are left out.`;
  }

  return (
    <Modal
      name="perf-safety"
      title={`Safety events: ${driver.name}`}
      lead={`${what}, weeks ${rangeWords(range)}.`}
      confirmLabel="Close"
      onConfirm={onDone}
      wide
    >
      {load.state === 'loading' ? (
        <p className="text-sm text-muted">Getting the events...</p>
      ) : null}
      {load.state === 'problem' ? (
        <p role="alert" className="problem text-sm">
          {load.words}
        </p>
      ) : null}
      {load.state === 'ready' ? (
        <>
          <p className="my-1 text-sm" data-testid="perf-safety-summary">
            {summary}
          </p>
          {load.events.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm" data-testid="perf-safety-table">
                <thead>
                  <tr className="border-b border-line text-left text-muted">
                    <th className="py-1 pr-3 font-semibold">Week</th>
                    <th className="py-1 pr-3 font-semibold">Date</th>
                    <th className="py-1 pr-3 font-semibold">Type</th>
                    <th className="py-1 pr-3 font-semibold">Subtype</th>
                    <th className="py-1 pr-3 font-semibold">Program impact</th>
                    <th className="py-1 pr-3 font-semibold">Source</th>
                    <th className="py-1 pr-3 font-semibold">Review details</th>
                    <th className="py-1 font-semibold">Video</th>
                  </tr>
                </thead>
                <tbody>
                  {load.events.map((event) => (
                    <tr key={event.id} className="border-b border-line align-top">
                      <td className="py-1 pr-3 whitespace-nowrap">{event.week}</td>
                      <td className="py-1 pr-3 whitespace-nowrap">{event.eventDate ?? ''}</td>
                      <td className="py-1 pr-3">{event.metricType ?? ''}</td>
                      <td className="py-1 pr-3">{event.metricSubtype ?? ''}</td>
                      <td className="py-1 pr-3">{event.programImpact ?? ''}</td>
                      <td className="py-1 pr-3">{event.source ?? ''}</td>
                      <td className="py-1 pr-3">{event.reviewDetails ?? ''}</td>
                      <td className="py-1">
                        {event.videoLink ? (
                          <span className="flex items-center gap-1.5">
                            <span
                              className="max-w-[12rem] truncate font-mono text-[0.85rem] text-muted"
                              title={event.videoLink}
                            >
                              {event.videoLink}
                            </span>
                            <Button
                              size="sm"
                              onClick={() => void copyLink(event)}
                              data-testid="perf-copy-video"
                            >
                              <Copy aria-hidden="true" />
                              {copied === event.id ? 'Copied' : 'Copy'}
                            </Button>
                          </span>
                        ) : (
                          <span className="text-faint">No video</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-sm text-muted">
                To watch a video, copy its link and paste it into your web browser.
              </p>
            </div>
          ) : null}
        </>
      ) : null}
    </Modal>
  );
}
