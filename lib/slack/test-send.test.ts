import { describe, it, expect } from 'vitest';
import { makeTestDb, makeUser, addMemberRow } from '@/lib/core/test-helpers';
import { SYSTEM_ACTOR } from '@/lib/access/actor';
import { createProject, setProjectSlackChannel } from '@/lib/core/projects';
import { createCard } from '@/lib/core/cards';
import { slackDeliveries } from '@/lib/db/schema';
import { MartrelloError } from '@/lib/errors';
import { SlackError, type SlackClient } from './client';
import { sendTestDigest } from './test-send';

function fakeSlack(postError?: unknown) {
  const posts: { channel: string; text: string }[] = [];
  const slack: SlackClient = {
    async postMessage(channel, text) {
      if (postError) throw postError;
      posts.push({ channel, text });
    },
    lookupUserIdByEmail: async (email) => (email === 'ana@t.local' ? 'UANA' : null),
    async listBotChannels() {
      return [];
    },
  };
  return { slack, posts };
}

const boardUrl = (id: string) => `https://m.test/p/${id}`;
// Sexta 13/11/2026, 14h30 em São Paulo: fora da janela das 9h às 12h.
const FRIDAY_AFTERNOON = new Date('2026-11-13T17:30:00Z');

async function setup(channel = true) {
  const { db, close } = makeTestDb();
  const { actor: admin } = await makeUser(db, { role: 'admin' });
  const { user: ana } = await makeUser(db, { email: 'ana@t.local', name: 'Ana' });
  const p = await createProject(db, SYSTEM_ACTOR, { name: 'TGS', acronym: 'TGS' });
  addMemberRow(db, p.id, ana.id);
  if (channel) await setProjectSlackChannel(db, SYSTEM_ACTOR, p.id, { id: 'C-TGS', name: 'tgs' });
  return { db, close, admin, ana, p };
}

describe('sendTestDigest', () => {
  it('envia a mensagem de hoje fora da janela e não registra envio do dia', async () => {
    const { db, close, admin, ana, p } = await setup();
    await createCard(db, SYSTEM_ACTOR, { project: p.id, title: 'Atrasada', dueDate: '2026-11-10', assignee: ana.email, list: 'A fazer' });
    await createCard(db, SYSTEM_ACTOR, { project: p.id, title: 'Hoje', dueDate: '2026-11-13' });
    const { slack, posts } = fakeSlack();

    const r = await sendTestDigest(db, admin, p.id, FRIDAY_AFTERNOON, { slack, boardUrl });

    expect(r).toEqual({ result: 'sent', channelName: 'tgs' });
    expect(posts).toHaveLength(1);
    expect(posts[0].channel).toBe('C-TGS');
    expect(posts[0].text).toContain('*Prazos de hoje · TGS* — sexta, 13/11');
    expect(posts[0].text).toContain('• Atrasada — <@UANA> · venceu ter 10/11');
    expect(posts[0].text).toContain('• Hoje — sem responsável');
    expect(posts[0].text).not.toContain('🗓️'); // sexta não é o primeiro dia útil da semana
    expect(db.select().from(slackDeliveries).all()).toHaveLength(0);
    close();
  });

  it('envia também em fim de semana', async () => {
    const { db, close, admin, p } = await setup();
    await createCard(db, SYSTEM_ACTOR, { project: p.id, title: 'Atrasada', dueDate: '2026-11-10' });
    const { slack, posts } = fakeSlack();
    const r = await sendTestDigest(db, admin, p.id, new Date('2026-11-14T15:00:00Z'), { slack, boardUrl });
    expect(r.result).toBe('sent');
    expect(posts).toHaveLength(1);
    close();
  });

  it('sem nada a avisar não envia', async () => {
    const { db, close, admin, p } = await setup();
    const { slack, posts } = fakeSlack();
    expect(await sendTestDigest(db, admin, p.id, FRIDAY_AFTERNOON, { slack, boardUrl })).toEqual({ result: 'empty', channelName: 'tgs' });
    expect(posts).toHaveLength(0);
    close();
  });

  it('projeto sem canal dá erro', async () => {
    const { db, close, admin, p } = await setup(false);
    const { slack } = fakeSlack();
    await expect(sendTestDigest(db, admin, p.id, FRIDAY_AFTERNOON, { slack, boardUrl })).rejects.toMatchObject({ code: 'SLACK_NO_CHANNEL' });
    close();
  });

  it('só o admin pode enviar', async () => {
    const { db, close, p } = await setup();
    const { actor: member } = await makeUser(db);
    const { slack } = fakeSlack();
    await expect(sendTestDigest(db, member, p.id, FRIDAY_AFTERNOON, { slack, boardUrl })).rejects.toBeInstanceOf(MartrelloError);
    close();
  });

  it('erro do Slack sobe como SlackError', async () => {
    const { db, close, admin, p } = await setup();
    await createCard(db, SYSTEM_ACTOR, { project: p.id, title: 'Atrasada', dueDate: '2026-11-10' });
    const { slack } = fakeSlack(new SlackError('not_in_channel', false));
    await expect(sendTestDigest(db, admin, p.id, FRIDAY_AFTERNOON, { slack, boardUrl })).rejects.toMatchObject({ code: 'not_in_channel' });
    close();
  });
});
