// Parity harness, TypeScript half: run the new core on the made-up fixtures and write JSON into
// scripts/parity/actual/, for scripts/parity/diff.mjs to compare with what the old app wrote.
//
//   npm run parity:ts
//
// dump-2a.ts writes inputs, matching, links, previous, routes, dwp and rows. If dump-2b.ts is
// there (vans, export, printing, shared/helvetica), it runs too: its default export is called
// with the list of days.

import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import dump2a from './dump-2a';
import { loadDays } from './harness';

const here = dirname(fileURLToPath(import.meta.url));

async function main(): Promise<void> {
  const days = loadDays();
  await dump2a(days);
  const second = join(here, 'dump-2b.ts');
  if (existsSync(second)) {
    const mod = (await import(pathToFileURL(second).href)) as {
      default?: (days: ReturnType<typeof loadDays>) => Promise<void>;
    };
    if (typeof mod.default === 'function') await mod.default(days);
  }
  console.log(`Wrote the new core's answers for ${days.length} days.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'The dump stopped.');
  process.exitCode = 1;
});
