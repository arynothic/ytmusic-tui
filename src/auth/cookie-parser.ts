import { ValidationError } from '@/core/errors';

/** A cookie jar: cookie name → value. */
export type CookieJar = Record<string, string>;

/** Cookies that must be present for a YouTube Music session to work. */
const REQUIRED_COOKIES = ['SAPISID', 'SID'] as const;

/** Only cookies scoped to these domains are imported. */
const GOOGLE_DOMAIN_PATTERN = /(?:^|\.)google\.com$|(?:^|\.)youtube\.com$/;

/** Parses a raw `Cookie:` header value into a jar. Malformed pairs are skipped. */
export function parseCookieHeader(header: string): CookieJar {
  const jar: CookieJar = {};
  for (const part of header.split(';')) {
    const equalsAt = part.indexOf('=');
    if (equalsAt === -1) {
      continue;
    }
    const name = part.slice(0, equalsAt).trim();
    const value = part.slice(equalsAt + 1).trim();
    if (name !== '') {
      jar[name] = value;
    }
  }
  return jar;
}

/** Serializes a jar back into a `Cookie:` header value. */
export function serializeCookieJar(jar: CookieJar): string {
  return Object.entries(jar)
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
}

/** One year, used as the expiry for cookies exported to a Netscape file. */
const NETSCAPE_TTL_SECONDS = 365 * 24 * 60 * 60;

/**
 * Serializes a jar into the Netscape `cookies.txt` format yt-dlp's
 * `--cookies` reads. Cookies are emitted for both `.youtube.com` and
 * `.google.com`, since a Google session spans both.
 */
export function serializeNetscapeCookieFile(jar: CookieJar, now = Date.now()): string {
  const expires = Math.floor(now / 1000) + NETSCAPE_TTL_SECONDS;
  const lines = ['# Netscape HTTP Cookie File'];
  for (const domain of ['.youtube.com', '.google.com']) {
    for (const [name, value] of Object.entries(jar)) {
      lines.push([domain, 'TRUE', '/', 'TRUE', String(expires), name, value].join('\t'));
    }
  }
  return `${lines.join('\n')}\n`;
}

/**
 * Parses a Netscape cookies.txt export into a jar. Only Google/YouTube
 * domain cookies are kept; comments and malformed lines are skipped.
 * `#HttpOnly_` prefixed lines are supported.
 */
export function parseNetscapeCookieFile(content: string): CookieJar {
  const jar: CookieJar = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '' || (line.startsWith('#') && !line.startsWith('#HttpOnly_'))) {
      continue;
    }
    const withoutPrefix = line.startsWith('#HttpOnly_') ? line.slice('#HttpOnly_'.length) : line;
    const fields = withoutPrefix.split('\t');
    if (fields.length < 7) {
      continue;
    }
    const [domain, , , , , name, ...valueParts] = fields;
    const value = valueParts.join('\t');
    if (domain === undefined || name === undefined || name === '') {
      continue;
    }
    if (!GOOGLE_DOMAIN_PATTERN.test(domain)) {
      continue;
    }
    jar[name] = value;
  }
  return jar;
}

/**
 * Validates that a jar contains a usable YouTube session and returns it
 * as a `Cookie:` header value. Throws {@link ValidationError} otherwise.
 */
export function buildSessionCookie(jar: CookieJar): string {
  const missing = REQUIRED_COOKIES.filter((name) => jar[name] === undefined || jar[name] === '');
  if (missing.length > 0) {
    throw new ValidationError(
      `Missing required cookies: ${missing.join(', ')}. ` +
        'Export cookies from an authenticated youtube.com browser session.',
    );
  }
  return serializeCookieJar(jar);
}

/**
 * High-level cookie import: accepts either a raw Cookie header paste or
 * Netscape cookies.txt file content, and returns a validated Cookie
 * header value ready for the gateway.
 */
export function importCookies(input: string): string {
  const jar = input.includes('\t') ? parseNetscapeCookieFile(input) : parseCookieHeader(input);
  return buildSessionCookie(jar);
}
