// How to use: the help page. Laid out like the sister app's help: a row of "jump to" buttons,
// then one section per question, with the problems folded up so the page stays short.
// Plain words only (see CLAUDE.md). Pictures are taken in demo mode, so they show made-up people.

import { ExternalLink, ListChecks, Signpost } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { DISCUSSIONS_URL } from '../../shared/links';
import { Shot } from '../help/HelpParts';
import { Button } from '../ui/button';
import { Chip, type Tone } from '../ui/chip';
import type { PageId, PageProps } from './types';

interface Section {
  id: string;
  title: string;
  body: ReactNode;
}

interface Problem {
  id: string;
  question: string;
  answer: ReactNode;
}

function Go({ to, children, goTo }: { to: PageId; children: ReactNode; goTo(id: PageId): void }) {
  return (
    <button type="button" className="link-button" onClick={() => goTo(to)}>
      {children}
    </button>
  );
}

function Example({ tone, children }: { tone: Tone; children: string }) {
  return <Chip tone={tone}>{children}</Chip>;
}

function problems(goTo: (id: PageId) => void): Problem[] {
  const go = (to: PageId, text: string) => (
    <Go to={to} goTo={goTo}>
      {text}
    </Go>
  );
  return [
    {
      id: 'wrong-day-dwp',
      question: 'The app says the DWP sheet is for the wrong day',
      answer: (
        <ul>
          <li>
            The DWP sheet's date does not match the roster's date. Its numbers (bags, OVS, staging)
            would be for different routes.
          </li>
          <li>
            Download the DWP sheet for the roster's day. On {go('route-data', 'Route Data')}, open
            the <strong>DWP</strong> tab and click <strong>Import DWP</strong> again. It replaces
            the old one.
          </li>
          <li>
            Then click <strong>Bring Over DWP</strong> on {go('load-out', 'Load Out')}.
          </li>
          <li>
            Only click <strong>Yes</strong> on the warning if you are sure the sheet is right, for
            example when the file name has the wrong date.
          </li>
        </ul>
      ),
    },
    {
      id: 'driver-not-found',
      question: 'A driver says "No associate found" in the Check column',
      answer: (
        <ul>
          <li>The app could not find this driver in your driver list.</li>
          <li>
            They may be new. Download a fresh driver list and bring it in on{' '}
            {go('associates', 'Associates')}.
          </li>
          <li>
            Their name may be written differently in the two files. On the Roster, right-click the
            driver's <strong>Transporter ID</strong> cell and choose{' '}
            <strong>Link to associate</strong>. Pick the right person. The app remembers this.
          </li>
          <li>
            <Example tone="bad">Ambiguous - pick one</Example> means more than one person fits.
            Right-click and link the right one the same way.
          </li>
          <li>
            <Example tone="warn">Verify match</Example> means the app found someone with a close
            name. Check it is the right person.
          </li>
        </ul>
      ),
    },
    {
      id: 'no-van',
      question: 'A driver did not get a van',
      answer: (
        <>
          <p>
            The window that opens after <strong>Assign Vans</strong> lists everyone left without a
            van first, with the reason. The app never puts a driver in a van they are not qualified
            for. The reasons are:
          </p>
          <ul>
            <li>
              <strong>No associate record</strong>: the driver is not linked to your driver list, so
              the app does not know their van skills. See "No associate found" above.
            </li>
            <li>
              <strong>Not ... qualified for any free van</strong>: every free van needs a skill the
              driver does not have. Check their skills on {go('associates', 'Associates')}.
            </li>
            <li>
              <strong>Only LMR vans left, and not on the approved list</strong>: only rental vans
              are free. Tick the driver on <strong>LMR Approved Drivers</strong> on{' '}
              {go('vehicle-data', 'Vehicle Data')} if they may take one.
            </li>
            <li>
              <strong>No van free</strong> or <strong>No van left in the fleet</strong>: every van
              they can drive is taken or grounded.
            </li>
          </ul>
          <p>Also check:</p>
          <ul>
            <li>
              Drivers with no route get no van. Click <strong>Bring Over Route Data</strong> first.
            </li>
            <li>
              Grounded vans and vans marked <strong>Manual</strong> are never given out by Assign
              Vans. Give a Manual van by hand: right-click the driver's <strong>Vehicle</strong>{' '}
              cell and choose <strong>Assign a Van</strong>.
            </li>
          </ul>
        </>
      ),
    },
    {
      id: 'file-will-not-open',
      question: 'A file will not open',
      answer: (
        <ul>
          <li>The app says why in a message. Read it: it often names what is missing.</li>
          <li>
            Check you are on the right page for that file. The load-out sheet goes on Load Out, the
            driver list on Associates, the vans on Vehicle Data, and the route files and the DWP
            sheet on Route Data.
          </li>
          <li>If the file is open in Excel, close it there and try again.</li>
          <li>
            Download the file again. A file that was still downloading, or was saved again by
            another program, may not be readable.
          </li>
          <li>Nothing changes when a file is refused. Your data stays as it was.</li>
        </ul>
      ),
    },
    {
      id: 'id-expiry',
      question: "A driver's ID is about to run out, or has run out",
      answer: (
        <ul>
          <li>
            <Example tone="warn">ID expires in 12d</Example> means their ID runs out in 12 days.
          </li>
          <li>
            <Example tone="bad">ID expired 3d ago</Example> means it ran out 3 days ago.
          </li>
          <li>
            The app still gives them a van. Whether they go out is your call. Tell your manager.
          </li>
          <li>
            Once the new date is in your driver list, download it again and bring it in on{' '}
            {go('associates', 'Associates')}. The warning goes away.
          </li>
        </ul>
      ),
    },
    {
      id: 'wrong-file',
      question: 'I brought in the wrong file',
      answer: (
        <ul>
          <li>
            Bring in the right one. It replaces the wrong one. The app asks first before it replaces
            a roster.
          </li>
        </ul>
      ),
    },
    {
      id: 'saved-data',
      question: 'The app says it could not open the saved data',
      answer: (
        <ul>
          <li>Close the app and open it again.</li>
          <li>If it keeps happening, ask for help (see "Still stuck?" below).</li>
        </ul>
      ),
    },
    {
      id: 'practise',
      question: 'I want to practise without using my real data',
      answer: (
        <ul>
          <li>
            Open {go('settings', 'Settings')} and turn on <strong>Demo mode</strong>. The app then
            shows made-up drivers and vans.
          </li>
          <li>Your real data is not touched, and nothing you do in demo mode is kept.</li>
          <li>Turn it off to go back to your real data.</li>
        </ul>
      ),
    },
  ];
}

