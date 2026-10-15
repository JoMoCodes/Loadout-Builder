// The two cards at the top of How to use: Demo mode (practise with made-up data) and Help (the
// page tours and the first-day checklist). They were on the Settings page; they live here now,
// next to the help they go with. The help step actions scroll to them by their data-setting.

import { Button } from '../../ui/button';
import type { PageProps } from '../types';

type Props = Pick<PageProps, 'settings' | 'changeSettings' | 'dataSource' | 'help'>;

export function DemoModeCard({ settings, changeSettings, dataSource }: Props) {
  return (
    <div className="settings-group card m-0" data-setting="demo-mode">
      <h2>Demo mode</h2>
      <label className="switch-row">
        <input
          type="checkbox"
          role="switch"
          className="switch"
          checked={settings.demoMode}
          onChange={(event) => void changeSettings({ demoMode: event.target.checked })}
        />
        Show made-up drivers and vans
      </label>
      <p className="hint">
        Use this to look around or to train someone. Your real data is not touched, and nothing you
        do in demo mode is kept. The app always starts with demo mode off.
      </p>
      {dataSource && !dataSource.ok && dataSource.mode === 'demo' ? (
        <p role="alert" className="problem">
          The demo data could not be loaded.
        </p>
      ) : null}
    </div>
  );
}

export function HelpCard({ settings, changeSettings, help }: Props) {
  return (
    <div className="settings-group card m-0" data-setting="help">
      <h2>Help</h2>
      <label className="switch-row">
        <input
          type="checkbox"
          role="switch"
          className="switch"
          checked={settings.autoTours}
          onChange={(event) => void changeSettings({ autoTours: event.target.checked })}
          data-testid="auto-tours"
        />
        Show a short tour the first time I open a page
      </label>
      <div className="row-of-buttons mt-2">
        <Button
          data-testid="tours-again"
          disabled={settings.toursSeen.length === 0}
          onClick={() => void changeSettings({ toursSeen: [], autoTours: true })}
        >
          See every tour again
        </Button>
        <Button
          data-testid="settings-show-checklist"
          disabled={help.checklistShown}
          onClick={help.showChecklist}
        >
          Show the checklist again
        </Button>
      </div>
      <p className="hint">
        You can always take a page&apos;s tour from <strong>Help</strong> at the top of the window.
        The first-day checklist shows under these cards.
      </p>
    </div>
  );
}

/** Both cards side by side (one above the other on a narrow window). */
export function HelpCards(props: Props) {
  return (
    <div className="mb-4 grid gap-4 md:grid-cols-2" data-testid="help-cards">
      <DemoModeCard {...props} />
      <HelpCard {...props} />
    </div>
  );
}
