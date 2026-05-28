// app/api/stream/route.ts
import { watch, type FSWatcher } from 'node:fs';
import path from 'node:path';
import { debounce } from '@/lib/realtime/debounce';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DB_PATH = process.env.DATABASE_URL?.replace(/^file:/, '') ?? './martrello.db';
const DB_DIR = path.dirname(path.resolve(DB_PATH));
const DB_BASENAME = path.basename(path.resolve(DB_PATH)); // "martrello.db"
const DEBOUNCE_MS = 120;
const KEEPALIVE_MS = 25_000;

export async function GET(request: Request) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      let keepalive: ReturnType<typeof setInterval> | null = null;
      let watcher: FSWatcher | null = null;

      const safeEnqueue = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      };

      // Coalesce WAL write bursts into a single "changed" event.
      const emitChanged = debounce(() => safeEnqueue('data: changed\n\n'), DEBOUNCE_MS);

      const cleanup = () => {
        if (closed) return;
        closed = true;
        emitChanged.cancel();
        if (keepalive) clearInterval(keepalive);
        if (watcher) watcher.close();
        try { controller.close(); } catch { /* already closed */ }
      };

      try {
        watcher = watch(DB_DIR, (_event, filename) => {
          // filename may be null on some platforms — treat as relevant.
          if (filename == null || filename.startsWith(DB_BASENAME)) emitChanged();
        });
      } catch (err) {
        safeEnqueue(`event: error\ndata: ${(err as Error).message}\n\n`);
        cleanup();
        return;
      }

      // Initial hello so the client knows the stream is live.
      safeEnqueue(': connected\n\n');

      keepalive = setInterval(() => safeEnqueue(': ping\n\n'), KEEPALIVE_MS);

      request.signal.addEventListener('abort', cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
