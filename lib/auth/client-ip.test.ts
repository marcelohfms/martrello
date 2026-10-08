import { describe, it, expect } from 'vitest';
import { clientIp } from './client-ip';

const h = (init: Record<string, string>) => new Headers(init);

describe('clientIp', () => {
  it('uses the first x-forwarded-for entry of a proxy chain', () => {
    expect(clientIp(h({ 'x-forwarded-for': '203.0.113.9, 10.0.0.2' }))).toBe('203.0.113.9');
  });
  it('falls back to x-real-ip', () => {
    expect(clientIp(h({ 'x-real-ip': ' 198.51.100.4 ' }))).toBe('198.51.100.4');
  });
  it('ignores an empty x-forwarded-for', () => {
    expect(clientIp(h({ 'x-forwarded-for': ' , ', 'x-real-ip': '198.51.100.4' }))).toBe('198.51.100.4');
  });
  it('returns "unknown" with no headers', () => {
    expect(clientIp(h({}))).toBe('unknown');
  });
});
