// Puts an associate into one of a van's affinity slots. A driver holds one primary van and one
// secondary van, so picking someone who already holds one of the same kind moves them here; the
// "Already holds" column says who that would be. Ported from the old app's driver window.

import { useMemo, useState } from 'react';
import type { AssociateView } from '../../../shared/snapshot';
import { sortRows } from '../../components/DataGrid';
import { Button } from '../../ui/button';
import { cn } from '../../ui/cn';
import { Modal } from '../dataPages/Modal';
import { driverOrder } from './affinityRows';

export interface DriverChoice {
  action: 'set' | 'clear';
  transporterId: string;
}

interface Column {
  id: 'name' | 'vans' | 'status' | 'holds';
  header: string;
}

const COLUMNS: readonly Column[] = [
  { id: 'name', header: 'Associate' },
  { id: 'vans', header: 'Vans' },
  { id: 'status', header: 'Status' },
  { id: 'holds', header: 'Already holds' },
];

interface DriverDialogProps {
  vehicleName: string;
  slotLabel: string;
  associates: readonly AssociateView[];
  currentId: string;
  /** Transporter ID -> what they already hold. */
  holds: ReadonlyMap<string, string>;
  /** The slot has someone in it, so "Empty this slot" is offered. */
  occupied: boolean;
  onDone: (choice: DriverChoice | null) => void;
}

export function DriverDialog({
  vehicleName,
  slotLabel,
  associates,
  currentId,
  holds,
  occupied,
  onDone,
}: DriverDialogProps) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<{ id: Column['id']; reverse: boolean } | null>(null);
  const [picked, setPicked] = useState(currentId);

  const text = (view: AssociateView, id: Column['id']) =>
    id === 'name'
      ? view.associate.name
      : id === 'vans'
        ? view.vanBadges
        : id === 'status'
          ? view.associate.status
          : (holds.get(view.associate.transporterId) ?? '');

  const rows = useMemo(() => {
    const ordered = driverOrder(associates, holds, query);
    // Inert until a heading is clicked, so the active-first order stands.
    return sort ? sortRows(ordered, (view) => text(view, sort.id), sort.reverse) : ordered;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `text` only reads `holds`
  }, [associates, holds, query, sort]);

  // Start on the person already in the slot, or else the top of the list.
  const chosen = rows.some((view) => view.associate.transporterId === picked)
    ? picked
    : (rows[0]?.associate.transporterId ?? '');

  return (
    <Modal
      name="driver"
      title={`${slotLabel} - van ${vehicleName}`}
      lead={
        <>
          <strong className="text-fg">
            Who is {slotLabel.toLowerCase()} on van {vehicleName}?
          </strong>
          <br />A driver holds one primary van and one secondary van. Picking someone who already
          holds one of the same kind moves them here.
        </>
      }
      confirmLabel="Assign"
      confirmDisabled={chosen === ''}
      onConfirm={() => onDone({ action: 'set', transporterId: chosen })}
      onCancel={() => onDone(null)}
      extraButtons={
        occupied ? (
          <Button
            type="button"
            data-action="empty-slot"
            onClick={() => onDone({ action: 'clear', transporterId: '' })}
          >
            Empty this slot
          </Button>
        ) : null
      }
      wide
    >
      <label className="mb-2 flex items-center gap-2 text-sm text-muted">
        Search
        <input
          value={query}
          autoFocus
          onChange={(event) => setQuery(event.target.value)}
          className="h-8 flex-1 rounded-md border border-line-strong bg-sunken px-2 text-sm text-fg"
          data-testid="driver-search"
        />
      </label>
      <div className="max-h-[22rem] overflow-auto rounded-md border border-line">
        <table className="w-full border-collapse text-sm" data-testid="driver-table">
          <thead className="sticky top-0 bg-raised">
            <tr>
              {COLUMNS.map((column) => (
                <th
                  key={column.id}
                  scope="col"
                  aria-sort={
                    sort?.id === column.id ? (sort.reverse ? 'descending' : 'ascending') : 'none'
                  }
                  className="border-b border-line px-2 py-1 text-left font-semibold"
                >
                  <button
                    type="button"
                    className="cursor-pointer font-semibold"
                    onClick={() =>
                      setSort((now) => ({
                        id: column.id,
                        reverse: now?.id === column.id ? !now.reverse : false,
                      }))
                    }
                  >
                    {column.header}
                    {sort?.id === column.id ? (sort.reverse ? '  v' : '  ^') : ''}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((view) => {
              const id = view.associate.transporterId;
              const active = view.associate.status.trim().toUpperCase() === 'ACTIVE';
              const held = Boolean(holds.get(id));
              return (
                <tr
                  key={id || view.associate.name}
                  aria-selected={chosen === id}
                  data-associate={id}
                  tabIndex={0}
                  onClick={() => setPicked(id)}
                  onFocus={() => setPicked(id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      onDone({ action: 'set', transporterId: id });
                    }
                  }}
                  onDoubleClick={() => onDone({ action: 'set', transporterId: id })}
                  className={cn(
                    'cursor-default',
                    chosen === id ? 'bg-row-selected' : 'hover:bg-row-hover',
                    !active && 'text-faint',
                    active && held && 'text-warn',
                  )}
                >
                  {COLUMNS.map((column) => (
                    <td key={column.id} className="border-b border-line/60 px-2 py-1">
                      {text(view, column.id) || '-'}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 ? (
          <p className="m-0 p-3 text-sm text-muted">Nobody matches that search.</p>
        ) : null}
      </div>
    </Modal>
  );
}
