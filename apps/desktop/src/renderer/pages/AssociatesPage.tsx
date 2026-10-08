// Associates: the anchor records behind route and van data, with each driver's Lifetime Routes on
// a tab of its own. Ported from the old app's Associates page.

import { useCallback, useState } from 'react';
import { useAppSnapshot } from '../lib/useAppSnapshot';
import { AssociatesTab } from './associates/AssociatesTab';
import { LifetimeRoutesTab } from './associates/LifetimeRoutesTab';
import { ProblemBanner, StatusLine, useMessages } from './dataPages/PageParts';
import { TabPanel, Tabs, type TabItem } from './dataPages/Tabs';
import type { PageProps } from './types';

const TABS: readonly TabItem[] = [
  { id: 'associates', label: 'Associates' },
  { id: 'lifetime-routes', label: 'Lifetime Routes' },
];

export function AssociatesPage({ request, takeRequest }: PageProps) {
  const { snapshot, loading, error } = useAppSnapshot();
  const [tab, setTab] = useState<string>(TABS[0]!.id);
  const messages = useMessages();
  const { setStatus, clearProblem } = messages;

  // Ctrl+I (from any page; the shell brings it here) runs Import Associates on its tab.
  const pendingImport = request?.action === 'import-associates';
  const importTaken = useCallback(() => {
    takeRequest();
    setTab('associates');
    setStatus('');
    clearProblem();
  }, [takeRequest, setStatus, clearProblem]);
  const shown = pendingImport ? 'associates' : tab;

  return (
    <section
      className="page-full flex min-h-0 flex-1 flex-col"
      data-page="associates"
      aria-labelledby="title-associates"
    >
      <div className="border-b border-line bg-surface px-6 pt-3 pb-1">
        <h1 id="title-associates" className="text-[1.6rem] leading-tight font-semibold">
          Associates
        </h1>
      </div>
      <Tabs
        label="Associates"
        name="associates"
        tabs={TABS}
        value={shown}
        onChange={(id) => {
          setTab(id);
          // What a tab said last is not news on the next one.
          messages.setStatus('');
          messages.clearProblem();
        }}
      />
      <ProblemBanner problem={messages.problem} onClose={messages.clearProblem} name="associates" />
      {error ? (
        <p role="alert" className="problem px-6 py-4" data-testid="associates-load-problem">
          {error}
        </p>
      ) : !snapshot ? (
        <p className="px-6 py-4 text-muted">{loading ? 'Getting the saved data...' : ''}</p>
      ) : (
        <TabPanel name="associates" id={shown}>
          {shown === 'associates' ? (
            <AssociatesTab
              snapshot={snapshot}
              messages={messages}
              pendingImport={pendingImport}
              onImportTaken={importTaken}
            />
          ) : null}
          {shown === 'lifetime-routes' ? (
            <LifetimeRoutesTab snapshot={snapshot} messages={messages} />
          ) : null}
        </TabPanel>
      )}
      <StatusLine text={messages.status} name="associates" />
    </section>
  );
}
