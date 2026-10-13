// Everything needed to send one route sheet to its recipients.

import { renderEmailHtml, renderEmailText, subjectFor } from '../email/render';
import type { SheetWithPad } from '../types';
import { buildEml, safeFileName, type EmlAttachment } from './eml';
import { extractPages } from './pages';

/** Who gets the email. The first one is greeted by name. */
export interface EmailRecipientInfo {
  name?: string;
  email?: string;
}

export interface RouteEmail {
  html: string;
  text: string;
  subject: string;
  eml: string;
  pdfName: string;
  /** The route's own PDF page(s), or null when the original PDF is not available. */
  pdf: Uint8Array | null;
}

export async function buildRouteEmail(
  sheet: SheetWithPad,
  recipients: EmailRecipientInfo[],
  pdf: Uint8Array | null | undefined,
  boundaries?: { mixed: string; alt: string },
): Promise<RouteEmail> {
  const primary = recipients[0];
  const html = renderEmailHtml(sheet, primary);
  const text = renderEmailText(sheet, primary);
  const subject = subjectFor(sheet);
  const pdfName = safeFileName(`${sheet.routeCode} ${sheet.staging || ''} route sheet.pdf`);
  const attachments: EmlAttachment[] = [];
  if (pdf)
    attachments.push({
      filename: pdfName,
      content: await extractPages(pdf, sheet.pageNumbers || [sheet.pageNumber]),
      contentType: 'application/pdf',
    });
  const eml = buildEml(
    {
      to: recipients.map((r) => r.email).filter((e): e is string => !!e),
      subject,
      html,
      text,
      attachments,
    },
    boundaries,
  );
  return { html, text, subject, eml, pdfName, pdf: attachments[0] ? attachments[0].content : null };
}
