import { FolderOpen } from 'lucide-react';
import { useState } from 'react';
import {
  FONT_SCALE_DEFAULT,
  FONT_SCALE_MAX,
  FONT_SCALE_MIN,
  THEMES,
  THEME_LABELS,
  stepFontScale,
} from '../../shared/settings';
import { call } from '../lib/channels';
import { Button } from '../ui/button';
import { EmailSettingsSection } from './settings/EmailSettingsSection';
import type { PageProps } from './types';

export function SettingsPage({ version, settings, changeSettings }: PageProps) {
  const [folderProblem, setFolderProblem] = useState(false);

  async function openFolder() {
    const reply = await call('data:open-folder');
    setFolderProblem(!reply.ok || !reply.value.ok);
  }

  const percent = Math.round(settings.fontScale * 100);

  return (
    <section className="page" data-page="settings" aria-labelledby="title-settings">
      <h1 id="title-settings">Settings</h1>

      <fieldset className="settings-group card" data-setting="theme">
        <legend>Colours</legend>
        <div className="theme-choices">
          {THEMES.map((theme) => (
            <label key={theme} className="theme-choice">
              <input
                type="radio"
                name="theme"
                value={theme}
                checked={settings.theme === theme}
                onChange={() => void changeSettings({ theme })}
              />
              {THEME_LABELS[theme]}
            </label>
          ))}
        </div>
        <p className="hint">High contrast makes the text and lines easier to see.</p>
      </fieldset>

      <div className="settings-group card" data-setting="text-size">
        <h2>Text size</h2>
        <div className="row-of-buttons">
          <Button
            disabled={settings.fontScale <= FONT_SCALE_MIN}
            onClick={() =>
              void changeSettings({ fontScale: stepFontScale(settings.fontScale, -1) })
            }
          >
            Smaller
          </Button>
          <span data-testid="font-percent" className="min-w-12 text-center tabular-nums">
            {percent}%
          </span>
          <Button
            disabled={settings.fontScale >= FONT_SCALE_MAX}
            onClick={() => void changeSettings({ fontScale: stepFontScale(settings.fontScale, 1) })}
          >
            Bigger
          </Button>
          <Button
            variant="ghost"
            disabled={settings.fontScale === FONT_SCALE_DEFAULT}
            onClick={() => void changeSettings({ fontScale: FONT_SCALE_DEFAULT })}
          >
            Back to normal
          </Button>
        </div>
        <p className="hint">You can also use A- and A+ at the top of the window.</p>
      </div>

      <div className="settings-group card" data-setting="data-folder">
        <h2>Your saved data</h2>
        <Button onClick={() => void openFolder()}>
          <FolderOpen aria-hidden="true" />
          Open data folder
        </Button>
        <p className="hint">Opens the folder on this computer where your saved data lives.</p>
        {folderProblem ? (
          <p role="alert" className="problem">
            The folder could not be opened.
          </p>
        ) : null}
      </div>

      <EmailSettingsSection email={settings.email} changeSettings={changeSettings} />

      <div className="settings-group card" data-setting="version">
        <h2>About</h2>
        <p>
          Loadout Builder, version <span data-testid="app-version">{version}</span>
        </p>
        <p data-testid="app-about">
          Builds the daily load-out roster and hands out the vans for your delivery station.
        </p>
      </div>
    </section>
  );
}
