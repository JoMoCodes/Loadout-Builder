// The Name and ID Links tab: every link a person made by hand on the Roster tab (pick a driver,
// then Pick associate), in one list. The app uses these before it matches by name, and a link
// stays after the driver drops off the roster, so this is the one place to see them all and to
// take one back. Removing a link sends the driver back to automatic matching.

import { Unlink } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import type { AppSnapshot } from '../../../shared/snapshot';
import { DataGrid, type GridColumn, type RowAction } from '../../components/DataGrid';
import { call, explain } from '../../lib/channels';
import { databaseLayoutStore } from '../../lib/gridLayoutStore';
import { Button } from '../../ui/button';
import { useAsk } from './Modal';
import { linkLines, linksHeader, type LinkLine } from './rules';

const COLUMNS: GridColumn<LinkLine>[] = [
  { id: 'driver', header: 'Driver', value: (l) => l.link.driverName, hideable: false },
  { id: 'linked_to', header: 'Linked to', value: (l) => l.linkedTo },
  {
    id: 'transporter_id',
    header: 'Transporter ID',
    value: (l) => l.link.transporterId ?? '',
    mono: true,
  },
  {
    id: 'on_roster',
    header: "On today's roster",
    value: (l) => (l.onRoster ? 'Yes' : 'No'),
    align: 'center',
  },
];

interface LinksTabProps {
  snapshot: AppSnapshot;
  say: (text: string) => void;
}

export function LinksTab({ snapshot, say }: LinksTabProps) {
  const { confirm, dialog } = useAsk();
  const [selected, setSelected] = useState<LinkLine | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [gridKey, setGridKey] = useState(0);

  const lines = useMemo(() => linkLines(snapshot), [snapshot]);
  const header = useMemo(() => linksHeader(lines), [lines]);
  // The selected line may be gone after a change; act on the one in the current list.
  const current = selected
    ? (lines.find((l) => l.link.driverKey === selected.link.driverKey) ?? null)
    : null;

  const removeOne = useCallback(
    async (line: LinkLine) => {
      setProblem(null);
      const yes = await confirm(
        'Remove this link?',
        `${line.link.driverName} is linked to ${line.linkedTo}.\n\nRemove the link? The app goes ` +
          'back to matching them by name.',
        { danger: true },
      );
      if (!yes) return;
      const reply = await call('loadOut:remove-link', {
        revision: snapshot.revision,
        driverKey: line.link.driverKey,
      });
      // Nothing else to do on success: the app says the data changed, and the snapshot follows.
      if (!reply.ok) {
        setProblem(explain(reply));
        return;
      }
      setSelected(null);
      say(`Link removed. ${line.link.driverName} is matched by name again.`);
    },
    [confirm, snapshot.revision, say],
  );

  async function clearAll() {
    setProblem(null);
    if (lines.length === 0) {
      say('No hand-made links to clear.');
      return;
    }
    const yes = await confirm(
      'Clear all links?',
      `Remove all ${lines.length} hand-made links?\n\nEvery driver goes back to automatic name ` +
        'matching.',
      { danger: true },
    );
    if (!yes) return;
    const reply = await call('loadOut:clear-links');
    if (!reply.ok) {
      setProblem(explain(reply));
      return;
    }
    setSelected(null);
    setGridKey((key) => key + 1);
    say('All hand-made links cleared.');
  }

  const rowActions = useMemo<RowAction<LinkLine>[]>(
    () => [
      {
        id: 'remove-link',
        label: 'Remove link...',
        icon: Unlink,
        danger: true,
        onSelect: (line) => void removeOne(line),
      },
    ],
    [removeOne],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-tab-panel="links">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2 border-b border-line bg-surface px-6 py-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">Name and ID Links</h2>
          <p className="text-sm text-muted">
            Links you made by hand on the Roster tab. The app uses them before matching by name.
          </p>
        </div>
        <div className="text-right">
          <p className="text-lg font-semibold" data-testid="links-count">
            {header}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface px-6 py-2">
        <Button
          disabled={current === null}
          onClick={() => current && void removeOne(current)}
          data-testid="remove-link"
        >
          Remove link
        </Button>
        <Button
          variant="danger"
          disabled={lines.length === 0}
          onClick={() => void clearAll()}
          data-testid="clear-all-links"
        >
          Clear all links
        </Button>
        {problem ? (
          <p
            role="alert"
            data-testid="links-action-problem"
            className="text-sm font-semibold text-bad"
          >
            {problem}
          </p>
        ) : null}
      </div>
      <div className="min-h-0 flex-1">
        <DataGrid
          key={gridKey}
          view="name-id-links"
          label="Name and ID links"
          columns={COLUMNS}
          rows={lines}
          getRowId={(line) => line.link.driverKey}
          layoutStore={databaseLayoutStore}
          rowActions={rowActions}
          onSelectionChange={setSelected}
          rowTone={(line) => (line.onRoster ? undefined : 'ghost')}
          searchPlaceholder="Search the links"
          empty={{
            title: 'No hand-made links.',
            body: 'On the Roster tab, pick a driver and choose Pick associate to make one.',
          }}
        />
      </div>
      {dialog}
    </div>
  );
}
