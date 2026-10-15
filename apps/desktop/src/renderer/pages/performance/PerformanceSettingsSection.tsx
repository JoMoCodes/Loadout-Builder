// The "Weekly performance" part of the Settings page: auto-import, the rule numbers behind the
// Dashboard's lists, the subject and message of the report emails, and bringing over the old
// Weekly Performance App's data. Ported from the old app's email settings window and its PDF
// settings. The email account itself is the Email part (settings/EmailSettingsSection.tsx).

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { EmailSettings, PerformanceSettings } from '../../../shared/performanceSettings';
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

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="mb-3">
      <label className="block">
        <span className="mb-1 block text-sm font-medium">{label}</span>
        {children}
      </label>
      {hint ? <p className="hint">{hint}</p> : null}
    </div>
  );
}

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
  email: saved,
  changeSettings,
}: {
  performance: PerformanceSettings;
  /** The app's email setup (Settings > Email): only the reports' subject and message are here. */
  email: EmailSettings;
  changeSettings(patch: SettingsPatch): Promise<void>;
}) {
  const [subject, setSubject] = useState(saved.subjectTemplate);
  const [body, setBody] = useState(saved.bodyTemplate);
  const [emailNote, setEmailNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [oldData, setOldData] = useState(false);

  // The settings can arrive after the page is drawn: words not yet changed here follow them.
  const before = useRef(saved);
  useEffect(() => {
    const was = before.current;
    before.current = saved;
    if (was === saved) return;
    setSubject((now) => (now === was.subjectTemplate ? saved.subjectTemplate : now));
    setBody((now) => (now === was.bodyTemplate ? saved.bodyTemplate : now));
  }, [saved]);

  const changed = subject !== saved.subjectTemplate || body !== saved.bodyTemplate;

  async function saveWords() {
    await changeSettings({ email: { ...saved, subjectTemplate: subject, bodyTemplate: body } });
    setEmailNote({ ok: true, text: 'Email settings saved.' });
  }

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

      <h3 className="mt-5 mb-2 text-base font-semibold">Emailing the reports</h3>
      <p className="hint mb-3">
        The reports are sent with the app&apos;s email setup, in the Email part below.
      </p>
      <Field label="Subject">
        <Input
          value={subject}
          onChange={(event) => {
            setSubject(event.target.value);
            setEmailNote(null);
          }}
          data-testid="perf-email-subject"
        />
      </Field>
      <Field label="Message">
        <textarea
          value={body}
          onChange={(event) => {
            setBody(event.target.value);
            setEmailNote(null);
          }}
          rows={7}
          className="w-full rounded-md border border-line-strong bg-sunken px-2.5 py-1.5 text-sm text-fg focus-visible:border-focus"
          data-testid="perf-email-body"
        />
      </Field>
      <p className="hint">
        In the subject and message, <strong>{'{name}'}</strong> becomes the driver’s name, and{' '}
        <strong>{'{from}'}</strong> and <strong>{'{to}'}</strong> become the first and last week of
        the report.
      </p>
      <div className="row-of-buttons mt-3">
        <Button
          variant="primary"
          disabled={!changed}
          onClick={() => void saveWords()}
          data-testid="perf-email-save"
        >
          Save subject and message
        </Button>
        <Button
          disabled={!changed}
          onClick={() => {
            setSubject(saved.subjectTemplate);
            setBody(saved.bodyTemplate);
            setEmailNote(null);
          }}
          data-testid="perf-email-undo"
        >
          Undo changes
        </Button>
      </div>
      {emailNote ? (
        <p role="status" className="mt-2 text-sm text-ok" data-testid="perf-email-note">
          {emailNote.text}
        </p>
      ) : null}

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
