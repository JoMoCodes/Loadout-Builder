// The Roster tab's columns, in the old app's order (loadout_page.py `COLUMNS`): Lifetime Routes
// beside the badges and the wave time, Matched On beside Vehicle and VIN, the three DWP numbers
// together, and the sheet's own Bag last.

import { padLabel } from '@loadout/core';
import type { GridColumn } from '../../components/DataGrid';
import { checkSeverity } from '../../lib/checkSeverity';
import { Chip, type Tone } from '../../ui/chip';
import type { RosterRowView } from '../../../shared/snapshot';

export function checkTone(check: string): Tone {
  const severity = checkSeverity(check);
  if (severity) return severity;
  return check ? 'ok' : 'neutral';
}

export function Badges({ text }: { text: string }) {
  if (!text) return <span className="text-faint">-</span>;
  return (
    <span className="flex gap-1">
      {text.split(/\s+/).map((badge) => (
        <span
          key={badge}
          className="rounded-sm border border-line px-1 text-[0.786rem] leading-[1.5] font-semibold text-muted"
        >
          {badge}
        </span>
      ))}
    </span>
  );
}

/** The columns a right-click can act on, and the van columns that share one menu. */
export const VAN_COLUMNS = ['vehicle', 'vin'];

export const ROSTER_COLUMNS: GridColumn<RosterRowView>[] = [
  { id: 'driver', header: 'Driver', value: (v) => v.row.driver, hideable: false },
  { id: 'shift_type', header: 'Shift Type', value: (v) => v.row.shiftType },
  { id: 'transporter_id', header: 'Transporter ID', value: (v) => v.associateId, mono: true },
  {
    id: 'tenure',
    header: 'Lifetime Routes',
    value: (v) => (v.tenure === null ? '' : String(v.tenure)),
    align: 'center',
  },
  {
    id: 'vans',
    header: 'Vans',
    value: (v) => v.vanBadges,
    cell: (v) => <Badges text={v.vanBadges} />,
    fitExtra: 24,
  },
  {
    id: 'check',
    header: 'Check',
    value: (v) => v.check,
    cell: (v) =>
      v.check ? (
        <Chip tone={checkTone(v.check)}>{v.check}</Chip>
      ) : (
        <span className="text-faint">-</span>
      ),
    fitExtra: 34,
  },
  { id: 'routes', header: 'Routes', value: (v) => v.row.routes },
  { id: 'wave_time', header: 'Wave Time', value: (v) => v.row.waveTime },
  { id: 'pad', header: 'PAD', value: (v) => padLabel(v.row), align: 'center' },
  { id: 'service_type', header: 'Service Type', value: (v) => v.row.serviceType },
  { id: 'vehicle', header: 'Vehicle', value: (v) => v.row.vehicle },
  { id: 'vin', header: 'VIN', value: (v) => v.row.vin, mono: true },
  { id: 'assign_method', header: 'Matched On', value: (v) => v.assignMethodLabel },
  { id: 'device', header: 'Device', value: (v) => v.row.device },
  { id: 'staging_location', header: 'Staging', value: (v) => v.row.stagingLocation },
  { id: 'bags', header: 'Bags', value: (v) => v.row.bags, align: 'center' },
  { id: 'ovs', header: 'OVS', value: (v) => v.row.ovs, align: 'center' },
  { id: 'bag', header: 'Bag', value: (v) => v.row.bag, align: 'center' },
];