export function HowToUsePage({ goTo, help, version }: PageProps) {
  const [linkProblem, setLinkProblem] = useState<string | null>(null);
  const go = (to: PageId, text: string) => (
    <Go to={to} goTo={goTo}>
      {text}
    </Go>
  );

  async function ask() {
    setLinkProblem(await help.openLink(DISCUSSIONS_URL));
  }

  const sections: Section[] = [
    {
      id: 'see',
      title: 'Make the app easier to see',
      body: (
        <ul>
          <li>
            Use <strong>A-</strong> and <strong>A+</strong> at the top of the window to make the
            text smaller or bigger. The middle button puts it back to normal.
          </li>
          <li>
            Open {go('settings', 'Settings')} to pick Light, Dark or High contrast. High contrast is
            the easiest to read.
          </li>
          <li>The app remembers your choices.</li>
        </ul>
      ),
    },
    {
      id: 'first',
      title: 'Before your first day',
      body: (
        <>
          <p>You do these once. Do them again when drivers or vans change.</p>
          <ol className="help-steps">
            <li>
              Bring in your driver list on {go('associates', 'Associates')}: click{' '}
              <strong>Import Associates</strong>.
            </li>
            <li>
              Bring in your vans on {go('vehicle-data', 'Vehicle Data')}: click{' '}
              <strong>Import Vehicles</strong>.
            </li>
            <li>
              The list on the right of {go('home', 'Home')} walks you through it. Click the{' '}
              <strong>?</strong> on a step to see where to download the file.
            </li>
          </ol>
          <Shot name="home-checklist" caption="The first-day checklist on Home" />
        </>
      ),
    },
    {
      id: 'daily',
      title: 'Every day, step by step',
      body: (
        <>
          <ol className="help-steps">
            <li>
              Download today's <strong>load-out sheet</strong> from DSP Workplace and the{' '}
              <strong>Routes</strong> file from Cortex. Using a DWP sheet? Download that too.
            </li>
            <li>
              Open {go('load-out', 'Load Out')}. Click <strong>Import Sheet</strong> and pick the
              load-out sheet.
            </li>
            <li>
              Open {go('route-data', 'Route Data')}. Click <strong>Import Routes</strong> and pick
              the Routes file. Click <strong>Assign PADs</strong> and put each time on its PAD.
            </li>
            <li>
              Using a DWP sheet? On the <strong>DWP</strong> tab, click <strong>Import DWP</strong>.
            </li>
            <li>
              Back on {go('load-out', 'Load Out')}, click <strong>Bring Over Route Data</strong>.
              Wave times, PADs and route codes go onto the roster. The DWP numbers come over too.
            </li>
            <li>
              Click <strong>Assign Vans</strong>. A window shows who got which van, and anyone who
              did not, with the reason.
            </li>
            <li>
              Look down the <strong>Check</strong> column. Sort out anything red. See "What the
              colours mean" below.
            </li>
            <li>
              Open the <strong>Print</strong> tab and click <strong>Print Page</strong>. Choose
              where to save it. Open the file and print it.
            </li>
            <li>
              Before you bring in tomorrow's sheet, click{' '}
              <strong>Move Data to Previous Roster</strong>. Then drivers get the same van again
              tomorrow.
            </li>
          </ol>
          <Shot name="load-out-roster" caption="The Load Out page with a made-up roster" />
          <p>The app saves your work by itself. There is no Save button.</p>
        </>
      ),
    },
    {
      id: 'colors',
      title: 'What the colours mean',
      body: (
        <>
          <p>
            The <strong>Check</strong> column on the Roster says if anything is wrong with a driver.
            The colour and the words always go together.
          </p>
          <ul className="help-chip-list">
            <li>
              <Example tone="ok">OK</Example> All is well.
            </li>
            <li>
              <Example tone="warn">ID expires in 12d</Example>
              <Example tone="warn">Inactive associate</Example>
              <Example tone="warn">Verify match</Example> Amber is a warning. Have a look, but the
              driver can still go out.
            </li>
            <li>
              <Example tone="bad">No associate found</Example>
              <Example tone="bad">Not CDV qualified</Example>
              <Example tone="bad">ID expired 3d ago</Example> Red needs you before the driver goes
              out.
            </li>
          </ul>
          <p>The whole row is tinted amber or red to match, so problems stand out.</p>
          <p>Elsewhere in the app:</p>
          <ul>
            <li>
              The <strong>Vans</strong> column shows the kinds of van a driver may drive.{' '}
              <strong>LMR</strong> means they may take a rental van.
            </li>
            <li>
              On the DWP tab, <Example tone="ok">Matches the roster's day</Example> is good.{' '}
              <Example tone="warn">Wrong day</Example> means the sheet is for another day.
            </li>
            <li>
              On Vehicle Data, a van's registration turns amber when it runs out within 45 days, and
              red once it has run out.
            </li>
            <li>
              On Route Data, amber rows are drivers who are not in your driver list. Grey rows have
              no PAD yet.
            </li>
            <li>
              A blue bar at the top of the window that says <strong>Demo mode is on</strong> means
              you are looking at made-up drivers and vans.
            </li>
          </ul>
        </>
      ),
    },
    {
      id: 'keys',
      title: 'Shortcuts and dragging files',
      body: (
        <>
          <p>These keys work while no question box is open.</p>
          <ul className="help-keys" data-testid="help-shortcuts">
            <li>
              <kbd>Ctrl</kbd>+<kbd>O</kbd> brings in a load-out sheet, from any page. It opens the{' '}
              <strong>Load Out</strong> page and does <strong>Import Sheet</strong>.
            </li>
            <li>
              <kbd>Ctrl</kbd>+<kbd>I</kbd> brings in the driver list, from any page. It opens the{' '}
              <strong>Associates</strong> page and does <strong>Import Associates</strong>.
            </li>
            <li>
              <kbd>Ctrl</kbd>+<kbd>P</kbd> on the <strong>Load Out</strong> page prints the roster,
              the same as <strong>Print Page</strong> on the Print tab.
            </li>
            <li>
              <kbd>Esc</kbd> closes a question box, or skips a tour.
            </li>
            <li>
              <kbd>Enter</kbd> goes to the next step of a tour.
            </li>
            <li>
              <kbd>Tab</kbd> moves from button to button. The arrow keys move around a table.
            </li>
          </ul>
          <p>
            You can also drag a file from your computer and drop it on the page that uses it. For
            example, drop the load-out sheet on the <strong>Roster</strong> tab, or the vehicle list
            on <strong>Vehicle Management</strong>. The page lights up when it can take the file.
          </p>
        </>
      ),
    },
    {
      id: 'problems',
      title: 'If something goes wrong',
      body: (
        <div data-testid="help-problems">
          {problems(goTo).map((problem) => (
            <details key={problem.id} data-problem={problem.id}>
              <summary>{problem.question}</summary>
              {problem.answer}
            </details>
          ))}
        </div>
      ),
    },
    {
      id: 'guides',
      title: 'The checklist and the tours',
      body: (
        <>
          <ul>
            <li>
              The <strong>first-day checklist</strong> on Home shows the five steps of a day. It
              hides itself once they are all done.
            </li>
            <li>
              Each page has a short <strong>tour</strong> that shows its buttons. It runs the first
              time you open the page. Click <strong>Help</strong> at the top of the window, then{' '}
              <strong>Take the tour of this page</strong>, to see it again.
            </li>
            <li>You can turn the tours off in {go('settings', 'Settings')}.</li>
          </ul>
          <div className="row-of-buttons">
            <Button
              data-testid="show-checklist-again"
              onClick={() => {
                help.showChecklist();
                goTo('home');
              }}
            >
              <ListChecks aria-hidden="true" />
              Show the checklist again
            </Button>
            <Button
              data-testid="tour-home-again"
              onClick={() => {
                goTo('home');
                window.setTimeout(() => help.takeTour('home'), 300);
              }}
            >
              <Signpost aria-hidden="true" />
              Take the tour of Home
            </Button>
          </div>
        </>
      ),
    },
    {
      id: 'stuck',
      title: 'Still stuck?',
      body: (
        <>
          <p>
            Ask on the app's help forum. Someone will answer, and the answer stays there for the
            next person with the same problem.
          </p>
          <p className="help-warning" role="note" data-testid="forum-warning">
            <strong>Anyone on the internet can read the forum.</strong> Describe the problem in
            words. Never post a roster, a screenshot or an exported file. Never post driver names,
            Transporter IDs, phone numbers or van numbers.
          </p>
          <p>When you ask, say:</p>
          <ul>
            <li>what you clicked,</li>
            <li>what you expected to happen,</li>
            <li>what happened instead, and the words of any message (with no names in them),</li>
            <li>
              your version of the app: <strong>{version || 'see Settings'}</strong>.
            </li>
          </ul>
          <p>You need a free GitHub account to post.</p>
          <div className="row-of-buttons">
            <Button variant="primary" data-testid="ask-a-question" onClick={() => void ask()}>
              <ExternalLink aria-hidden="true" />
              Ask a question
            </Button>
          </div>
          {linkProblem ? (
            <p role="alert" className="problem" data-testid="ask-problem">
              {linkProblem}
            </p>
          ) : null}
        </>
      ),
    },
  ];

  return (
    <section className="page" data-page="how-to-use" aria-labelledby="title-how-to-use">
      <h1 id="title-how-to-use">How to use</h1>
      <p className="lede">
        Everything you need for a normal day, and what to do when something goes wrong.
      </p>

      <nav className="help-jump" aria-label="Jump to a part of this page">
        <span>Jump to:</span>
        {sections.map((section) => (
          <Button
            key={section.id}
            size="sm"
            data-jump={section.id}
            onClick={() =>
              document
                .getElementById(`help-${section.id}`)
                ?.scrollIntoView({ block: 'start', behavior: 'smooth' })
            }
          >
            {section.title}
          </Button>
        ))}
      </nav>

      {sections.map((section) => (
        <section
          key={section.id}
          id={`help-${section.id}`}
          className="help-section"
          aria-labelledby={`help-title-${section.id}`}
        >
          <h2 id={`help-title-${section.id}`}>{section.title}</h2>
          {section.body}
        </section>
      ))}
    </section>
  );
}
