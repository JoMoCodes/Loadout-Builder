// What the file window says and shows for each kind of file. The titles are what people read.

import type { FileKind } from '../shared/channels/files';

export interface PickSpec {
  title: string;
  filters: Array<{ name: string; extensions: string[] }>;
}

const SHEET = { name: 'Excel workbook', extensions: ['xlsx', 'xlsm'] };
const CSV = { name: 'CSV file', extensions: ['csv'] };
const ANY = { name: 'All files', extensions: ['*'] };

export const PICKS: Record<FileKind, PickSpec> = {
  loadout: { title: 'Choose the load-out sheet', filters: [SHEET, ANY] },
  associates: { title: 'Choose the associate list (CSV)', filters: [CSV, ANY] },
  tenure: { title: 'Choose the Tenured Workforce file (CSV)', filters: [CSV, ANY] },
  vehicles: { title: 'Choose the vehicle list', filters: [SHEET, ANY] },
  dwp: { title: 'Choose the DWP sheet', filters: [SHEET, ANY] },
  routes: { title: 'Choose the Routes export', filters: [SHEET, ANY] },
  itineraries: { title: 'Choose the Itineraries export', filters: [SHEET, ANY] },
  schedule: { title: 'Choose the Weekly Schedule', filters: [SHEET, ANY] },
};
