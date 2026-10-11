// The verification export, ported from DataExporter.cs: the saved scorecards written back out
// with the scorecard file's own column names plus a "Source File" column, so it can be put next
// to the original files to check that every value came in as expected.
//
// Pure: returns the text. The caller saves it. It starts with a byte-order mark (U+FEFF) so
// Excel reads it as UTF-8; write the string as UTF-8 and the mark comes out as the old app's
// EF BB BF bytes. Lines end with CRLF, as the old CSV writer did.

import { METRIC_DEFINITIONS, type MetricEntry, type PerfData } from './models';
import { compareNoCase, compareOrdinal, formatNetRoundTrip, sortedBy } from './analysis/dotnet';

export const BYTE_ORDER_MARK = '﻿';

export interface VerificationExportOptions {
  /** Line ending. Default "\r\n" (what the old CSV writer used). */
  newline?: string;
}

export interface VerificationExport {
  /** The whole file, starting with the byte-order mark. */
  csv: string;
  driversExported: number;
  weeksExported: number;
  /** Data rows (one per driver and week). */
  rowsWritten: number;
}

/** The header row: the scorecard file's column names, after "Source File". */
export function verificationHeaders(): string[] {
  const headers = [
    'Source File',
    'Transporter ID',
    'Delivery Associate',
    'Week',
    'Overall Standing',
    'Overall Score',
    'Packages Delivered',
  ];
  for (const m of METRIC_DEFINITIONS) headers.push(m.valueCol, m.tierCol, m.scoreCol, m.weightCol);
  return headers;
}

/**
 * One field the way the old CSV writer (CsvHelper) wrote it: in quotes, with quotes doubled,
 * when it holds a comma, a quote or a line break, or starts or ends with a space.
 */
export function csvField(value: string, newline = '\r\n'): string {
  if (value === '') return value;
  const needsQuotes =
    value.startsWith(' ') ||
    value.endsWith(' ') ||
    value.includes('"') ||
    value.includes(',') ||
    (newline === '\r\n' ? /[\r\n]/.test(value) : value.includes(newline));
  return needsQuotes ? `"${value.replace(/"/g, '""')}"` : value;
}

function numberText(value: number | null): string {
  return value === null ? '' : formatNetRoundTrip(value);
}

/**
 * The verification CSV for the given drivers: one row per driver and week, every week on file,
 * sorted by name (SQLite's NOCASE order) then week. Drivers not on file are skipped.
 */
export function buildVerificationExport(
  data: PerfData,
  transporterIds: Iterable<string>,
  options: VerificationExportOptions = {},
): VerificationExport {
  const newline = options.newline ?? '\r\n';
  const ids = new Set(transporterIds);
  const drivers = sortedBy(
    data.drivers.filter((d) => ids.has(d.transporterId)),
    (a, b) => compareOrdinal(a.transporterId, b.transporterId),
  );

  // Drivers JOIN WeeklyScorecards ... ORDER BY d.Name COLLATE NOCASE, ws.Week
  const rows = sortedBy(
    drivers.flatMap((driver) =>
      data.scorecards
        .filter((card) => card.transporterId === driver.transporterId)
        .map((card) => ({ driver, card })),
    ),
    (a, b) =>
      compareNoCase(a.driver.name, b.driver.name) || compareOrdinal(a.card.week, b.card.week),
  );

  const cardIds = new Set(rows.map((row) => row.card.id));
  const metricsByCard = new Map<number, Map<string, MetricEntry>>();
  for (const metric of sortedBy(
    data.metrics.filter((m) => cardIds.has(m.scorecardId)),
    (a, b) => a.id - b.id,
  )) {
    let byName = metricsByCard.get(metric.scorecardId);
    if (!byName) metricsByCard.set(metric.scorecardId, (byName = new Map()));
    // The first entry of a name wins, as in the old code.
    if (!byName.has(metric.metricName)) byName.set(metric.metricName, metric);
  }

  const line = (fields: string[]): string =>
    fields.map((field) => csvField(field, newline)).join(',') + newline;

  let csv = BYTE_ORDER_MARK + line(verificationHeaders());
  for (const { driver, card } of rows) {
    const fields = [
      card.sourceFile ?? '(re-import to populate)',
      card.transporterId,
      driver.name,
      card.week,
      card.overallStanding ?? '',
      numberText(card.overallScore),
      numberText(card.packagesDelivered),
    ];
    const byName = metricsByCard.get(card.id);
    for (const m of METRIC_DEFINITIONS) {
      const entry = byName?.get(m.name);
      fields.push(
        entry?.metricValue ?? '',
        entry?.tier ?? '',
        numberText(entry?.score ?? null),
        numberText(entry?.weightApplied ?? null),
      );
    }
    csv += line(fields);
  }

  return {
    csv,
    driversExported: new Set(rows.map((row) => row.card.transporterId)).size,
    weeksExported: new Set(rows.map((row) => row.card.week)).size,
    rowsWritten: rows.length,
  };
}

/** Just the verification CSV text (see buildVerificationExport). */
export function verificationCsv(
  data: PerfData,
  transporterIds: Iterable<string>,
  options: VerificationExportOptions = {},
): string {
  return buildVerificationExport(data, transporterIds, options).csv;
}
