// Email drafts (.eml files) that Outlook opens ready to send.
//
// No Node-only helpers here: this file is part of the package's main entry, which a page may
// import, so text and bytes are turned into base64 with what both Node and a browser window have.

/** Bytes as base64 text. */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/** Text as base64 of its UTF-8 bytes. */
export const utf8ToBase64 = (text: string): string => bytesToBase64(new TextEncoder().encode(text));

export const wrap76 = (b64: string): string => b64.replace(/.{1,76}/g, '$&\r\n');

export const encodeHeader = (s: string): string =>
  /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${utf8ToBase64(s)}?=`;

export const safeFileName = (s: unknown): string =>
  String(s)
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim();

export interface EmlAttachment {
  filename: string;
  content: Uint8Array;
  contentType: string;
}

export interface EmlMessage {
  to: string[];
  subject: string;
  html: string;
  text: string;
  attachments?: EmlAttachment[];
}

/**
 * Builds an RFC 822 email draft. "X-Unsent: 1" makes Outlook open it as a new, editable message.
 * `boundaries` replaces the random part separators (the parity check fixes them).
 */
export function buildEml(m: EmlMessage, boundaries?: { mixed: string; alt: string }): string {
  const mixed =
    boundaries?.mixed ?? `mixed_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
  const alt = boundaries?.alt ?? `alt_${Math.random().toString(36).slice(2)}`;
  const lines = [
    'X-Unsent: 1',
    `To: ${m.to.filter(Boolean).join(', ')}`,
    `Subject: ${encodeHeader(m.subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${mixed}"`,
    '',
    `--${mixed}`,
    `Content-Type: multipart/alternative; boundary="${alt}"`,
    '',
    `--${alt}`,
    'Content-Type: text/plain; charset="utf-8"',
    'Content-Transfer-Encoding: base64',
    '',
    wrap76(utf8ToBase64(m.text)),
    `--${alt}`,
    'Content-Type: text/html; charset="utf-8"',
    'Content-Transfer-Encoding: base64',
    '',
    wrap76(utf8ToBase64(m.html)),
    `--${alt}--`,
  ];
  for (const a of m.attachments || []) {
    lines.push(
      `--${mixed}`,
      `Content-Type: ${a.contentType}; name="${a.filename}"`,
      `Content-Disposition: attachment; filename="${a.filename}"`,
      'Content-Transfer-Encoding: base64',
      '',
      wrap76(bytesToBase64(a.content)),
    );
  }
  lines.push(`--${mixed}--`, '');
  return lines.join('\r\n');
}
