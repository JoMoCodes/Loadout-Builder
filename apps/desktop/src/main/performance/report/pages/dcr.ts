// The two DCR pages: the reference guide (exemptions, best practices, the RTS question), then
// the DCR thresholds, the weekly summary table and the list of returns that counted.

import type { DcrWeekTotals } from '@loadout/performance';
import type { Palette } from '../colours';
import { esc, formatN0, shortDate, shortWeek } from '../format';
import type { ReportModel } from '../model';
import {
  directionOf,
  metricCells,
  metricRow,
  metricThresholds,
  plainRow,
  weekTable,
} from '../tables';

function steps(items: readonly (readonly [string, string])[], kind: 'std' | 'alt'): string {
  return (
    `<div class="steps steps-${kind}">` +
    items
      .map(
        ([stage, action], i) =>
          `<div class="step"><div class="stage">${esc(stage)}</div><div>${esc(action)}</div></div>` +
          (i < items.length - 1 ? '<div class="arrow">→</div>' : ''),
      )
      .join('') +
    '</div>'
  );
}

/** Page 7: the DCR reference guide (fixed text). */
export function dcrGuidePage(p: Palette): string {
  return (
    '<div class="guide">' +
    '<h4 class="guide-title">1. Exemptions for Delivery Completion</h4>' +
    '<h5>A. Successful CONTACT COMPLIANCE</h5>' +
    '<p><b>NOTE: </b><i>Never "Select All" and mark packages UTA, UTL, NSL, Unsafe due to dog, or Customer Unavailable — this generates a CC miss on all TBAs and impacts DCR.</i></p>' +
    '<p class="big"><b>Eligible Conditions: </b>1. Unable to Access  •  2. Unable to Locate  •  3. No Safe Location  •  4. Unsafe due to Dog Bite  •  5. Customer Unavailable</p>' +
    '<p class="big semi">Standard Workflow</p>' +
    steps(
      [
        ['IF', 'Eligible condition met'],
        ['THEN', 'Call customer, wait 3+ rings'],
        ['THEN', 'Text customer'],
        ['✓', 'Removed from DCR'],
      ],
      'std',
    ) +
    '<p class="big semi">Alternative — no phone, disconnected, or LAN line</p>' +
    steps(
      [
        ['IF', 'Eligible condition met'],
        ['THEN', 'Text OR Call Driver Support'],
        ['THEN', 'Confirm TBA was Marked Correctly'],
        ['✓', 'Removed from DCR'],
      ],
      'alt',
    ) +
    '<h5>B. Successful BUSINESS CLOSED Protocol</h5>' +
    '<div class="closed"><div class="criteria">' +
    '<div class="criteria-title">Four Criteria to Meet</div>' +
    '<div>1. DA within the Geofence</div>' +
    '<div>2. DA arrives within posted business hours</div>' +
    '<div>3. 30 seconds lapse between package scan &amp; swipe to finish</div>' +
    '<div>4. DA marks package "Business Closed"</div>' +
    '</div><div class="closed-notes">' +
    '<div>• Verify business hours are accurate; update in In-App Defects or GeoStudio.</div>' +
    '<div>• DA Controllables: Route Adherence, Pacing (arrival prior to business hours).</div>' +
    '</div></div>' +
    '<h4 class="guide-title">2. Best Practices for Delivery Completion</h4>' +
    '<div class="practices">' +
    '<div>• Reattempt again at end of route prior to RTS.</div>' +
    '<div>• Attempt every package at least once — none left "in-transit" or "up next".</div>' +
    '<div>• Reattempt packages found on the van that were previously marked missing (via Itinerary &amp; troubleshoot).</div>' +
    '</div>' +
    `<div class="qa" style="border-color:${esc(p.border)}">` +
    '<div class="q">Why are packages showing in the RTS Dashboard as "No RTS Code Selected"?</div>' +
    '<div class="a">When a DA does not select an RTS code while returning packages to the station, neither Amazon nor the customer receives detail on why the package was unable to be delivered. Packages returned to station without an RTS code count as a DCR defect by default.</div>' +
    '</div></div>'
  );
}

