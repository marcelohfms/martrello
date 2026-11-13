import { describe, it, expect, vi } from 'vitest';
import { makeTestDb, makeUser, addMemberRow, type Db } from '@/lib/core/test-helpers';
import { SYSTEM_ACTOR } from '@/lib/access/actor';
import { createProject, setProjectSlackChannel, archiveProject } from '@/lib/core/projects';
import { createCard } from '@/lib/core/cards';
import { slackDeliveries } from '@/lib/db/schema';
import { SlackError, type SlackClient } from './client';
import { runDigestTick } from './digest-runner';

function fakeSlack(opts: { postErrors?: unknown[]; lookup?: (email: string) => Promise<string | null> } = {}) {
  const posts: { channel: string; text: string }[] = [];
  const errors = [...(opts.postErrors ?? [])];
  const slack: SlackClient = {
    async postMessage(channel, text) {
      const err = errors.shift();
      if (err) throw err;
      posts.push({ channel, text });
    },
    lookupUserIdByEmail: opts.lookup ?? (async () => null),
    async listBotChannels() {
      return [];
    },
  };
  return { slack, posts };
}

const boardUrl = (id: string) => `https://m.test/p/${id}`;
const log = () => {};
const rows = (db: Db) => db.select().from(slackDeliveries).all();

async function projectWithChannel(db: Db, name: string, channel = true) {
  const p = await createProject(db, SYSTEM_ACTOR, { name });
  if (channel) await setProjectSlackChannel(db, SYSTEM_ACTOR, p.id, { id: `C-${name}`, name });
  return p;
}

