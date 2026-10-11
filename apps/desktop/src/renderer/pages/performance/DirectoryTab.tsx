// The Directory tab: everyone on the driver list with how to reach them. Ported from the old
// app's directory window, with Copy email and Copy phone added.

import { Copy } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  DataGrid,
  type GridColumn,
  type RowAction,
  type StatusChipFilter,
} from '../../components/DataGrid';
import type { PerfDirectoryRow } from '../../../shared/performance';
import { call, explain } from '../../lib/channels';
import { databaseLayoutStore } from '../../lib/gridLayoutStore';
import { Button } from '../../ui/button';
import { ButtonStrip, type Messages } from '../dataPages/PageParts';
import { statusOf } from './perfText';

const idOf = (row: PerfDirectoryRow) => row.transporterId;
const phoneOf = (row: PerfDirectoryRow) => row.personalPhone || row.workPhone;

const COLUMNS: GridColumn<PerfDirectoryRow>[] = [
  { id: 'name', header: 'Driver', value: (row) => row.name },
  { id: 'transporter-id', header: 'Transporter ID', value: (row) => row.transporterId, mono: true },
  { id: 'status', header: 'Status', value: (row) => statusOf(row) },
  { id: 'position', header: 'Position', value: (row) => row.position },
  { id: 'qualifications', header: 'Qualifications', value: (row) => row.qualifications },
  { id: 'email', header: 'Email', value: (row) => row.email },
  { id: 'personal-phone', header: 'Personal Phone', value: (row) => row.personalPhone },
  { id: 'work-phone', header: 'Work Phone', value: (row) => row.workPhone },
  { id: 'id-expiry', header: 'ID Expires', value: (row) => row.idExpiration },
];

const CHIPS: StatusChipFilter<PerfDirectoryRow>[] = [
  { id: 'active', label: 'Active', tone: 'ok', match: (row) => statusOf(row) === 'ACTIVE' },
  { id: 'inactive', label: 'Inactive', tone: 'warn', match: (row) => statusOf(row) === 'INACTIVE' },
  {
    id: 'offboarded',
    label: 'Offboarded',
    tone: 'neutral',
    match: (row) => statusOf(row) === 'OFFBOARDED',
  },
];

export function DirectoryTab({ revision, messages }: { revision: number; messages: Messages }) {
  const { setStatus, setProblem } = messages;
  const [rows, setRows] = useState<PerfDirectoryRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [current, setCurrent] = useState<PerfDirectoryRow | null>(null);

  useEffect(() => {
    let off = false;
    void call('performance:directory').then((reply) => {
      if (off) return;
      setLoaded(true);
      if (reply.ok) setRows(reply.value ?? []);
      else setProblem({ title: 'The directory could not be read', message: explain(reply) });
    });
    return () => {
      off = true;
    };
  }, [revision, setProblem]);

  async function copy(row: PerfDirectoryRow | null, what: 'email' | 'phone') {
    if (!row) {
      setStatus('Pick a driver in the table first.');
      return;
    }
    const text = what === 'email' ? row.email : phoneOf(row);
    if (!text) {
      setStatus(
        `There is no ${what === 'email' ? 'email address' : 'phone number'} on file for ${row.name}.`,
      );
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setStatus(
        `Copied the ${what === 'email' ? 'email address' : 'phone number'} for ${row.name}.`,
      );
    } catch {
      setStatus('That could not be copied. Try again.');
    }
  }

  const rowActions = useMemo<RowAction<PerfDirectoryRow>[]>(
    () => [
      {
        id: 'copy-email',
        label: 'Copy email address',
        icon: Copy,
        disabled: (row) => !row.email,
        onSelect: (row) => void copy(row, 'email'),
      },
      {
        id: 'copy-phone',
        label: 'Copy phone number',
        icon: Copy,
        disabled: (row) => !phoneOf(row),
        onSelect: (row) => void copy(row, 'phone'),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- copy only uses the row it is given
    [],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ButtonStrip label="Directory actions">
        <Button onClick={() => void copy(current, 'email')} data-testid="perf-copy-email">
          <Copy aria-hidden="true" />
          Copy email
        </Button>
        <Button onClick={() => void copy(current, 'phone')} data-testid="perf-copy-phone">
          <Copy aria-hidden="true" />
          Copy phone
        </Button>
        <span className="text-sm text-muted" data-testid="perf-directory-current">
          {current ? `${current.name} is picked.` : 'Click a driver, then copy their details.'}
        </span>
      </ButtonStrip>
      <div className="min-h-0 flex-1">
        <DataGrid
          view="performance-directory"
          label="Directory"
          columns={COLUMNS}
          rows={rows}
          getRowId={idOf}
          layoutStore={databaseLayoutStore}
          rowActions={rowActions}
          onRowActivate={(row) => void copy(row, 'email')}
          onSelectionChange={setCurrent}
          statusChips={CHIPS}
          searchPlaceholder="Search name, ID, email, phone..."
          loading={!loaded}
          loadingText="Getting the directory..."
          empty={{
            title: 'No driver list yet',
            body: 'Bring in the driver list (AssociateData.csv) on the Imports tab, and everyone shows up here.',
          }}
        />
      </div>
    </div>
  );
}
