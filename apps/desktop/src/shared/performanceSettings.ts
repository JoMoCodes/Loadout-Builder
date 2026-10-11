// The weekly performance choices the app remembers between runs: the rule numbers behind the
// coaching and ID-expiry lists, the report colours, the email setup and what the Performance
// page was showing. They live in the app's one settings file, under `performance`.
//
// Two things are kept by the main process only and never reach a page: the folders each kind of
// export is brought in from (a page never names a place on the computer) and the email app
// password (kept sealed by the computer's own safe storage). See main/performance/.

/** Colours of the PDF report. Same names and defaults as the old app's PDF settings. */
export interface ReportColours {
  /** Off: the report prints in black and white. */
  useColor: boolean;
  platinumBackground: string;
  platinumForeground: string;
  goldBackground: string;
  goldForeground: string;
  silverBackground: string;
  silverForeground: string;
  bronzeBackground: string;
  bronzeForeground: string;
  headerBarBackground: string;
  headerBarForeground: string;
  tableBorderColor: string;
  podRejectBackground: string;
  podRejectForeground: string;
}

export const COLOUR_KEYS = [
  'platinumBackground',
  'platinumForeground',
  'goldBackground',
  'goldForeground',
  'silverBackground',
  'silverForeground',
  'bronzeBackground',
  'bronzeForeground',
  'headerBarBackground',
  'headerBarForeground',
  'tableBorderColor',
  'podRejectBackground',
  'podRejectForeground',
] as const satisfies readonly (keyof ReportColours)[];

export const DEFAULT_REPORT_COLOURS: ReportColours = {
  useColor: true,
  platinumBackground: '#81DBED',
  platinumForeground: '#000000',
  goldBackground: '#E9DE63',
  goldForeground: '#000000',
  silverBackground: '#D1D1D1',
  silverForeground: '#000000',
  bronzeBackground: '#AA4918',
  bronzeForeground: '#FFFFFF',
  headerBarBackground: '#E8E8E8',
  headerBarForeground: '#000000',
  tableBorderColor: '#8B8B8B',
  podRejectBackground: '#FECACA',
  podRejectForeground: '#991B1B',
};

/** How the reports are emailed. The app password is not here (see the top of this file). */
export interface EmailSettings {
  smtpHost: string;
  smtpPort: number;
  fromAddress: string;
  fromName: string;
  username: string;
  /** A hidden copy of every email to this address. Empty is off. */
  bccAddress: string;
  /** Placeholders: {name} {from} {to}. */
  subjectTemplate: string;
  bodyTemplate: string;
}

export const DEFAULT_EMAIL: EmailSettings = {
  smtpHost: 'smtp.gmail.com',
  smtpPort: 587,
  fromAddress: '',
  fromName: '',
  username: '',
  bccAddress: '',
  subjectTemplate: 'Your Weekly Performance Report ({from} – {to})',
  bodyTemplate:
    'Hi {name},\n\n' +
    'Attached is your delivery performance report for {from} to {to}.\n\n' +
    'Please review it and let us know if you have any questions.\n\n' +
    'Thank you,\nDSP Performance Team',
};

/** The week range the Performance page was showing. Null on both ends means "all weeks". */
export interface WeekRangeChoice {
  from: string | null;
  to: string | null;
}

export interface PerformanceSettings {
  /** Bring in new files from the remembered folders each time the app opens. */
  autoImportOnStartup: boolean;
  /** "Expiring soon" means within this many days. */
  complianceWindowDays: number;
  /** How many drivers the Dashboard lists as most improved and most declined. */
  topN: number;
  /** Flag a driver whose score fell this many weeks running. */
  atRiskDecliningWeeks: number;
  /** Flag a driver who failed the same category this many weeks running. */
  recurringCategoryWeeks: number;
  colours: ReportColours;
  email: EmailSettings;
  weekRange: WeekRangeChoice;
  /** The Drivers tab's filter chips, by name ("status:ACTIVE", "tier:Bronze"). */
  filters: string[];
  /** The Drivers tab's ticked drivers, by Transporter ID. */
  selected: string[];
}

