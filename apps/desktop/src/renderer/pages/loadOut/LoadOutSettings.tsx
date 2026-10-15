// The "Load Out settings" window, opened by the gear button next to the Load Out title. It holds
// the switch that lets Assign Vans remember the answer to "Keep the vans drivers already have?",
// and that answer itself, which can be changed here. Every change saves at once.

import { Settings } from 'lucide-react';
import type { AppSettings, SettingsPatch } from '../../../shared/settings';
import { Button } from '../../ui/button';
import { Modal } from '../dataPages/Modal';

export function LoadOutSettingsDialog({
  settings,
  changeSettings,
  onDone,
}: {
  settings: AppSettings;
  changeSettings(patch: SettingsPatch): Promise<void>;
  onDone(): void;
}) {
  const saved = settings.keepVans;
  return (
    <Modal
      name="load-out-settings"
      title="Load Out settings"
      lead="Each change saves as soon as you make it."
      confirmLabel="Close"
      onConfirm={onDone}
      noValidate
    >
      <div className="my-2 flex flex-col gap-3 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            role="switch"
            className="switch"
            checked={settings.rememberKeepVans}
            onChange={(event) => void changeSettings({ rememberKeepVans: event.target.checked })}
            data-testid="remember-keep-vans"
          />
          Remember my answer about vans drivers already have
        </label>
        <p className="hint">
          When this is on, Assign Vans asks once whether to keep the vans given by hand and the vans
          from the load-out sheet, then uses the same answer every time. When it is off, it asks
          every time.
        </p>
        {settings.rememberKeepVans ? (
          saved ? (
            <fieldset className="flex flex-col gap-2" data-testid="saved-keep-vans">
              <legend className="mb-1 font-medium">Your saved answer</legend>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={saved.byHand}
                  onChange={(event) =>
                    void changeSettings({ keepVans: { ...saved, byHand: event.target.checked } })
                  }
                  data-testid="saved-keep-by-hand"
                />
                Keep vans given by hand
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={saved.fromSheet}
                  onChange={(event) =>
                    void changeSettings({ keepVans: { ...saved, fromSheet: event.target.checked } })
                  }
                  data-testid="saved-keep-from-sheet"
                />
                Keep vans from the load-out sheet
              </label>
              <div className="row-of-buttons mt-1">
                <Button
                  onClick={() => void changeSettings({ keepVans: null })}
                  data-testid="forget-keep-vans"
                >
                  Ask me again next time
                </Button>
              </div>
            </fieldset>
          ) : (
            <p className="hint" data-testid="no-saved-keep-vans">
              No answer saved yet. Assign Vans will ask the next time some drivers already have a
              van.
            </p>
          )
        ) : null}
      </div>
    </Modal>
  );
}

/** The gear button next to the Load Out title that opens the window. */
export function LoadOutSettingsButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      onClick={onClick}
      aria-haspopup="dialog"
      title="Choices for the Load Out page"
      data-testid="load-out-settings"
    >
      <Settings aria-hidden="true" />
      Load Out settings
    </Button>
  );
}
