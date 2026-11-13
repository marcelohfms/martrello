// Cliente mínimo da Web API do Slack (fetch puro, sem SDK).

export class SlackError extends Error {
  constructor(public code: string, public retryable: boolean) {
    super(`Slack: ${code}`);
    this.name = 'SlackError';
  }
}

export interface SlackClient {
  postMessage(channel: string, text: string): Promise<void>;
  lookupUserIdByEmail(email: string): Promise<string | null>;
  listBotChannels(): Promise<{ id: string; name: string }[]>;
}

const CONNECT_ERRORS = new Set(['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'UND_ERR_CONNECT_TIMEOUT']);

type SlackResponse = {
  ok: boolean;
  error?: string;
  user?: { id: string };
  channels?: { id: string; name: string }[];
  response_metadata?: { next_cursor?: string };
};

export function createSlackClient(token: string, fetchImpl: typeof fetch = fetch): SlackClient {
  async function call(method: string, contentType: string, body: string): Promise<SlackResponse> {
    let res: Response;
    try {
      res = await fetchImpl(`https://slack.com/api/${method}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': contentType },
        body,
        signal: AbortSignal.timeout(10_000),
      });
    } catch (e) {
      const code = (e as { cause?: { code?: unknown } })?.cause?.code;
      if (typeof code === 'string' && CONNECT_ERRORS.has(code)) throw new SlackError(code, true);
      throw new SlackError('ambiguous', false);
    }
    if (res.status === 429 || res.status >= 500) throw new SlackError(`http_${res.status}`, true);
    let data: SlackResponse;
    try {
      data = (await res.json()) as SlackResponse;
    } catch {
      throw new SlackError('ambiguous', false);
    }
    if (!data.ok) {
      const error = data.error ?? 'unknown_error';
      throw new SlackError(error, error === 'ratelimited');
    }
    return data;
  }

  const form = (method: string, params: Record<string, string>) =>
    call(method, 'application/x-www-form-urlencoded', new URLSearchParams(params).toString());

  return {
    async postMessage(channel, text) {
      await call(
        'chat.postMessage',
        'application/json; charset=utf-8',
        JSON.stringify({ channel, text, unfurl_links: false, unfurl_media: false }),
      );
    },

    async lookupUserIdByEmail(email) {
      try {
        const data = await form('users.lookupByEmail', { email });
        return data.user?.id ?? null;
      } catch (e) {
        if (e instanceof SlackError && e.code === 'users_not_found') return null;
        throw e;
      }
    },

    async listBotChannels() {
      const out: { id: string; name: string }[] = [];
      let cursor = '';
      do {
        const params: Record<string, string> = {
          types: 'public_channel,private_channel',
          exclude_archived: 'true',
          limit: '200',
        };
        if (cursor) params.cursor = cursor;
        const data = await form('users.conversations', params);
        for (const c of data.channels ?? []) out.push({ id: c.id, name: c.name });
        cursor = data.response_metadata?.next_cursor ?? '';
      } while (cursor);
      return out.sort((a, b) => a.name.localeCompare(b.name));
    },
  };
}
