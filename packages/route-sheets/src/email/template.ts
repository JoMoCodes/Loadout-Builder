// The wording of a route sheet email: the subject and the opening lines of the message, with
// placeholders filled from the sheet. The defaults reproduce the old app's fixed wording byte for
// byte (the parity tests prove it); anything else is what someone typed on the Route Sheets page.

/** The subject and the opening of the message. Placeholders: {name} {route} {date} {staging} {wave} {pad}. */
export interface RouteSheetWording {
  subjectTemplate: string;
  bodyTemplate: string;
}

/**
 * The old app's wording. Its subject only had the wave and the pad when the sheet had them, so
 * the default template names them all and the filler leaves out what is empty (see
 * fillRouteSheetTemplate). With these templates the output is exactly the old app's.
 */
export const DEFAULT_ROUTE_SHEET_WORDING: RouteSheetWording = {
  subjectTemplate: 'Route Sheet: {route} · {staging} · {date} · {wave} · Pad {pad}',
  bodyTemplate: 'Hi {name}, here is your route sheet for {date}.',
};

export const ROUTE_SHEET_PLACEHOLDERS = [
  'name',
  'route',
  'date',
  'staging',
  'wave',
  'pad',
] as const;
export type RouteSheetPlaceholder = (typeof ROUTE_SHEET_PLACEHOLDERS)[number];

/** What each placeholder becomes. An empty value takes its piece of the line with it. */
export type RouteSheetValues = Record<RouteSheetPlaceholder, string>;

const PLACEHOLDER = /\{(name|route|date|staging|wave|pad)\}/g;

/** The pieces of a line are separated by a middle dot with a space each side, as in the subject. */
const SEPARATOR = ' · ';

/**
 * Fills the placeholders in a subject or message.
 *
 * A placeholder with no value (no pad for this wave, no wave on the sheet, nobody to greet) does
 * not leave a hole behind: the piece of the line it sits in goes too. A piece is the text between
 * " · " separators, or the whole line when there are none. So "Route Sheet: {route} · {wave} ·
 * Pad {pad}" with no pad gives "Route Sheet: CX1 · 09:50 AM", and "Hi {name}, here is your route
 * sheet." with nobody to greet gives nothing at all. A line with no placeholder stays as typed, and
 * so does anything in braces that is not a placeholder.
 */
export function fillRouteSheetTemplate(template: string, values: RouteSheetValues): string {
  const lines = template.replace(/\r\n?/g, '\n').split('\n');
  const filled: string[] = [];
  for (const line of lines) {
    const pieces = line.split(SEPARATOR);
    const kept = pieces.filter((piece) => !hasEmptyPlaceholder(piece, values));
    // Every piece of the line was emptied: the line goes, rather than leaving a blank one.
    if (kept.length === 0 && pieces.some((piece) => hasPlaceholder(piece))) continue;
    filled.push(
      kept
        .map((piece) => piece.replace(PLACEHOLDER, (_, key: RouteSheetPlaceholder) => values[key]))
        .join(SEPARATOR),
    );
  }
  return filled.join('\n');
}

function hasPlaceholder(piece: string): boolean {
  return [...piece.matchAll(PLACEHOLDER)].length > 0;
}

function hasEmptyPlaceholder(piece: string, values: RouteSheetValues): boolean {
  for (const match of piece.matchAll(PLACEHOLDER)) {
    if (values[match[1] as RouteSheetPlaceholder] === '') return true;
  }
  return false;
}
