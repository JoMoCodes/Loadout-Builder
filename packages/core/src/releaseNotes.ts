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
    version: '2.2.0',
    items: [
      'You can now open any page in a window of its own. Right-click a page in the left menu and choose Open in new window.',
      'The same works for tabs. Right-click a tab, such as Available Vans on the Load Out page, and choose Open in new window.',
      'Every window shows the same live data. Take a van off a driver in one window and the Available Vans list in another window changes straight away.',
      'Changing the text size, the colours or demo mode in one window changes it in every window.',
      'A window opened this way shows just that page, with no left menu. Its title says what it shows, like "Load Out · Available Vans".',
      'Right-click the same page or tab again and the window you already have comes to the front instead of a second one opening.',
      'Closing the main window closes the other windows with it.',
    ],
  },
  {
    version: '2.1.0',
    items: [
      'The Weekly Performance App is now part of Loadout Builder. You only need one app for the roster and for the weekly scorecards.',
      'There is a new Dashboard page. It shows how the drivers did this week, who needs a word, and whose ID runs out soon.',
      'Click How is this worked out? next to a number on the Dashboard to see where it comes from.',
      'There is a new Performance page with four tabs: Drivers, Reports, Directory and Imports.',
      'Drivers lists every driver with their scores. Double-click a driver to open their report.',
      'Tick drivers and click Generate for selected to save a PDF report for each one.',
      'Click Email selected to email each driver their report. The app shows who gets what before it sends anything.',
      'Emails go out from your Gmail address. Set it up once in Settings, under Weekly performance. Your Gmail app password is kept locked away on this computer.',
      "Reports lets you change the report colours and preview a driver's report before you send it.",
      "Directory shows every driver's email and phone numbers. Click a driver, then copy what you need.",
      'Imports has a card for each of the ten weekly files. Choose the folder for each one once.',
      'After that, click Sync now and the app brings in every new file. It also does this by itself each time it opens. You can turn that off.',
      'You can also drop the weekly files, or a whole folder, on the Imports tab.',
      'Used the old Weekly Performance App? The first time you open this version, it offers to bring its data over. Say Not now to do it later from Settings.',
      'Demo mode now has made-up weekly scorecards too, so you can practise the weekly reports safely.',
      'Home has a second checklist for the weekly routine. It ticks each step off by itself, like the first-day one.',
      'The Dashboard and each Performance tab have a short tour the first time you open them.',
      'How to use has a new Weekly performance part. It walks you through the week and says where to get each file.',
      'After you make reports or save the check file, click Show in folder to see where they went.',
      'While the app makes or emails reports, it counts up, like "Emailing 3 of 12", with a bar that fills up.',
      'The sample report on the Reports tab has Fit width, 100% and zoom buttons.',
      'Hid the weekly checklist? Click Help, then Show the weekly checklist again.',
      'Explain this score now shows every week. Pick a week, or look at the chart of points lost each week.',
      'Click a number in What changed since last week to see who moved tier or had new safety events. Click a name to jump to that driver.',
      'Email everyone shown emails every driver in the list. It shows who gets what first, like Email selected.',
    ],
  },
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
