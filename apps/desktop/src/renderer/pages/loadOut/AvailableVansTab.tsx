// The Available Vans tab: operational vans nobody on today's roster is holding
// (available_vans_page.py). Read straight off the snapshot, so it answers itself the moment a van
// is assigned, grounded or freed. Read-only, as the old tab was.

import { useCallback, useMemo, useState } from 'react';
import type { AppSnapshot } from '../../../shared/snapshot';
import { DataGrid, type GridColumn } from '../../components/DataGrid';
import { databaseLayoutStore } from '../../lib/gridLayoutStore';
import {
  ALL_CATEGORIES,
  ALL_SERVICE_TYPES,
  availableEmpty,
  availableFilterOptions,
  availableHeader,
  availableVanRow,
  type AvailableVanRow,
} from './rules';

const COLUMNS: GridColumn<AvailableVanRow>[] = [
  { id: 'name', header: 'Vehicle', value: (r) => r.values.name, hideable: false },
  { id: 'service_type', header: 'Service Type', value: (r) => r.values.serviceType },
  { id: 'category', header: 'Category', value: (r) => r.values.category },
  { id: 'assign', header: 'Assign', value: (r) => r.values.assign },
  { id: 'make_model', header: 'Make / Model', value: (r) => r.values.makeModel },
  { id: 'plate', header: 'Plate', value: (r) => r.values.plate },
  { id: 'registration', header: 'Registration', value: (r) => r.values.registration },
  { id: 'note', header: 'Note', value: (r) => r.values.note },
  { id: 'vin', header: 'VIN', value: (r) => r.values.vin, mono: true },
];

const selectClass = 'h-8 rounded-md border border-line-strong bg-sunken px-2 text-sm text-fg';

export function AvailableVansTab({ snapshot }: { snapshot: AppSnapshot }) {
  const [service, setService] = useState(ALL_SERVICE_TYPES);
  const [kind, setKind] = useState(ALL_CATEGORIES);

  const rows = useMemo(
    () =>
      snapshot.vehicles
        .filter((view) => view.available)
        .map((view) => availableVanRow(view, snapshot.today)),
    [snapshot.vehicles, snapshot.today],
  );
  const header = useMemo(() => availableHeader(snapshot.vehicles), [snapshot.vehicles]);
  const options = useMemo(() => availableFilterOptions(snapshot.vehicles), [snapshot.vehicles]);
  const empty = useMemo(() => availableEmpty(snapshot.vehicles), [snapshot.vehicles]);
  const serviceShown = options.services.includes(service) ? service : ALL_SERVICE_TYPES;
  const kindShown = options.categories.includes(kind) ? kind : ALL_CATEGORIES;

  const filter = useCallback(
    (row: AvailableVanRow) =>
      (serviceShown === ALL_SERVICE_TYPES || row.view.vehicle.serviceType === serviceShown) &&
      (kindShown === ALL_CATEGORIES || row.values.category === kindShown),
    [serviceShown, kindShown],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-tab-panel="available-vans">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2 border-b border-line bg-surface px-6 py-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">Available Vans</h2>
          <p className="text-sm text-muted" data-testid="available-source">
            {header.source}
          </p>
        </div>
        <div className="text-right">
          <p className="text-lg font-semibold" data-testid="available-count">
            {header.count}
          </p>
          {header.mix ? <p className="text-sm text-muted">{header.mix}</p> : null}
          {header.manual ? (
            <p className="text-sm text-muted" data-testid="available-manual">
              {header.manual}
            </p>
          ) : null}
        </div>
      </div>
      <div className="min-h-0 flex-1">
        <DataGrid
          view="available-vans"
          label="Available vans"
          columns={COLUMNS}
          rows={rows}
          getRowId={(row) => row.view.vehicle.vin || row.view.vehicle.name}
          layoutStore={databaseLayoutStore}
          rowTone={(row) => row.severity || undefined}
          filter={filter}
          onResetFilters={() => {
            setService(ALL_SERVICE_TYPES);
            setKind(ALL_CATEGORIES);
          }}
          filterControls={
            <>
              <label className="flex items-center gap-1.5 text-sm text-muted">
                <span>Service</span>
                <select
                  value={serviceShown}
                  onChange={(event) => setService(event.target.value)}
                  className={selectClass}
                  data-testid="service-filter"
                >
                  {options.services.map((name) => (
                    <option key={name}>{name}</option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-1.5 text-sm text-muted">
                <span>Category</span>
                <select
                  value={kindShown}
                  onChange={(event) => setKind(event.target.value)}
                  className={selectClass}
                  data-testid="category-filter"
                >
                  {options.categories.map((name) => (
                    <option key={name}>{name}</option>
                  ))}
                </select>
              </label>
            </>
          }
          searchPlaceholder="Search vans"
          empty={{ title: empty.title, body: empty.body || undefined }}
        />
      </div>
    </div>
  );
}
