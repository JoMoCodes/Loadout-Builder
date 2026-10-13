// The "?" notes on the Home checklists: where to get each file, step by step, with a picture.
// Pictures of the app are taken in demo mode. Pictures of the websites the files come from need a
// real account, so a drawn box stands in for them until they are taken (with no real names).

import type { ReactNode } from 'react';
import {
  PERF_KINDS,
  PERF_KIND_WORDS,
  SINGLE_FILE_KINDS,
  type PerfKind,
} from '../../shared/performance';
import { Modal } from '../pages/dataPages/Modal';
import type { StepId } from './checklist';
import { Shot, ShotToCome, type ShotName } from './HelpParts';
import type { WeeklyStepId } from './weeklySteps';

interface NoteStep {
  text: ReactNode;
  /** Something under the words that cannot sit in a sentence (a list). */
  extra?: ReactNode;
  shot?: { name: ShotName; caption: string };
  toCome?: { name: string; what: string };
}

interface Note {
  title: string;
  lead: string;
  steps: NoteStep[];
}

export const WHERE_TO_GET: Record<StepId, Note> = {
  drivers: {
    title: 'Where to get the driver list',
    lead: 'The driver list is the associate file from Cortex. It is a .csv file.',
    steps: [
      {
        text: (
          <>
            In Cortex, open the <strong>Administration</strong> menu and click{' '}
            <strong>Associates</strong>.
          </>
        ),
        toCome: { name: 'cortex-associates-menu', what: 'the Administration menu in Cortex' },
      },
      {
        text: (
          <>
            On the <strong>My associates</strong> tab, click the download button on the right. The
            file goes to your Downloads folder.
          </>
        ),
        toCome: {
          name: 'cortex-associates-download',
          what: 'the download button on My associates',
        },
      },
      {
        text: (
          <>
            In this app, open <strong>Associates</strong>, click <strong>Import Associates</strong>{' '}
            and pick the file.
          </>
        ),
        shot: {
          name: 'associates',
          caption: 'The Associates page, with Import Associates at the top',
        },
      },
      {
        text: 'Do this again when someone starts or leaves, or when a driver gets a new van skill.',
      },
    ],
  },
  vans: {
    title: 'Where to get your vans',
    lead: 'The van list is the vehicle file. Its name is usually VehiclesData.xlsx.',
    steps: [
      {
        text: 'Download the vehicle file from the site your station keeps its vans on. Ask your manager if you are not sure which one.',
        toCome: { name: 'vehicles-download', what: 'where the vehicle file is downloaded' },
      },
      {
        text: (
          <>
            In this app, open <strong>Vehicle Data</strong>, click <strong>Import Vehicles</strong>{' '}
            and pick the file.
          </>
        ),
        shot: {
          name: 'vehicles',
          caption: 'The Vehicle Data page, with Import Vehicles at the top',
        },
      },
      {
        text: 'A van that is in the shop can be grounded here, so nobody gets it.',
      },
    ],
  },
  sheet: {
    title: "Where to get today's load-out sheet",
    lead: 'The load-out sheet comes from DSP Workplace. Its name ends in loadout_sheet.xlsx.',
    steps: [
      {
        text: "In DSP Workplace, download today's load-out sheet. The file goes to your Downloads folder.",
        toCome: {
          name: 'dsp-workplace-load-out',
          what: 'the Load-out sheet download button in DSP Workplace',
        },
      },
      {
        text: (
          <>
            In this app, open <strong>Load Out</strong> and click <strong>Import Sheet</strong>.
            Pick the file. You can also drop the file on the Roster tab.
          </>
        ),
        shot: { name: 'load-out-roster', caption: 'The Load Out page with a made-up roster' },
      },
    ],
  },
  'route-data': {
    title: 'Where to get the route data',
    lead: 'Route data says when each driver leaves and from which PAD. The Routes file from Cortex is enough.',
    steps: [
      {
        text: (
          <>
            In Cortex, open the <strong>Operations</strong> menu and click <strong>Delivery</strong>
            . On the <strong>Routes</strong> tab, click the download button on the right.
          </>
        ),
        toCome: {
          name: 'cortex-routes-download',
          what: 'the download button on the Routes tab in Cortex',
        },
      },
      {
        text: (
          <>
            In this app, open <strong>Route Data</strong>, click <strong>Import Routes</strong> and
            pick the file. Then click <strong>Assign PADs</strong> and put each time on its PAD.
          </>
        ),
        shot: {
          name: 'route-data',
          caption: 'The Route Data page, with Import Routes and Assign PADs',
        },
      },
      {
        text: (
          <>
            Using a DWP sheet too? Open the <strong>DWP</strong> tab and click{' '}
            <strong>Import DWP</strong>. Its name starts with DWP.
          </>
        ),
        toCome: { name: 'dwp-download', what: 'where the DWP sheet is downloaded' },
      },
      {
        text: (
          <>
            Back on <strong>Load Out</strong>, click <strong>Bring Over Route Data</strong>.
          </>
        ),
      },
    ],
  },
  'assign-print': {
    title: 'How to give out vans and print',
    lead: 'No file to download for this one.',
    steps: [
      {
        text: (
          <>
            On <strong>Load Out</strong>, click <strong>Assign Vans</strong>. A window shows who got
            which van, and anyone who did not get one, with the reason.
          </>
        ),
        shot: { name: 'assign-result', caption: 'The window Assign Vans shows when it is done' },
      },
      {
        text: (
          <>
            Open the <strong>Print</strong> tab and click <strong>Print Page</strong>. Choose where
            to save it, then open the file and print it.
          </>
        ),
        shot: { name: 'print', caption: 'The Print tab, with Print Page at the top' },
      },
    ],
  },
  'route-sheets': {
    title: 'Where to get the route sheet PDF',
    lead: 'The route sheet PDF has one page for each route. It is a .pdf file.',
    steps: [
      {
        text: (
          <>
            In Slack, go to your <strong>escalations</strong> chat room and download the PDF for
            your route sheets. It goes to your Downloads folder.
          </>
        ),
        shot: {
          name: 'slack-download-pdf',
          caption: 'Slack: the download button on the route sheet PDF',
        },
      },
      {
        text: (
          <>
            In this app, open <strong>Route Sheets</strong> and click{' '}
            <strong>Bring in the route sheet PDF</strong>. Pick the file. You can also drop the file
            on the page.
          </>
        ),
        shot: {
          name: 'route-sheets-distribute',
          caption: 'The Route Sheets page, with a made-up day',
        },
      },
      {
        text: (
          <>
            The driver list and the Routes file are the ones already in the app. Click the{' '}
            <strong>?</strong> on those steps in the checklist on <strong>Home</strong> to see where
            to get them.
          </>
        ),
      },
      {
        text: (
          <>
            To email the route sheets, set up your Gmail once in <strong>Settings</strong>, under{' '}
            <strong>Email</strong>.
          </>
        ),
      },
    ],
  },
};

