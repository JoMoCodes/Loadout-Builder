// The "Weekly performance" part of the Settings page: auto-import, the rule numbers behind the
// Dashboard's lists, and bringing over the old Weekly Performance App's data. Ported from the old
// app's settings windows. The email account itself is the Email part (settings/
// EmailSettingsSection.tsx), and the subject and message of the report emails are behind the
// Settings button on the Scorecards page (performance/EmailWordingDialog.tsx).

import { useId, useState } from 'react';
import type { PerformanceSettings } from '../../../shared/performanceSettings';
import type { SettingsPatch } from '../../../shared/settings';
import { OldDataDialog } from '../../shell/OldDataDialog';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';

const RULES = [
  {
    key: 'complianceWindowDays',
    label: 'Warn about an ID that runs out within this many days',
    hint: 'A driver whose ID runs out sooner than this shows on the ID expiry list.',
    min: 1,
    max: 365,
  },
  {
    key: 'atRiskDecliningWeeks',
    label: 'Flag a driver whose score fell this many weeks running',
    hint: 'For example 3: three weeks in a row of a lower score than the week before.',
    min: 2,
    max: 26,
  },
  {
    key: 'recurringCategoryWeeks',
    label: 'Flag a driver with the same problem this many weeks running',
    hint: 'The same kind of failure (for example the same POD reject reason) week after week.',
    min: 2,
    max: 26,
  },
  {
    key: 'topN',
    label: 'How many most improved and most declined drivers to list',
    hint: 'The Dashboard lists this many of each.',
    min: 1,
    max: 50,
  },
] as const;

type RuleKey = (typeof RULES)[number]['key'];

function RuleInput({
  rule,
  value,
  onSave,
}: {
  rule: (typeof RULES)[number];
  value: number;
  onSave: (key: RuleKey, value: number) => void;
}) {
  const id = useId();
  const [text, setText] = useState(String(value));
  const [problem, setProblem] = useState('');

  function save() {
    const n = Number(text.trim());
    if (!Number.isInteger(n) || n < rule.min || n > rule.max) {
      setProblem(`Type a whole number from ${rule.min} to ${rule.max}.`);
      return;
    }
    setProblem('');
    if (n !== value) onSave(rule.key, n);
  }

  return (
    <div className="mb-3">
      <label htmlFor={id} className="mb-1 block text-sm font-medium">
        {rule.label}
      </label>
      <Input
        id={id}
        type="number"
        min={rule.min}
        max={rule.max}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onBlur={save}
        onKeyDown={(event) => {
          if (event.key === 'Enter') save();
        }}
        className="w-28"
        data-testid={`perf-rule-${rule.key}`}
      />
      {problem ? (
        <p role="alert" className="problem mt-1 text-sm">
          {problem}
        </p>
      ) : null}
      <p className="hint">{rule.hint}</p>
    </div>
  );
}

export function PerformanceSettingsSection({
  performance,
  changeSettings,
}: {
  performance: PerformanceSettings;
  changeSettings(patch: SettingsPatch): Promise<void>;
}) {
  const [oldData, setOldData] = useState(false);

  return (
    <div className="settings-group card" data-setting="performance">
      <h2>Weekly performance</h2>

      <label className="switch-row">
        <input
          type="checkbox"
          role="switch"
          className="switch"
          checked={performance.autoImportOnStartup}
          onChange={(event) =>
            void changeSettings({ performance: { autoImportOnStartup: event.target.checked } })
          }
          data-testid="perf-settings-auto-import"
        />
        Bring in new weekly files each time the app opens
      </label>
      <p className="hint">
        The app looks in the folders you chose on the Scorecards page, Imports tab, and brings in
        any file it has not seen before.
      </p>

      <h3 className="mt-5 mb-2 text-base font-semibold">Rules for the Dashboard lists</h3>
      {RULES.map((rule) => (
        <RuleInput
          key={`${rule.key}-${performance[rule.key]}`}
          rule={rule}
          value={performance[rule.key]}
          onSave={(key, value) => void changeSettings({ performance: { [key]: value } })}
        />
      ))}

      <h3 className="mt-5 mb-2 text-base font-semibold">
        Data from the old Weekly Performance App
      </h3>
      <Button onClick={() => setOldData(true)} data-testid="perf-bring-over-old-data">
        Bring over data from the old Weekly Performance App
      </Button>
      <p className="hint">
        Copies the drivers’ weekly scores, safety events and thresholds from the old app. It only
        works while this app has no weekly data yet, and it never writes over data.
      </p>
      {oldData ? (
        <OldDataDialog how="settings" about="performance" onClose={() => setOldData(false)} />
      ) : null}
    </div>
  );
}
