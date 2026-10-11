// The "Weekly performance" part of the Settings page: auto-import, the rule numbers behind the
// Dashboard's lists, how the reports are emailed, and bringing over the old Weekly Performance
// App's data. Ported from the old app's email settings window and its PDF settings.

import { useEffect, useId, useState, type ReactNode } from 'react';
import type { EmailStatus } from '../../../shared/performance';
import type { EmailSettings, PerformanceSettings } from '../../../shared/performanceSettings';
import type { SettingsPatch } from '../../../shared/settings';
import { call, explain } from '../../lib/channels';
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
  changeSettings,
}: {
  performance: PerformanceSettings;
  changeSettings(patch: SettingsPatch): Promise<void>;
}) {
  const [email, setEmail] = useState<EmailSettings>(performance.email);
  const [port, setPort] = useState(String(performance.email.smtpPort));
  const [emailNote, setEmailNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<EmailStatus | null>(null);
  const [passwordNote, setPasswordNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [testTo, setTestTo] = useState(performance.email.fromAddress);
  const [testNote, setTestNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [oldData, setOldData] = useState(false);

  useEffect(() => {
    let off = false;
    void call('performance:email-status').then((reply) => {
      if (!off && reply.ok) setStatus(reply.value ?? null);
    });
    return () => {
      off = true;
    };
  }, []);

  const saved = performance.email;
  const changed =
    port !== String(saved.smtpPort) ||
    (Object.keys(email) as (keyof EmailSettings)[]).some(
      (key) => key !== 'smtpPort' && email[key] !== saved[key],
    );

  function set<K extends keyof EmailSettings>(key: K, value: EmailSettings[K]) {
    setEmail((now) => ({ ...now, [key]: value }));
    setEmailNote(null);
  }

  /** Saves the email fields; false (with words shown) when the port will not do. */
  async function saveEmail(): Promise<boolean> {
    const n = Number(port.trim());
    if (!Number.isInteger(n) || n < 1 || n > 65535) {
      setEmailNote({ ok: false, text: 'The port must be a whole number, like 587.' });
      return false;
    }
    await changeSettings({ performance: { email: { ...email, smtpPort: n } } });
    setEmailNote({ ok: true, text: 'Email settings saved.' });
    return true;
  }

  async function savePassword(value: string) {
    // Spaces pasted in from Google's page are taken out, as the old app did.
    const reply = await call('performance:set-email-password', {
      password: value.replace(/\s+/g, ''),
    });
    setPassword('');
    if (!reply.ok) {
      setPasswordNote({ ok: false, text: explain(reply) });
      return;
    }
    if (reply.value) setStatus(reply.value);
    setPasswordNote({
      ok: true,
      text: value.trim() ? 'App password saved.' : 'App password forgotten.',
    });
  }

  async function sendTest() {
    if (testing) return;
    setTesting(true);
    setTestNote(null);
    try {
      if (changed && !(await saveEmail())) return;
      const to = testTo.trim();
      const reply = await call('performance:email-test', { to: to || undefined });
      if (!reply.ok) setTestNote({ ok: false, text: explain(reply) });
      else if (reply.value?.sent)
        setTestNote({ ok: true, text: 'Test email sent. Check the inbox.' });
      else
        setTestNote({
          ok: false,
          text: reply.value?.problem ?? 'The test email was not sent. Check the settings above.',
        });
    } finally {
      setTesting(false);
    }
  }

  const note = (value: { ok: boolean; text: string } | null, testId: string) =>
    value ? (
      <p
        role={value.ok ? 'status' : 'alert'}
        className={value.ok ? 'mt-2 text-sm text-ok' : 'problem mt-2 text-sm'}
        data-testid={testId}
      >
        {value.text}
      </p>
    ) : null;

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
        The app looks in the folders you chose on the Performance page, Imports tab, and brings in
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
        The reports are sent from a Gmail address. To let the app send from it, Gmail needs an app
        password (not your usual password): sign in to your Google Account, turn on 2-Step
        Verification, then search for <strong>App passwords</strong>, make one for “Loadout
        Builder”, and paste the 16 letters below.
      </p>
      <div className="grid gap-x-4 md:grid-cols-2">
        <Field label="Send from (email address)">
          <Input
            value={email.fromAddress}
            onChange={(event) => set('fromAddress', event.target.value)}
            data-testid="perf-email-from"
          />
        </Field>
        <Field label="Name people see it from" hint="Leave empty to show the email address.">
          <Input
            value={email.fromName}
            onChange={(event) => set('fromName', event.target.value)}
            data-testid="perf-email-from-name"
          />
        </Field>
        <Field label="Send a hidden copy to" hint="Leave empty for no hidden copy.">
          <Input
            value={email.bccAddress}
            onChange={(event) => set('bccAddress', event.target.value)}
            data-testid="perf-email-bcc"
          />
        </Field>
        <Field
          label="User name"
          hint="Usually the same as the send-from address. Leave empty to use it."
        >
          <Input
            value={email.username}
            onChange={(event) => set('username', event.target.value)}
            data-testid="perf-email-username"
          />
        </Field>
        <Field label="Mail server" hint="smtp.gmail.com for Gmail.">
          <Input
            value={email.smtpHost}
            onChange={(event) => set('smtpHost', event.target.value)}
            data-testid="perf-email-host"
          />
        </Field>
        <Field label="Port" hint="587 for Gmail.">
          <Input
            value={port}
            inputMode="numeric"
            onChange={(event) => {
              setPort(event.target.value);
              setEmailNote(null);
            }}
            className="w-28"
            data-testid="perf-email-port"
          />
        </Field>
      </div>
      <Field label="Subject">
        <Input
          value={email.subjectTemplate}
          onChange={(event) => set('subjectTemplate', event.target.value)}
          data-testid="perf-email-subject"
        />
      </Field>
      <Field label="Message">
        <textarea
          value={email.bodyTemplate}
          onChange={(event) => set('bodyTemplate', event.target.value)}
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
          onClick={() => void saveEmail()}
          data-testid="perf-email-save"
        >
          Save email settings
        </Button>
        <Button
          disabled={!changed}
          onClick={() => {
            setEmail(saved);
            setPort(String(saved.smtpPort));
            setEmailNote(null);
          }}
          data-testid="perf-email-undo"
        >
          Undo changes
        </Button>
      </div>
      {note(emailNote, 'perf-email-note')}

      <h3 className="mt-5 mb-2 text-base font-semibold">App password</h3>
      <p className="m-0 text-sm" data-testid="perf-password-status">
        {status === null
          ? 'Checking...'
          : status.passwordSaved
            ? 'Saved. The app keeps it locked on this computer and never shows it.'
            : 'Not saved.'}
      </p>
      {status && !status.canSeal ? (
        <p role="alert" className="problem mt-1 text-sm">
          This computer cannot keep a password locked away, so the app will not save one.
        </p>
      ) : null}
      <form
        className="row-of-buttons mt-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (password.trim()) void savePassword(password);
        }}
      >
        <label className="sr-only" htmlFor="perf-password">
          App password
        </label>
        <Input
          id="perf-password"
          type="password"
          autoComplete="off"
          value={password}
          placeholder="Paste the app password"
          onChange={(event) => setPassword(event.target.value)}
          className="w-64"
          data-testid="perf-password"
        />
        <Button type="submit" disabled={!password.trim()} data-testid="perf-password-save">
          Save password
        </Button>
        <Button
          variant="ghost"
          disabled={!status?.passwordSaved}
          onClick={() => void savePassword('')}
          data-testid="perf-password-forget"
        >
          Forget it
        </Button>
      </form>
      {note(passwordNote, 'perf-password-note')}

      <h3 className="mt-5 mb-2 text-base font-semibold">Send a test email</h3>
      <div className="row-of-buttons">
        <label className="sr-only" htmlFor="perf-test-to">
          Send the test to
        </label>
        <Input
          id="perf-test-to"
          value={testTo}
          placeholder="Your email address"
          onChange={(event) => setTestTo(event.target.value)}
          className="w-64"
          data-testid="perf-test-to"
        />
        <Button onClick={() => void sendTest()} disabled={testing} data-testid="perf-email-test">
          {testing ? 'Sending...' : 'Send test email'}
        </Button>
      </div>
      <p className="hint">
        Sends a short email with no report attached, to check the settings work. Unsaved changes
        above are saved first.
      </p>
      {note(testNote, 'perf-test-note')}

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