/** The ten weekly exports: what each is called on the Imports tab, and where it comes from. */
export function PerfExportList({ kinds = PERF_KINDS }: { kinds?: readonly PerfKind[] }) {
  return (
    <ul className="m-0 mt-1 list-disc pl-5" data-testid="perf-export-list">
      {kinds.map((kind) => (
        <li key={kind} data-export={kind}>
          <strong>{PERF_KIND_WORDS[kind].title}</strong>
          {SINGLE_FILE_KINDS.includes(kind) ? ' (one file)' : ' (a folder, one file a week)'}:{' '}
          {PERF_KIND_WORDS[kind].whereFrom}
        </li>
      ))}
    </ul>
  );
}

export const WEEKLY_WHERE_TO_GET: Record<WeeklyStepId, Note> = {
  'perf-roster': {
    title: 'Where to get the driver list',
    lead: PERF_KIND_WORDS.roster.whereFrom,
    steps: [
      {
        text: 'Download the driver list from the DSP portal. The file goes to your Downloads folder.',
        toCome: { name: 'perf-roster-download', what: 'where the driver list is downloaded' },
      },
      {
        text: (
          <>
            In this app, open <strong>Performance</strong>, then the <strong>Imports</strong> tab.
            On the <strong>Driver list</strong> card, click <strong>Choose file</strong> and pick
            the file.
          </>
        ),
        shot: { name: 'perf-imports', caption: 'The Imports tab, with a card for each export' },
      },
      {
        text: 'The app remembers the file. Next time, Sync now brings it in again if it has changed.',
      },
    ],
  },
  'perf-folders': {
    title: 'Where to keep the weekly exports',
    lead: 'There are ten kinds of weekly export. Keep each kind in its own folder, and choose that folder once.',
    steps: [
      {
        text: (
          <>
            Make a folder for each kind on your computer, for example in Downloads. Save each
            week&apos;s file into its folder. The ten kinds are:
          </>
        ),
        extra: <PerfExportList />,
        toCome: { name: 'perf-exports-download', what: 'where the weekly exports are downloaded' },
      },
      {
        text: (
          <>
            On the <strong>Imports</strong> tab, click <strong>Choose folder</strong> on each card
            and pick its folder. The app brings in what is there straight away.
          </>
        ),
        shot: { name: 'perf-imports', caption: 'The Imports tab, with a card for each export' },
      },
      {
        text: 'If a folder is on a USB stick that is unplugged, the card says so. Plug it in, or choose the folder again.',
      },
    ],
  },
  'perf-sync': {
    title: 'How to bring in a new week',
    lead: 'Save the new files into their folders, then let the app bring them in.',
    steps: [
      {
        text: (
          <>
            On the <strong>Imports</strong> tab, click <strong>Sync now</strong>. The app brings in
            every file it has not seen before, and says how many weeks it updated.
          </>
        ),
        shot: { name: 'perf-imports', caption: 'The Imports tab, with Sync now at the top' },
      },
      {
        text: (
          <>
            Leave <strong>Bring in new files each time the app opens</strong> on, and the app does
            this by itself when you open it.
          </>
        ),
      },
      {
        text: 'No folders chosen? Drop the files, or a whole folder, anywhere on the Imports tab. The app works out which kind each file is from its name.',
      },
    ],
  },
  'perf-dashboard': {
    title: 'How to read the Dashboard',
    lead: 'No file to download for this one.',
    steps: [
      {
        text: (
          <>
            Open <strong>Dashboard</strong>. The tiles at the top show the fleet average score, the
            tiers, packages and safety events, with the change from the week before.
          </>
        ),
        shot: { name: 'dashboard', caption: 'The Dashboard with made-up weekly data' },
      },
      {
        text: (
          <>
            <strong>Who needs a word</strong> lists drivers to coach, with the reasons.{' '}
            <strong>ID expiry</strong> lists IDs that run out soon. Click a driver to open them on
            the Performance page or preview their report.
          </>
        ),
      },
      {
        text: (
          <>
            Not sure what a number means? Click <strong>How is this worked out?</strong> next to it.
          </>
        ),
      },
    ],
  },
  'perf-reports': {
    title: 'How to make and email the reports',
    lead: 'No file to download for this one. Emailing needs setting up once.',
    steps: [
      {
        text: (
          <>
            Set up email once: open <strong>Settings</strong>, go to <strong>Email</strong>, and
            fill in the Gmail address to send from. Then make a Gmail <strong>App password</strong>{' '}
            (not your usual password) and paste it in. The computer keeps it locked away.
          </>
        ),
      },
      {
        text: (
          <>
            On the <strong>Performance</strong> page, <strong>Drivers</strong> tab, tick the
            drivers. Click <strong>Generate for selected</strong> to save their PDF reports, or{' '}
            <strong>Email selected</strong> to send them. The app shows who would get what before it
            sends anything.
          </>
        ),
        shot: { name: 'perf-drivers', caption: 'The Drivers tab with made-up drivers' },
      },
      {
        text: (
          <>
            Want to see a report first? Double-click a driver, or use{' '}
            <strong>Preview a driver</strong> on the <strong>Reports</strong> tab.
          </>
        ),
        shot: { name: 'perf-reports', caption: 'The Reports tab: colours and a preview' },
      },
    ],
  },
};

/** The "?" window for one step of either checklist. */
export function WhereToGetDialog({
  step,
  onClose,
}: {
  step: StepId | WeeklyStepId;
  onClose: () => void;
}) {
  const note =
    step in WHERE_TO_GET ? WHERE_TO_GET[step as StepId] : WEEKLY_WHERE_TO_GET[step as WeeklyStepId];
  return (
    <Modal
      name="where-to-get"
      title={note.title}
      lead={note.lead}
      confirmLabel="Close"
      onConfirm={onClose}
      wide
    >
      <ol className="help-note-steps">
        {note.steps.map((item, index) => (
          <li key={index}>
            <p>{item.text}</p>
            {item.extra}
            {item.shot ? <Shot name={item.shot.name} caption={item.shot.caption} /> : null}
            {item.toCome ? <ShotToCome name={item.toCome.name} what={item.toCome.what} /> : null}
          </li>
        ))}
      </ol>
    </Modal>
  );
}
