// Bringing in the Tenured Workforce file, which carries each driver's lifetime routes. It is the
// same on both Associates tabs. The file window opens first, then the file is read and folded in;
// an old file never rolls anyone back, and the status line says so when that happened.

import { call, explain } from '../../lib/channels';
import { chooseFile } from '../dataPages/bringIn';
import type { Messages } from '../dataPages/PageParts';
import { tenureImportedMessage } from './associateRows';

export async function importTenure(messages: Messages, dropped?: string): Promise<void> {
  messages.clearProblem();
  const path = dropped ?? (await chooseFile('tenure', messages));
  if (path === null) return;
  const reply = await call('files:import', { kind: 'tenure', path });
  if (!reply.ok) {
    messages.setProblem({ title: 'Import failed', message: explain(reply) });
    messages.setStatus('Import failed.');
    return;
  }
  if (reply.value.tenure) messages.setStatus(tenureImportedMessage(reply.value.tenure));
}
