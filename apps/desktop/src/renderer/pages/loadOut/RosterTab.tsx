// The Roster tab: today's roster, one row per driver, and everything the old app's Roster tab
// did to it (loadout_page.py `RosterPage`). The page only asks and shows: every change is one
// command, and the core does the work.

import {
  BY_HAND,
  isActive,
  needsVan,
  rosterDateLabel,
  type Associate,
  type DriverRow,
} from '@loadout/core';
import {
  ArrowLeftRight,
  ChevronDown,
  Link2,
  Truck,
  Unlink,
  UserMinus,
  type LucideIcon,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AppSnapshot, RosterRowView } from '../../../shared/snapshot';
import { DataGrid, type RowAction } from '../../components/DataGrid';
import { FileDrop } from '../../components/FileDrop';
import { call, explain, type Failure } from '../../lib/channels';
import { checkSeverity } from '../../lib/checkSeverity';
import { databaseLayoutStore } from '../../lib/gridLayoutStore';
import { Button } from '../../ui/button';
import { Chip } from '../../ui/chip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../ui/dropdown-menu';
import { Badges, checkTone, ROSTER_COLUMNS, VAN_COLUMNS } from './columns';
import {
  AssignDialog,
  LinkDialog,
  RosterPickDialog,
  SourceDialog,
  VanPickDialog,
  type LinkAnswer,
} from './dialogs';
import { useAsk } from './Modal';
import { ExportButtons } from './print';
import {
  ALL_SHIFTS,
  applySummary,
  assignSummary,
  baseName,
  dwpDayProblem,
  dwpSummary,
  matchesShift,
  rosterHeader,
  routeTakers,
  shiftOptions,
  vanChoices,
  vanTakers,
  workOf,
  type VanChoice,
} from './rules';

/** What the right-click menu says on a cell that has no actions (the old `_NO_ACTION`). */
export const NO_ACTION =
  'Nothing to do on that column. Right-click a Driver, Transporter ID, Routes, Service Type, ' +
  'Vehicle or VIN cell.';

interface RosterTabProps {
  snapshot: AppSnapshot;
  /** Plain words for the status line at the bottom of the page. */
  say: (text: string) => void;
  /** Ctrl+O was pressed (maybe on another tab): bring in a sheet, then call `onImportTaken`. */
  pendingImport: boolean;
  onImportTaken: () => void;
}

const needsAttention = (view: RosterRowView) => checkSeverity(view.check) !== '';
const rowTone = (view: RosterRowView) => checkSeverity(view.check) || undefined;

