// The email rules ported from the old EmailSender.cs: who the email is from, how the connection is
// made (port 465 secure from the start, 587 upgraded), and the plain words for what went wrong.
// nodemailer is replaced by a stand-in, so nothing goes over the network.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_EMAIL } from '../../shared/performanceSettings';

const created: Array<Record<string, unknown>> = [];
vi.mock('nodemailer', () => ({
  default: {
    createTransport: (options: Record<string, unknown>) => {
      created.push(options);
      return { verify: async () => true, sendMail: async () => ({}), close: () => undefined };
    },
  },
}));

const { describeConnectProblem, nodemailerTransport, sender, smtpConfig } =
  await import('./mailer');

beforeEach(() => {
  created.length = 0;
});

describe('the email setup', () => {
  it('shows the from address as the sender name when the name is blank', () => {
    const email = { ...DEFAULT_EMAIL, fromAddress: 'dispatch@example.com' };
    expect(sender({ ...email, fromName: '  ' })).toEqual({
      name: 'dispatch@example.com',
      address: 'dispatch@example.com',
    });
    expect(sender({ ...email, fromName: 'Dispatch' }).name).toBe('Dispatch');
  });

  it('logs in with the from address when the user name is blank', () => {
    const email = { ...DEFAULT_EMAIL, fromAddress: 'dispatch@example.com' };
    expect(smtpConfig(email, 'secret').username).toBe('dispatch@example.com');
    expect(smtpConfig({ ...email, username: 'other@example.com' }, 'secret').username).toBe(
      'other@example.com',
    );
  });

  it('starts set for Gmail, and port 465 is secure from the start while 587 upgrades', () => {
    expect([DEFAULT_EMAIL.smtpHost, DEFAULT_EMAIL.smtpPort]).toEqual(['smtp.gmail.com', 587]);
    const config = { host: 'smtp.gmail.com', username: 'a@example.com', password: 'x' };
    nodemailerTransport({ ...config, port: 587 });
    nodemailerTransport({ ...config, port: 465 });
    expect(created.map((o) => [o.port, o.secure, o.requireTLS])).toEqual([
      [587, false, true],
      [465, true, false],
    ]);
  });
});

describe('what went wrong, in plain words', () => {
  it('says what to check after a turned-down login or a failed secure connection', () => {
    expect(describeConnectProblem({ code: 'EAUTH' })).toMatch(
      /turned down the login.*app password/,
    );
    expect(describeConnectProblem({ responseCode: 535 })).toMatch(/turned down the login/);
    expect(describeConnectProblem({ code: 'ETLS' })).toMatch(/server and port in Settings/);
    expect(describeConnectProblem({ code: 'ETIMEDOUT' })).toMatch(/did not answer in time/);
    expect(describeConnectProblem(new Error('odd'))).toMatch(/Check the email settings/);
  });
});
