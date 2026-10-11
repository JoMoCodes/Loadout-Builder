// The report's colours, with the old app's black-and-white rules for when colour is off
// (PdfSettings.TierBackground / TierForeground / Effective*).

import type { ReportColours } from '../../../shared/performanceSettings';

export type Tier = 'Platinum' | 'Gold' | 'Silver' | 'Bronze';

export interface Palette {
  useColor: boolean;
  tierBackground(tier: string | null | undefined): string;
  tierForeground(tier: string | null | undefined): string;
  headerBackground: string;
  headerForeground: string;
  border: string;
  rejectBackground: string;
  rejectForeground: string;
  /** The tier's own background even with colour off: only used when colour is on (chart bands). */
  bandColour(tier: Tier): string;
}

const HEX = /^#[0-9A-Fa-f]{6}$/;

/** A colour from the settings, or the fallback if it is not a plain "#RRGGBB". */
function safe(value: string, fallback: string): string {
  return HEX.test(value) ? value : fallback;
}

export function palette(c: ReportColours): Palette {
  const on = c.useColor;
  const bg: Record<Tier, string> = {
    Platinum: safe(c.platinumBackground, '#FFFFFF'),
    Gold: safe(c.goldBackground, '#FFFFFF'),
    Silver: safe(c.silverBackground, '#FFFFFF'),
    Bronze: safe(c.bronzeBackground, '#FFFFFF'),
  };
  const fg: Record<Tier, string> = {
    Platinum: safe(c.platinumForeground, '#000000'),
    Gold: safe(c.goldForeground, '#000000'),
    Silver: safe(c.silverForeground, '#000000'),
    Bronze: safe(c.bronzeForeground, '#000000'),
  };
  const isTier = (t: string | null | undefined): t is Tier =>
    t === 'Platinum' || t === 'Gold' || t === 'Silver' || t === 'Bronze';
  return {
    useColor: on,
    tierBackground: (t) => (on && isTier(t) ? bg[t] : '#FFFFFF'),
    tierForeground: (t) => (on && isTier(t) ? fg[t] : '#000000'),
    headerBackground: on ? safe(c.headerBarBackground, '#E8E8E8') : '#FFFFFF',
    headerForeground: on ? safe(c.headerBarForeground, '#000000') : '#000000',
    border: on ? safe(c.tableBorderColor, '#8B8B8B') : '#000000',
    rejectBackground: on ? safe(c.podRejectBackground, '#FECACA') : '#FFFFFF',
    rejectForeground: on ? safe(c.podRejectForeground, '#991B1B') : '#000000',
    bandColour: (t) => bg[t],
  };
}
