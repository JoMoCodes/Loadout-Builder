// The app's one email account (Settings > Email): the settings a page sees, and the app password,
// which only the main process keeps, sealed by the computer's safe storage. The weekly reports
// (PerfService) and the route sheets (RouteSheetsHost) both send through it. Everything that needs
// Electron or the network is handed in, so the tests run it with stand-ins.

import type { EmailStatus } from '../../shared/performance';
import type { EmailSettings } from '../../shared/performanceSettings';
import { ChannelRefusal } from '../channels';
import type { MainOnlySettings } from '../settingsFile';
import {
  describeConnectProblem,
  describeSendProblem,
  sender,
  setupProblem,
  smtpConfig,
  type MailTransport,
  type TransportFactory,
} from './mailer';

/** The computer's safe storage for the app password (Electron's safeStorage). */
export interface Sealer {
  isEncryptionAvailable(): boolean;
  encryptString(plain: string): Buffer;
  decryptString(sealed: Buffer): string;
}

export interface EmailAccountDeps {
  /** The email settings as they are now (AppSettings.email). */
  settings(): EmailSettings;
  mainOnly(): MainOnlySettings;
  updateMainOnly(change: (current: MainOnlySettings) => MainOnlySettings): void;
  sealer: Sealer;
  transport: TransportFactory;
  /** Counts and codes only. */
  log(message: string): void;
}

export class EmailAccount {
  constructor(private readonly deps: EmailAccountDeps) {}

  settings(): EmailSettings {
    return this.deps.settings();
  }

  /** The saved app password, unsealed, or null (none saved, or sealed on another computer). */
  password(): string | null {
    const sealed = this.deps.mainOnly().emailPasswordSealed;
    if (!sealed) return null;
    try {
      if (!this.deps.sealer.isEncryptionAvailable()) return null;
      const plain = this.deps.sealer.decryptString(Buffer.from(sealed, 'base64'));
      return plain === '' ? null : plain;
    } catch {
      return null;
    }
  }

  status(): EmailStatus {
    let canSeal: boolean;
    try {
      canSeal = this.deps.sealer.isEncryptionAvailable();
    } catch {
      canSeal = false;
    }
    return { passwordSaved: this.password() !== null, canSeal };
  }

  /** What is missing before an email can be sent, in plain words, or null when nothing is. */
  problem(): string | null {
    return setupProblem(this.deps.settings(), this.password());
  }

  ready(): boolean {
    return this.problem() === null;
  }

  /** Saves (or, with an empty one, forgets) the app password. Gmail's spaces are taken out. */
  setPassword(password: string): EmailStatus {
    if (password === '') {
      this.deps.updateMainOnly((kept) => ({ ...kept, emailPasswordSealed: null }));
      return this.status();
    }
    if (!this.status().canSeal) {
      throw new ChannelRefusal(
        'refused',
        "This computer can't keep the password safe, so it was not saved.",
      );
    }
    // Gmail shows the app password in groups of four; the spaces are not part of it.
    const sealed = this.deps.sealer.encryptString(password.replace(/\s+/g, '')).toString('base64');
    this.deps.updateMainOnly((kept) => ({ ...kept, emailPasswordSealed: sealed }));
    this.deps.log('email: app password saved');
    return this.status();
  }

  /**
   * A connection to the email server, not yet logged in (call `verify`, and `close` when done),
   * with the settings it was made from. Refuses in plain words when the setup is not finished.
   */
  open(): { transport: MailTransport; settings: EmailSettings } {
    const settings = this.deps.settings();
    const password = this.password();
    const problem = setupProblem(settings, password);
    if (problem !== null || password === null) {
      throw new ChannelRefusal('refused', problem ?? 'Add the app password in Settings first.');
    }
    return { transport: this.deps.transport(smtpConfig(settings, password)), settings };
  }

  /** Sends Send test email's short message, to `to` or to the from address. */
  async sendTest(to: string | undefined): Promise<{ sent: boolean; problem: string | null }> {
    const { transport, settings } = this.open();
    const address = to?.trim() || settings.fromAddress.trim();
    try {
      await transport.verify();
    } catch (error) {
      transport.close();
      this.deps.log('email test: could not connect');
      return { sent: false, problem: describeConnectProblem(error) };
    }
    try {
      await transport.send({
        from: sender(settings),
        to: { name: '', address },
        subject: 'Test email from Loadout Builder',
        text:
          'This is a test message to check that the email settings work.\n\n' +
          'If you got it, the app can send email from this account.',
      });
      this.deps.log('email test: sent');
      return { sent: true, problem: null };
    } catch (error) {
      this.deps.log('email test: not sent');
      const reason = describeSendProblem(error).replace(/\.$/, '');
      return { sent: false, problem: `The test email was not sent: ${reason}.` };
    } finally {
      transport.close();
    }
  }
}
