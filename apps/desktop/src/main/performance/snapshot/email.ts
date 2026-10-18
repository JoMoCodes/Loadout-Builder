// The report email with the snapshot in it: the wording from Settings as before, then the two
// snapshot pictures stacked, phone width, with the PDF still attached. Tables and inline styles
// only, like the route sheet email, so Outlook, Gmail and phones all show the same thing. The
// pictures ride inside the email (cid: attachments); the plain-text part says they are there.

import { esc } from '../report/format';
import type { SnapshotImage } from './render';

export interface InlineImage {
  /** The Content-ID the HTML refers to (without the angle brackets). */
  cid: string;
  filename: string;
  image: SnapshotImage;
}

/** The pictures of one snapshot as inline attachments: page 1 then page 2. */
export function inlineImages(images: readonly SnapshotImage[], stamp: string): InlineImage[] {
  return images.map((image, index) => ({
    cid: `snapshot-page-${index + 1}-${stamp}@loadout-builder`,
    filename: `snapshot-page-${index + 1}.${image.contentType === 'image/png' ? 'png' : 'jpg'}`,
    image,
  }));
}

const FONT = 'font-family:Segoe UI,Helvetica,Arial,sans-serif;';

/** The wording as paragraphs: a blank line starts a new one, a line break stays a line break. */
function paragraphs(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .filter((part) => part.trim() !== '')
    .map(
      (part) =>
        `<p style="margin:0 0 12px;${FONT}font-size:15px;line-height:1.45;color:#1b2430;">${esc(part).replace(/\n/g, '<br>')}</p>`,
    )
    .join('');
}

/**
 * The email as a web page: the wording, then the snapshot pages stacked at 360 px, then a line
 * about the attached PDF. Without pictures it is the wording alone, so the same message reads
 * well either way.
 */
export function snapshotEmailHtml(bodyText: string, images: readonly InlineImage[]): string {
  const pictures = images
    .map(
      (one, index) =>
        `<tr><td style="padding:0;line-height:0;font-size:0;">` +
        `<img src="cid:${esc(one.cid)}" width="${one.image.width}" alt="Your weekly snapshot, page ${index + 1}" ` +
        `style="display:block;width:${one.image.width}px;max-width:100%;height:auto;border:0;${index > 0 ? 'margin-top:12px;' : ''}"></td></tr>`,
    )
    .join('');
  const note =
    images.length > 0
      ? `<p style="margin:14px 0 0;${FONT}font-size:13px;line-height:1.45;color:#5b6675;">` +
        'The pictures above are your two-page snapshot. The full report, with every metric and every week, is the PDF attached to this email.</p>'
      : '';
  return (
    '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>' +
    '<body style="margin:0;padding:16px 12px;background:#ffffff;">' +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:${images[0]?.image.width ?? 360}px;margin:0 auto;border-collapse:collapse;">` +
    `<tr><td style="padding:0 0 4px;">${paragraphs(bodyText)}</td></tr>` +
    pictures +
    `<tr><td style="padding:0;">${note}</td></tr>` +
    '</table></body></html>'
  );
}

/** The plain-text part: the wording, then one line about the pictures and the PDF. */
export function snapshotEmailText(bodyText: string, hasImages: boolean): string {
  if (!hasImages) return bodyText;
  return (
    `${bodyText.replace(/\s+$/, '')}\n\n` +
    'Your two-page weekly snapshot is in this email as two pictures. ' +
    'The full report, with every metric and every week, is the attached PDF.'
  );
}