describe('runDigestTick', () => {
  it('fora de dia útil ou da janela não faz nada', async () => {
    const { db, close } = makeTestDb();
    const p = await projectWithChannel(db, 'alpha');
    await createCard(db, SYSTEM_ACTOR, { project: p.id, title: 't', dueDate: '2026-11-01' });
    const { slack, posts } = fakeSlack();
    for (const iso of ['2026-11-14T13:00:00Z', '2026-11-20T13:00:00Z', '2026-11-16T11:59:00Z', '2026-11-16T15:00:00Z']) {
      const r = await runDigestTick(db, new Date(iso), { slack, boardUrl, log });
      expect(r).toEqual({ sent: 0, empty: 0, failed: 0, retry: 0 });
    }
    expect(posts).toHaveLength(0);
    expect(rows(db)).toHaveLength(0);
    close();
  });

  it('janela 9h–12h', async () => {
    for (const iso of ['2026-11-16T12:00:00Z', '2026-11-16T14:59:00Z']) {
      const { db, close } = makeTestDb();
      const p = await projectWithChannel(db, 'alpha');
      await createCard(db, SYSTEM_ACTOR, { project: p.id, title: 't', dueDate: '2026-11-01' });
      const { slack, posts } = fakeSlack();
      const r = await runDigestTick(db, new Date(iso), { slack, boardUrl, log });
      expect(r.sent).toBe(1);
      expect(posts).toHaveLength(1);
      close();
    }
  });

  it('envia uma vez por projeto com canal', async () => {
    const { db, close } = makeTestDb();
    const a = await projectWithChannel(db, 'alpha');
    const b = await projectWithChannel(db, 'beta');
    const c = await projectWithChannel(db, 'gamma', false);
    await createCard(db, SYSTEM_ACTOR, { project: a.id, title: 'atrasada', dueDate: '2026-11-01' });
    await createCard(db, SYSTEM_ACTOR, { project: c.id, title: 'sem canal', dueDate: '2026-11-01' });
    const { slack, posts } = fakeSlack();
    const r = await runDigestTick(db, new Date('2026-11-16T12:00:00Z'), { slack, boardUrl, log });
    expect(r).toEqual({ sent: 1, empty: 1, failed: 0, retry: 0 });
    expect(posts).toHaveLength(1);
    expect(posts[0].channel).toBe('C-alpha');
    const byProject = Object.fromEntries(rows(db).map((x) => [x.projectId, x.status]));
    expect(byProject).toEqual({ [a.id]: 'sent', [b.id]: 'empty' });
    close();
  });

  it('não repete após reinício', async () => {
    const { db, close } = makeTestDb();
    const p = await projectWithChannel(db, 'alpha');
    await createCard(db, SYSTEM_ACTOR, { project: p.id, title: 't', dueDate: '2026-11-01' });
    const { slack, posts } = fakeSlack();
    await runDigestTick(db, new Date('2026-11-16T12:00:00Z'), { slack, boardUrl, log });
    await runDigestTick(db, new Date('2026-11-16T12:15:00Z'), { slack, boardUrl, log });
    expect(posts).toHaveLength(1);
    close();
  });

  it('segunda inclui a semana, terça não; segunda feriado passa para o primeiro dia útil', async () => {
    const { db, close } = makeTestDb();
    const p = await projectWithChannel(db, 'alpha');
    await createCard(db, SYSTEM_ACTOR, { project: p.id, title: 'domingo', dueDate: '2026-11-22' });
    const { slack, posts } = fakeSlack();
    await runDigestTick(db, new Date('2026-11-16T12:00:00Z'), { slack, boardUrl, log });
    expect(posts[0].text).toContain('domingo');
    await runDigestTick(db, new Date('2026-11-17T12:00:00Z'), { slack, boardUrl, log });
    expect(posts).toHaveLength(1);
    expect(rows(db).find((x) => x.day === '2026-11-17')?.status).toBe('empty');
    close();

    // 02/11 (Finados) é feriado: terça 03/11 é o primeiro dia útil da semana.
    const other = makeTestDb();
    const q = await projectWithChannel(other.db, 'alpha');
    await createCard(other.db, SYSTEM_ACTOR, { project: q.id, title: 'sexta', dueDate: '2026-11-06' });
    const s2 = fakeSlack();
    await runDigestTick(other.db, new Date('2026-11-03T12:30:00Z'), { slack: s2.slack, boardUrl, log });
    expect(s2.posts).toHaveLength(1);
    expect(s2.posts[0].text).toContain('sexta');
    other.close();
  });

  it('erro retentável tenta no próximo tick', async () => {
    const { db, close } = makeTestDb();
    const p = await projectWithChannel(db, 'alpha');
    await createCard(db, SYSTEM_ACTOR, { project: p.id, title: 't', dueDate: '2026-11-01' });
    const { slack, posts } = fakeSlack({ postErrors: [new SlackError('ratelimited', true)] });
    const r1 = await runDigestTick(db, new Date('2026-11-16T12:00:00Z'), { slack, boardUrl, log });
    expect(r1.retry).toBe(1);
    expect(rows(db)[0]).toMatchObject({ status: 'retry', error: 'ratelimited' });
    const r2 = await runDigestTick(db, new Date('2026-11-16T12:15:00Z'), { slack, boardUrl, log });
    expect(r2.sent).toBe(1);
    expect(rows(db)[0]).toMatchObject({ status: 'sent', attempts: 2 });
    expect(posts).toHaveLength(1);
    close();
  });

  it('erro permanente encerra o dia', async () => {
    const { db, close } = makeTestDb();
    const p = await projectWithChannel(db, 'alpha');
    await createCard(db, SYSTEM_ACTOR, { project: p.id, title: 't', dueDate: '2026-11-01' });
    const { slack, posts } = fakeSlack({ postErrors: [new SlackError('not_in_channel', false)] });
    const r1 = await runDigestTick(db, new Date('2026-11-16T12:00:00Z'), { slack, boardUrl, log });
    expect(r1.failed).toBe(1);
    expect(rows(db)[0]).toMatchObject({ status: 'failed', error: 'not_in_channel' });
    await runDigestTick(db, new Date('2026-11-16T12:15:00Z'), { slack, boardUrl, log });
    expect(posts).toHaveLength(0);
    close();
  });

  it('falha em um projeto não impede os outros no mesmo tick', async () => {
    const { db, close } = makeTestDb();
    const a = await projectWithChannel(db, 'alpha');
    const b = await projectWithChannel(db, 'beta');
    await createCard(db, SYSTEM_ACTOR, { project: a.id, title: 'ta', dueDate: '2026-11-01' });
    await createCard(db, SYSTEM_ACTOR, { project: b.id, title: 'tb', dueDate: '2026-11-01' });
    const posts: string[] = [];
    const slack: SlackClient = {
      async postMessage(channel) {
        if (channel === 'C-alpha') throw new SlackError('not_in_channel', false);
        posts.push(channel);
      },
      lookupUserIdByEmail: async () => null,
      listBotChannels: async () => [],
    };
    const r = await runDigestTick(db, new Date('2026-11-16T12:00:00Z'), { slack, boardUrl, log });
    expect(r).toEqual({ sent: 1, empty: 0, failed: 1, retry: 0 });
    const byProject = Object.fromEntries(rows(db).map((x) => [x.projectId, x.status]));
    expect(byProject).toEqual({ [a.id]: 'failed', [b.id]: 'sent' });
    expect(posts).toEqual(['C-beta']);
    close();
  });

  it('erro comum no envio vira failed com a mensagem', async () => {
    const { db, close } = makeTestDb();
    const p = await projectWithChannel(db, 'alpha');
    await createCard(db, SYSTEM_ACTOR, { project: p.id, title: 't', dueDate: '2026-11-01' });
    const { slack } = fakeSlack({ postErrors: [new Error('boom')] });
    const r = await runDigestTick(db, new Date('2026-11-16T12:00:00Z'), { slack, boardUrl, log });
    expect(r.failed).toBe(1);
    expect(rows(db)[0]).toMatchObject({ status: 'failed', error: 'boom' });
    close();
  });

  it('exceção de banco em um projeto é logada e o laço continua', async () => {
    const { db, close } = makeTestDb();
    const a = await projectWithChannel(db, 'alpha');
    const b = await projectWithChannel(db, 'beta');
    await createCard(db, SYSTEM_ACTOR, { project: a.id, title: 'ta', dueDate: '2026-11-01' });
    await createCard(db, SYSTEM_ACTOR, { project: b.id, title: 'tb', dueDate: '2026-11-01' });
    // Sem linha 'sent' pré-existente: o trigger aborta o UPDATE para 'sent' do projeto A (falha no 1º finishDelivery).
    db.$client.exec(
      `CREATE TRIGGER boom BEFORE UPDATE ON slack_deliveries WHEN NEW.status = 'sent' AND NEW.project_id = '${a.id}' BEGIN SELECT RAISE(ABORT, 'db-boom'); END`,
    );
    const { slack, posts } = fakeSlack();
    const logs: string[] = [];
    const r = await runDigestTick(db, new Date('2026-11-16T12:00:00Z'), { slack, boardUrl, log: (m) => logs.push(m) });
    expect(r.sent).toBe(1);
    expect(posts.map((p) => p.channel)).toEqual(['C-alpha', 'C-beta']);
    expect(logs.some((l) => l.startsWith('[slack] alpha: erro inesperado (db-boom'))).toBe(true);
    expect(rows(db).find((x) => x.projectId === a.id)?.status).toBe('sending');
    close();
  });

  it('sending antigo vira failed', async () => {
    const { db, close } = makeTestDb();
    const p = await projectWithChannel(db, 'alpha');
    await createCard(db, SYSTEM_ACTOR, { project: p.id, title: 't', dueDate: '2026-11-01' });
    db.insert(slackDeliveries)
      .values({ projectId: p.id, day: '2026-11-16', status: 'sending', attempts: 1, error: null, updatedAt: 1 })
      .run();
    const { slack, posts } = fakeSlack();
    const logs: string[] = [];
    await runDigestTick(db, new Date('2026-11-16T12:00:00Z'), { slack, boardUrl, log: (m) => logs.push(m) });
    expect(rows(db)[0]).toMatchObject({ status: 'failed', error: 'interrupted' });
    expect(posts).toHaveLength(0);
    expect(logs).toContain('[slack] envio interrompido em 1 projeto(s)');
    close();
  });

  it('busca de e-mail que falha vira nome', async () => {
    const { db, close } = makeTestDb();
    const p = await projectWithChannel(db, 'alpha');
    const ana = await makeUser(db, { email: 'ana@x.com', name: 'Ana Souza' });
    addMemberRow(db, p.id, ana.user.id);
    await createCard(db, SYSTEM_ACTOR, { project: p.id, title: 't', dueDate: '2026-11-01', assignee: 'ana@x.com' });
    const lookup = vi.fn().mockRejectedValue(new SlackError('ratelimited', true));
    const { slack, posts } = fakeSlack({ lookup });
    const r = await runDigestTick(db, new Date('2026-11-16T12:00:00Z'), { slack, boardUrl, log });
    expect(r.sent).toBe(1);
    expect(posts[0].text).toContain('Ana Souza');
    expect(posts[0].text).not.toContain('<@');
    close();
  });

  it('menciona quem tem usuário no Slack e consulta cada e-mail uma vez', async () => {
    const { db, close } = makeTestDb();
    const p = await projectWithChannel(db, 'alpha');
    const ana = await makeUser(db, { email: 'ana@x.com', name: 'Ana Souza' });
    addMemberRow(db, p.id, ana.user.id);
    await createCard(db, SYSTEM_ACTOR, { project: p.id, title: 't1', dueDate: '2026-11-01', assignee: 'ana@x.com' });
    await createCard(db, SYSTEM_ACTOR, { project: p.id, title: 't2', dueDate: '2026-11-02', assignee: 'ana@x.com' });
    const lookup = vi.fn().mockResolvedValue('U123');
    const { slack, posts } = fakeSlack({ lookup });
    await runDigestTick(db, new Date('2026-11-16T12:00:00Z'), { slack, boardUrl, log });
    expect(posts[0].text).toContain('<@U123>');
    expect(lookup).toHaveBeenCalledTimes(1);
    close();
  });

  it('projeto arquivado não recebe', async () => {
    const { db, close } = makeTestDb();
    const p = await projectWithChannel(db, 'alpha');
    await createCard(db, SYSTEM_ACTOR, { project: p.id, title: 't', dueDate: '2026-11-01' });
    await archiveProject(db, SYSTEM_ACTOR, p.id);
    const { slack, posts } = fakeSlack();
    await runDigestTick(db, new Date('2026-11-16T12:00:00Z'), { slack, boardUrl, log });
    expect(posts).toHaveLength(0);
    expect(rows(db)).toHaveLength(0);
    close();
  });
});
