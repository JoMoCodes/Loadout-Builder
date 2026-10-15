// The Email part of Settings on the stand-in bridge: the app's one email setup, used by the weekly
// reports and the route sheets. The fields save through settings:set as `email`, the app password
// is kept by the main process (never shown), and Send test email saves first. The subject and
// message of the weekly reports are behind Settings on the Scorecards page
// (performance-settings.spec.ts). Moved here from performance-settings.spec.ts when the email
// setup became its own part (migration plan, section 3, item 4).

import { expect, test, type Page } from '@playwright/test';
import { DEFAULT_EMAIL } from '../src/shared/performanceSettings';
import { callsTo, onCall } from './support/fakeBridge';
import { openPerformance } from './support/performance';

const section = (page: Page) => page.locator('[data-setting="email"]');
const performance = (page: Page) => page.locator('[data-setting="performance"]');

async function patches(page: Page) {
  return (await callsTo(page, 'settings:set')) as Array<Record<string, unknown>>;
}

test('Email is its own part of Settings, right after Weekly performance', async ({ page }) => {
  await openPerformance(page, { page: 'settings' });
  await expect(section(page).getByRole('heading', { level: 2 })).toHaveText('Email');
  const order = await page
    .locator('[data-setting]')
    .evaluateAll((parts) => parts.map((part) => part.getAttribute('data-setting')));
  expect(order.indexOf('email')).toBe(order.indexOf('performance') + 1);
  // The account is no longer in the Weekly performance part.
  await expect(performance(page).getByTestId('email-from')).toHaveCount(0);
  await expect(performance(page)).not.toContainText('Send test email');
  await expect(performance(page)).not.toContainText('App password');
});

test('the email fields save together, and a bad port is refused in plain words', async ({
  page,
}) => {
  await openPerformance(page, { page: 'settings' });
  await expect(page.getByTestId('email-host')).toHaveValue('smtp.gmail.com');
  await expect(page.getByTestId('email-port')).toHaveValue('587');
  await expect(page.getByTestId('email-save')).toBeDisabled();
  await expect(section(page)).toContainText('search for App passwords');

  // Undo changes throws the changes away.
  await page.getByTestId('email-from').fill('someone@example.com');
  await page.getByTestId('email-undo').click();
  await expect(page.getByTestId('email-from')).toHaveValue('');
  await expect(page.getByTestId('email-save')).toBeDisabled();

  await page.getByTestId('email-from').fill('dispatch@example.com');
  await page.getByTestId('email-from-name').fill('Example Delivery Team');
  await page.getByTestId('email-bcc').fill('office@example.com');
  await page.getByTestId('email-username').fill('dispatch@example.com');
  await page.getByTestId('email-port').fill('abc');
  await page.getByTestId('email-save').click();
  await expect(page.getByTestId('email-note')).toHaveText(
    'The port must be a whole number, like 587.',
  );
  expect((await patches(page)).some((patch) => 'email' in patch)).toBe(false);

  await page.getByTestId('email-port').fill('465');
  await page.getByTestId('email-save').click();
  await expect(page.getByTestId('email-note')).toHaveText('Email settings saved.');
  expect(await patches(page)).toContainEqual({
    email: {
      ...DEFAULT_EMAIL,
      fromAddress: 'dispatch@example.com',
      fromName: 'Example Delivery Team',
      bccAddress: 'office@example.com',
      username: 'dispatch@example.com',
      smtpPort: 465,
    },
  });
  // Nothing is written under the weekly performance settings any more.
  expect((await patches(page)).some((patch) => 'performance' in patch)).toBe(false);
  await expect(page.getByTestId('email-save')).toBeDisabled();
});

test('the email fields start from the saved setup', async ({ page }) => {
  await openPerformance(page, {
    page: 'settings',
    settings: {
      email: { ...DEFAULT_EMAIL, fromAddress: 'dispatch@example.com', smtpPort: 465 },
    },
  });
  await expect(page.getByTestId('email-from')).toHaveValue('dispatch@example.com');
  await expect(page.getByTestId('email-port')).toHaveValue('465');
  await expect(page.getByTestId('email-test-to')).toHaveValue('dispatch@example.com');
});

test('the app password is saved without its spaces and never shown again', async ({ page }) => {
  await openPerformance(page, { page: 'settings' });
  await expect(page.getByTestId('email-password-status')).toHaveText('Not saved.');
  await onCall(
    page,
    'performance:set-email-password',
    `(input) => ({ ok: true, value: { passwordSaved: input.password !== '', canSeal: true } })`,
  );
  const box = page.getByTestId('email-password');
  await expect(box).toHaveAttribute('type', 'password');
  await box.fill('abcd efgh ijkl mnop');
  await page.getByTestId('email-password-save').click();
  await expect(page.getByTestId('email-password-note')).toHaveText('App password saved.');
  await expect(page.getByTestId('email-password-status')).toContainText('Saved.');
  await expect(box).toHaveValue('');
  expect(await callsTo(page, 'performance:set-email-password')).toEqual([
    { password: 'abcdefghijklmnop' },
  ]);
  // It never goes into the settings file.
  expect(JSON.stringify(await patches(page))).not.toContain('abcd');

  await page.getByTestId('email-password-forget').click();
  await expect(page.getByTestId('email-password-status')).toHaveText('Not saved.');
  expect((await callsTo(page, 'performance:set-email-password')).at(-1)).toEqual({
    password: '',
  });
});

test('Send test email saves first, then says whether it went', async ({ page }) => {
  await openPerformance(page, { page: 'settings' });
  await onCall(
    page,
    'performance:email-test',
    `() => ({ ok: true, value: { sent: false, problem: 'Gmail did not accept the app password. Check it and save it again.' } })`,
  );
  await page.getByTestId('email-from').fill('dispatch@example.com');
  await page.getByTestId('email-test-to').fill('me@example.com');
  await page.getByTestId('email-test').click();
  await expect(page.getByTestId('email-test-note')).toHaveText(
    'Gmail did not accept the app password. Check it and save it again.',
  );
  expect(await patches(page)).toContainEqual({
    email: { ...DEFAULT_EMAIL, fromAddress: 'dispatch@example.com' },
  });
  expect(await callsTo(page, 'performance:email-test')).toEqual([{ to: 'me@example.com' }]);

  await onCall(
    page,
    'performance:email-test',
    `() => ({ ok: true, value: { sent: true, problem: null } })`,
  );
  await page.getByTestId('email-test').click();
  await expect(page.getByTestId('email-test-note')).toHaveText('Test email sent. Check the inbox.');
});

test('the weekly reports’ subject and message are not in Settings any more', async ({ page }) => {
  await openPerformance(page, { page: 'settings' });
  await expect(performance(page)).not.toContainText('Emailing the reports');
  await expect(page.getByTestId('perf-email-subject')).toHaveCount(0);
  await expect(section(page)).not.toContainText('Subject');
});