export function RosterTab({ snapshot, say, pendingImport, onImportTaken }: RosterTabProps) {
  const { ask, confirm, inform, dialog } = useAsk();
  const [shift, setShift] = useState(ALL_SHIFTS);
  // Remounting the table clears its search, filters and sort, as the old Reset did after an
  // import or a clear.
  const [gridKey, setGridKey] = useState(0);

  const rows = snapshot.roster.rows;
  const header = useMemo(() => rosterHeader(snapshot), [snapshot]);
  const shifts = useMemo(() => shiftOptions(rows), [rows]);
  const shown = shifts.includes(shift) ? shift : ALL_SHIFTS;
  const filter = useCallback((view: RosterRowView) => matchesShift(view, shown), [shown]);

  const resetFilters = useCallback(() => {
    setShift(ALL_SHIFTS);
    setGridKey((key) => key + 1);
  }, []);

  /** Shows why a command did not work. Answers true when it did. */
  const failed = useCallback(
    (reply: { ok: true } | Failure): reply is Failure => {
      if (reply.ok) return false;
      say(explain(reply));
      return true;
    },
    [say],
  );

  // ------------------------------------------------------------ import

  /** Import Sheet. `dropped` is the token of a sheet dropped on the tab: no file window then. */
  const importSheet = useCallback(
    async (dropped?: string) => {
      let path: string | null = dropped ?? null;
      if (path === null) {
        const picked = await call('files:pick', { kind: 'loadout' });
        if (failed(picked)) return;
        path = picked.value.path;
      }
      if (path === null) return;
      const now = snapshot;
      if (now.roster.rows.length > 0) {
        const replace = await confirm(
          'Replace current roster?',
          `A roster for ${rosterDateLabel({ loadOutDate: now.loadOutDate })} is already loaded ` +
            `(${now.roster.rows.length} drivers).\n\nReplace it with ${baseName(path)}?`,
        );
        if (!replace) {
          say('Import cancelled - existing roster kept.');
          return;
        }
      }
      const done = await call('files:import', { kind: 'loadout', path });
      if (!done.ok) {
        await inform('Import failed', explain(done));
        say('Import failed.');
        return;
      }
      resetFilters();
      const after = await call('state:snapshot');
      let extra = '';
      if (after.ok) {
        extra =
          after.value.counts.associates > 0
            ? ` ${after.value.counts.matched} of ${done.value.rows} found in the driver list.`
            : ' Import the driver list to match them up.';
      }
      say(`Imported ${done.value.rows} drivers from ${baseName(path)}.${extra}`);
    },
    [snapshot, confirm, inform, failed, resetFilters, say],
  );

  // Taken once, even when the tab has only just opened for it (Ctrl+O from another tab).
  const taking = useRef(false);
  useEffect(() => {
    if (!pendingImport) {
      taking.current = false;
      return;
    }
    if (taking.current) return;
    taking.current = true;
    onImportTaken();
    void importSheet();
  }, [pendingImport, onImportTaken, importSheet]);

  // -------------------------------------------------------- bring over

  /** Brings the DWP over. Returns what to say, so Bring Over Route Data can add it to its line. */
  const bringOverDwp = useCallback(
    async (afterRouteData: boolean): Promise<string> => {
      const now = snapshot;
      if (now.roster.rows.length === 0) {
        if (!afterRouteData) say('Import a load-out sheet first.');
        return '';
      }
      if (now.dwp.set.rows.length === 0) {
        if (afterRouteData) return '';
        await inform(
          'No DWP sheet loaded',
          'Staging, bags and OVS come from the DWP sheet.\n\nImport it on Route Data > DWP, ' +
            'then bring it over.',
        );
        say('Nothing to bring over - no DWP sheet loaded.');
        return '';
      }
      const problem = dwpDayProblem(now);
      if (problem) {
        const anyway = await confirm(
          "Is this the right day's DWP sheet?",
          `${problem}\n\nBring its staging, bags and OVS over anyway?`,
          { danger: true },
        );
        if (!anyway) {
          const message = "DWP data left alone - the sheet may be the wrong day's.";
          if (!afterRouteData) say(message);
          return message;
        }
      }
      const reply = await call('loadOut:bring-over-dwp');
      if (failed(reply)) return '';
      const message = dwpSummary(reply.value);
      if (!afterRouteData) say(message);
      return message;
    },
    [snapshot, confirm, inform, failed, say],
  );

  const bringOverRouteData = useCallback(async () => {
    const now = snapshot;
    if (now.roster.rows.length === 0) {
      say('Import a load-out sheet first.');
      return;
    }
    const available = now.routeSets.filter((set) => set.rows.length > 0);
    if (available.length === 0) {
      await inform(
        'No route data',
        'Import a Routes, Itineraries or Weekly Schedule export on the Route Data page ' +
          'first.\n\nAny one of the three is enough.',
      );
      return;
    }
    if (now.counts.associates === 0) {
      await inform(
        'No associate data',
        "Route data is matched to drivers by Transporter ID, and the load-out sheet doesn't " +
          'carry one.\n\nImport the associate export on the Associates page first.',
      );
      return;
    }
    let kind = available[0]!.kind;
    if (available.length > 1) {
      const chosen = await ask<string | null>((done) => (
        <SourceDialog sets={available} current={now.roster.routeSource} onAnswer={done} />
      ));
      if (chosen === null) return;
      kind = chosen;
    }
    const reply = await call('loadOut:bring-over-route-data', {
      kind: kind as 'routes' | 'itineraries' | 'schedule',
    });
    if (failed(reply)) return;
    const result = reply.value;
    const summary = applySummary(result, now.roster.rows.length + result.addedDrivers.length);
    say(summary);
    if (result.needsReview.length > 0) {
      const shown = result.needsReview.slice(0, 15);
      const tail =
        result.needsReview.length > 15 ? `\n\n...and ${result.needsReview.length - 15} more.` : '';
      await inform(
        'Check these before assigning vans',
        "Route data was the only record of these drivers, so EDV is all they were given - it's " +
          'the one qualification route data can stand behind on its own.\n\nAssign Vans ' +
          "won't put them in a van their route calls for until the rest is set on the " +
          `Associates page:\n\n${shown.join('\n')}${tail}`,
      );
    }
    if (result.filled && !result.pads) {
      const label = available.find((set) => set.kind === kind)?.label ?? kind;
      await inform(
        'No PADs assigned',
        `${label} has no PAD assigned to any of its dispatch times yet, so the PAD column is ` +
          "still empty.\n\nUse 'Assign PADs' on the Route Data page, then bring the data over " +
          'again.',
      );
    }
    // Last, because the DWP joins on the route code this pass just put on the roster.
    const note = await bringOverDwp(true);
    if (note) say(`${summary}  ${note}`);
  }, [snapshot, ask, inform, failed, say, bringOverDwp]);

  // ------------------------------------------------------------- vans

  const assignVans = useCallback(async () => {
    const now = snapshot;
    if (now.roster.rows.length === 0) {
      say('Import a load-out sheet first.');
      return;
    }
    if (now.vehicles.length === 0) {
      await inform(
        'No vehicles',
        'Import the fleet on the Vehicle Data page first - there is nothing to assign from.',
      );
      return;
    }
    if (now.counts.associates === 0) {
      await inform(
        'No associate data',
        "Qualifications come from the associate export, and a driver is never put in a van they aren't " +
          'qualified for.\n\nImport it on the Associates page first.',
      );
      return;
    }
    if (now.counts.operationalVehicles === 0) {
      await inform(
        'No operational vans',
        'Every van in the fleet is grounded. Return some to service on the Vehicle Data page.',
      );
      return;
    }
    if (!now.roster.rows.some((view) => needsVan(view.row))) {
      await inform(
        'No routes on the roster',
        'Nobody has a service type, so nobody has a route to put a van against.\n\nBring route ' +
          'data over first. Service type is what says a route was given out - a shift type ' +
          'only says the scheduler told someone to come in.',
      );
      say('Nothing to assign - no service types on the roster.');
      return;
    }
    // Assign Vans works every van out again, so a van given by hand would be lost.
    if (
      now.roster.rows.some(
        (view) => view.row.assignMethod === BY_HAND && (view.row.vehicle || view.row.vin),
      )
    ) {
      const yes = await confirm(
        'Replace vans given by hand?',
        'Some vans were given by hand. Assign Vans will replace them. Go ahead?',
      );
      if (!yes) {
        say('Vans left as they were.');
        return;
      }
    }
    const reply = await call('loadOut:assign-vans');
    if (failed(reply)) return;
    say(assignSummary(reply.value));
    await ask<void>((done) => <AssignDialog result={reply.value} onClose={() => done()} />);
  }, [snapshot, ask, confirm, inform, failed, say]);

  const clearVans = useCallback(async () => {
    const holding = snapshot.roster.rows.filter((view) => view.row.vehicle || view.row.vin).length;
    if (holding === 0) {
      say('No van assignments to clear.');
      return;
    }
    const yes = await confirm(
      'Clear van assignments?',
      `Take the van off all ${holding} drivers who have one?\n\nThe vans go back to the ` +
        'Available Vans tab. Assign Vans can hand them out again.',
      { danger: true },
    );
    if (!yes) return;
    const reply = await call('loadOut:clear-vans');
    if (failed(reply)) return;
    say(
      reply.value ? `Cleared the van from ${reply.value} drivers.` : 'No van assignments to clear.',
    );
  }, [snapshot, confirm, failed, say]);

  const clearLinks = useCallback(async () => {
    const now = snapshot;
    if (now.counts.links === 0) {
      say('No manual links to clear.');
      return;
    }
    const yes = await confirm(
      'Clear manual links?',
      `Remove all ${now.counts.links} hand-made driver links?\n\nEvery driver goes back to ` +
        'automatic name matching.',
      { danger: true },
    );
    if (!yes) return;
    const reply = await call('loadOut:clear-links');
    if (failed(reply)) return;
    say('Manual links cleared.');
  }, [snapshot, confirm, failed, say]);

  const moveToPrevious = useCallback(async () => {
    const now = snapshot;
    if (now.roster.rows.length === 0) {
      say('Nothing to move - no roster loaded.');
      return;
    }
    const kept = now.previousRoster.rows.length;
    if (kept) {
      const replace = await confirm(
        'Replace the previous roster?',
        `The Previous Roster tab already holds ${kept} drivers ` +
          `(${rosterDateLabel(now.previousRoster)}).\n\nReplace it with today's ` +
          `${now.roster.rows.length}?`,
      );
      if (!replace) {
        say('Previous roster kept as it was.');
        return;
      }
    }
    const reply = await call('loadOut:move-to-previous-roster');
    if (failed(reply)) return;
    const withVans = now.roster.rows.filter((view) => view.row.vehicle).length;
    say(
      `Copied ${reply.value} drivers to the Previous Roster, ${withVans} of them holding a van. ` +
        "Today's roster is unchanged.",
    );
  }, [snapshot, confirm, failed, say]);

  const clearRoster = useCallback(async () => {
    const now = snapshot;
    if (now.roster.rows.length === 0) {
      say('Nothing to clear - no roster loaded.');
      return;
    }
    const yes = await confirm(
      'Clear roster?',
      `Remove the roster for ${rosterDateLabel({ loadOutDate: now.loadOutDate })} ` +
        `(${now.roster.rows.length} drivers)?\n\nAny van assignments on it will be removed ` +
        'too. This cannot be undone.\nAssociate data and manual links are kept.',
      { danger: true },
    );
    if (!yes) return;
    const reply = await call('loadOut:clear-roster');
    if (failed(reply)) return;
    resetFilters();
    say('Roster cleared.');
  }, [snapshot, confirm, failed, resetFilters, say]);

  // ------------------------------------------------------ row actions

  const associateOf = useCallback(
    (view: RosterRowView): Associate | null => {
      if (!view.associateId) return null;
      return (
        snapshot.associates.find((a) => a.associate.transporterId === view.associateId)
          ?.associate ?? null
      );
    },
    [snapshot],
  );

  /** The two rows of a hand move as they are after it (read again), else as they were before. */
  const rowsAfter = useCallback(
    async (from: RosterRowView, to: RosterRowView): Promise<[DriverRow, DriverRow]> => {
      const reply = await call('state:snapshot');
      const rows = reply.ok ? reply.value.roster.rows : [];
      return [rows[from.index]?.row ?? from.row, rows[to.index]?.row ?? to.row];
    },
    [],
  );

  const removeDriver = useCallback(
    async (view: RosterRowView) => {
      const revision = snapshot.revision;
      const size = snapshot.roster.rows.length;
      const yes = await confirm(
        'Remove driver?',
        `Take ${view.row.driver} off the roster?\n\nAnything they were holding - route, van, ` +
          'PAD - goes with them. Re-import the load-out sheet to get them back.',
        { danger: true },
      );
      if (!yes) return;
      const reply = await call('loadOut:remove-driver', { revision, rowIndex: view.index });
      if (failed(reply)) return;
      say(`${view.row.driver} removed. ${size - 1} drivers on the roster.`);
    },
    [snapshot, confirm, failed, say],
  );

  const linkDriver = useCallback(
    async (view: RosterRowView) => {
      const now = snapshot;
      if (now.associates.length === 0) {
        await inform(
          'No associate data',
          'Import the associate export on the Associates page first.',
        );
        return;
      }
      const answer = await ask<LinkAnswer>((done) => (
        <LinkDialog
          driver={view.row.driver}
          associates={now.associates.map((a) => a.associate)}
          currentId={view.associateId}
          suggestions={view.match.candidates.map((c) => c.transporterId)}
          hasManualLink={view.match.method === 'manual' || view.match.method === 'cleared'}
          onAnswer={done}
        />
      ));
      if (answer === null) return;
      const base = { revision: now.revision, rowIndex: view.index };
      if (answer.action === 'link') {
        const reply = await call('loadOut:link-driver', {
          ...base,
          transporterId: answer.transporterId,
        });
        if (failed(reply)) return;
        const name =
          now.associates.find((a) => a.associate.transporterId === answer.transporterId)?.associate
            .name ?? answer.transporterId;
        say(`Linked ${view.row.driver} to ${name}.`);
      } else if (answer.action === 'clear') {
        const reply = await call('loadOut:link-driver', { ...base, transporterId: null });
        if (failed(reply)) return;
        say(`${view.row.driver} marked as not an associate.`);
      } else {
        const reply = await call('loadOut:unlink-driver', base);
        if (failed(reply)) return;
        say(`${view.row.driver} back to automatic matching.`);
      }
    },
    [snapshot, ask, inform, failed, say],
  );

  const unlinkDriver = useCallback(
    async (view: RosterRowView) => {
      const reply = await call('loadOut:unlink-driver', {
        revision: snapshot.revision,
        rowIndex: view.index,
      });
      if (failed(reply)) return;
      say(`${view.row.driver} back to automatic matching.`);
    },
    [snapshot, failed, say],
  );

  const reassignRoute = useCallback(
    async (view: RosterRowView) => {
      const now = snapshot;
      const work = workOf(view.row);
      if (!work) {
        say(`${view.row.driver} has no route or service type to reassign.`);
        return;
      }
      const yes = await confirm(
        'Reassign route?',
        `Move ${work} off ${view.row.driver}?\n\nThe wave time, service type, PAD and van go ` +
          'with it.',
      );
      if (!yes) return;
      const chosen = await ask<RosterRowView | null>((done) => (
        <RosterPickDialog
          title={`Reassign ${work}`}
          heading={`Who takes ${work} from ${view.row.driver}?`}
          subtitle={
            'Drivers with no work are listed first. Picking someone who already has some ' +
            'swaps the two, so neither route is lost.'
          }
          rows={routeTakers(now.roster.rows, view)}
          confirmLabel="Reassign"
          isSwap={(other) => Boolean(workOf(other.row))}
          onAnswer={done}
        />
      ));
      if (chosen === null) return;
      const reply = await call('loadOut:reassign-route', {
        revision: now.revision,
        from: view.index,
        to: chosen.index,
      });
      if (failed(reply)) return;
      // Said from the two rows as they are after the move, as the old app did.
      const [from, to] = await rowsAfter(view, chosen);
      if (workOf(chosen.row)) {
        say(`Swapped: ${to.driver} takes ${workOf(to)}, ${from.driver} takes ${workOf(from)}.`);
      } else {
        const van = to.vehicle ? ` and van ${to.vehicle}` : '';
        say(`${to.driver} takes ${workOf(to)}${van}. ${from.driver} now has nothing.`);
      }
    },
    [snapshot, rowsAfter, ask, confirm, failed, say],
  );

  const takeVan = useCallback(
    async (view: RosterRowView) => {
      if (!view.row.vehicle && !view.row.vin) {
        say(`${view.row.driver} has no van to unassign.`);
        return;
      }
      const revision = snapshot.revision;
      const yes = await confirm(
        'Unassign van?',
        `Take van ${view.row.vehicle || view.row.vin} off ${view.row.driver}?\n\nIt goes back ` +
          'to the Available Vans tab.',
        { danger: true },
      );
      if (!yes) return;
      const reply = await call('loadOut:take-van', { revision, rowIndex: view.index });
      if (failed(reply)) return;
      say(`Took van ${reply.value} off ${view.row.driver}. It's back on the Available Vans tab.`);
    },
    [snapshot, confirm, failed, say],
  );

  const reassignVan = useCallback(
    async (view: RosterRowView) => {
      const now = snapshot;
      if (!view.row.vehicle && !view.row.vin) {
        say(`${view.row.driver} has no van to reassign.`);
        return;
      }
      const others = vanTakers(now.roster.rows, view);
      if (others.length === 0) {
        await inform(
          'Nobody to take it',
          'No other driver on the roster has a route, so there is nobody to give this van to.',
        );
        return;
      }
      const yes = await confirm(
        'Reassign van?',
        `Move van ${view.row.vehicle || view.row.vin} off ${view.row.driver}?`,
      );
      if (!yes) return;
      const chosen = await ask<RosterRowView | null>((done) => (
        <RosterPickDialog
          title={`Reassign van ${view.row.vehicle}`}
          heading={`Who takes van ${view.row.vehicle} from ${view.row.driver}?`}
          subtitle={
            'Only drivers with a route are listed, those still without a van first. Picking ' +
            'someone who already has one swaps the two.'
          }
          rows={others}
          confirmLabel="Reassign"
          isSwap={(other) => Boolean(other.row.vehicle)}
          onAnswer={done}
        />
      ));
      if (chosen === null) return;
      const reply = await call('loadOut:reassign-van', {
        revision: now.revision,
        from: view.index,
        to: chosen.index,
      });
      if (failed(reply)) return;
      const [from, to] = await rowsAfter(view, chosen);
      if (chosen.row.vehicle) {
        say(
          `Swapped vans: ${to.driver} takes ${to.vehicle}, ${from.driver} takes ${from.vehicle}.`,
        );
      } else {
        say(`${to.driver} takes van ${to.vehicle}. ${from.driver} now has none.`);
      }
    },
    [snapshot, rowsAfter, ask, confirm, inform, failed, say],
  );

  const giveVan = useCallback(
    async (view: RosterRowView) => {
      const now = snapshot;
      if (view.row.vehicle || view.row.vin) {
        await reassignVan(view);
        return;
      }
      if (now.vehicles.length === 0) {
        await inform('No vehicles', 'Import the fleet on the Vehicle Data page first.');
        return;
      }
      const choices = vanChoices(
        view.row,
        associateOf(view),
        now.vehicles.filter((v) => v.available).map((v) => v.vehicle),
        new Set(now.lmrApproved),
      );
      if (choices.length === 0) {
        await inform(
          'No vans available',
          "Every operational van is already out with a driver.\n\nThe Available Vans tab shows what's left.",
        );
        return;
      }
      const note = view.row.routes ? '' : '  This driver has no route yet.';
      const chosen = await ask<VanChoice | null>((done) => (
        <VanPickDialog
          heading={`Which van for ${view.row.driver}?`}
          subtitle={
            `${choices.length} free. Best fit first; anything they aren't cleared for is ` +
            `flagged rather than hidden.${note}`
          }
          choices={choices}
          onAnswer={done}
        />
      ));
      if (chosen === null) return;
      const reply = await call('loadOut:give-van', {
        revision: now.revision,
        rowIndex: view.index,
        vin: chosen.vehicle.vin,
      });
      if (failed(reply)) return;
      say(`${view.row.driver} takes van ${chosen.vehicle.name} - ${chosen.fit.toLowerCase()}.`);
    },
    [snapshot, ask, inform, failed, say, associateOf, reassignVan],
  );

  const hasVanIn = (view: RosterRowView) => Boolean(view.row.vehicle || view.row.vin);
  const rowActions = useMemo<RowAction<RosterRowView>[]>(() => {
    const action = (
      id: string,
      label: string,
      icon: LucideIcon,
      appliesTo: (view: RosterRowView, column: string) => boolean,
      run: (view: RosterRowView) => Promise<void>,
      danger = false,
    ): RowAction<RosterRowView> => ({
      id,
      label,
      icon,
      danger,
      appliesTo,
      onSelect: (view) => void run(view),
    });
    return [
      action(
        'remove',
        'Remove from the roster...',
        UserMinus,
        (_v, c) => c === 'driver',
        removeDriver,
        true,
      ),
      action('link', 'Link to associate...', Link2, (_v, c) => c === 'transporter_id', linkDriver),
      action(
        'unlink',
        'Match automatically',
        Unlink,
        (_v, c) => c === 'transporter_id',
        unlinkDriver,
      ),
      action(
        'reassign-route',
        'Reassign this route...',
        ArrowLeftRight,
        (_v, c) => c === 'routes' || c === 'service_type',
        reassignRoute,
      ),
      action(
        'reassign-van',
        'Reassign this van...',
        ArrowLeftRight,
        (v, c) => VAN_COLUMNS.includes(c) && hasVanIn(v),
        reassignVan,
      ),
      action(
        'unassign-van',
        'Unassign this van',
        Truck,
        (v, c) => VAN_COLUMNS.includes(c) && hasVanIn(v),
        takeVan,
        true,
      ),
      action(
        'assign-van',
        'Assign a Van...',
        Truck,
        (v, c) => VAN_COLUMNS.includes(c) && !hasVanIn(v),
        giveVan,
      ),
    ];
  }, [removeDriver, linkDriver, unlinkDriver, reassignRoute, reassignVan, takeVan, giveVan]);

  // ---------------------------------------------------------- drawing

  const dropProblem = useCallback(
    (words: string) => {
      say('Import failed.');
      void inform('Import failed', words);
    },
    [say, inform],
  );

  return (
    <FileDrop
      page="load-out"
      kind="loadout"
      onDropped={(token) => void importSheet(token)}
      onProblem={dropProblem}
    >
      <div className="flex min-h-0 flex-1 flex-col" data-tab-panel="roster">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2 border-b border-line bg-surface px-6 py-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold" data-testid="roster-title">
              {header.title}
            </h2>
            {header.source ? (
              <p className="text-sm text-muted" data-testid="roster-source">
                {header.source}
              </p>
            ) : null}
          </div>
          <div className="text-right">
            <p className="text-lg font-semibold" data-testid="roster-count">
              {header.count}
            </p>
            {header.breakdown ? (
              <p className="text-sm text-muted" data-testid="roster-breakdown">
                {header.breakdown}
              </p>
            ) : null}
            {header.anchor ? (
              <p className="text-sm text-muted" data-testid="roster-anchor">
                {header.anchor}
              </p>
            ) : null}
          </div>
        </div>
        <div
          className="flex flex-wrap items-center gap-2 border-b border-line bg-surface px-6 py-2"
          role="toolbar"
          aria-label="Roster actions"
        >
          <Button onClick={() => void importSheet()} data-action="import-sheet" title="Ctrl+O">
            Import Sheet
          </Button>
          <Button onClick={() => void bringOverRouteData()} data-action="bring-over-route-data">
            Bring Over Route Data
          </Button>
          <Button onClick={() => void bringOverDwp(false)} data-action="bring-over-dwp">
            Bring Over DWP
          </Button>
          <Button variant="primary" onClick={() => void assignVans()} data-action="assign-vans">
            Assign Vans
          </Button>
          <Button onClick={() => void moveToPrevious()} data-action="move-to-previous">
            Move Data to Previous Roster
          </Button>
          <Button variant="danger" onClick={() => void clearRoster()} data-action="clear-roster">
            Clear Roster
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button data-action="more">
                More <ChevronDown aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onSelect={() => void clearVans()} data-action="clear-vans">
                Clear Van Assignments
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void clearLinks()} data-action="clear-links">
                Clear Manual Links
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {/* The two ways off this page, set apart from the buttons that change what is on it. */}
          <div className="ml-3">
            <ExportButtons onStatus={say} />
          </div>
        </div>
        <div className="min-h-0 flex-1">
          <DataGrid
            key={gridKey}
            view="roster"
            label="Roster"
            columns={ROSTER_COLUMNS}
            rows={rows}
            getRowId={(view) => String(view.index)}
            layoutStore={databaseLayoutStore}
            rowActions={rowActions}
            noActionText={NO_ACTION}
            needsAttention={needsAttention}
            rowTone={rowTone}
            filter={filter}
            onResetFilters={() => setShift(ALL_SHIFTS)}
            filterControls={
              <label className="flex items-center gap-1.5 text-sm text-muted">
                <span>Shift</span>
                <select
                  value={shown}
                  onChange={(event) => setShift(event.target.value)}
                  className="h-8 rounded-md border border-line-strong bg-sunken px-2 text-sm text-fg"
                  aria-label="Shift type"
                  data-testid="shift-filter"
                >
                  {shifts.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
            }
            searchPlaceholder="Search drivers, routes, vans"
            empty={{
              title: 'No roster yet.',
              body: "Import today's load-out sheet to start.",
              action: (
                <Button variant="primary" onClick={() => void importSheet()}>
                  Import Sheet
                </Button>
              ),
            }}
            renderDetail={(view) => <DriverDetail view={view} associate={associateOf(view)} />}
            onStatus={say}
          />
        </div>
        {dialog}
      </div>
    </FileDrop>
  );
}

