// What comes after a route file is brought in, wherever that happens (Import Route Data on the
// Roster, a new file on Route Sheets, or the buttons on a route file's own tab): saying who a
// shared route belongs to, and putting the dispatch times into PADs. Ported from the old app's
// RouteSourcePage.

import { dispatchTimes, routeDataDateLabel, sharedRows } from '@loadout/core';
import type { RouteKindName } from '../../../shared/channels/routeData';
import type { AppSnapshot, RouteSetView } from '../../../shared/snapshot';
import { call, explain } from '../../lib/channels';
import { readNow } from '../dataPages/bringIn';
import type { Messages } from '../dataPages/PageParts';
import type { Asker } from '../dataPages/useDialogs';
import { PadDialog } from './PadDialog';
import { SharedRouteDialog, type SharedRouteItem } from './SharedRouteDialog';
import { padsMessage } from './routeRows';

type Say = Pick<Messages, 'setStatus' | 'setProblem'>;

/** Asks who each shared route belongs to. The saved choices, or null if nothing was saved. */
export async function askShared(
  ask: Asker,
  say: Say,
  kind: RouteKindName,
  items: SharedRouteItem[],
  revision: number,
  current: RouteSetView,
) {
  const chosen = await ask<Map<number, string>>((done) => (
    <SharedRouteDialog sourceLabel={current.label} items={items} onDone={done} />
  ));
  if (chosen === null) return null;
  const choices = items
    .map(({ index }) => ({ rowIndex: index, transporterId: chosen.get(index) ?? '' }))
    .filter((choice) => choice.transporterId !== '');
  const reply = await call('routeData:set-route-drivers', { kind, revision, choices });
  if (!reply.ok) {
    say.setProblem({ title: 'That did not go through', message: explain(reply) });
    return null;
  }
  return choices;
}

/** Asks about every route that came through with more than one driver. */
export async function resolveShared(
  ask: Asker,
  say: Say,
  kind: RouteKindName,
  fresh: AppSnapshot,
  afterImport: boolean,
): Promise<void> {
  const current = fresh.routeSets.find((candidate) => candidate.kind === kind);
  if (!current) return;
  const shared = sharedRows(current);
  if (shared.length === 0) {
    if (!afterImport)
      say.setStatus(`No ${current.label} route came through with more than one driver.`);
    return;
  }
  const items = current.rows
    .map((entry, index) => ({ index, entry }))
    .filter(({ entry }) => shared.includes(entry));
  const saved = await askShared(ask, say, kind, items, fresh.revision, current);
  if (saved === null) {
    say.setStatus(
      `${shared.length} shared route(s) left as imported - right-click the Driver column on the ${current.label} tab to set them.`,
    );
    return;
  }
  say.setStatus(`Assigned ${shared.length} shared route(s) to one driver each.`);
}

/**
 * Puts the dispatch times into PADs. When the roster's route data came from this file, the new
 * PADs go onto the roster too. True when PADs were saved.
 */
export async function assignPads(
  ask: Asker,
  say: Say,
  kind: RouteKindName,
  options: { afterImport?: boolean; from?: AppSnapshot } = {},
): Promise<boolean> {
  const latest = options.from ?? (await readNow());
  const current = latest?.routeSets.find((candidate) => candidate.kind === kind);
  if (!latest || !current || current.rows.length === 0) {
    say.setStatus('Bring the file in with Import Route Data on the Roster first.');
    return false;
  }
  const chosen = await ask<Record<string, number>>((done) => (
    <PadDialog
      sourceLabel={current.label}
      dayLabel={routeDataDateLabel(current)}
      times={dispatchTimes(current)}
      current={current.pads}
      onDone={done}
    />
  ));
  if (chosen === null) {
    if (options.afterImport) {
      say.setStatus(
        `Imported ${current.rows.length} rows - no PADs assigned yet. Use 'Assign PADs' on the ${current.label} tab when you're ready.`,
      );
    }
    return false;
  }
  const reply = await call('routeData:set-pads', { kind, pads: chosen });
  if (!reply.ok) {
    say.setProblem({ title: 'That did not go through', message: explain(reply) });
    return false;
  }
  let words = padsMessage(current.label, current, chosen);
  // Straight after an import the roster takes the route data next, PADs and all.
  if (!options.afterImport && latest.roster.routeSource === kind && latest.roster.rows.length) {
    const again = await call('loadOut:bring-over-route-data', { kind });
    if (again.ok) words += ' The Roster has the new PADs too.';
  }
  say.setStatus(words);
  return true;
}
