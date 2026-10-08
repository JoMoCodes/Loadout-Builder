// Parity harness, TypeScript half, for matching, links, tenure and bring-over: writes inputs,
// matching, links, previous, routes, dwp and rows for every fixture day into
// scripts/parity/actual/<day>/, shaped exactly as python_dump.py writes them (see CONTRACT.md).

import {
  AssociateIndex,
  ROUTE_SCHEDULE,
  daysUntilIdExpiry,
  driverKey,
  duplicateCodes,
  idState,
  isAmbiguous,
  isMatched,
  matchLabel,
  missingForShift,
  nameKey,
  needsReview,
  needsVan,
  normalizeName,
  routeApplySkipped,
  dwpSkipped,
  rosterDateLabel,
  sequenceRatio,
  tenureCount,
  tenureLabel,
  tenureRoutes,
  affinitySize,
  newestWeek,
  weekLabel,
  type AppState,
  type DwpApplyResult,
  type IsoDate,
  type Match,
} from '@loadout/core';
import {
  ASSOCIATES_FILE,
  DWP_FILES,
  MAIN_KIND,
  ROUTE_KINDS,
  TENURE_FILES,
  VEHICLES_FILE,
  assocRef,
  baseName,
  fresh,
  loadDays,
  readers,
  writeModule,
  type Ctx,
  type Day,
} from './harness';

// ------------------------------------------------------------------ modules

function inputsModule(ctx: Ctx) {
  const { state: st, day } = ctx;
  const sources: Record<string, unknown> = {};
  for (const kind of ROUTE_KINDS) {
    const data = st.routeSet(kind);
    const file = day.files[kind];
    sources[kind] = {
      day: data.day,
      file: file ? baseName(file) : null,
      pads: data.pads,
      row_count: data.rows.length,
      source_total: data.sourceTotal,
    };
  }
  return {
    affinity_slots_held: affinitySize(st.affinity),
    associates: {
      count: st.associates.rows.length,
      file: baseName(ASSOCIATES_FILE),
      with_tenure: tenureCount(st.associates),
    },
    driver_links: st.links.size,
    dwp: {
      day: st.dwp.day,
      file: day.files.dwp ? baseName(day.files.dwp) : null,
      row_count: st.dwp.rows.length,
    },
    lmr_approved: st.lmrApproved.size,
    loadout: {
      date: st.roster.loadOutDate,
      date_label: rosterDateLabel(st.roster),
      file: baseName(day.loadout),
      row_count: st.roster.rows.length,
    },
    previous_roster: {
      date: st.previousRoster.loadOutDate,
      row_count: st.previousRoster.rows.length,
    },
    print_layouts_saved: st.printPresets(),
    route_sources: sources,
    tenure: {
      files: TENURE_FILES.map(baseName),
      record_count: st.tenureBook.records.size,
    },
    today: day.date,
    vehicle_overrides: st.vehicleOverrides.size,
    vehicle_priorities: st.vehiclePriorities.size,
    vehicles: {
      count: st.vehicles.rows.length,
      file: baseName(VEHICLES_FILE),
      operational: st.operationalVehicles().length,
    },
  };
}

function matchRef(match: Match | null, name: string) {
  if (match === null) return null;
  let ratio: number | null = null;
  if (match.method === 'fuzzy' && match.associate !== null) {
    ratio = sequenceRatio(normalizeName(name), normalizeName(match.associate.name));
  }
  return {
    associate: assocRef(match.associate),
    candidates: match.candidates.map(assocRef),
    driver_name: match.driverName,
    fuzzy_ratio: ratio,
    is_ambiguous: isAmbiguous(match),
    label: matchLabel(match),
    matched: isMatched(match),
    method: match.method,
    needs_review: needsReview(match),
  };
}

