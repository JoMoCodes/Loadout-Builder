import { useCallback, useState } from 'react';
import { FirstRunChecklist } from '../help/FirstRunChecklist';
import type { PageProps } from './types';

function count(counts: Record<string, number>, table: string): number {
  return counts[table] ?? 0;
}

export function HomePage({ version, dataSource, goTo, settings, changeSettings, help }: PageProps) {
  const counts = dataSource?.counts ?? {};
  // Once every step is done the list puts itself away, but the "all done" note stays up until
  // the person leaves Home, so they see it happen.
  const [justFinished, setJustFinished] = useState(false);
  const { hideChecklist } = help;
  const finished = useCallback(() => {
    setJustFinished(true);
    hideChecklist();
  }, [hideChecklist]);

  return (
    <section className="page home-page" data-page="home" aria-labelledby="title-home">
      <div className="home-layout">
        <div className="home-main">
          <h1 id="title-home">Welcome to Loadout Builder</h1>
          <p className="lede">Version {version}</p>

          <div className="card">
            <h2>What is saved on this computer</h2>
            {dataSource && !dataSource.ok ? (
              <p role="alert" data-testid="data-problem" className="problem">
                The saved data could not be opened. Close the app and open it again. If this keeps
                happening, ask for help.
              </p>
            ) : (
              <ul data-testid="data-summary">
                <li>Drivers in your list: {count(counts, 'associates')}</li>
                <li>Vans in your list: {count(counts, 'vehicles')}</li>
                <li>Drivers on the roster: {count(counts, 'driver_rows')}</li>
              </ul>
            )}

            <p>
              New here? Open{' '}
              <button type="button" className="link-button" onClick={() => goTo('how-to-use')}>
                How to use
              </button>{' '}
              for help, step by step.
            </p>
          </div>
        </div>

        {help.checklistShown || justFinished ? (
          <div className="home-aside" data-slot="first-run-checklist">
            <FirstRunChecklist
              settings={settings}
              changeSettings={changeSettings}
              goTo={goTo}
              help={help}
              onFinished={finished}
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}
