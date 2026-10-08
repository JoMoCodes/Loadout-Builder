// The Load Out page's picker windows, ported from the old app's dialogs: link_dialog.py,
// roster_pick_dialog.py, van_pick_dialog.py, assign_dialog.py and source_dialog.py. Same
// headings, same columns, same order, same buttons.

import {
  category,
  isActive,
  makeModel,
  manualOnly,
  vanBadges,
  type Associate,
  type AssignmentResult,
} from '@loadout/core';
import { useMemo, useState } from 'react';
import type { RosterRowView, RouteSetView } from '../../../shared/snapshot';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Modal } from './Modal';
import { PickTable, type PickColumn } from './PickTable';
import {
  assignHeading,
  assignLines,
  describeSource,
  holdingText,
  linkCandidates,
  type AssignLine,
  type VanChoice,
} from './rules';

function Subtitle({ text }: { text: string }) {
  return <p className="text-sm text-muted">{text}</p>;
}

function SearchBox({ value, onChange }: { value: string; onChange: (text: string) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <span>Search</span>
      <Input
        type="search"
        value={value}
        autoFocus
        onChange={(event) => onChange(event.target.value)}
        aria-label="Search"
        data-testid="dialog-search"
      />
    </label>
  );
}

/** Keeps a picked row while it is still listed, else picks the first one listed. */
function useSelection<Row>(shown: readonly Row[], getId: (row: Row) => string, first?: string) {
  const [picked, setPicked] = useState<string | null>(first ?? null);
  const current =
    picked !== null && shown.some((row) => getId(row) === picked)
      ? picked
      : shown[0] !== undefined
        ? getId(shown[0])
        : null;
  const row = shown.find((r) => getId(r) === current) ?? null;
  return { selectedId: current, selected: row, pick: (r: Row) => setPicked(getId(r)) };
}

// ------------------------------------------------------------------ link

export type LinkAnswer =
  { action: 'link'; transporterId: string } | { action: 'clear' } | { action: 'auto' } | null;

interface LinkDialogProps {
  driver: string;
  associates: readonly Associate[];
  currentId: string;
  suggestions: readonly string[];
  hasManualLink: boolean;
  onAnswer: (answer: LinkAnswer) => void;
}

/** Picks an associate for a driver by hand (`LinkDialog`). */
export function LinkDialog(props: LinkDialogProps) {
  const [search, setSearch] = useState('');
  const suggested = useMemo(() => new Set(props.suggestions), [props.suggestions]);
  const shown = useMemo(
    () => linkCandidates(props.associates, suggested, search),
    [props.associates, suggested, search],
  );
  // Only the first list starts on the driver's current associate; a search starts at the top.
  const [first] = useState(props.currentId || undefined);
  const { selectedId, selected, pick } = useSelection(
    shown,
    (a) => a.transporterId,
    search ? undefined : first,
  );
  const columns = useMemo<PickColumn<Associate>[]>(
    () => [
      {
        id: 'name',
        header: 'Associate',
        value: (a) => a.name + (suggested.has(a.transporterId) ? '   (suggested)' : ''),
      },
      { id: 'transporter_id', header: 'Transporter ID', value: (a) => a.transporterId, mono: true },
      { id: 'status', header: 'Status', value: (a) => a.status },
      { id: 'vans', header: 'Vans', value: (a) => vanBadges(a) },
    ],
    [suggested],
  );
  const confirm = (row: Associate | null) => {
    if (row) props.onAnswer({ action: 'link', transporterId: row.transporterId });
  };

  return (
    <Modal
      title={`Which associate is "${props.driver}"?`}
      wide
      onCancel={() => props.onAnswer(null)}
      onEnter={() => confirm(selected)}
      testId="link-dialog"
      footer={
        <>
          <Button onClick={() => props.onAnswer({ action: 'clear' })} className="mr-auto">
            Not an associate
          </Button>
          {props.hasManualLink ? (
            <Button onClick={() => props.onAnswer({ action: 'auto' })}>Match automatically</Button>
          ) : null}
          <Button onClick={() => props.onAnswer(null)}>Cancel</Button>
          <Button variant="primary" disabled={!selected} onClick={() => confirm(selected)}>
            Link
          </Button>
        </>
      }
    >
      <Subtitle text="Suggestions are listed first. The link is remembered for future imports." />
      <SearchBox value={search} onChange={setSearch} />
      <PickTable
        label="Associates"
        columns={columns}
        rows={shown}
        getId={(a) => a.transporterId}
        tone={(a) => (isActive(a) ? '' : 'ghost')}
        selectedId={selectedId}
        onSelect={pick}
        onConfirm={confirm}
      />
    </Modal>
  );
}

