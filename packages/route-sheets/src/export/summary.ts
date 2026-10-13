// The two summary files written beside the drafts when everything is exported.

import { esc } from '../email/render';
import type { Distribution } from '../matcher/distribute';

export const STATE_LABEL: Record<string, string> = {
  ready: 'Ready to send',
  'needs-decision': 'Needs your decision',
  exception: 'No exact match',
  'no-sheet': 'No route sheet',
  skipped: 'Not sending',
};

/** `runLabel` is the run's label text (see `runLabel` in the run rules). */
export function renderSummaryHtml(runLabel: string, dist: Distribution): string {
  const row = (cells: string[]): string => `<tr>${cells.map((c) => `<td>${c}</td>`).join('')}</tr>`;
  const routes = dist.routes
    .map((r) =>
      row([
        `<b>${esc(r.routeCode)}</b>`,
        esc(r.sheet?.staging || '—'),
        esc(r.sheet?.waveTime || '—'),
        esc(r.sheet?.pad || '—'),
        esc(r.sheet?.totalPackages ?? '—'),
        esc(
          r.listed
            .map((c) => `${c.rosterName || c.routesName} (${c.transporterId || 'no ID'})`)
            .join(', ') || '—',
        ),
        esc(
          r.recipients
            .map((p) => `${p.name}${p.email ? ` <${p.email}>` : ' (no email)'}`)
            .join(', ') || '—',
        ),
        `<span class="s ${r.state}">${STATE_LABEL[r.state]}</span>`,
        esc(
          r.state === 'ready'
            ? r.issues
                .filter((i) => i.level !== 'info')
                .map((i) => i.text)
                .join('; ')
            : r.headline,
        ),
      ]),
    )
    .join('');
  const missing = dist.people.notReceiving
    .map((p) =>
      row([
        esc(p.name),
        esc(p.transporterId || '—'),
        esc(p.routes.map((x) => x.routeCode).join(', ')),
        esc(p.routes.map((x) => x.reason).join('; ')),
      ]),
    )
    .join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Distribution summary</title><style>
body{font-family:Segoe UI,Arial,sans-serif;color:#1b2430;margin:24px}table{border-collapse:collapse;width:100%;margin:8px 0 24px}
td,th{border-bottom:1px solid #e3e7ec;padding:6px 8px;text-align:left;font-size:13px;vertical-align:top}th{background:#f3f5f8}
.s{padding:2px 8px;border-radius:10px;font-size:12px;white-space:nowrap}.ready{background:#e3f4e8;color:#1d6b35}.needs-decision{background:#fff2d6;color:#7a5100}
.exception,.no-sheet{background:#fde4e2;color:#9b1c14}.skipped{background:#eceff3;color:#505a66}</style></head><body>
<h1>Route sheet distribution — ${esc(runLabel)}</h1>
<p>${dist.counts.ready} ready · ${dist.counts['needs-decision']} need a decision · ${dist.counts.exception} no exact match · ${dist.counts['no-sheet']} no route sheet · ${dist.counts.skipped} not sending</p>
<h2>People who will not get a route sheet (${dist.people.notReceiving.length})</h2>
${missing ? `<table><tr><th>Name</th><th>Transporter ID</th><th>Route(s)</th><th>Why</th></tr>${missing}</table>` : '<p>Everyone listed on the routes file gets a route sheet.</p>'}
<h2>All routes</h2>
<table><tr><th>Route</th><th>Staging</th><th>Wave</th><th>Pad</th><th>Pkgs</th><th>Listed on routes file</th><th>Sending to</th><th>Status</th><th>Notes</th></tr>${routes}</table>
</body></html>`;
}

export function renderSummaryCsv(dist: Distribution): string {
  const q = (v: unknown): string => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [
    [
      'Route',
      'Staging',
      'Wave',
      'Pad',
      'Total Packages',
      'Listed Transporter IDs',
      'Recipient',
      'Recipient Transporter ID',
      'Recipient Email',
      'Status',
      'Reason',
    ]
      .map(q)
      .join(','),
  ];
  for (const r of dist.routes) {
    lines.push(
      [
        r.routeCode,
        r.sheet?.staging,
        r.sheet?.waveTime,
        r.sheet?.pad,
        r.sheet?.totalPackages,
        r.listed.map((c) => c.transporterId).join(' | '),
        r.recipients.map((p) => p.name).join(' | '),
        r.recipients.map((p) => p.transporterId).join(' | '),
        r.recipients.map((p) => p.email).join(' | '),
        STATE_LABEL[r.state],
        r.headline,
      ]
        .map(q)
        .join(','),
    );
  }
  return lines.join('\r\n');
}
