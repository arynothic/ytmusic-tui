import { describe, expect, it } from 'vitest';

import {
  buildSessionCookie,
  importCookies,
  parseCookieHeader,
  parseNetscapeCookieFile,
  serializeCookieJar,
} from '@/auth';
import { ValidationError } from '@/core/errors';

describe('parseCookieHeader', () => {
  it('parses a header into name/value pairs', () => {
    expect(parseCookieHeader('SID=abc; HSID=def ;SAPISID=ghi')).toEqual({
      SID: 'abc',
      HSID: 'def',
      SAPISID: 'ghi',
    });
  });

  it('handles values containing = and skips malformed pairs', () => {
    expect(parseCookieHeader('A=b=c; malformed; B=')).toEqual({ A: 'b=c', B: '' });
  });

  it('returns an empty jar for empty input', () => {
    expect(parseCookieHeader('')).toEqual({});
  });
});

describe('serializeCookieJar', () => {
  it('round-trips with parseCookieHeader', () => {
    const jar = { SID: 'abc', SAPISID: 'xyz' };
    expect(parseCookieHeader(serializeCookieJar(jar))).toEqual(jar);
  });
});

describe('parseNetscapeCookieFile', () => {
  const file = [
    '# Netscape HTTP Cookie File',
    '.youtube.com\tTRUE\t/\tTRUE\t2147483647\tSAPISID\tyt-sapisid',
    '.google.com\tTRUE\t/\tFALSE\t2147483647\tSID\tgoogle-sid',
    '#HttpOnly_.google.com\tTRUE\t/\tTRUE\t2147483647\tHSID\thttp-only-hsid',
    '.example.com\tTRUE\t/\tFALSE\t2147483647\tTRACKER\tno-thanks',
    'malformed line without tabs',
    '',
  ].join('\n');

  it('parses google/youtube cookies including HttpOnly, skipping others', () => {
    expect(parseNetscapeCookieFile(file)).toEqual({
      SAPISID: 'yt-sapisid',
      SID: 'google-sid',
      HSID: 'http-only-hsid',
    });
  });

  it('returns an empty jar for content without google cookies', () => {
    expect(parseNetscapeCookieFile('.example.com\tTRUE\t/\tFALSE\t1\tA\tb')).toEqual({});
  });
});

describe('buildSessionCookie', () => {
  it('serializes a complete jar', () => {
    expect(buildSessionCookie({ SID: 'a', SAPISID: 'b', OTHER: 'c' })).toBe(
      'SID=a; SAPISID=b; OTHER=c',
    );
  });

  it('throws ValidationError listing missing required cookies', () => {
    expect(() => buildSessionCookie({ SID: 'a' })).toThrowError(ValidationError);
    expect(() => buildSessionCookie({ SID: 'a' })).toThrowError(/SAPISID/);
    expect(() => buildSessionCookie({ SAPISID: 'b' })).toThrowError(/SID/);
  });
});

describe('importCookies', () => {
  it('accepts a raw cookie header', () => {
    expect(importCookies('SID=a; SAPISID=b')).toBe('SID=a; SAPISID=b');
  });

  it('accepts netscape file content', () => {
    const file = '.google.com\tTRUE\t/\tFALSE\t2147483647\tSID\tsid-val\n.google.com\tTRUE\t/\tFALSE\t2147483647\tSAPISID\tsapisid-val';
    expect(importCookies(file)).toBe('SID=sid-val; SAPISID=sapisid-val');
  });

  it('rejects input without a usable session', () => {
    expect(() => importCookies('THEME=dark')).toThrowError(ValidationError);
  });
});
