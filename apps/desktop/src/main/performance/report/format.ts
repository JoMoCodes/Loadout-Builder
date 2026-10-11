// Small text helpers for the report: HTML escaping and the old report's number and date formats.

import { formatNet } from '@loadout/performance';

const ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Text made safe to put inside HTML (element text or a quoted attribute). */
export function esc(value: string | number | null | undefined): string {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ESCAPES[ch] ?? ch);
}

/** Lines of text as HTML, joined with line breaks; a blank line keeps its height. */
export function lines(parts: readonly string[]): string {
  return parts.map((part) => (part.trim() === '' ? '&nbsp;' : esc(part))).join('<br>');
}

/** .NET "N0": whole number with thousands commas ("1,093"). */
export function formatN0(value: number): string {
  const rounded = formatNet(value, '0');
  const negative = rounded.startsWith('-');
  const digits = negative ? rounded.slice(1) : rounded;
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return negative ? `-${grouped}` : grouped;
}

/** int.TryParse(text) > 0, as the old report decided whether to paint a count red. */
export function isPositiveCount(text: string): boolean {
  if (!/^\s*[+-]?\d+\s*$/.test(text)) return false;
  const n = Number(text.trim());
  return n > 0 && n <= 2147483647;
}

/** "2026-W14" -> "W14" (the last three characters, as the old incident list did). */
export function shortWeek(week: string): string {
  return week.length >= 4 ? week.slice(-3) : week;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-03-31" (or "3/31/2026") -> "Mar 31"; anything else comes back as it was. */
export function shortDate(raw: string): string {
  const text = raw.trim();
  let month: number | null = null;
  let day: number | null = null;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/.exec(text);
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?: .*)?$/.exec(text);
  if (iso) {
    month = Number(iso[2]);
    day = Number(iso[3]);
  } else if (us) {
    month = Number(us[1]);
    day = Number(us[2]);
  }
  if (month === null || day === null || month < 1 || month > 12 || day < 1 || day > 31) return raw;
  return `${MONTHS[month - 1]} ${day}`;
}
