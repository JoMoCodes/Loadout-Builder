// The Previous Roster page in the left menu: the same table as the Load Out page's Previous
// Roster tab, on a page of its own. It started as the worked example in docs/PAGE-PATTERN.md
// (read the snapshot, run one command) and still is one.

import { useState } from 'react';
import { useAppSnapshot } from '../lib/useAppSnapshot';
import { PreviousRosterTab } from './loadOut/PreviousRosterTab';

export function PreviousRosterPage() {
  const { snapshot, loading, error } = useAppSnapshot();
  const [status, setStatus] = useState('');

  if (error || !snapshot) {
    return (
      <section className="page" data-page="previous-roster" aria-labelledby="title-previous-roster">
        <h1 id="title-previous-roster">Previous Roster</h1>
        <div className="card">
          {error ? (
            <p role="alert" data-testid="previous-roster-problem" className="problem">
              {error}
            </p>
          ) : (
            <p>{loading ? 'Getting the saved roster...' : ''}</p>
          )}
        </div>
      </section>
    );
  }

  return (
    <section
      className="page-full flex min-h-0 flex-1 flex-col"
      data-page="previous-roster"
      aria-labelledby="title-previous-roster"
    >
      <PreviousRosterTab snapshot={snapshot} say={setStatus} headingLevel={1} />
      <div
        role="status"
        className="min-h-[2rem] border-t border-line bg-surface px-6 py-1.5 text-sm text-muted"
      >
        {status}
      </div>
    </section>
  );
}
