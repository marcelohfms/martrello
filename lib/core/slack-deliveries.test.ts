import { describe, it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { makeTestDb, type Db } from './test-helpers';
import { SYSTEM_ACTOR } from '@/lib/access/actor';
import { createProject, archiveProject, setProjectSlackChannel } from './projects';
import { slackDeliveries } from '@/lib/db/schema';
import {
  listDigestTargets, claimDelivery, finishDelivery, failStaleSending, deliveryStatuses,
} from './slack-deliveries';

let db: Db;
let close: () => void;
let projectId: string;

beforeEach(async () => {
  const t = makeTestDb();
  db = t.db;
  close = t.close;
  projectId = (await createProject(db, SYSTEM_ACTOR, { name: 'alpha' })).id;
});

const rowOf = (day: string) =>
  db.select().from(slackDeliveries).where(eq(slackDeliveries.day, day)).all()[0];

describe('slack deliveries', () => {
  it('claimDelivery reserva uma vez por dia', () => {
    expect(claimDelivery(db, projectId, '2026-11-13', 1)).toBe(true);
    expect(claimDelivery(db, projectId, '2026-11-13', 2)).toBe(false);
    expect(claimDelivery(db, projectId, '2026-11-16', 3)).toBe(true);
    close();
  });

  it('retry pode ser reclamado de novo e conta tentativas', () => {
    claimDelivery(db, projectId, '2026-11-13', 1);
    finishDelivery(db, projectId, '2026-11-13', 'retry', 'ratelimited', 2);
    expect(claimDelivery(db, projectId, '2026-11-13', 3)).toBe(true);
    const row = rowOf('2026-11-13');
    expect(row.attempts).toBe(2);
    expect(row.status).toBe('sending');
    close();
  });

  it.each(['sent', 'empty', 'failed'] as const)('%s não é reclamado de novo', (status) => {
    claimDelivery(db, projectId, '2026-11-13', 1);
    finishDelivery(db, projectId, '2026-11-13', status, null, 2);
    expect(claimDelivery(db, projectId, '2026-11-13', 3)).toBe(false);
    close();
  });

  it('failStaleSending marca sending do dia como failed/interrupted', () => {
    claimDelivery(db, projectId, '2026-11-13', 1);
    claimDelivery(db, projectId, '2026-11-12', 1);
    expect(failStaleSending(db, '2026-11-13', 5)).toBe(1);
    const row = rowOf('2026-11-13');
    expect(row.status).toBe('failed');
    expect(row.error).toBe('interrupted');
    expect(rowOf('2026-11-12').status).toBe('sending');
    close();
  });

  it('listDigestTargets ignora projeto sem canal e arquivado', async () => {
    const b = await createProject(db, SYSTEM_ACTOR, { name: 'beta' });
    const c = await createProject(db, SYSTEM_ACTOR, { name: 'gamma' });
    await setProjectSlackChannel(db, SYSTEM_ACTOR, projectId, null);
    await setProjectSlackChannel(db, SYSTEM_ACTOR, b.id, { id: 'C2', name: 'beta-ch' });
    await setProjectSlackChannel(db, SYSTEM_ACTOR, c.id, { id: 'C3', name: 'gamma-ch' });
    await archiveProject(db, SYSTEM_ACTOR, c.id);
    expect(await listDigestTargets(db)).toEqual([{ id: b.id, name: 'beta', channelId: 'C2' }]);
    close();
  });

  it('deliveryStatuses devolve o último envio e o último sucesso', async () => {
    claimDelivery(db, projectId, '2026-11-13', 1);
    finishDelivery(db, projectId, '2026-11-13', 'sent', null, 1000);
    claimDelivery(db, projectId, '2026-11-16', 2000);
    finishDelivery(db, projectId, '2026-11-16', 'failed', 'boom', 3000);
    const s = (await deliveryStatuses(db)).get(projectId)!;
    expect(s.latest).toEqual({ day: '2026-11-16', status: 'failed', error: 'boom', at: 3000 });
    expect(s.lastSentAt).toBe(1000);
    close();
  });
});