export const DEFAULT_PERFORMANCE: PerformanceSettings = {
  autoImportOnStartup: true,
  complianceWindowDays: 30,
  topN: 5,
  atRiskDecliningWeeks: 3,
  recurringCategoryWeeks: 3,
  colours: DEFAULT_REPORT_COLOURS,
  email: DEFAULT_EMAIL,
  weekRange: { from: null, to: null },
  filters: ['status:ACTIVE'],
  selected: [],
};

const HEX = /^#[0-9A-Fa-f]{6}$/;
const WEEK = /^\d{4}-W\d{2}$/;
const FILTER = /^[a-z]+:[A-Za-z0-9 _-]{1,30}$/;
const TRANSPORTER_ID = /^[A-Za-z0-9]{1,20}$/;

function intIn(value: unknown, min: number, max: number): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
    ? value
    : undefined;
}

function textUpTo(value: unknown, max: number): string | undefined {
  return typeof value === 'string' && value.length <= max ? value : undefined;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function cleanList(value: unknown, max: number, shape: RegExp): string[] | undefined {
  if (!Array.isArray(value) || value.length > max) return undefined;
  const kept = value.filter((v): v is string => typeof v === 'string' && shape.test(v));
  // A list with anything odd in it is refused whole, rather than half kept.
  return kept.length === value.length ? [...new Set(kept)] : undefined;
}

/** Keeps only the valid fields of a performance patch, merged onto `current`. */
export function mergePerformance(current: PerformanceSettings, raw: unknown): PerformanceSettings {
  const input = record(raw);
  if (input === null) return current;
  const next: PerformanceSettings = {
    ...current,
    colours: { ...current.colours },
    email: { ...current.email },
    weekRange: { ...current.weekRange },
  };
  if (typeof input.autoImportOnStartup === 'boolean') {
    next.autoImportOnStartup = input.autoImportOnStartup;
  }
  next.complianceWindowDays =
    intIn(input.complianceWindowDays, 1, 365) ?? current.complianceWindowDays;
  next.topN = intIn(input.topN, 1, 50) ?? current.topN;
  next.atRiskDecliningWeeks =
    intIn(input.atRiskDecliningWeeks, 2, 26) ?? current.atRiskDecliningWeeks;
  next.recurringCategoryWeeks =
    intIn(input.recurringCategoryWeeks, 2, 26) ?? current.recurringCategoryWeeks;

  const colours = record(input.colours);
  if (colours) {
    if (typeof colours.useColor === 'boolean') next.colours.useColor = colours.useColor;
    for (const key of COLOUR_KEYS) {
      const value = colours[key];
      if (typeof value === 'string' && HEX.test(value)) next.colours[key] = value.toUpperCase();
    }
  }

  const email = record(input.email);
  if (email) {
    const e = next.email;
    e.smtpHost = textUpTo(email.smtpHost, 200)?.trim() ?? e.smtpHost;
    e.smtpPort = intIn(email.smtpPort, 1, 65535) ?? e.smtpPort;
    e.fromAddress = textUpTo(email.fromAddress, 200)?.trim() ?? e.fromAddress;
    e.fromName = textUpTo(email.fromName, 200) ?? e.fromName;
    e.username = textUpTo(email.username, 200)?.trim() ?? e.username;
    e.bccAddress = textUpTo(email.bccAddress, 200)?.trim() ?? e.bccAddress;
    e.subjectTemplate = textUpTo(email.subjectTemplate, 300) ?? e.subjectTemplate;
    e.bodyTemplate = textUpTo(email.bodyTemplate, 5000) ?? e.bodyTemplate;
  }

  const range = record(input.weekRange);
  if (range) {
    for (const end of ['from', 'to'] as const) {
      const value = range[end];
      if (value === null || (typeof value === 'string' && WEEK.test(value))) {
        next.weekRange[end] = value;
      }
    }
  }
  next.filters = cleanList(input.filters, 40, FILTER) ?? current.filters;
  next.selected = cleanList(input.selected, 2000, TRANSPORTER_ID) ?? current.selected;
  return next;
}

/** Fills {name}, {from} and {to} in an email subject or body. */
export function fillTemplate(
  template: string,
  values: { name: string; from: string; to: string },
): string {
  return template
    .replaceAll('{name}', values.name)
    .replaceAll('{from}', values.from)
    .replaceAll('{to}', values.to);
}
