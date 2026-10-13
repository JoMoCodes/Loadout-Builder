// The app's one mailer: the weekly reports and the route sheets both go out through it. Ported
// from the old Weekly Performance app's EmailSender.cs (MailKit) to nodemailer, and extended for
// Route Sheet Distributor's mailer.js (an HTML part, and attachments given as bytes): SMTP with
// STARTTLS on 587 (Gmail) or TLS from the start on 465, logged in with the account's app
// password. One connection is opened for a whole batch and closed at the end. The transport is
// handed in, so the tests use a stand-in and nothing goes over the network.

import nodemailer from 'nodemailer';
import type { EmailSettings } from '../../shared/performanceSettings';

export interface SmtpConfig {
  host: string;
  port: number;
  username: string;
  password: string;
}

export interface MailAddress {
  name: string;
  address: string;
}

/** A file to attach: one on the disk (the reports), or bytes already in hand (a route sheet). */
export type MailAttachment =
  | { filename: string; path: string; content?: undefined; contentType?: undefined }
  | { filename: string; content: Uint8Array; contentType: string; path?: undefined };

export interface MailMessage {
  from: MailAddress;
  to: MailAddress;
  /** More people on the To line, after `to` (a route sheet chosen for two drivers). */
  moreTo?: MailAddress[];
  bcc?: string;
  subject: string;
  text: string;
  /** The same message as a web page, shown instead of `text` by mail apps that can. */
  html?: string;
  attachments?: MailAttachment[];
}

/** One open connection to the email server. */
export interface MailTransport {
  /** Connects and logs in. Throws when the server or the login refuses. */
  verify(): Promise<void>;
  send(message: MailMessage): Promise<void>;
  close(): void;
}

export type TransportFactory = (config: SmtpConfig) => MailTransport;

/** The real one: nodemailer, reusing one logged-in connection for every message. */
export const nodemailerTransport: TransportFactory = (config) => {
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    // 465 expects TLS from the first byte; anything else (587) must upgrade with STARTTLS.
    secure: config.port === 465,
    requireTLS: config.port !== 465,
    auth: { user: config.username, pass: config.password },
    pool: true,
    maxConnections: 1,
    connectionTimeout: 20_000,
    greetingTimeout: 20_000,
    socketTimeout: 60_000,
  });
  return {
    verify: async () => {
      await transport.verify();
    },
    send: async (message) => {
      const to = [message.to, ...(message.moreTo ?? [])].map((one) => ({
        name: one.name,
        address: one.address,
      }));
      await transport.sendMail({
        from: { name: message.from.name, address: message.from.address },
        to: to.length === 1 ? to[0] : to,
        bcc: message.bcc || undefined,
        subject: message.subject,
        text: message.text,
        ...(message.html !== undefined ? { html: message.html } : {}),
        attachments: message.attachments?.map((a) =>
          a.path !== undefined
            ? { filename: a.filename, path: a.path }
            : {
                filename: a.filename,
                content: Buffer.from(a.content),
                contentType: a.contentType,
              },
        ),
      });
    },
    close: () => transport.close(),
  };
};

/** What is missing before an email can be sent, in plain words, or null when nothing is. */
export function setupProblem(email: EmailSettings, password: string | null): string | null {
  if (!email.fromAddress.trim() || !password) {
    return 'Add the from address and the app password in Settings first.';
  }
  if (!email.smtpHost.trim()) {
    return 'Add the email server in Settings first (for Gmail it is smtp.gmail.com).';
  }
  return null;
}

/** The connection settings, with the from address as the username when none was given. */
export function smtpConfig(email: EmailSettings, password: string): SmtpConfig {
  return {
    host: email.smtpHost.trim(),
    port: email.smtpPort,
    username: email.username.trim() || email.fromAddress.trim(),
    password,
  };
}

/** The sender as the email shows it: the from name, or the address when there is no name. */
export function sender(email: EmailSettings): { name: string; address: string } {
  const address = email.fromAddress.trim();
  return { name: email.fromName.trim() || address, address };
}

function codeOf(error: unknown): string {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code: unknown }).code)
    : '';
}

function responseCodeOf(error: unknown): number {
  return typeof error === 'object' && error !== null && 'responseCode' in error
    ? Number((error as { responseCode: unknown }).responseCode)
    : 0;
}

/** Why connecting or logging in failed, in words a person can act on. */
export function describeConnectProblem(error: unknown): string {
  const code = codeOf(error);
  if (code === 'EAUTH' || responseCodeOf(error) === 535) {
    return (
      'The email server turned down the login. For Gmail: the from address must be the Google ' +
      'account that made the app password, 2-Step Verification must be on, and the password ' +
      'must be the 16-letter app password, not the normal Google password.'
    );
  }
  if (code === 'ETLS' || code === 'ESOCKET' || code === 'ECONNECTION' || code === 'EDNS') {
    return (
      'The app could not reach the email server. Check the server and port in Settings ' +
      '(Gmail uses smtp.gmail.com, port 587) and that the computer is online.'
    );
  }
  if (code === 'ETIMEDOUT') {
    return 'The email server did not answer in time. Check that the computer is online and try again.';
  }
  return 'The app could not connect to the email server. Check the email settings and try again.';
}

/** Why one message was not sent, in a few plain words. */
export function describeSendProblem(error: unknown): string {
  const code = codeOf(error);
  const response = responseCodeOf(error);
  if (code === 'EENVELOPE' || response === 550 || response === 553 || response === 501) {
    return 'the email server refused this address';
  }
  return 'the email could not be sent';
}
