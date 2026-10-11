// The report's style sheet: US Letter pages, the old report's sizes (10 pt text, 20 pt name,
// 13 pt section titles) and the table looks. Colours that come from the settings are put on
// each cell instead, so this text never changes.

export const REPORT_CSS = `
@page { size: Letter; margin: 0.55in 0.55in 0.6in 0.55in; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: #FFFFFF; color: #000000; }
body {
  font-family: Lato, "Segoe UI", Calibri, Arial, Helvetica, sans-serif;
  font-size: 10pt; line-height: 1.25;
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
.page + .page { break-before: page; }
table.frame { border-collapse: collapse; }
table.frame > thead > tr > td, table.frame > tbody > tr > td { padding: 0; vertical-align: top; }
table.frame > tbody > tr { break-inside: auto; }
.page-head { margin-bottom: 10pt; }
.page-head h1 { font-size: 20pt; font-weight: 700; margin: 0; line-height: 1.15; }
.page-head .sub { color: #616161; white-space: pre; }
.page-head .rule { border-top: 1px solid; margin-top: 8pt; }
h2 { font-size: 13pt; font-weight: 700; margin: 15pt 0 6pt; }
.page-head + h2 { margin-top: 0; }
h3 { font-size: 12pt; font-weight: 600; margin: 0 0 4pt; white-space: pre-wrap; }
p { margin: 0 0 6pt; }
.semi { font-weight: 600; }
.block { margin: 12pt 0 8pt; }
.legend .indent { padding-left: 15pt; }
.legend b { font-weight: 600; }
.two-lists { display: flex; gap: 12pt; padding-top: 8pt; }
.two-lists > div { flex: 1; }
.two-lists ul { list-style: none; margin: 0; padding-left: 10pt; }
.two-lists li { margin-bottom: 2pt; }
.chart-box svg { width: 100%; height: auto; display: block; }
.c-title { font-size: 14px; font-weight: 700; fill: #222; }
.c-axis { font-size: 13px; font-weight: 700; fill: #222; }
.c-tick { font-size: 10px; fill: #444; }
.c-label { font-size: 10px; font-weight: 700; fill: #222; }
.c-grid { stroke: #E3E3E3; stroke-width: 1; }
.c-frame { fill: none; stroke: #222; stroke-width: 1; }

table { width: 100%; table-layout: fixed; }
thead { display: table-header-group; }
tr { break-inside: avoid; }
table.grid { border-collapse: separate; border-spacing: 4px; margin: 0 -4px 8pt; width: calc(100% + 8px); }
table.grid th, table.grid td {
  border-style: solid; border-width: 0 0 1px 1px; padding: 3px;
  text-align: left; vertical-align: top; overflow-wrap: anywhere;
}
table.grid th { font-weight: 700; }
table.grid .lbl { border-left-width: 0; }
table.grid td.lbl .name { display: block; font-weight: 600; }
table.grid td.lbl .dir { display: block; font-size: 8pt; color: #757575; margin-top: 2pt; }
table.grid tr.metric td.lbl { font-weight: 600; }
table.grid tr.plain td { vertical-align: middle; }
table.grid tr.plain td.lbl { font-weight: 600; }
table.grid tr.tall td { height: 32pt; }
table.grid td.small { font-size: 9pt; }
table.grid td.bad, table.grid tr.emph td { font-weight: 700; }
table.incidents td.ev { font-size: 9pt; color: #374151; vertical-align: middle; }
table.incidents td.tracking { font-size: 8pt; color: #111827; }
table.incidents td.code { font-weight: 700; color: #111827; }

table.thresholds { border-collapse: collapse; }
table.thresholds col.c-name { width: 40%; }
table.thresholds col.c-weight { width: 60pt; }
table.thresholds th, table.thresholds td {
  padding: 4px; border-bottom: 1px solid #E0E0E0; text-align: center; white-space: pre-wrap;
}
table.thresholds th { background: #EEEEEE; font-weight: 600; }
table.thresholds .lbl { text-align: left; }

table.ref { border-collapse: collapse; margin-top: 8pt; }
table.ref th, table.ref td {
  border-style: solid; border-width: 0 0 1px 1px; padding: 4px;
  text-align: left; vertical-align: middle;
}
table.ref th:first-child, table.ref td:first-child { border-left-width: 0; }
table.ref th { font-weight: 700; }
table.ref td { font-size: 9pt; }
table.ref td:first-child { font-weight: 600; }
table.cdf-legend th:first-child { width: 31.8%; }
table.numbered th:first-child { width: 22pt; text-align: center; }
table.numbered td:first-child { text-align: center; }
table.numbered td:nth-child(2) { font-weight: 600; width: 28%; }
table.numbered td:nth-child(3) { font-size: 8pt; }
table.psb-legend th:nth-child(4) { width: 18%; }

.guide { display: flex; flex-direction: column; gap: 8pt; }
.guide h4.guide-title { text-align: center; font-size: 14pt; font-weight: 700; color: #B91C1C; margin: 6pt 0 0; }
.guide h5 { font-size: 12pt; font-weight: 600; margin: 4pt 0 0; padding-left: 10pt; }
.guide p { margin: 0; padding-left: 10pt; }
.guide .big { font-size: 11pt; }
.steps { display: flex; align-items: stretch; margin-left: 10pt; }
.step { flex: 1; padding: 6pt; font-size: 10pt; }
.step .stage { font-weight: 700; margin-bottom: 2pt; }
.steps-std .step { background: #DBEAFE; }
.steps-std .stage { color: #1E3A8A; }
.steps-alt .step { background: #FEE2E2; }
.steps-alt .stage { color: #991B1B; }
.arrow { width: 18pt; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 13pt; }
.closed { display: flex; gap: 10pt; margin-left: 10pt; font-size: 11pt; }
.criteria { flex: 1; background: #FEF3C7; padding: 8pt; }
.criteria > div { padding-left: 4pt; margin-bottom: 2pt; }
.criteria .criteria-title { font-weight: 700; color: #854D0E; padding-left: 0; }
.closed-notes { flex: 1; padding-top: 2pt; }
.closed-notes > div { margin-bottom: 4pt; }
.practices { padding-left: 10pt; font-size: 11pt; }
.practices > div { margin-bottom: 2pt; }
.qa { display: flex; border: 1px solid; margin-top: 6pt; }
.qa .q { flex: 1.4; background: #F3F4F6; padding: 8pt; font-weight: 600; font-size: 11pt; display: flex; align-items: center; }
.qa .a { flex: 3; padding: 8pt; font-size: 10pt; display: flex; align-items: center; }
h3.events-title { margin-top: 14pt; }
p.clean { font-style: italic; color: #15803D; margin-top: 8pt; }
`;
