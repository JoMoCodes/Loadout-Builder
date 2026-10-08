// The day a DWP file is for, read off its name (port of date_from_name in the old dwp.py).
// Null means the name does not say, which is different from a failure: callers should say so
// rather than guess.

const NAME_MDY = /(?<!\d)(\d{1,2})[-_.](\d{1,2})[-_.](\d{4})(?!\d)/;
const NAME_YMD = /(?<!\d)(\d{4})[-_.](\d{1,2})[-_.](\d{1,2})(?!\d)/;

export function dateFromName(path: string): string | null {
  // Only the file name, without its folder or extension.
  const file = path.split(/[\\/]/).pop() ?? '';
  const dot = file.lastIndexOf('.');
  const stem = dot > 0 ? file.slice(0, dot) : file;

  let year: number;
  let month: number;
  let day: number;
  const ymd = NAME_YMD.exec(stem);
  if (ymd) {
    [year, month, day] = [Number(ymd[1]), Number(ymd[2]), Number(ymd[3])] as [
      number,
      number,
      number,
    ];
  } else {
    const mdy = NAME_MDY.exec(stem);
    if (!mdy) return null;
    [month, day, year] = [Number(mdy[1]), Number(mdy[2]), Number(mdy[3])] as [
      number,
      number,
      number,
    ];
  }
  // '13-40-2026' is a number, not a date.
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }
  const p = (n: number) => String(n).padStart(2, '0');
  return `${String(year).padStart(4, '0')}-${p(month)}-${p(day)}`;
}
