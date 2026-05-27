// tests/mcp-smoke.test.ts
import { describe, it, expect } from 'vitest';
import { createServer } from '@/mcp/server';
import { tools } from '@/mcp/tools';

describe('mcp server', () => {
  it('constructs without throwing', () => {
    expect(createServer).toBeTypeOf('function');
    const s = createServer();
    expect(s).toBeDefined();
  });

  it('tool registry is iterable', () => {
    expect(Array.isArray(tools)).toBe(true);
  });
});
