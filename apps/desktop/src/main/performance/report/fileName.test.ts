import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { reportFileName } from './fileName';

const EXPECTED = new URL('../../../../../../scripts/parity/wpa/expected/pdf/', import.meta.url);

describe('reportFileName', () => {
  it('names files like the old app did', () => {
    const oldNames = readdirSync(fileURLToPath(EXPECTED)).filter(
      (n) => n.endsWith('.pdf') && !n.startsWith('Coaching_') && !n.startsWith('Team_'),
    );
    expect(oldNames.length).toBeGreaterThan(0);
    for (const oldName of oldNames) {
      const match = /^(.*)_([A-Z0-9]+)_(\d{4}-W\d{2})_to_(\d{4}-W\d{2})\.pdf$/.exec(oldName);
      expect(match).not.toBeNull();
      const [, name, id, from, to] = match!;
      expect(reportFileName(name!, id!, from!, to!)).toBe(oldName);
    }
  });

  it('replaces characters Windows does not allow with _', () => {
    expect(reportFileName('A/B:C*D?"E<F>|G\\H', 'A047LNAN5VQIQR', '2026-W01', '2026-W04')).toBe(
      'A_B_C_D__E_F__G_H_A047LNAN5VQIQR_2026-W01_to_2026-W04.pdf',
    );
    expect(reportFileName('Tab\there', 'X', 'a', 'b')).toBe('Tab_here_X_a_to_b.pdf');
  });
});
