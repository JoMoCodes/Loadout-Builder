// Route Data: the Amazon exports that say who works and when they leave. One tab for each
// export (Routes, Itineraries, Weekly Schedule), plus the DWP sheet, which sits here because it is
// read for the same day. Ported from the old app's Route Data page.

import { useState } from 'react';
import { ROUTE_KINDS, type RouteKindName } from '../../shared/channels/routeData';
import { useAppSnapshot } from '../lib/useAppSnapshot';
import { ProblemBanner, StatusLine, useMessages } from './dataPages/PageParts';
import { TabPanel, Tabs, type TabItem } from './dataPages/Tabs';
import { DwpTab } from './routeData/DwpTab';
import { RouteSourceTab } from './routeData/RouteSourceTab';

const LABELS: Record<RouteKindName, string> = {
  routes: 'Routes',
  itineraries: 'Itineraries',
  schedule: 'Weekly Schedule',
};

const TABS: readonly TabItem[] = [
  ...ROUTE_KINDS.map((kind) => ({ id: kind, label: LABELS[kind] })),
  { id: 'dwp', label: 'DWP' },
];

export function RouteDataPage() {
  const { snapshot, loading, error } = useAppSnapshot();
  const [tab, setTab] = useState<string>(TABS[0]!.id);
  const messages = useMessages();

  return (
    <section
      className="page-full flex min-h-0 flex-1 flex-col"
      data-page="route-data"
      aria-labelledby="title-route-data"
    >
      <div className="border-b border-line bg-surface px-6 pt-3 pb-1">
        <h1 id="title-route-data" className="text-[1.6rem] leading-tight font-semibold">
          Route Data
        </h1>
      </div>
      <Tabs
        label="Route data"
        name="route-data"
        tabs={TABS}
        value={tab}
        onChange={(id) => {
          setTab(id);
          // What a tab said last is not news on the next one.
          messages.setStatus('');
          messages.clearProblem();
        }}
      />
      <ProblemBanner problem={messages.problem} onClose={messages.clearProblem} name="route-data" />
      {error ? (
        <p role="alert" className="problem px-6 py-4" data-testid="route-data-load-problem">
          {error}
        </p>
      ) : !snapshot ? (
        <p className="px-6 py-4 text-muted">{loading ? 'Getting the saved data...' : ''}</p>
      ) : (
        <TabPanel name="route-data" id={tab}>
          {tab === 'dwp' ? (
            <DwpTab snapshot={snapshot} messages={messages} />
          ) : (
            <RouteSourceTab
              key={tab}
              kind={tab as RouteKindName}
              snapshot={snapshot}
              messages={messages}
            />
          )}
        </TabPanel>
      )}
      <StatusLine text={messages.status} name="route-data" />
    </section>
  );
}