// ---------------------------------------------------------- roster pick

interface RosterPickProps {
  /** The window's title ("Reassign CX1"). */
  title: string;
  heading: string;
  subtitle: string;
  rows: readonly RosterRowView[];
  confirmLabel: string;
  /** Picking this row is a swap, not a plain move; it is greyed out. */
  isSwap: (view: RosterRowView) => boolean;
  onAnswer: (view: RosterRowView | null) => void;
}

const ROSTER_PICK_COLUMNS: PickColumn<RosterRowView>[] = [
  { id: 'driver', header: 'Driver', value: (v) => v.row.driver },
  { id: 'holding', header: 'Holding', value: (v) => holdingText(v.row) },
  { id: 'routes', header: 'Route', value: (v) => v.row.routes },
  { id: 'service_type', header: 'Service Type', value: (v) => v.row.serviceType },
  { id: 'wave_time', header: 'Wave Time', value: (v) => v.row.waveTime },
  { id: 'vehicle', header: 'Vehicle', value: (v) => v.row.vehicle },
  { id: 'shift_type', header: 'Shift Type', value: (v) => v.row.shiftType },
];

/** Who takes this route or van instead (`RosterPickDialog`). */
export function RosterPickDialog(props: RosterPickProps) {
  const [search, setSearch] = useState('');
  const shown = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return props.rows;
    return props.rows.filter((view) =>
      ROSTER_PICK_COLUMNS.some((c) => (c.value(view) || '-').toLowerCase().includes(query)),
    );
  }, [props.rows, search]);
  const { selectedId, selected, pick } = useSelection(shown, (v) => String(v.index));
  const confirm = (view: RosterRowView | null) => {
    if (view) props.onAnswer(view);
  };
  return (
    <Modal
      title={props.heading}
      caption={props.title}
      wide
      onCancel={() => props.onAnswer(null)}
      onEnter={() => confirm(selected)}
      testId="roster-pick-dialog"
      footer={
        <>
          <Button onClick={() => props.onAnswer(null)}>Cancel</Button>
          <Button variant="primary" disabled={!selected} onClick={() => confirm(selected)}>
            {props.confirmLabel}
          </Button>
        </>
      }
    >
      <Subtitle text={props.subtitle} />
      <SearchBox value={search} onChange={setSearch} />
      <PickTable
        label="Drivers"
        columns={ROSTER_PICK_COLUMNS}
        rows={shown}
        getId={(v) => String(v.index)}
        tone={(v) => (props.isSwap(v) ? 'ghost' : '')}
        selectedId={selectedId}
        onSelect={pick}
        onConfirm={confirm}
      />
    </Modal>
  );
}

// ------------------------------------------------------------- van pick

const VAN_PICK_COLUMNS: PickColumn<VanChoice>[] = [
  { id: 'name', header: 'Vehicle', value: (c) => c.vehicle.name },
  { id: 'fit', header: 'Fit', value: (c) => c.fit },
  { id: 'service_type', header: 'Service Type', value: (c) => c.vehicle.serviceType },
  { id: 'category', header: 'Category', value: (c) => category(c.vehicle) },
  { id: 'assign', header: 'Assign', value: (c) => (manualOnly(c.vehicle) ? 'Manual' : 'Auto') },
  { id: 'make_model', header: 'Make / Model', value: (c) => makeModel(c.vehicle) },
  { id: 'plate', header: 'Plate', value: (c) => c.vehicle.plate },
  { id: 'vin', header: 'VIN', value: (c) => c.vehicle.vin, mono: true },
];

interface VanPickProps {
  heading: string;
  subtitle: string;
  choices: readonly VanChoice[];
  onAnswer: (choice: VanChoice | null) => void;
}