function totalRow(
  label: string,
  weeks: readonly string[],
  totals: ReadonlyMap<string, DcrWeekTotals>,
  pick: (t: DcrWeekTotals) => number | null,
  p: Palette,
): string {
  return plainRow(
    label,
    weeks.map((w) => {
      const t = totals.get(w.toUpperCase());
      if (!t) return '—';
      const v = pick(t);
      return v === null ? '—' : formatN0(v);
    }),
    {},
    p,
  );
}

/** Page 8: DCR thresholds, the weekly summary and the returns that counted. */
export function dcrPage(model: ReportModel, p: Palette): string {
  const weeks = model.weeks;
  const counts = new Map<string, { total: number; y: number }>();
  for (const e of model.dcrEvents) {
    const key = e.week.toUpperCase();
    const c = counts.get(key) ?? { total: 0, y: 0 };
    c.total++;
    if (e.impactsDcr) c.y++;
    counts.set(key, c);
  }
  const totals = new Map<string, DcrWeekTotals>();
  for (const t of model.dcrTotals) {
    if (!totals.has(t.week.toUpperCase())) totals.set(t.week.toUpperCase(), t);
  }

  const rows =
    metricRow('Delivery Completion DPMO', directionOf('DCR'), metricCells(model, 'DCR'), p) +
    plainRow(
      'Total RTS Events',
      weeks.map((w) => String(counts.get(w.toUpperCase())?.total ?? 0)),
      {},
      p,
    ) +
    plainRow(
      'Impact DC DPMO (Y)',
      weeks.map((w) => String(counts.get(w.toUpperCase())?.y ?? 0)),
      { reject: true },
      p,
    ) +
    totalRow('Packages Dispatched', weeks, totals, (t) => t.packagesDispatched, p) +
    totalRow('Packages Delivered', weeks, totals, (t) => t.packagesDelivered, p) +
    totalRow('Packages Returned to Station', weeks, totals, (t) => t.packagesReturnedToStation, p) +
    totalRow(
      'Packages Returned to Station - DA Controllable',
      weeks,
      totals,
      (t) => t.packagesReturnedToStationDaControllable,
      p,
    ) +
    totalRow('Rescued Packages', weeks, totals, (t) => t.rescuedPackages, p) +
    totalRow('RTS All Exempted', weeks, totals, (t) => t.rtsAllExempted, p);

  const yEvents = model.dcrEvents.filter((e) => e.impactsDcr);
  let list: string;
  if (yEvents.length === 0) {
    list = '<p class="clean">No DC DPMO-impacting events in this range. Great work.</p>';
  } else {
    const head = `background:${esc(p.headerBackground)};color:${esc(p.headerForeground)};border-color:${esc(p.border)}`;
    const border = `border-color:${esc(p.border)}`;
    list =
      '<table class="grid incidents"><colgroup><col style="width:8.11%"><col style="width:10.81%"><col style="width:22.97%"><col style="width:24.32%"><col style="width:33.78%"></colgroup>' +
      '<thead><tr>' +
      ['Week', 'Date', 'Tracking ID', 'RTS Code', 'Notes']
        .map((h, i) => `<th class="${i === 0 ? 'lbl' : ''}" style="${head}">${h}</th>`)
        .join('') +
      '</tr></thead><tbody>' +
      yEvents
        .map((e) => {
          const notes =
            e.additionalInformation.trim() !== ''
              ? e.additionalInformation
              : e.exemptionReason.trim() === ''
                ? '—'
                : e.exemptionReason;
          return (
            '<tr>' +
            `<td class="lbl ev" style="${border}">${esc(shortWeek(e.week))}</td>` +
            `<td class="ev" style="${border}">${esc(shortDate(e.plannedDeliveryDate))}</td>` +
            `<td class="ev tracking" style="${border}">${esc(e.trackingId)}</td>` +
            `<td class="ev code" style="${border}">${esc(e.rtsCode)}</td>` +
            `<td class="ev" style="${border}">${esc(notes)}</td>` +
            '</tr>'
          );
        })
        .join('') +
      '</tbody></table>';
  }

  return (
    metricThresholds(model.thresholds, 'DCR', p) +
    weekTable('Week', weeks, rows, p) +
    `<h3 class="events-title">Impact DC DPMO = Y Events  (${yEvents.length} total)</h3>` +
    list
  );
}
