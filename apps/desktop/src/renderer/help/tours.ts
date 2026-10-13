// The short tour of each page: a few tooltips over the real buttons, in plain words.
// Each step points at something on the page by a CSS selector. A step whose thing is not on the
// screen (for example a table with nothing in it) is left out when the tour starts.
//
// Tour names are stored in the settings once a tour has run, so they must stay the same.

import type { PageId } from '../pages/types';

export interface TourStep {
  /** What to point at. Left out: the tooltip sits in the middle of the window. */
  element?: string;
  title: string;
  text: string;
  side?: 'top' | 'right' | 'bottom' | 'left';
}

export interface Tour {
  name: string;
  /** The name people see in the Help menu ("Load Out: Print tab"). */
  label: string;
  steps: TourStep[];
}

const LOAD_OUT = '[data-page="load-out"]';
const ROUTE_DATA = '[data-page="route-data"]';
const VEHICLE_DATA = '[data-page="vehicle-data"]';
const ASSOCIATES = '[data-page="associates"]';
const ROUTE_SHEETS = '[data-page="route-sheets"]';
const SETTINGS = '[data-page="settings"]';
const PERF = '[data-page="performance"]';
const DASHBOARD = '[data-page="dashboard"]';

export const TOURS: Record<string, Tour> = {
  home: {
    name: 'home',
    label: 'Home',
    steps: [
      {
        element: 'nav.sidebar',
        title: 'The pages',
        text: 'Each page in this menu does one job. Most days you only need Load Out.',
        side: 'right',
      },
      {
        element: '[data-testid="first-run-checklist"]',
        title: 'Your first day, step by step',
        text: 'This list shows the six things to do. Each step ticks itself off when it is done.',
        side: 'left',
      },
      {
        element: '[data-testid="first-run-checklist"] [data-step-current="true"] [data-step-do]',
        title: 'Do the next step',
        text: 'This button takes you to the right page and starts the step. The ? next to it shows where to get the file.',
        side: 'left',
      },
      {
        element: '[data-testid="weekly-checklist"]',
        title: 'Your weekly performance',
        text: 'Once a week, this list walks you through the scorecards and the driver reports, step by step.',
        side: 'left',
      },
      {
        element: '[data-testid="help-menu"]',
        title: 'Help is always here',
        text: 'Click Help to see this tour again, or to open How to use.',
        side: 'bottom',
      },
      {
        element: '.text-size',
        title: 'Text too small?',
        text: 'Use A- and A+ to make the text smaller or bigger.',
        side: 'bottom',
      },
    ],
  },

  'load-out-roster': {
    name: 'load-out-roster',
    label: 'Load Out: Roster tab',
    steps: [
      {
        element: `${LOAD_OUT} [role="tablist"]`,
        title: 'Four tabs',
        text: "Roster is today's drivers. Print makes the sheet you hand out. Available Vans shows the vans nobody has. Previous Roster is the last one you kept.",
        side: 'bottom',
      },
      {
        element: `${LOAD_OUT} [data-action="import-sheet"]`,
        title: 'Start here every day',
        text: "Click Import Sheet and pick today's load-out sheet. You can also press Ctrl+O, or drop the file on this tab.",
        side: 'bottom',
      },
      {
        element: `${LOAD_OUT} [data-action="bring-over-route-data"]`,
        title: 'Then bring over route data',
        text: 'This adds wave times, PADs and route codes from the Route Data page. It brings over the DWP numbers too, if you loaded the DWP sheet.',
        side: 'bottom',
      },
      {
        element: `${LOAD_OUT} [data-action="assign-vans"]`,
        title: 'Give out the vans',
        text: 'Assign Vans gives each driver a van they are qualified for. A window then shows who got which van, and who did not and why.',
        side: 'bottom',
      },
      {
        element: `${LOAD_OUT} [role="columnheader"][data-col-id="check"]`,
        title: 'Look at the Check column',
        text: 'OK means all is well. Amber is a warning, like an ID that runs out soon. Red needs you before the driver goes out.',
        side: 'bottom',
      },
      {
        element: `${LOAD_OUT} [data-testid="data-grid"]`,
        title: 'Change things by hand',
        text: 'Right-click a driver to link them to the right person, or to give, take or swap a van.',
        side: 'top',
      },
    ],
  },

  'load-out-print': {
    name: 'load-out-print',
    label: 'Load Out: Print tab',
    steps: [
      {
        element: `${LOAD_OUT} [data-testid="print-page"]`,
        title: 'Print the roster',
        text: 'Print Page saves the sheet as a PDF. Open it and print it, or tick "Open it when saved" to open it straight away.',
        side: 'bottom',
      },
      {
        element: `${LOAD_OUT} [data-testid="print-vans"]`,
        title: 'Only the drivers with vans',
        text: 'Print Vans makes the same sheet with only the drivers who have a van. Ctrl+P on Load Out does Print Page.',
        side: 'bottom',
      },
      {
        element: `${LOAD_OUT} [data-testid="print-columns"]`,
        title: 'Choose the columns',
        text: 'Add, remove and move the columns the sheet shows. The picture of the sheet changes as you go.',
        side: 'right',
      },
      {
        element: `${LOAD_OUT} [data-testid="print-who"]`,
        title: 'Choose who is on it',
        text: 'Untick a driver or a shift type to leave them off the sheet.',
        side: 'left',
      },
      {
        element: `${LOAD_OUT} [data-testid="print-preset"]`,
        title: 'Keep a layout',
        text: 'Happy with the sheet? Click Save As to keep the layout under a name for next time.',
        side: 'bottom',
      },
    ],
  },

  'load-out-available-vans': {
    name: 'load-out-available-vans',
    label: 'Load Out: Available Vans tab',
    steps: [
      {
        element: `${LOAD_OUT} [data-testid="available-count"]`,
        title: 'Vans nobody has',
        text: 'These are the vans in service that no driver on the roster has. The list changes by itself as vans are given out.',
        side: 'bottom',
      },
      {
        element: `${LOAD_OUT} [data-testid="service-filter"]`,
        title: 'Narrow the list',
        text: 'Show only one kind of route or one kind of van.',
        side: 'bottom',
      },
      {
        element: `${LOAD_OUT} [data-testid="data-grid"]`,
        title: 'Manual vans',
        text: 'A van marked Manual is never given out by Assign Vans. Give it to a driver by hand on the Roster tab.',
        side: 'top',
      },
    ],
  },

  'load-out-previous-roster': {
    name: 'load-out-previous-roster',
    label: 'Load Out: Previous Roster tab',
    steps: [
      {
        element: `${LOAD_OUT} [data-testid="previous-roster-count"]`,
        title: 'The last roster you kept',
        text: 'Drivers who had a van last time get the same van back when you click Assign Vans.',
        side: 'bottom',
      },
      {
        element: `${LOAD_OUT} [data-testid="clear-previous-roster"]`,
        title: 'Start fresh',
        text: 'Clear Previous Roster forgets it. Keep a new one with Move Data to Previous Roster on the Roster tab.',
        side: 'bottom',
      },
      {
        element: `${LOAD_OUT} [data-testid="data-grid"]`,
        title: 'Who had which van',
        text: 'Each row is a driver from the last roster, with the van they had.',
        side: 'top',
      },
    ],
  },

  'previous-roster': {
    name: 'previous-roster',
    label: 'Previous Roster',
    steps: [
      {
        element: '[data-page="previous-roster"] [data-testid="previous-roster-count"]',
        title: 'The last roster you kept',
        text: 'Drivers who had a van last time get the same van back when you click Assign Vans.',
        side: 'bottom',
      },
      {
        element: '[data-page="previous-roster"] [data-testid="clear-previous-roster"]',
        title: 'Start fresh',
        text: 'Clear Previous Roster forgets it. Keep a new one with Move Data to Previous Roster on the Load Out page.',
        side: 'bottom',
      },
      {
        element: '[data-page="previous-roster"] [data-testid="data-grid"]',
        title: 'Who had which van',
        text: 'Each row is a driver from the last roster, with the van they had.',
        side: 'top',
      },
    ],
  },

  'route-data': {
    name: 'route-data',
    label: 'Route Data',
    steps: [
      {
        element: `${ROUTE_DATA} [role="tablist"]`,
        title: 'One tab for each file',
        text: 'Routes, Itineraries and Weekly Schedule say when each driver leaves. Any one of them is enough. DWP has the bags, OVS and staging.',
        side: 'bottom',
      },
      {
        element: `${ROUTE_DATA} [data-testid="import-routes"]`,
        title: 'Bring in a file',
        text: 'Click Import and pick the file you downloaded. You can also drop the file on this tab.',
        side: 'bottom',
      },
      {
        element: `${ROUTE_DATA} [data-testid="assign-pads-routes"]`,
        title: 'Put each wave on a PAD',
        text: 'Assign PADs asks which PAD each dispatch time goes to. The app never guesses this.',
        side: 'bottom',
      },
      {
        element: `${ROUTE_DATA} [data-testid="route-data-tab-dwp"]`,
        title: 'The DWP sheet',
        text: 'Bring in the DWP sheet here. Check it is for the same day as the roster: the app warns you if it is not.',
        side: 'bottom',
      },
      {
        title: 'Then go to Load Out',
        text: 'Click Bring Over Route Data on the Load Out page. That puts the times, PADs and DWP numbers on the roster.',
      },
    ],
  },

  'route-sheets': {
    name: 'route-sheets',
    label: 'Route Sheets',
    steps: [
      {
        element: `${ROUTE_SHEETS} [data-testid="route-sheets-top"]`,
        title: 'What the app reads',
        text: 'These cards show the route data, driver list and email setup in use. They come from Route Data, Associates and Settings.',
        side: 'bottom',
      },
      {
        element: `${ROUTE_SHEETS} [data-testid="route-sheets-bring-in"]`,
        title: 'Bring in the PDF',
        text: 'Click here and pick the route sheet PDF, or drop it on the page. The ? next to it shows where to download it.',
        side: 'bottom',
      },
      {
        element: `${ROUTE_SHEETS} [role="group"][aria-label="Route sheet counts"]`,
        title: 'The counts',
        text: 'Green are ready to send. Amber need your decision. Red have no exact match, or no page in the PDF.',
        side: 'bottom',
      },
      {
        element: `${ROUTE_SHEETS} [data-testid="route-sheets-accept-suggestions"]`,
        title: 'Choose who gets a route sheet',
        text: "When a route lists more than one driver, choose one. Accept all suggestions takes the app's best guess for each.",
        side: 'bottom',
      },
      {
        element: `${ROUTE_SHEETS} [data-testid="route-sheets-tab-sheets"]`,
        title: 'Check it, then send it',
        text: 'Pick a route on the Sheets tab to see its email. Send email, Copy or Open email draft, then Mark as sent. Email all and Export all do every ready one.',
        side: 'bottom',
      },
      {
        element: `${ROUTE_SHEETS} [data-testid="route-sheets-tab-history"]`,
        title: "Yesterday's work",
        text: 'History keeps each day for 30 days. Click Open to go back to one, or New run to start fresh.',
        side: 'bottom',
      },
    ],
  },

  'vehicle-data': {
    name: 'vehicle-data',
    label: 'Vehicle Data',
    steps: [
      {
        element: `${VEHICLE_DATA} [data-testid="import-vehicles"]`,
        title: 'Bring in your vans',
        text: 'Click Import Vehicles and pick the vehicle file. Do it again when vans come or go.',
        side: 'bottom',
      },
      {
        element: `${VEHICLE_DATA} [data-testid="ground-return"]`,
        title: 'Van in the shop?',
        text: 'Tick a van, then click Ground / Return. A grounded van is never given out. It stays grounded when you bring in a new vehicle file.',
        side: 'bottom',
      },
      {
        element: `${VEHICLE_DATA} [data-testid="set-priority"]`,
        title: 'Best vans first',
        text: 'Give a van a higher number to give it to your most experienced drivers first.',
        side: 'bottom',
      },
      {
        element: `${VEHICLE_DATA} [data-testid="vehicle-data-tab-affinity"]`,
        title: 'Who drives which van',
        text: "On Van Affinity, set each van's usual drivers. Assign Vans tries them first.",
        side: 'bottom',
      },
      {
        element: `${VEHICLE_DATA} [data-testid="vehicle-data-tab-lmr"]`,
        title: 'Rental vans',
        text: 'Only drivers ticked on LMR Approved Drivers are given a rental van.',
        side: 'bottom',
      },
    ],
  },

  associates: {
    name: 'associates',
    label: 'Associates',
    steps: [
      {
        element: `${ASSOCIATES} [data-testid="import-associates"]`,
        title: 'Bring in your driver list',
        text: 'Click Import Associates and pick the associate file. Do it again when someone starts or leaves.',
        side: 'bottom',
      },
      {
        element: `${ASSOCIATES} [data-testid="import-tenure"]`,
        title: 'How many routes each driver has done',
        text: 'Import Tenure reads the tenure file. Drivers with more routes get first pick of the best vans.',
        side: 'bottom',
      },
      {
        element: `${ASSOCIATES} [aria-label="Search this table"]`,
        title: 'Find someone',
        text: 'Type a name or ID to find a driver. Their van skills and ID expiry date are in the table.',
        side: 'bottom',
      },
      {
        element: `${ASSOCIATES} [data-testid="associates-tab-lifetime-routes"]`,
        title: 'Lifetime Routes',
        text: 'This tab lists the route count for each driver.',
        side: 'bottom',
      },
    ],
  },

  'performance-drivers': {
    name: 'performance-drivers',
    label: 'Performance: Drivers tab',
    steps: [
      {
        element: `${PERF} [role="tablist"]`,
        title: 'Four tabs',
        text: 'Drivers lists everyone and makes the reports. Reports sets how they look. Directory has phone numbers and emails. Imports brings in the weekly files.',
        side: 'bottom',
      },
      {
        element: `${PERF} [data-testid="perf-week-range"]`,
        title: 'Pick the weeks',
        text: 'The scores and the reports cover these weeks. Click a quick pick, or choose the first and last week.',
        side: 'bottom',
      },
      {
        element: `${PERF} [role="group"][aria-label="Show only"]`,
        title: 'Narrow the list',
        text: 'Show only active drivers, one tier, or the drivers with a scorecard in these weeks.',
        side: 'bottom',
      },
      {
        element: `${PERF} [data-testid="data-grid"]`,
        title: 'Check a driver',
        text: 'Double-click a driver to open their report. Click a red safety number to see the events. Tick drivers in the first column to act on them.',
        side: 'top',
      },
      {
        element: `${PERF} [data-testid="perf-generate-selected"]`,
        title: 'Make the reports',
        text: 'Generate for selected saves one PDF for each ticked driver, in a folder you choose.',
        side: 'bottom',
      },
      {
        element: `${PERF} [data-testid="perf-email-selected"]`,
        title: 'Email the reports',
        text: 'Email selected sends each ticked driver their report. It shows who gets what first. Set up email once in Settings.',
        side: 'bottom',
      },
    ],
  },

  'performance-reports': {
    name: 'performance-reports',
    label: 'Performance: Reports tab',
    steps: [
      {
        element: `${PERF} [data-testid="perf-use-colour"]`,
        title: 'Colour or black and white',
        text: 'Turn colour off for reports that print well on any printer.',
        side: 'right',
      },
      {
        element: `${PERF} [data-testid="perf-save-colours"]`,
        title: 'Keep your colours',
        text: 'Change the colours, look at the sample, then click Save colours. Reset puts the old colours back.',
        side: 'top',
      },
      {
        element: `${PERF} [data-testid="perf-driver-preview"]`,
        title: 'Preview a driver',
        text: "See a driver's report before you send it. The arrows go to the next driver on the Drivers tab.",
        side: 'top',
      },
      {
        element: `${PERF} [data-testid="perf-import-thresholds"]`,
        title: 'The scorecard thresholds',
        text: 'The numbers each tier needs. Bring in a new thresholds file when they change.',
        side: 'top',
      },
    ],
  },

  'performance-directory': {
    name: 'performance-directory',
    label: 'Performance: Directory tab',
    steps: [
      {
        element: `${PERF} [data-testid="data-grid"]`,
        title: 'How to reach everyone',
        text: 'Every driver on the driver list, with their email, phones and ID expiry date.',
        side: 'top',
      },
      {
        element: `${PERF} [aria-label="Search this table"]`,
        title: 'Find someone',
        text: 'Type a name, ID, email or phone number.',
        side: 'bottom',
      },
      {
        element: `${PERF} [data-testid="perf-copy-email"]`,
        title: 'Copy their details',
        text: 'Click a driver, then Copy email or Copy phone. Paste it where you need it.',
        side: 'bottom',
      },
    ],
  },

  'performance-imports': {
    name: 'performance-imports',
    label: 'Performance: Imports tab',
    steps: [
      {
        element: `${PERF} [data-testid="perf-card-roster"]`,
        title: 'One card for each file',
        text: 'Each card says where its file comes from, which folder it is read from, and when it was last brought in.',
        side: 'right',
      },
      {
        element: `${PERF} [data-testid="perf-choose-scorecards"]`,
        title: 'Choose each folder once',
        text: 'Click Choose folder and pick the folder you save that kind of file in. The app brings in what is there.',
        side: 'bottom',
      },
      {
        element: `${PERF} [data-testid="perf-sync-now"]`,
        title: 'Every week: Sync now',
        text: 'Sync now brings in every new file from the folders you chose.',
        side: 'bottom',
      },
      {
        element: `${PERF} label:has([data-testid="perf-auto-import"])`,
        title: 'Or let it happen by itself',
        text: 'Leave this on, and the app brings in new files each time it opens.',
        side: 'bottom',
      },
      {
        title: 'Drag and drop works too',
        text: 'Drop files, or a whole folder, anywhere on this tab. The app works out which kind each file is from its name.',
      },
    ],
  },

  dashboard: {
    name: 'dashboard',
    label: 'Dashboard',
    steps: [
      {
        element: `${DASHBOARD} [data-testid="dashboard-weekbar"]`,
        title: 'Pick the weeks',
        text: 'Everything on the Dashboard covers these weeks. Click a quick pick, or choose the first and last week.',
        side: 'bottom',
      },
      {
        element: `${DASHBOARD} [data-testid="tile-fleet"]`,
        title: 'The week at a glance',
        text: 'The tiles show the average score, the tiers, packages and safety, with the change from the week before.',
        side: 'bottom',
      },
      {
        element: `${DASHBOARD} [data-testid="dashboard-coaching"]`,
        title: 'Who needs a word',
        text: 'Drivers to coach, with the reasons. Click a driver to open them on the Performance page or preview their report.',
        side: 'right',
      },
      {
        element: `${DASHBOARD} [data-testid="dashboard-compliance"]`,
        title: 'IDs that run out soon',
        text: 'Drivers whose ID has run out, or runs out soon. Tell them before it does.',
        side: 'left',
      },
      {
        element: `${DASHBOARD} [data-testid="dashboard-coaching-explain"]`,
        title: 'Where a number comes from',
        text: 'Click How is this worked out? next to any number to see the rule behind it.',
        side: 'bottom',
      },
      {
        element: `${DASHBOARD} [data-testid="dashboard-go-imports"]`,
        title: 'No scorecards yet?',
        text: 'Bring in the weekly exports on the Performance page, Imports tab, and the Dashboard fills in.',
        side: 'bottom',
      },
    ],
  },

  settings: {
    name: 'settings',
    label: 'Settings',
    steps: [
      {
        element: `${SETTINGS} [data-setting="theme"]`,
        title: 'Colours',
        text: 'Pick Light, Dark or High contrast. High contrast is easiest to read.',
        side: 'right',
      },
      {
        element: `${SETTINGS} [data-setting="text-size"]`,
        title: 'Text size',
        text: 'Make the text bigger or smaller. The app remembers it.',
        side: 'right',
      },
      {
        element: `${SETTINGS} [data-setting="demo-mode"]`,
        title: 'Practise safely',
        text: 'Demo mode shows made-up drivers and vans. Your real data is not touched.',
        side: 'right',
      },
      {
        element: `${SETTINGS} [data-setting="help"]`,
        title: 'Tours',
        text: 'Turn the page tours off here, or see them all again.',
        side: 'right',
      },
    ],
  },
};

/** The tour for what is on screen: the page, and on Load Out and Performance the open tab. */
export function tourNameFor(page: PageId, openTab: string | null): string | null {
  let name: string = page;
  if (page === 'load-out') name = `load-out-${openTab ?? 'roster'}`;
  else if (page === 'performance') name = `performance-${openTab ?? 'drivers'}`;
  return TOURS[name] ? name : null;
}

/** Reads which Load Out tab is open from the page itself. */
export function openLoadOutTab(root: ParentNode = document): string | null {
  const tab = root.querySelector('[data-page="load-out"] [role="tab"][aria-selected="true"]');
  return tab?.getAttribute('data-tab-button') ?? null;
}

/** Reads which Performance tab is open from the page itself ("drivers", "imports"). */
export function openPerformanceTab(root: ParentNode = document): string | null {
  const tab = root.querySelector('[data-page="performance"] [role="tab"][aria-selected="true"]');
  const id = tab?.getAttribute('id') ?? '';
  return id.startsWith('performance-tab-') ? id.slice('performance-tab-'.length) : null;
}

/** Every tour name, for "See all the tours again" and for tests. */
export const TOUR_NAMES = Object.keys(TOURS);
