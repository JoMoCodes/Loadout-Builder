// Who a route belongs to, when the export names more than one person. Amazon writes a shared
// route as one line with the names pipe-joined; only one of them can be the one the roster and the
// van follow, so the app asks rather than guessing. Ported from the old app's shared route window.

import { driverOptions, workload, type RouteEntry } from '@loadout/core';
import { useState } from 'react';
import { Modal } from '../dataPages/Modal';

export interface SharedRouteItem {
  /** The row's place in the export. */
  index: number;
  entry: RouteEntry;
}

interface SharedRouteDialogProps {
  sourceLabel: string;
  items: readonly SharedRouteItem[];
  /** The Transporter ID chosen for each row, by row index; null if closed without saving. */
  onDone: (chosen: Map<number, string> | null) => void;
}

export function SharedRouteDialog({ sourceLabel, items, onDone }: SharedRouteDialogProps) {
  const [chosen, setChosen] = useState(
    () => new Map(items.map(({ index, entry }) => [index, entry.transporterId])),
  );
  const count = items.length;

  return (
    <Modal
      name="shared-routes"
      title={`Shared routes - ${sourceLabel}`}
      lead={
        <>
          <strong className="text-fg">
            {count} {count === 1 ? 'route' : 'routes'} came through with more than one driver
          </strong>
          <br />
          {sourceLabel}. Pick who each one is assigned to - the van and the roster row follow that
          choice.
        </>
      }
      confirmLabel="Save"
      onConfirm={() => onDone(chosen)}
      onCancel={() => onDone(null)}
      wide
    >
      <div className="flex flex-col gap-2">
        {items.map(({ index, entry }) => (
          <fieldset
            key={index}
            data-row={index}
            className="m-0 flex flex-wrap items-center gap-x-4 gap-y-1 border-0 p-0"
          >
            <legend className="sr-only">{workload(entry) || '(unnamed work)'}</legend>
            <span className="w-32 font-semibold">{workload(entry) || '(unnamed work)'}</span>
            {entry.dispatchTime ? (
              <span className="w-20 text-sm text-muted">{entry.dispatchTime}</span>
            ) : null}
            {driverOptions(entry).map(([name, transporterId]) => (
              <label key={transporterId || name} className="flex items-center gap-1.5 text-sm">
                <input
                  type="radio"
                  name={`shared-${index}`}
                  checked={chosen.get(index) === transporterId}
                  onChange={() => setChosen((now) => new Map(now).set(index, transporterId))}
                  data-testid={`shared-${index}-${transporterId}`}
                />
                {name || transporterId}
              </label>
            ))}
          </fieldset>
        ))}
      </div>
    </Modal>
  );
}
