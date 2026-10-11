// The old app's report file name: "Name_ID_from_to_to.pdf".

// Characters Windows does not allow in a file name (Path.GetInvalidFileNameChars).
// eslint-disable-next-line no-control-regex
const INVALID = /[<>:"/\\|?*\u0000-\u001F]/g;

/**
 * The file name the old app gave a report. Like the old app, each character Windows does not
 * allow in the driver's name becomes "_"; the ID and weeks are used as they are, apart from
 * the same characters, so the result is always one safe file name.
 */
export function reportFileName(
  name: string,
  transporterId: string,
  from: string,
  to: string,
): string {
  const safe = (text: string) => text.replace(INVALID, '_');
  return `${safe(name)}_${safe(transporterId)}_${safe(from)}_to_${safe(to)}.pdf`;
}
