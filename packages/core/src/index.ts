// Loadout Builder core: the rules and file reading, with no Electron code.
//
// This main entry holds only what is safe to load in a browser window: the models and the release
// notes. The file readers (spreadsheets, CSV) need Node, so they live in their own entry:
//
//   import { importLoadoutSheet } from '@loadout/core/importers';

export const CORE_NAME = '@loadout/core';

export { RELEASE_NOTES, compareVersions, notesBetween } from './releaseNotes';
export type { ReleaseNote } from './releaseNotes';

export * from './models';
export * from './matching';
export * from './state';

// Van assignment, the fixed printed sheet, and the page math for printed layouts.
export * from './assignment';
export * as sheetExport from './export';
export * as printing from './printing/printing';