function compareKey(a: readonly [string, string], b: readonly [string, string]): number {
  for (let i = 0; i < 2; i += 1) {
    const x = a[i] as string;
    const y = b[i] as string;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

function matchingSnapshot(st: AppState) {
  const rows = st.roster.rows.map((row, index) => ({
    driver: row.driver,
    index,
    key: driverKey(row.driver),
    match: matchRef(st.matchFor(row), row.driver),
    name_key: nameKey(row.driver),
  }));
  const book = AssociateIndex.build(st.associates.rows);
  return {
    associate_collisions: book
      .collisions()
      .sort((x, y) => compareKey(x[0], y[0]))
      .map(([key, group]) => ({ key, transporter_ids: group.map((a) => a.transporterId) })),
    associate_names: st.associates.rows.map((a) => ({
      name_key: nameKey(a.name),
      normalized: normalizeName(a.name),
      transporter_id: a.transporterId,
    })),
    matched_count: st.matchedCount(),
    review_count: st.reviewCount(),
    rostered_ids: st.rosteredIds(),
    rows,
    summary: st.matchSummary(),
  };
}

function linksSnapshot(st: AppState) {
  const rows = st.roster.rows.map((row, index) => {
    const key = driverKey(row.driver);
    const associate = st.associateFor(row);
    return {
      associate: assocRef(associate),
      driver: row.driver,
      index,
      key,
      link: st.links.get(key) ?? null,
      link_present: st.links.has(key),
      tenure: associate ? associate.tenure : null,
      tenure_label: associate ? tenureLabel(associate) : '',
      tenure_routes: associate ? tenureRoutes(associate) : 0,
    };
  });
  return { links: new Map(st.links), rows };
}

function tenureBookSnapshot(st: AppState) {
  const book = st.tenureBook;
  const records: Record<string, unknown> = {};
  for (const [id, r] of book.records)
    records[id] = { routes: r.routes, week: r.week, year: r.year };
  return {
    count: book.records.size,
    newest: newestWeek(book),
    records,
    week_label: weekLabel(book),
  };
}

function associatesSnapshot(st: AppState): Array<[string, string, string, string[]]> {
  return st.associates.rows.map((a) => [
    a.name,
    a.transporterId,
    a.position,
    [...a.qualifications],
  ]);
}

async function routeScenario(day: Day, kind: string, mode: 'by_time' | 'adopted') {
  const ctx = await fresh(day);
  try {
    const st = ctx.state;
    if (mode === 'adopted' && st.routeSet(ROUTE_SCHEDULE).rows.length === 0) {
      return { kind, mode, skipped: 'no weekly schedule for this day' };
    }
    let adopt: [number, number, number] | null = null;
    if (mode === 'adopted') {
      st.setPads(kind, new Map());
      adopt = st.adoptSchedulePads(kind);
    }
    const dataset = st.routeSet(kind);
    const beforeRows = st.roster.rows.length;
    const beforeAssociates = associatesSnapshot(st);
    const beforeLinks = new Map(st.links);
    const result = st.applyRouteData(kind);
    const afterAssociates = associatesSnapshot(st);
    const changed: unknown[] = [];
    beforeAssociates.forEach((old, index) => {
      const now = afterAssociates[index];
      if (now !== undefined && JSON.stringify(old) !== JSON.stringify(now)) {
        changed.push({ after: now, before: old, index });
      }
    });
    const linksAdded = new Map([...st.links].filter(([key]) => !beforeLinks.has(key)));
    return {
      adopt_result: adopt,
      associates_added: afterAssociates.slice(beforeAssociates.length),
      associates_changed: changed,
      entry_pads_after_adopt: adopt ? dataset.rows.map((e) => e.pad) : null,
      kind,
      links_added: linksAdded,
      mode,
      pads_set: dataset.pads,
      result: {
        added_drivers: result.addedDrivers,
        dispatch_times: result.dispatchTimes,
        duplicates: result.duplicates,
        filled: result.filled,
        kind: result.kind,
        needs_review: result.needsReview,
        no_associate: result.noAssociate,
        not_in_export: result.notInExport,
        pads: result.pads,
        route_codes: result.routeCodes,
        service_types: result.serviceTypes,
        skipped: routeApplySkipped(result),
      },
      roster_route_source: st.roster.routeSource,
      roster_rows_after: st.roster.rows.length,
      roster_rows_before: beforeRows,
      rows_after: st.roster.rows.map((row) => ({
        driver: row.driver,
        shift_type: row.shiftType,
        routes: row.routes,
        wave_time: row.waveTime,
        pad: row.pad,
        service_type: row.serviceType,
      })),
    };
  } finally {
    ctx.close();
  }
}

async function routesModule(day: Day) {
  const out: Record<string, unknown> = {};
  for (const kind of ROUTE_KINDS) {
    if (!day.files[kind]) {
      out[`${kind}/by_time`] = { kind, mode: 'by_time', skipped: 'no file for this day' };
      continue;
    }
    out[`${kind}/by_time`] = await routeScenario(day, kind, 'by_time');
    if (kind !== ROUTE_SCHEDULE) out[`${kind}/adopted`] = await routeScenario(day, kind, 'adopted');
  }
  return { scenarios: out };
}

function dwpSnapshot(st: AppState) {
  return { day_status: st.dwpDayStatus(), matched_count: st.dwpMatchedCount() };
}

function dwpResult(result: DwpApplyResult) {
  return {
    bags: result.bags,
    cleared: result.cleared,
    filled: result.filled,
    no_route_code: result.noRouteCode,
    not_in_sheet: result.notInSheet,
    ovs: result.ovs,
    skipped: dwpSkipped(result),
    staging: result.staging,
  };
}

function dwpRows(st: AppState) {
  return st.roster.rows.map((row) => ({
    driver: row.driver,
    routes: row.routes,
    staging_location: row.stagingLocation,
    bags: row.bags,
    ovs: row.ovs,
  }));
}

async function dwpModule(day: Day, main: AppState, pre: unknown, apply: unknown, post: unknown) {
  // The same apply on the roster exactly as the sheet was imported (its own Routes column only).
  let without: unknown;
  let ctx = await fresh(day);
  try {
    const st = ctx.state;
    const before = dwpSnapshot(st);
    const result = dwpResult(st.applyDwp());
    without = { before, result, rows_after: dwpRows(st) };
  } finally {
    ctx.close();
  }
  // This day's sheet, then another day's sheet over the top of it.
  const others = DWP_FILES.filter((path) => path !== day.files.dwp);
  let reapply: unknown;
  ctx = await fresh(day);
  try {
    const st = ctx.state;
    st.applyRouteData(MAIN_KIND);
    st.applyDwp();
    const sheet = st.importDwp(await readers.dwp(others[0] as string));
    const before = dwpSnapshot(st);
    const result = dwpResult(st.applyDwp());
    reapply = {
      before,
      file: baseName(others[0] as string),
      file_day: sheet.day,
      result,
      rows_after: dwpRows(st),
    };
  } finally {
    ctx.close();
  }
  const dataset = main.dwp;
  return {
    after_route_bring_over: {
      after: post,
      apply_result: apply,
      before: pre,
      rows_after: dwpRows(main),
    },
    dataset: {
      day: dataset.day,
      duplicate_codes: duplicateCodes(dataset),
      rows: dataset.rows.map((e) => ({
        bags: e.bags,
        ovs: e.ovs,
        route_code: e.routeCode,
        staging: e.staging,
      })),
    },
    on_imported_roster: without,
    reapply_other_sheet: reapply,
  };
}

function rowsModule(st: AppState, today: IsoDate) {
  const rows = st.roster.rows.map((row, index) => {
    const associate = st.associateFor(row);
    const match = st.matchFor(row);
    return {
      assign_method_label: st.assignMethodLabel(row),
      check_text: st.checkText(row, today),
      days_until_id_expiry: associate ? daysUntilIdExpiry(associate, today) : null,
      driver: row.driver,
      driver_issues: st.driverIssues(row, today),
      id_state: associate ? idState(associate, today) : null,
      index,
      match_method: match ? match.method : null,
      missing_for_shift: associate ? missingForShift(associate, row.shiftType) : [],
      needs_van: needsVan(row),
      van_badges: st.vanBadges(associate),
    };
  });
  return { rows, today };
}

// --------------------------------------------------------------------- main

/**
 * The main run up to van assignment (CONTRACT.md section 3): snapshots after import, route
 * bring-over, then DWP. Hands back the state as it stands before `assignVans`, for the van,
 * export and printing modules to carry on from.
 */
export async function mainRun(day: Day) {
  const ctx = await fresh(day);
  const st = ctx.state;
  const modules: Record<string, unknown> = { inputs: inputsModule(ctx) };

  const matchingAfterImport = matchingSnapshot(st);
  const linksAfterImport = linksSnapshot(st);
  const tenureBook = tenureBookSnapshot(st);
  const previousAfterImport = { previous_vans: st.previousVans() };

  st.applyRouteData(MAIN_KIND); // its numbers are in routes.json
  const matchingAfterBring = matchingSnapshot(st);
  const linksAfterBring = linksSnapshot(st);
  const previousAfterBring = { previous_vans: st.previousVans() };

  modules.matching = {
    after_import: matchingAfterImport,
    after_route_bring_over: matchingAfterBring,
  };
  modules.links = {
    after_import: linksAfterImport,
    after_route_bring_over: linksAfterBring,
    tenure_book: tenureBook,
  };
  const prev = st.previousRoster;
  modules.previous = {
    after_bring_over: previousAfterBring,
    after_import: previousAfterImport,
    previous_roster: {
      date: prev.loadOutDate,
      row_count: prev.rows.length,
      rows_with_vin: prev.rows.filter((r) => r.vin).length,
      route_source: prev.routeSource,
    },
  };

  const pre = dwpSnapshot(st);
  const applied = dwpResult(st.applyDwp());
  const post = dwpSnapshot(st);
  modules.dwp = await dwpModule(day, st, pre, applied, post);
  return { ctx, modules };
}

/** Write 2a's modules for every day. */
export default async function dump2a(days: Day[] = loadDays()): Promise<void> {
  for (const day of days) {
    const { ctx, modules } = await mainRun(day);
    try {
      ctx.state.assignVans();
      modules.rows = rowsModule(ctx.state, day.date);
    } finally {
      ctx.close();
    }
    modules.routes = await routesModule(day);
    for (const [name, payload] of Object.entries(modules)) writeModule(day, name, payload);
  }
}
