// The app's one email account: the twin of Route Sheet Distributor's email settings test, against
// this app's settings file and its sealed app password. The computer's safe storage is a stand-in.

import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mergeSettings, type AppSettings } from '../../shared/settings';
import { SettingsFile } from '../settingsFile';
import { EmailAccount, type Sealer } from './emailAccount';

let folder: string;
beforeEach(() => {
  folder = mkdtempSync(path.join(tmpdir(), 'loadout-email-account-'));
});
afterEach(() => rmSync(folder, { recursive: true, force: true }));

const sealer = (available = true): Sealer => ({
  isEncryptionAvailable: () => available,
  encryptString: (plain) => Buffer.from(`enc:${Buffer.from(plain).toString('base64')}`),
  decryptString: (sealed) => {
    const text = sealed.toString();
    if (!text.startsWith('enc:')) throw new Error('not ours');
    return Buffer.from(text.slice(4), 'base64').toString();
  },
});

function account(file: SettingsFile, settings: () => AppSettings, available = true) {
  return new EmailAccount({
    settings: () => settings().email,
    mainOnly: () => file.getMainOnly(),
    updateMainOnly: (change) => void file.updateMainOnly(change),
    sealer: sealer(available),
    transport: () => {
      throw new Error('no network in this test');
    },
    log: () => undefined,
  });
}

describe('the email account', () => {
  it('Email settings: App Password is stored encrypted, Gmail spaces removed, unreadable blobs count as not set', () => {
    const where = path.join(folder, 'settings.json');
    const file = new SettingsFile(where);
    let settings = file.load();
    const mail = account(file, () => settings);
    expect(mail.problem()).toMatch(/from address/);

    settings = mergeSettings(settings, {
      email: { fromAddress: 'dispatch@example.com', fromName: 'Dispatch' },
    });
    file.save(settings);
    const status = mail.setPassword('abcd efgh ijkl mnop');
    expect(status).toEqual({ passwordSaved: true, canSeal: true });
    expect(mail.problem()).toBeNull();
    // The password is never handed back: only whether one is saved.
    expect(JSON.stringify(status)).not.toContain('abcd');
    const raw = readFileSync(where, 'utf8');
    expect(raw).not.toContain('abcd');
    expect(raw).not.toContain('abcdefghijklmnop');
    expect(mail.password()).toBe('abcdefghijklmnop');

    // Saving the other settings keeps the saved password.
    settings = mergeSettings(settings, { email: { fromName: 'Dispatch 2' } });
    file.save(settings);
    expect(mail.password()).toBe('abcdefghijklmnop');

    // Sealed on another computer: it counts as not set.
    file.updateMainOnly((kept) => ({
      ...kept,
      emailPasswordSealed: Buffer.from('from-another-pc').toString('base64'),
    }));
    expect(mail.status().passwordSaved).toBe(false);
    expect(mail.problem()).toMatch(/app password/);

    mail.setPassword('x');
    expect(mail.status().passwordSaved).toBe(true);
    expect(mail.setPassword('').passwordSaved).toBe(false);
    expect(() => account(file, () => settings, false).setPassword('x')).toThrow(
      /can't keep the password safe/,
    );
  });

  it('is the one setup: an older settings file’s weekly performance email comes up to the top', () => {
    const where = path.join(folder, 'settings.json');
    const older = {
      theme: 'light',
      performance: { email: { fromAddress: 'dispatch@example.com', smtpPort: 465 } },
    };
    const io = { read: () => older, write: () => true };
    const settings = new SettingsFile(where, io).load();
    expect(settings.email).toMatchObject({ fromAddress: 'dispatch@example.com', smtpPort: 465 });
    // The copy under performance stays equal, for the pages that still read it there.
    expect(settings.performance.email).toEqual(settings.email);
    // Once the top one is saved, it is the one that counts.
    const later = mergeSettings(settings, { email: { fromName: 'Dispatch' } });
    const reread = mergeSettings(mergeSettings(settings, {}), JSON.parse(JSON.stringify(later)));
    expect(reread.email.fromName).toBe('Dispatch');
    // A page that still sends the email under performance changes the same setup.
    const fromPage = mergeSettings(later, {
      performance: { email: { bccAddress: 'lead@example.com' } },
    });
    expect(fromPage.email.bccAddress).toBe('lead@example.com');
    expect(fromPage.email.fromName).toBe('Dispatch');
  });
});
