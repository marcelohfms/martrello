import { describe, it, expect } from 'vitest';
import { clientIp } from './client-ip';

const h = (init: Record<string, string>) => new Headers(init);

describe('clientIp', () => {
  it('uses the rightmost x-forwarded-for entry (appended by our proxy)', () => {
    expect(clientIp(h({ 'x-forwarded-for': '203.0.113.9, 10.0.0.2' }))).toBe('10.0.0.2');
  });
  it('ignores a spoofed leftmost entry', () => {
    expect(clientIp(h({ 'x-forwarded-for': '6.6.6.6, 198.51.100.7' }))).toBe('198.51.100.7');
  });
  it('handles a single entry and trailing commas', () => {
    expect(clientIp(h({ 'x-forwarded-for': '198.51.100.7, ' }))).toBe('198.51.100.7');
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
