// Weekly performance: models, file readers and the numbers worked out from them.
//
// This main entry holds the models and rules, the analysis (averages, ranks, trends, coaching,
// ID expiry, ...) and the verification export. The file readers live in their own entry, the
// same way @loadout/core does it:
//
//   import { parseScorecards } from '@loadout/performance/importers';

export const PERFORMANCE_NAME = '@loadout/performance';

export * from './models';
export * from './analysis';
export * from './export';
