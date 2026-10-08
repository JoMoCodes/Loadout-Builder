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
const SETTINGS = '[data-page="settings"]';

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
        text: 'This list shows the five things to do. Each step ticks itself off when it is done.',
        side: 'left',
      },
      {
        element: '[data-testid="first-run-checklist"] [data-step-current="true"] [data-step-do]',
        title: 'Do the next step',
        text: 'This button takes you to the right page and starts the step. The ? next to it shows where to get the file.',
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

/** The tour for what is on screen: the page, and on Load Out the open tab. Null if none. */
export function tourNameFor(page: PageId, loadOutTab: string | null): string | null {
  if (page === 'load-out') return `load-out-${loadOutTab ?? 'roster'}`;
  return TOURS[page] ? page : null;
}

/** Reads which Load Out tab is open from the page itself. */
export function openLoadOutTab(root: ParentNode = document): string | null {
  const tab = root.querySelector('[data-page="load-out"] [role="tab"][aria-selected="true"]');
  return tab?.getAttribute('data-tab-button') ?? null;
}

/** Every tour name, for "See all the tours again" and for tests. */
export const TOUR_NAMES = Object.keys(TOURS);
