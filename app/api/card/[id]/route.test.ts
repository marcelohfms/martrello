import { describe, it, expect, afterEach, vi } from 'vitest';
import { makeTestDb, makeUser } from '@/lib/core/test-helpers';
import { createProject } from '@/lib/core/projects';
import { createCard } from '@/lib/core/cards';
import * as clientModule from '@/lib/db/client';
import * as currentUser from '@/lib/auth/current-user';
import { GET } from './route';

afterEach(() => vi.restoreAllMocks());

describe('GET /api/card/[id]', () => {
  it('devolve 404 CARD_NOT_FOUND para card inacessível ou inexistente', async () => {
    const { db } = makeTestDb();
    const admin = await makeUser(db, { role: 'admin' });
    const outsider = await makeUser(db);
    const p = await createProject(db, admin.actor, { name: 'Segredo' });
    const card = await createCard(db, admin.actor, { project: p.id, title: 'x' });
    vi.spyOn(clientModule, 'getDb').mockReturnValue(db as any);
    vi.spyOn(currentUser, 'requireActor').mockResolvedValue({ user: outsider.user as any, actor: outsider.actor });

    for (const id of [card.id, 'nao-existe']) {
      const res = await GET(new Request('http://localhost/api/card/x'), { params: Promise.resolve({ id }) });
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe('CARD_NOT_FOUND');
      expect(typeof body.message).toBe('string');
    }
  });
});
