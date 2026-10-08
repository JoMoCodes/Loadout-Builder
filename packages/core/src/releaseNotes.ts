// "What's new" notes, shown once after the app updates and on the Features log page.
//
// Add an entry at the top for every release, newest first. Write them like you are
// explaining to a five-year-old: plain words, short sentences, no code or file names
// (see CLAUDE.md). The test fails if the newest note does not match the app's version.

export interface ReleaseNote {
  version: string;
  items: string[];
}

export const RELEASE_NOTES: readonly ReleaseNote[] = [
  {
    version: '2.0.0',
    items: [
      'This is the first version of the new Loadout Builder. It builds your daily roster, gives each driver a van, and prints the sheets you hand out.',
      'Used the old Loadout Builder? The first time you open this one, it offers to bring your old drivers, vans and saved layouts over. Say Not now to do it later from Settings.',
      'The app has a new icon, and it shows as Loadout Builder in the Start menu.',
      "You can hide columns you don't need in any table. Right-click a heading to hide or show columns. Which columns you hid is kept on this computer only.",
      'You can drag a file from your computer and drop it on the page that uses it. For example, drop the load-out sheet on the Roster tab.',
      'The page lights up when it can take the file. If the file is the wrong kind, the app tells you what it should be.',
      'Ctrl+O brings in a load-out sheet and Ctrl+I brings in the driver list, from any page.',
      'Ctrl+P on the Load Out page prints the roster.',
      'The app now asks before it clears all the vans, takes a van off one driver, or replaces vans you gave by hand.',
      'When the app asks before clearing something, No is picked to start with. Pressing Enter will not clear anything by accident.',
      'The Lifetime Routes tab has a new Clear Lifetime Routes button. It asks first.',
      'Home has a checklist for your first day. It shows the five steps and ticks each one off by itself when it is done.',
      'Each step on the checklist has a button that does it, and a ? that shows where to download the file.',
      'The checklist hides itself when every step is done. To see it again, open How to use and click Show the checklist again.',
      'Want to practise first? Click Try it with made-up data on the checklist.',
      'Each page shows a short tour of its buttons the first time you open it. Press Esc to skip it.',
      'Click Help at the top of the window to take a page tour again, or to open How to use.',
      'How to use now walks you through a normal day, says what the colours mean, and helps when something goes wrong.',
      'Ask a question on How to use opens the help forum. Describe the problem in words. Never post a roster, a screenshot or driver names: anyone can read the forum.',
    ],
  },
];

/** Compares "1.2.3" style versions: negative if a < b, 0 if equal, positive if a > b. */
export function compareVersions(a: string, b: string): number {
  const parts = (version: string): number[] =>
    String(version)
      .split('-')[0]!
      .split('.')
      .map((n) => Number.parseInt(n, 10) || 0);
  const pa = parts(a);
  const pb = parts(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const difference = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (difference) return difference;
  }
  return 0;
}

/** Notes for versions after `fromVersion` up to and including `toVersion`, newest first. */
export function notesBetween(
  fromVersion: string,
  toVersion: string,
  notes: readonly ReleaseNote[] = RELEASE_NOTES,
): ReleaseNote[] {
  return notes.filter(
    (note) =>
      compareVersions(note.version, fromVersion) > 0 &&
      compareVersions(note.version, toVersion) <= 0,
  );
}
