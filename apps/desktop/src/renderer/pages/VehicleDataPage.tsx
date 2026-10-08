// Vehicle Data: the fleet, and who belongs on which van. One tab each for Vehicle Management, Van
// Affinity and the LMR Approved Drivers. Ported from the old app's Vehicle Data page.

import { useState } from 'react';
import { useAppSnapshot } from '../lib/useAppSnapshot';
import { ProblemBanner, StatusLine, useMessages } from './dataPages/PageParts';
import { TabPanel, Tabs, type TabItem } from './dataPages/Tabs';
import { AffinityTab } from './vehicleData/AffinityTab';
import { LmrTab } from './vehicleData/LmrTab';
import { ManagementTab } from './vehicleData/ManagementTab';

const TABS: readonly TabItem[] = [
  { id: 'management', label: 'Vehicle Management' },
  { id: 'affinity', label: 'Van Affinity' },
  { id: 'lmr', label: 'LMR Approved Drivers' },
];

export function VehicleDataPage() {
  const { snapshot, loading, error } = useAppSnapshot();
  const [tab, setTab] = useState<string>(TABS[0]!.id);
  const messages = useMessages();

  return (
    <section
      className="page-full flex min-h-0 flex-1 flex-col"
      data-page="vehicle-data"
      aria-labelledby="title-vehicle-data"
    >
      <div className="border-b border-line bg-surface px-6 pt-3 pb-1">
        <h1 id="title-vehicle-data" className="text-[1.6rem] leading-tight font-semibold">
          Vehicle Data
        </h1>
      </div>
      <Tabs
        label="Vehicle data"
        name="vehicle-data"
        tabs={TABS}
        value={tab}
        onChange={(id) => {
          setTab(id);
          // What a tab said last is not news on the next one.
          messages.setStatus('');
          messages.clearProblem();
        }}
      />
      <ProblemBanner
        problem={messages.problem}
        onClose={messages.clearProblem}
        name="vehicle-data"
      />
      {error ? (
        <p role="alert" className="problem px-6 py-4" data-testid="vehicle-data-load-problem">
          {error}
        </p>
      ) : !snapshot ? (
        <p className="px-6 py-4 text-muted">{loading ? 'Getting the saved data...' : ''}</p>
      ) : (
        <TabPanel name="vehicle-data" id={tab}>
          {tab === 'management' ? <ManagementTab snapshot={snapshot} messages={messages} /> : null}
          {tab === 'affinity' ? <AffinityTab snapshot={snapshot} messages={messages} /> : null}
          {tab === 'lmr' ? <LmrTab snapshot={snapshot} messages={messages} /> : null}
        </TabPanel>
      )}
      <StatusLine text={messages.status} name="vehicle-data" />
    </section>
  );
}