/** Which free van, best fit first (`VanPickDialog`). */
export function VanPickDialog(props: VanPickProps) {
  const [search, setSearch] = useState('');
  const shown = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return props.choices;
    return props.choices.filter((choice) =>
      VAN_PICK_COLUMNS.some((c) => (c.value(choice) || '-').toLowerCase().includes(query)),
    );
  }, [props.choices, search]);
  const getId = (c: VanChoice) => c.vehicle.vin || c.vehicle.name;
  const { selectedId, selected, pick } = useSelection(shown, getId);
  const confirm = (choice: VanChoice | null) => {
    if (choice) props.onAnswer(choice);
  };
  return (
    <Modal
      title={props.heading}
      wide
      onCancel={() => props.onAnswer(null)}
      onEnter={() => confirm(selected)}
      testId="van-pick-dialog"
      footer={
        <>
          <Button onClick={() => props.onAnswer(null)}>Cancel</Button>
          <Button variant="primary" disabled={!selected} onClick={() => confirm(selected)}>
            Assign
          </Button>
        </>
      }
    >
      <Subtitle text={props.subtitle} />
      <SearchBox value={search} onChange={setSearch} />
      <PickTable
        label="Free vans"
        columns={VAN_PICK_COLUMNS}
        rows={shown}
        getId={getId}
        tone={(c) => c.severity}
        selectedId={selectedId}
        onSelect={pick}
        onConfirm={confirm}
      />
    </Modal>
  );
}

// ------------------------------------------------------- assign read-out

const ASSIGN_COLUMNS: PickColumn<AssignLine>[] = [
  { id: 'driver', header: 'Driver', value: (l) => l.driver },
  { id: 'vehicle', header: 'Vehicle', value: (l) => l.vehicle },
  { id: 'how', header: 'Matched On', value: (l) => l.how },
  { id: 'detail', header: 'Detail', value: (l) => l.detail },
];

/** What a van assignment run did, and who it could not place (`AssignDialog`). */
export function AssignDialog({
  result,
  onClose,
}: {
  result: AssignmentResult;
  onClose: () => void;
}) {
  const heading = assignHeading(result);
  const lines = useMemo(() => assignLines(result), [result]);
  return (
    <Modal
      title={heading.title}
      wide
      onCancel={onClose}
      onEnter={onClose}
      testId="assign-dialog"
      footer={
        <Button variant="primary" onClick={onClose} autoFocus>
          Close
        </Button>
      }
    >
      <Subtitle text={heading.summary} />
      {heading.loose ? <Subtitle text={heading.loose} /> : null}
      <PickTable
        label="Van assignments"
        columns={ASSIGN_COLUMNS}
        rows={lines}
        getId={(l) => `${l.driver}\u0000${l.vehicle}\u0000${l.detail}`}
        tone={(l) => l.severity}
        testId="assign-lines"
      />
    </Modal>
  );
}

// ------------------------------------------------------------ the source

interface SourceDialogProps {
  sets: readonly RouteSetView[];
  current: string;
  onAnswer: (kind: string | null) => void;
}

/** Which export the roster takes route data from (`SourceDialog`). */
export function SourceDialog({ sets, current, onAnswer }: SourceDialogProps) {
  const [choice, setChoice] = useState(
    sets.some((set) => set.kind === current) ? current : (sets[0]?.kind ?? ''),
  );
  return (
    <Modal
      title="Which export should the roster take?"
      onCancel={() => onAnswer(null)}
      onEnter={() => onAnswer(choice)}
      testId="source-dialog"
      footer={
        <>
          <Button onClick={() => onAnswer(null)}>Cancel</Button>
          <Button variant="primary" onClick={() => onAnswer(choice)}>
            Bring Over
          </Button>
        </>
      }
    >
      <Subtitle text="Dispatch times differ between them - a schedule start time is not a planned departure." />
      <fieldset className="flex flex-col gap-3 overflow-y-auto">
        <legend className="sr-only">Route exports</legend>
        {sets.map((set) => (
          <label key={set.kind} className="flex flex-col gap-0.5 text-sm">
            <span className="flex items-center gap-2 font-medium">
              <input
                type="radio"
                name="route-source"
                value={set.kind}
                checked={choice === set.kind}
                onChange={() => setChoice(set.kind)}
              />
              {set.label}
            </span>
            {describeSource(set).map((line, index) => (
              <span key={index} className="pl-6 text-muted">
                {line}
              </span>
            ))}
          </label>
        ))}
      </fieldset>
    </Modal>
  );
}
