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
    version: '2.9.0',
    items: [
      'On Scorecards, the Performance tab now has a Lifetime Routes column. It sits right after the Status column.',
      'It shows the same count as the Associates page. It is blank for a driver with no count yet.',
    ],
  },
  {
    version: '2.8.1',
    items: [
      'On Scorecards, the In latest scorecard chip now shows only the drivers who are on the newest scorecard of the weeks you chose. Before, it also showed drivers whose last scorecard was an older week. Pick Everyone to see those drivers too.',
    ],
  },
  {
    version: '2.8.0',
    items: [
      'The Dashboard has a Dashboard settings button next to its title. The rule numbers for its lists (the ID expiry warning, the weeks-running flags and how many movers to show) live there now.',
      'Settings is shorter: Colours, Text size, Your saved data, Email and About. Demo mode and the Help switches moved to the top of How to use.',
      'The first-day checklist is off the Home page. It shows at the top of How to use, under those two cards. Show it again from the Help card there or from the Help menu.',
      'The Bring over data from the old app buttons are gone from Settings. The app still offers to bring old data over the first time it opens with nothing saved.',
      'On Scorecards, the Performance tab starts on In latest scorecard (it used to be called Had a scorecard), so you see the drivers who were on the scorecards for the weeks you chose. Pick Everyone to see all of them. That choice is for this visit only; the status and tier chips are still remembered.',
    ],
  },
  {
    version: '2.7.0',
    items: [
      'Load Out has a new tab, Name and ID Links. It lists every driver you linked to an associate by hand, and who they are linked to.',
      "The list says whether each linked driver is on today's roster, and you can search it.",
      'Remove one link there to go back to automatic matching for that driver, or clear them all.',
    ],
  },
  {
    version: '2.6.0',
    items: [
      'The wording of the report emails is now behind a Settings button on the Scorecards page, on both the Performance and Reports tabs. The address and server stay in Settings.',
      'The route sheet emails have their own wording now. Click Settings on the Route Sheets page, Sheets tab, to change the subject and the message. Until you do, they read as they always have.',
      'On the Reports tab, Thresholds is at the top, and the colours card previews the real report of the driver you pick instead of a sample page. The sample page only shows when there is no driver to show.',
    ],
  },
  {
    version: '2.5.0',
    items: [
      'The Performance page is now called Scorecards. Its first tab is called Performance.',
      'The Directory tab is gone. The Associates page now has the Position column and the Copy email and Copy phone buttons, so everything about a driver is in one place.',
      'On Associates, right-click a driver to copy their email address or phone number. You can search by email or phone too.',
      'Previous Roster is no longer in the left menu. It is still a tab on the Load Out page, where you move the roster across.',
      'If the app remembered one of those pages, it opens the new place.',
    ],
  },
  {
    version: '2.4.0',
    items: [
      'You now bring in the driver list once, on the Associates page. The Performance page uses the same list.',
      'The Driver list card is gone from the Imports tab on the Performance page. The weekly checklist on Home sends you to Associates for it instead.',
      'Bringing in a new driver list no longer wipes the old one. New people are added, people in the file are updated, and anyone who is not in the file any more is kept and marked Offboarded.',
      'Drivers who leave stay on the list as Offboarded, so their old scorecards keep their names. Load Out never matches a name to an offboarded driver.',
      'The Associates page shows current drivers by default. Pick Offboarded or All statuses in the Status box to see everyone.',
      'After an import, the Associates page says how many were new, updated and offboarded.',
      'If you already had the driver list on the Performance page, those drivers are moved onto the Associates list the first time you open this version. Nothing is lost.',
    ],
  },
  {
    version: '2.3.0',
    items: [
      'Route Sheet Distributor is now part of Loadout Builder. You only need one app. You can uninstall the old one.',
      'There is a new Route Sheets page, right under Load Out in the left menu.',
      "Bring in the day's route sheet PDF. The app works out which driver each page belongs to, and shows you the email that driver will get.",
      "It uses the driver list from the Associates page and the Routes file from the Route Data page. They are the ones you already have, so you don't bring them in twice.",
      'The PAD for each route comes from Route Data too. If a time on the PDF is not on the Routes file, the page lets you type its PAD.',
      'The Distribute tab shows green, amber and red counts. Green is ready to send. Amber and red need you to choose.',
      'Click Accept all suggestions to take the little green Suggested pick for every route in one go.',
      'The Sheets tab shows the email each driver gets. Send it, copy it, open it as a draft, or mark it as sent.',
      'Click Email all to send every ready route sheet. The app asks first, and tells you how many went.',
      'Click Export all to save the emails and PDFs into a folder you pick.',
      'The History tab keeps each day for 30 days, so you can open an older day. Older days clear by themselves.',
      'Emails go out from the same Gmail address as the weekly reports. Set it up once in Settings, under Email.',
      'Used the old Route Sheet Distributor? Nothing is brought over. Put your Gmail app password in Settings, under Email, once.',
      'Home has a new last step, Send the route sheets. It ticks itself off when they are sent.',
      'The Route Sheets page has a short tour. How to use has a new part called Sending the route sheets.',
      'Demo mode has a made-up day of route sheets too, so you can practise safely.',
      'Hid the Home checklist before? Open How to use to bring it back and see the new step.',
    ],
  },
  {
    version: '2.2.1',
    items: [
      'Each window you open with Open in new window now remembers its size and place, so it opens the same way next time.',
      'A file or folder window now opens over the window you clicked in, not over the main window.',
    ],
  },
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
