// The email address check, the same one the old mailer used.

const EMAIL_RE = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]+$/;

export const isEmail = (s: unknown): boolean => EMAIL_RE.test(String(s || '').trim());
