// The "Email" part of the Settings page: the app's one email setup, used by the weekly reports and
// the route sheets (docs/RSD-MIGRATION-PLAN.md, section 3, item 4). The address and server, the
// app password (kept locked by the main process, never shown) and a test email. The subject and
// message of the weekly reports stay in the Weekly performance part: they are the reports' own.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { EmailStatus } from '../../../shared/performance';
import type { EmailSettings } from '../../../shared/performanceSettings';
import type { SettingsPatch } from '../../../shared/settings';
import { call, explain } from '../../lib/channels';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';

/** The fields of the email account (the rest of EmailSettings belongs to the weekly reports). */
const ACCOUNT_FIELDS = [
  'fromAddress',
  'fromName',
  'bccAddress',
  'username',
  'smtpHost',
] as const satisfies readonly (keyof EmailSettings)[];

type AccountField = (typeof ACCOUNT_FIELDS)[number];
type Account = Pick<EmailSettings, AccountField>;

function accountOf(email: EmailSettings): Account {
  return {
    fromAddress: email.fromAddress,
    fromName: email.fromName,
    bccAddress: email.bccAddress,
    username: email.username,
    smtpHost: email.smtpHost,
  };
}

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

export function EmailSettingsSection({
  email: saved,
  changeSettings,
}: {
  email: EmailSettings;
  changeSettings(patch: SettingsPatch): Promise<void>;
}) {
  const [account, setAccount] = useState<Account>(() => accountOf(saved));
  const [port, setPort] = useState(String(saved.smtpPort));
  const [emailNote, setEmailNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<EmailStatus | null>(null);
  const [passwordNote, setPasswordNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [testTo, setTestTo] = useState(saved.fromAddress);
  const [testNote, setTestNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    let off = false;
    void call('performance:email-status').then((reply) => {
      if (!off && reply.ok) setStatus(reply.value ?? null);
    });
    return () => {
      off = true;
    };
  }, []);

  // The settings can arrive after the page is drawn (or change in another window): fields the
  // person has not touched follow them.
  const before = useRef(saved);
  useEffect(() => {
    const was = before.current;
    before.current = saved;
    if (was === saved) return;
    setAccount((now) =>
      ACCOUNT_FIELDS.some((key) => now[key] !== was[key]) ? now : accountOf(saved),
    );
    setPort((now) => (now === String(was.smtpPort) ? String(saved.smtpPort) : now));
    setTestTo((now) => (now === was.fromAddress ? saved.fromAddress : now));
  }, [saved]);

  const changed =
    port !== String(saved.smtpPort) || ACCOUNT_FIELDS.some((key) => account[key] !== saved[key]);

  function set(key: AccountField, value: string) {
    setAccount((now) => ({ ...now, [key]: value }));
    setEmailNote(null);
  }

  /** Saves the email fields; false (with words shown) when the port will not do. */
  async function saveEmail(): Promise<boolean> {
    const n = Number(port.trim());
    if (!Number.isInteger(n) || n < 1 || n > 65535) {
      setEmailNote({ ok: false, text: 'The port must be a whole number, like 587.' });
      return false;
    }
    await changeSettings({ email: { ...saved, ...account, smtpPort: n } });
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
    <div className="settings-group card" data-setting="email">
      <h2>Email</h2>
      <p className="hint mb-3">
        The reports are sent from a Gmail address. To let the app send from it, Gmail needs an app
        password (not your usual password): sign in to your Google Account, turn on 2-Step
        Verification, then search for <strong>App passwords</strong>, make one for “Loadout
        Builder”, and paste the 16 letters below.
      </p>
      <div className="grid gap-x-4 md:grid-cols-2">
        <Field label="Send from (email address)">
          <Input
            value={account.fromAddress}
            onChange={(event) => set('fromAddress', event.target.value)}
            data-testid="email-from"
          />
        </Field>
        <Field label="Name people see it from" hint="Leave empty to show the email address.">
          <Input
            value={account.fromName}
            onChange={(event) => set('fromName', event.target.value)}
            data-testid="email-from-name"
          />
        </Field>
        <Field label="Send a hidden copy to" hint="Leave empty for no hidden copy.">
          <Input
            value={account.bccAddress}
            onChange={(event) => set('bccAddress', event.target.value)}
            data-testid="email-bcc"
          />
        </Field>
        <Field
          label="User name"
          hint="Usually the same as the send-from address. Leave empty to use it."
        >
          <Input
            value={account.username}
            onChange={(event) => set('username', event.target.value)}
            data-testid="email-username"
          />
        </Field>
        <Field label="Mail server" hint="smtp.gmail.com for Gmail.">
          <Input
            value={account.smtpHost}
            onChange={(event) => set('smtpHost', event.target.value)}
            data-testid="email-host"
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
            data-testid="email-port"
          />
        </Field>
      </div>
      <div className="row-of-buttons mt-3">
        <Button
          variant="primary"
          disabled={!changed}
          onClick={() => void saveEmail()}
          data-testid="email-save"
        >
          Save email settings
        </Button>
        <Button
          disabled={!changed}
          onClick={() => {
            setAccount(accountOf(saved));
            setPort(String(saved.smtpPort));
            setEmailNote(null);
          }}
          data-testid="email-undo"
        >
          Undo changes
        </Button>
      </div>
      {note(emailNote, 'email-note')}

      <h3 className="mt-5 mb-2 text-base font-semibold">App password</h3>
      <p className="m-0 text-sm" data-testid="email-password-status">
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
        <label className="sr-only" htmlFor="email-password">
          App password
        </label>
        <Input
          id="email-password"
          type="password"
          autoComplete="off"
          value={password}
          placeholder="Paste the app password"
          onChange={(event) => setPassword(event.target.value)}
          className="w-64"
          data-testid="email-password"
        />
        <Button type="submit" disabled={!password.trim()} data-testid="email-password-save">
          Save password
        </Button>
        <Button
          variant="ghost"
          disabled={!status?.passwordSaved}
          onClick={() => void savePassword('')}
          data-testid="email-password-forget"
        >
          Forget it
        </Button>
      </form>
      {note(passwordNote, 'email-password-note')}

      <h3 className="mt-5 mb-2 text-base font-semibold">Send a test email</h3>
      <div className="row-of-buttons">
        <label className="sr-only" htmlFor="email-test-to">
          Send the test to
        </label>
        <Input
          id="email-test-to"
          value={testTo}
          placeholder="Your email address"
          onChange={(event) => setTestTo(event.target.value)}
          className="w-64"
          data-testid="email-test-to"
        />
        <Button onClick={() => void sendTest()} disabled={testing} data-testid="email-test">
          {testing ? 'Sending...' : 'Send test email'}
        </Button>
      </div>
      <p className="hint">
        Sends a short email with no report attached, to check the settings work. Unsaved changes
        above are saved first.
      </p>
      {note(testNote, 'email-test-note')}
    </div>
  );
}
