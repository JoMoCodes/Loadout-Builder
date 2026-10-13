// Route sheets: the rules behind the Route Sheets page, ported from Route Sheet Distributor
// (see docs/RSD-MIGRATION-PLAN.md, section 4).
//
// This main entry holds the pure rules: the page parser (over positioned text items), the
// matcher, the email and export renderers, and the run rules. Reading a PDF into items needs
// Node and pdfjs, so it lives in its own entry, the same way @loadout/performance does it:
//
//   import { readPdfItems, parseRouteSheetPdf } from '@loadout/route-sheets/pdf-items';

export const ROUTE_SHEETS_NAME = '@loadout/route-sheets';

export type * from './types';
export * from './parser';
export * from './matcher';
export * from './email';
export * from './export';
export * from './runs';
export * from './join';
