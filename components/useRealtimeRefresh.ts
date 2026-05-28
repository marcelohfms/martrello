'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export function useRealtimeRefresh(opts: { fallbackMs?: number } = {}) {
  const router = useRouter();
  const fallbackMs = opts.fallbackMs ?? 20_000;

  useEffect(() => {
    let es: EventSource | null = null;

    try {
      es = new EventSource('/api/stream');
      es.onmessage = () => router.refresh();
      // On error, EventSource auto-reconnects; nothing to do but keep it.
    } catch {
      es = null; // EventSource unavailable — fallback poll still covers us.
    }

    const fallback = setInterval(() => router.refresh(), fallbackMs);
    const onFocus = () => router.refresh();
    window.addEventListener('focus', onFocus);

    return () => {
      es?.close();
      clearInterval(fallback);
      window.removeEventListener('focus', onFocus);
    };
  }, [router, fallbackMs]);
}
