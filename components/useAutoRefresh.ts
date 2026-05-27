'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export function useAutoRefresh(intervalMs = 3000) {
  const router = useRouter();
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    let visible = !document.hidden;

    const start = () => {
      if (timer) return;
      timer = setInterval(() => router.refresh(), intervalMs);
    };
    const stop = () => {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
    };

    if (visible) start();
    const onVis = () => {
      visible = !document.hidden;
      if (visible) { router.refresh(); start(); } else stop();
    };
    const onFocus = () => router.refresh();

    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onFocus);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', onFocus);
    };
  }, [router, intervalMs]);
}
