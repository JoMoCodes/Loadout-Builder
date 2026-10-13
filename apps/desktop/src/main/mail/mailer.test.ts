// The email rules ported from the old EmailSender.cs: who the email is from, how the connection is
// made (port 465 secure from the start, 587 upgraded), and the plain words for what went wrong.
// The twins of Route Sheet Distributor's two mailer tests are here too, against this app's mailer.
// nodemailer is replaced by a stand-in, so nothing goes over the network.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_EMAIL } from '../../shared/performanceSettings';

const created: Array<Record<string, unknown>> = [];
const mailed: Array<Record<string, unknown>> = [];
vi.mock('nodemailer', () => ({
  default: {
    createTransport: (options: Record<string, unknown>) => {
      created.push(options);
      return {
        verify: async () => true,
        sendMail: async (message: Record<string, unknown>) => {
          mailed.push(message);
          return {};
        },
        close: () => undefined,
      };
    },
  },
}));

const {
  describeConnectProblem,
  describeSendProblem,
  nodemailerTransport,
  sender,
  setupProblem,
  smtpConfig,
} = await import('./mailer');

beforeEach(() => {
  created.length = 0;
  mailed.length = 0;
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

describe('Route Sheet Distributor’s mailer rules, in this app’s mailer', () => {
  it('Mailer: Gmail defaults use STARTTLS on 587; 465 uses TLS from the start', () => {
    const email = { ...DEFAULT_EMAIL, fromAddress: 'me@example.com' };
    expect(email.smtpHost).toBe('smtp.gmail.com');
    const config = smtpConfig(email, 'pw');
    expect(config).toEqual({
      host: 'smtp.gmail.com',
      port: 587,
      // The login defaults to the From address.
      username: 'me@example.com',
      password: 'pw',
    });
    nodemailerTransport(config);
    nodemailerTransport(smtpConfig({ ...email, smtpPort: 465, username: 'other' }, 'pw'));
    expect(created.map((o) => [o.port, o.secure, o.requireTLS])).toEqual([
      [587, false, true],
      [465, true, false],
    ]);
    expect(created[0]!.auth).toEqual({ user: 'me@example.com', pass: 'pw' });
    expect(created[1]!.auth).toEqual({ user: 'other', pass: 'pw' });
    // One connection is reused for a whole batch.
    expect([created[0]!.pool, created[0]!.maxConnections]).toEqual([true, 1]);
  });

  it('Mailer: explains what is missing and turns SMTP errors into plain words', () => {
    const blank = { ...DEFAULT_EMAIL };
    expect(setupProblem(blank, 'pw')).toMatch(/from address/);
    expect(setupProblem({ ...blank, fromAddress: 'me@example.com' }, null)).toMatch(/app password/);
    expect(setupProblem({ ...blank, fromAddress: 'me@example.com', smtpHost: ' ' }, 'pw')).toMatch(
      /email server/,
    );
    expect(setupProblem({ ...blank, fromAddress: 'me@example.com' }, 'pw')).toBeNull();
    expect(describeConnectProblem({ code: 'EAUTH', message: 'Invalid login' })).toMatch(
      /app password/,
    );
    expect(describeConnectProblem({ code: 'ETIMEDOUT', message: 'timeout' })).toMatch(
      /did not answer in time/,
    );
    expect(describeConnectProblem({ code: 'ECONNECTION' })).toMatch(/could not reach/);
    expect(describeSendProblem({ code: 'EENVELOPE', responseCode: 550 })).toBe(
      'the email server refused this address',
    );
    expect(describeSendProblem(new Error('odd'))).toBe('the email could not be sent');
  });

  it('Mailer: the old setup checks, in order: the port, the from address, the BCC address', () => {
    const ok = { ...DEFAULT_EMAIL, fromAddress: 'me@example.com' };
    expect(setupProblem({ ...ok, smtpPort: 0 }, 'pw')).toBe('The mail server port is not valid.');
    expect(setupProblem({ ...ok, smtpPort: 65536 }, 'pw')).toBe(
      'The mail server port is not valid.',
    );
    expect(setupProblem({ ...ok, smtpPort: 65535 }, 'pw')).toBeNull();
    expect(setupProblem({ ...ok, fromAddress: 'nope' }, 'pw')).toBe(
      '"nope" is not a valid email address.',
    );
    // The port is checked before the address.
    expect(setupProblem({ ...ok, fromAddress: 'nope', smtpPort: 0 }, 'pw')).toBe(
      'The mail server port is not valid.',
    );
    expect(setupProblem({ ...ok, bccAddress: 'x' }, 'pw')).toBe(
      'The BCC address "x" is not a valid email address.',
    );
    expect(setupProblem({ ...ok, bccAddress: 'lead@example.com' }, 'pw')).toBeNull();
    // The earlier checks keep their words.
    expect(setupProblem({ ...ok, fromAddress: '', smtpPort: 0 }, 'pw')).toBe(
      'Add the from address and the app password in Settings first.',
    );
  });

  it('Mailer: Gmail’s daily sending limit is said in plain words', () => {
    const words =
      'Gmail says this account hit its daily sending limit. Try again tomorrow, or send the rest with Export all.';
    expect(
      describeSendProblem({
        responseCode: 550,
        response: '550 5.4.5 Daily user sending limit exceeded',
      }),
    ).toBe(words);
    expect(describeSendProblem(new Error('Message rejected: sending limit exceeded'))).toBe(words);
    expect(describeConnectProblem({ response: '421 Daily user sending limit exceeded' })).toBe(
      words,
    );
  });

  it('sends the HTML part, everyone on the To line, and attachments from a file or as bytes', async () => {
    const transport = nodemailerTransport({
      host: 'smtp.gmail.com',
      port: 587,
      username: 'dispatch@example.com',
      password: 'pw',
    });
    const bytes = new Uint8Array([37, 80, 68, 70]);
    await transport.send({
      from: { name: 'Dispatch', address: 'dispatch@example.com' },
      to: { name: 'Adrian Danforth', address: 'adrian@example.com' },
      moreTo: [{ name: 'Barrett Ainsworth', address: 'barrett@example.com' }],
      subject: 'CX1',
      text: 'plain',
      html: '<p>page</p>',
      attachments: [
        { filename: 'CX1.pdf', content: bytes, contentType: 'application/pdf' },
        { filename: 'report.pdf', path: '/tmp/report.pdf' },
      ],
    });
    await transport.send({
      from: { name: 'Dispatch', address: 'dispatch@example.com' },
      to: { name: 'Adrian Danforth', address: 'adrian@example.com' },
      subject: 'Report',
      text: 'plain',
    });
    const [first, second] = mailed;
    expect(first!.to).toEqual([
      { name: 'Adrian Danforth', address: 'adrian@example.com' },
      { name: 'Barrett Ainsworth', address: 'barrett@example.com' },
    ]);
    expect(first!.html).toBe('<p>page</p>');
    const files = first!.attachments as Array<Record<string, unknown>>;
    expect(files[0]!.contentType).toBe('application/pdf');
    expect([...(files[0]!.content as Uint8Array)]).toEqual([37, 80, 68, 70]);
    expect(files[1]).toEqual({ filename: 'report.pdf', path: '/tmp/report.pdf' });
    // The weekly reports' messages are what they were: one person, text only.
    expect(second!.to).toEqual({ name: 'Adrian Danforth', address: 'adrian@example.com' });
    expect(second).not.toHaveProperty('html');
  });
});
