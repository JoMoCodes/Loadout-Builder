// The "?" notes on the first-day checklist: where to get each file, step by step, with a picture.
// Pictures of the app are taken in demo mode. Pictures of the websites the files come from need a
// real account, so a drawn box stands in for them until they are taken (with no real names).

import type { ReactNode } from 'react';
import { Modal } from '../pages/dataPages/Modal';
import type { StepId } from './checklist';
import { Shot, ShotToCome, type ShotName } from './HelpParts';

interface NoteStep {
  text: ReactNode;
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
};

/** The "?" window for one step. */
export function WhereToGetDialog({ step, onClose }: { step: StepId; onClose: () => void }) {
  const note = WHERE_TO_GET[step];
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
            {item.shot ? <Shot name={item.shot.name} caption={item.shot.caption} /> : null}
            {item.toCome ? <ShotToCome name={item.toCome.name} what={item.toCome.what} /> : null}
          </li>
        ))}
      </ol>
    </Modal>
  );
}
