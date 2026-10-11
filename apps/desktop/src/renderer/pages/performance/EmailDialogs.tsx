// Emailing reports: first a dry run that lists who would get what (nothing is sent yet), then
// the plain result ("Sent 12, could not send 1: no address on file").

import type { EmailOutcome, WeekRange } from '../../../shared/performance';
import { plural } from '../dataPages/format';
import { Modal } from '../dataPages/Modal';
import { emailWords, rangeWords } from './perfText';

function NotSentList({ outcome, shown = 10 }: { outcome: EmailOutcome; shown?: number }) {
  if (outcome.notSent.length === 0) return null;
  const more = outcome.notSent.length - shown;
  return (
    <ul className="my-1 list-disc pl-5 text-sm" data-testid="perf-email-not-sent">
      {outcome.notSent.slice(0, shown).map((one) => (
        <li key={one.transporterId}>
          {one.name}: {one.reason}
        </li>
      ))}
      {more > 0 ? <li>and {plural(more, 'more driver')}</li> : null}
    </ul>
  );
}

/** Who would get what. Send is the only way anything goes out. */
export function EmailDryRunDialog({
  outcome,
  range,
  bcc,
  onDone,
}: {
  outcome: EmailOutcome;
  range: WeekRange;
  bcc: string;
  onDone: (send: boolean) => void;
}) {
  const count = outcome.wouldSend.length;
  return (
    <Modal
      name="perf-email-dry-run"
      title={count > 0 ? `Email ${plural(count, 'report')}?` : 'No reports to email'}
      lead={`Weeks ${rangeWords(range)}. Nothing has been sent yet.`}
      confirmLabel={count > 0 ? `Send ${plural(count, 'email')}` : 'Send'}
      confirmDisabled={count === 0}
      cancelLabel="Not now"
      onConfirm={() => onDone(true)}
      onCancel={() => onDone(false)}
      wide
    >
      {count > 0 ? (
        <>
          <p className="my-1 text-sm font-semibold">Who would get what</p>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm" data-testid="perf-email-would-send">
              <thead>
                <tr className="border-b border-line text-left text-muted">
                  <th className="py-1 pr-3 font-semibold">Driver</th>
                  <th className="py-1 pr-3 font-semibold">Sent to</th>
                  <th className="py-1 font-semibold">Subject</th>
                </tr>
              </thead>
              <tbody>
                {outcome.wouldSend.map((one) => (
                  <tr key={one.transporterId} className="border-b border-line">
                    <td className="py-1 pr-3">{one.name}</td>
                    <td className="py-1 pr-3">{one.to}</td>
                    <td className="py-1">{one.subject}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <p className="my-1 text-sm">
          None of these drivers can get an email. Email addresses come from the driver list.
        </p>
      )}
      {outcome.notSent.length > 0 ? (
        <>
          <p className="mt-3 mb-1 text-sm font-semibold">
            {plural(outcome.notSent.length, 'driver')} would not get one
          </p>
          <NotSentList outcome={outcome} />
        </>
      ) : null}
      {bcc && count > 0 ? (
        <p className="mt-3 text-sm text-muted">A hidden copy of each email goes to {bcc}.</p>
      ) : null}
    </Modal>
  );
}

/** What happened after Send. */
export function EmailResultDialog({
  outcome,
  onDone,
}: {
  outcome: EmailOutcome;
  onDone: () => void;
}) {
  return (
    <Modal
      name="perf-email-result"
      title={outcome.notSent.length > 0 ? 'Some emails were not sent' : 'Emails sent'}
      onConfirm={onDone}
    >
      <p className="my-2 text-sm" data-testid="perf-email-result">
        {emailWords(outcome)}
      </p>
      <NotSentList outcome={outcome} />
    </Modal>
  );
}
