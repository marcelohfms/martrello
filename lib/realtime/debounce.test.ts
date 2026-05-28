import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { debounce } from './debounce';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('debounce', () => {
  it('coalesces multiple calls within the window into one', () => {
    const fn = vi.fn();
    const d = debounce(fn, 120);
    d(); d(); d();
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(120);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('uses the args from the last call', () => {
    const fn = vi.fn();
    const d = debounce(fn, 100);
    d('a'); d('b'); d('c');
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledWith('c');
  });

  it('fires again for calls in a later window', () => {
    const fn = vi.fn();
    const d = debounce(fn, 100);
    d();
    vi.advanceTimersByTime(100);
    d();
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('cancel() prevents a pending call', () => {
    const fn = vi.fn();
    const d = debounce(fn, 100);
    d();
    d.cancel();
    vi.advanceTimersByTime(100);
    expect(fn).not.toHaveBeenCalled();
  });
});