/** The panel beside the table for the picked driver: their associate record, badges and issues. */
function DriverDetail({ view, associate }: { view: RosterRowView; associate: Associate | null }) {
  return (
    <div className="flex flex-col gap-3" data-testid="driver-detail">
      <div>
        <h3 className="text-base font-semibold">{view.row.driver}</h3>
        <p className="text-sm text-muted">{view.row.shiftType || 'No shift type'}</p>
      </div>
      {view.check ? (
        <Chip tone={checkTone(view.check)} className="self-start">
          {view.check}
        </Chip>
      ) : null}
      {view.issues.length > 0 ? (
        <ul className="list-disc pl-5 text-sm">
          {view.issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      ) : null}
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
        <dt className="text-muted">Associate</dt>
        <dd>{associate ? associate.name : 'No associate record'}</dd>
        <dt className="text-muted">Transporter ID</dt>
        <dd className="font-mono">{view.associateId || '-'}</dd>
        <dt className="text-muted">Status</dt>
        <dd>{associate ? associate.status || '-' : '-'}</dd>
        <dt className="text-muted">Active</dt>
        <dd>{associate ? (isActive(associate) ? 'Yes' : 'No') : '-'}</dd>
        <dt className="text-muted">Vans</dt>
        <dd>
          <Badges text={view.vanBadges} />
        </dd>
        <dt className="text-muted">Lifetime Routes</dt>
        <dd>{view.tenure === null ? '-' : view.tenure}</dd>
        <dt className="text-muted">Vehicle</dt>
        <dd>{view.row.vehicle || '-'}</dd>
        <dt className="text-muted">Matched On</dt>
        <dd>{view.assignMethodLabel || '-'}</dd>
      </dl>
    </div>
  );
}
