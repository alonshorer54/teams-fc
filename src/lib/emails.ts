/**
 * Checks an invite address before it's saved. An invite to a mistyped address can never be
 * claimed and just sits there, so obvious typos — "gmail.cob", "gmial.com", "walla.co.l" —
 * are caught here with a suggestion instead.
 */

const POPULAR_DOMAINS = [
  'gmail.com',
  'googlemail.com',
  'walla.co.il',
  'walla.com',
  'hotmail.com',
  'outlook.com',
  'live.com',
  'yahoo.com',
  'ymail.com',
  'aol.com',
  'mail.com',
  'email.com',
  'gmx.com',
  'zoho.com',
  'yandex.com',
  'icloud.com',
  'me.com',
  'proton.me',
  'protonmail.com',
  'bezeqint.net',
  'netvision.net.il',
  '012.net.il',
];

/** Endings an address can really have; anything else ("cob", "comm") is a typo */
const KNOWN_ENDINGS = new Set([
  'com', 'net', 'org', 'edu', 'gov', 'info', 'biz', 'io', 'co', 'me', 'app', 'dev', 'ai',
  'il', 'co.il', 'org.il', 'ac.il', 'gov.il', 'net.il', 'muni.il', 'k12.il', 'idf.il',
  'uk', 'co.uk', 'ac.uk', 'de', 'fr', 'nl', 'es', 'it', 'ch', 'at', 'be', 'se', 'no', 'dk',
  'fi', 'pl', 'pt', 'ie', 'ru', 'ua', 'us', 'ca', 'au', 'com.au', 'nz', 'co.nz', 'in',
  'co.in', 'jp', 'co.jp', 'cn', 'br', 'com.br', 'mx', 'ar', 'za', 'co.za', 'tv', 'xyz',
  'online', 'site', 'tech', 'email',
]);

const SHAPE = /^[a-z0-9._%+-]+@([a-z0-9-]+\.)+[a-z]{2,}$/;

function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = temp;
    }
  }
  return row[b.length];
}

export type EmailCheck = { ok: true; email: string } | { ok: false; error: string };

export function checkEmail(raw: string): EmailCheck {
  const email = raw.trim().toLowerCase();
  if (!email) return { ok: false, error: '' };
  const [local, domain = ''] = email.split('@');

  // A near miss of a well-known provider is almost certainly a typo — checked before the
  // shape, so "walla.co.l" gets a suggestion rather than a bare "invalid"
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) && !POPULAR_DOMAINS.includes(domain)) {
    // Only long names: two letters off "me.com" or "aol.com" is usually another real domain
    const near = POPULAR_DOMAINS.find((d) => d.length >= 9 && distance(domain, d) <= 2);
    if (near) return { ok: false, error: `התכוונת ל-${local}@${near}?` };
  }

  if (!SHAPE.test(email) || email.includes('..')) {
    return { ok: false, error: 'זו לא כתובת מייל תקינה' };
  }

  const labels = domain.split('.');
  const ending2 = labels.slice(-2).join('.');
  const ending1 = labels[labels.length - 1];
  if (!KNOWN_ENDINGS.has(ending2) && !KNOWN_ENDINGS.has(ending1)) {
    return { ok: false, error: `הסיומת ".${ending1}" לא נראית נכונה — בדקו את הכתובת` };
  }

  return { ok: true, email };
}

/**
 * The address as plain text in a chat message. WhatsApp turns any address into a mailto
 * link; a zero-width space after the "@" keeps it looking the same but unlinked.
 */
export const unlinkedEmail = (email: string) => email.replace('@', '@​');
