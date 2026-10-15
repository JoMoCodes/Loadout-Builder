// The "Dashboard settings" window: the four rule numbers behind the Dashboard's lists (the ID
// expiry window, the two "weeks running" flags and how many movers to list). Opened by the gear
// button next to the Dashboard's title. Each number saves when you leave the box or press Enter,
// and an odd number is refused in plain words. Ported from the old app's settings window.

import { Settings } from 'lucide-react';
import { useId, useState } from 'react';
import type { PerformanceSettings } from '../../../shared/performanceSettings';
import type { SettingsPatch } from '../../../shared/settings';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Modal } from '../dataPages/Modal';

export const RULES = [
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
          // Enter saves this number; it does not close the window.
          if (event.key === 'Enter') {
            event.preventDefault();
            save();
          }
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

export function DashboardSettingsDialog({
  performance,
  changeSettings,
  onDone,
}: {
  performance: PerformanceSettings;
  changeSettings(patch: SettingsPatch): Promise<void>;
  onDone(): void;
}) {
  return (
    <Modal
      name="dashboard-settings"
      title="Dashboard settings"
      lead="The rules behind the Dashboard's lists. Each number saves as soon as you leave its box."
      confirmLabel="Close"
      onConfirm={onDone}
      noValidate
    >
      <div className="my-2">
        {RULES.map((rule) => (
          <RuleInput
            key={`${rule.key}-${performance[rule.key]}`}
            rule={rule}
            value={performance[rule.key]}
            onSave={(key, value) => void changeSettings({ performance: { [key]: value } })}
          />
        ))}
      </div>
    </Modal>
  );
}

/** The gear button next to the Dashboard's title that opens the window. */
export function DashboardSettingsButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      onClick={onClick}
      aria-haspopup="dialog"
      title="The rule numbers behind the Dashboard's lists"
      data-testid="dashboard-settings"
    >
      <Settings aria-hidden="true" />
      Dashboard settings
    </Button>
  );
}
