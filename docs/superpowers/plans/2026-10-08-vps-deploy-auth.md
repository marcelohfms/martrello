# VPS Deploy, Argon2 Login & Remote MCP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Host martrello on the user's Easypanel VPS with a single-user argon2id login, a token-protected remote MCP endpoint, and a GitHub Actions → GHCR → Easypanel deploy pipeline.

**Architecture:** Auth lives in `lib/auth/*` as small, db-injected modules (same style as `lib/core/*`), wired into Next via `proxy.ts`, a `(app)` route group whose layout requires a user, and a `/login` page. The existing MCP `createServer()` is exposed at `app/api/mcp/route.ts` through the SDK's stateless web-standard Streamable HTTP transport. A multi-stage Dockerfile builds a Next `standalone` image plus esbuild-bundled ops scripts (migrate, user-set, backup); backups run in-process from `instrumentation.ts`.

**Tech Stack:** Next.js 16.2 (App Router, `proxy.ts`), React 19, better-sqlite3 + drizzle-orm 0.45, `@node-rs/argon2`, `@modelcontextprotocol/sdk` 1.29, vitest 4, esbuild, Docker, GitHub Actions, GHCR, Easypanel.

**Spec:** `docs/superpowers/specs/2026-10-08-vps-deploy-auth-design.md`

## Global Constraints

- Node 24 (`.nvmrc` = `24`), pnpm 11.3.0.
- argon2id parameters: `memoryCost: 19456`, `timeCost: 2`, `parallelism: 1`, PHC string format.
- Session cookie name `martrello_session`; `HttpOnly`, `SameSite=Lax`, `Path=/`, 30-day lifetime; `Secure` only when `SESSION_COOKIE_SECURE=true`.
- Only `sha256(token)` of a session is ever stored; the raw token lives only in the cookie.
- Login rate limit: 5 failures per IP within 15 min → blocked for 15 min; reset on success.
- Generic login error copy: `Usuário ou senha inválidos.`; blocked copy: `Muitas tentativas. Tente de novo em N minutos.`
- Minimum password length 12.
- `/api/mcp` auth: `Authorization: Bearer <MCP_TOKEN>`; missing/empty `MCP_TOKEN` → `503 {"error":"MCP_DISABLED"}`; bad/missing header → `401 {"error":"UNAUTHORIZED"}`; constant-time compare over SHA-256 digests.
- Production env: `DATABASE_URL=file:/data/martrello.db`, `BACKUP_DIR=/data/backups`, `BACKUP_KEEP` default 14, single replica.
- Image: `ghcr.io/marcelohfms/martrello`, tags `latest` and `sha-<7-char sha>`, platform `linux/amd64`.
- UI copy is Portuguese (pt-BR), matching the existing app.
- No new multi-user features, password reset, 2FA, or OAuth.
- Never commit or modify the user's real DB (`martrello.db` in the repo root / worktree). All manual verification uses copies under `tmp/` (gitignored).

## Review Focus

- Username typed with different case or stray spaces (`"Marcelo "` vs `marcelo`) must log in as the same user → Task 3 test `normalizes username on set and authenticate`.
- `MCP_TOKEN` pasted with a trailing newline/space in Easypanel must still match the client's token → Task 6 test `trims surrounding whitespace in the configured token`.
- `x-forwarded-for` carrying a proxy chain (`"203.0.113.9, 10.0.0.2"`) must rate-limit the client IP, and a missing header must not crash → Task 4 tests for `clientIp`.
- An absurdly long password (e.g. 1 MB) must be rejected cheaply instead of being fed to argon2 → Task 3 test `rejects over-long passwords without hashing`.
- Backup retention must only delete `martrello-*.db` files, never other files in `/data/backups` → Task 7 test `prune only touches martrello-*.db files`.

---

## File Structure

| File | Responsibility |
|---|---|
| `lib/db/schema.ts` (modify) | add `users`, `sessions` tables |
| `lib/db/migrations/0004_*.sql` (generated) | DDL for the new tables |
| `lib/db/client.ts` (modify) | export `DB_PATH` |
| `lib/auth/password.ts` | argon2id hash/verify |
| `lib/auth/sessions.ts` | create/validate/delete sessions |
| `lib/auth/users.ts` | username normalization, set password, authenticate |
| `lib/auth/rate-limit.ts` | in-memory failure limiter + `loginLimiter` singleton |
| `lib/auth/client-ip.ts` | client IP from proxy headers |
| `lib/auth/cookie.ts` | cookie name + options |
| `lib/auth/access.ts` | pure routing decision for the proxy |
| `lib/auth/current-user.ts` | `getCurrentUser()` / `requireUser()` for RSC + actions |
| `lib/auth/mcp-token.ts` | bearer-token check for `/api/mcp` |
| `proxy.ts` | Next 16 proxy: session gate for every route |
| `app/layout.tsx` (modify) | root html/body only |
| `app/(app)/layout.tsx` | authenticated shell (sidebar, privacy provider) |
| `app/(app)/page.tsx`, `app/(app)/project/**`, `app/(app)/sprint/**` (moved) | existing pages, unchanged content |
| `app/login/page.tsx`, `app/login/LoginForm.tsx`, `app/login/actions.ts` | login/logout UI + actions |
| `app/actions.ts` (modify) | `requireUser()` at the top of every action |
| `components/SidebarClient.tsx` (modify) | "Sair" button in footer |
| `app/api/mcp/route.ts` | remote MCP endpoint |
| `lib/backup.ts` | online backup, retention, due check |
| `lib/backup-scheduler.ts` | hourly in-process scheduler |
| `instrumentation.ts` | starts the scheduler on server boot |
| `scripts/backup.ts` (rewrite) | manual backup CLI |
| `scripts/user-set.ts` | create user / change password CLI |
| `scripts/build-scripts.ts` | esbuild bundles → `dist/scripts/*.js` |
| `scripts/start.sh` | container entrypoint: check `/data`, migrate, start |
| `Dockerfile`, `.dockerignore` | image build |
| `next.config.ts` (modify) | `standalone`, `serverExternalPackages` |
| `pnpm-workspace.yaml`, `package.json`, `.gitignore`, `vitest.config.ts` (modify) | tooling |
| `.github/workflows/deploy.yml` | test → build/push GHCR → Easypanel webhook |
| `docs/deploy.md`, `README.md` (modify) | runbook |

---

### Task 1: Users/sessions schema + argon2 password module

**Files:**
- Modify: `lib/db/schema.ts`, `package.json` (dependency)
- Create (generated): `lib/db/migrations/0004_<random>.sql`, `lib/db/migrations/meta/0004_snapshot.json`, `lib/db/migrations/meta/_journal.json` (updated)
- Create: `lib/auth/password.ts`
- Test: `lib/auth/password.test.ts`

**Interfaces:**
- Produces: tables `users`, `sessions`; types `User`, `Session` from `@/lib/db/schema`; `hashPassword(plain: string): Promise<string>`; `verifyPassword(passwordHash: string, plain: string): Promise<boolean>`.

- [ ] **Step 1: Add the dependency**

Run: `pnpm add @node-rs/argon2`
Expected: `package.json` gains `"@node-rs/argon2"` under `dependencies`; lockfile updated.

- [ ] **Step 2: Write the failing test**

`lib/auth/password.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from './password';

describe('password', () => {
  it('hashes with argon2id and the configured parameters', async () => {
    const h = await hashPassword('correct horse battery staple');
    expect(h).not.toContain('correct horse');
    expect(h.startsWith('$argon2id$')).toBe(true);
    expect(h).toContain('m=19456,t=2,p=1');
  });

  it('verifies the right password', async () => {
    const h = await hashPassword('correct horse battery staple');
    expect(await verifyPassword(h, 'correct horse battery staple')).toBe(true);
  });

  it('rejects a wrong password', async () => {
    const h = await hashPassword('correct horse battery staple');
    expect(await verifyPassword(h, 'wrong horse battery staple')).toBe(false);
  });

  it('returns false (does not throw) for a malformed hash', async () => {
    expect(await verifyPassword('not-a-hash', 'whatever')).toBe(false);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm vitest run lib/auth/password.test.ts`
Expected: FAIL — cannot resolve `./password`.

- [ ] **Step 4: Implement `lib/auth/password.ts`**

```ts
import { hash, verify } from '@node-rs/argon2';

// OWASP argon2id baseline; @node-rs/argon2 defaults to the argon2id variant.
const OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 };

export async function hashPassword(plain: string): Promise<string> {
  return hash(plain, OPTIONS);
}

export async function verifyPassword(passwordHash: string, plain: string): Promise<boolean> {
  try {
    return await verify(passwordHash, plain);
  } catch {
    return false;
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run lib/auth/password.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Add the tables to `lib/db/schema.ts`**

Insert after the `sprintSlots` table definition (before the `export type` block):

```ts
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: integer('created_at').notNull(),
});

export const sessions = sqliteTable(
  'sessions',
  {
    idHash: text('id_hash').primaryKey(),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    createdAt: integer('created_at').notNull(),
    expiresAt: integer('expires_at').notNull(),
  },
  (t) => ({
    byUser: index('sessions_by_user').on(t.userId),
  }),
);
```

And append to the type exports:

```ts
export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
```

- [ ] **Step 7: Generate the migration**

Run: `pnpm db:generate`
Expected: a new `lib/db/migrations/0004_<name>.sql` containing `CREATE TABLE \`users\``, `CREATE UNIQUE INDEX \`users_username_unique\``, `CREATE TABLE \`sessions\`` (with the FK to `users` `ON DELETE cascade`) and `CREATE INDEX \`sessions_by_user\``. Open the file and confirm it contains only those statements (nothing touching existing tables).

- [ ] **Step 8: Run the full suite (migrations are applied by `makeTestDb`)**

Run: `pnpm test`
Expected: all tests PASS (previous 120 + 4 new).

- [ ] **Step 9: Commit**

```bash
git add package.json pnpm-lock.yaml lib/db/schema.ts lib/db/migrations lib/auth/password.ts lib/auth/password.test.ts
git commit -m "feat(auth): add users/sessions schema and argon2id password hashing"
```

---

### Task 2: Session store

**Files:**
- Create: `lib/auth/sessions.ts`
- Test: `lib/auth/sessions.test.ts`

**Interfaces:**
- Consumes: `users`, `sessions` from `@/lib/db/schema`; `Db` from `@/lib/core/test-helpers`.
- Produces:
  - `type SessionUser = { id: string; username: string }`
  - `SESSION_TTL_MS: number` (30 days)
  - `hashToken(token: string): string` (hex sha256)
  - `createSession(db: Db, userId: string, now?: number): Promise<{ token: string; expiresAt: number }>`
  - `validateSession(db: Db, token: string | null | undefined, now?: number): Promise<SessionUser | null>`
  - `deleteSession(db: Db, token: string | null | undefined): Promise<void>`
  - `deleteUserSessions(db: Db, userId: string): Promise<void>`

- [ ] **Step 1: Write the failing test**

`lib/auth/sessions.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { makeTestDb, type Db } from '@/lib/core/test-helpers';
import { users, sessions } from '@/lib/db/schema';
import {
  createSession, validateSession, deleteSession, deleteUserSessions, hashToken, SESSION_TTL_MS,
} from './sessions';

let db: Db;
beforeEach(async () => {
  db = makeTestDb().db;
  await db.insert(users).values({ id: 'u1', username: 'marcelo', passwordHash: 'x', createdAt: 0 });
});

describe('sessions', () => {
  it('create → validate returns the user', async () => {
    const { token, expiresAt } = await createSession(db, 'u1', 1_000);
    expect(expiresAt).toBe(1_000 + SESSION_TTL_MS);
    expect(await validateSession(db, token, 2_000)).toEqual({ id: 'u1', username: 'marcelo' });
  });

  it('stores only the token hash, never the token', async () => {
    const { token } = await createSession(db, 'u1');
    const rows = await db.select().from(sessions);
    expect(rows).toHaveLength(1);
    expect(rows[0].idHash).toBe(hashToken(token));
    expect(rows[0].idHash).not.toBe(token);
  });

  it('generates distinct high-entropy tokens', async () => {
    const a = await createSession(db, 'u1');
    const b = await createSession(db, 'u1');
    expect(a.token).not.toBe(b.token);
    expect(a.token.length).toBeGreaterThanOrEqual(43);
  });

  it('returns null for unknown, empty or missing tokens', async () => {
    expect(await validateSession(db, 'nope')).toBeNull();
    expect(await validateSession(db, '')).toBeNull();
    expect(await validateSession(db, undefined)).toBeNull();
  });

  it('expired session returns null and its row is deleted', async () => {
    const { token } = await createSession(db, 'u1', 0);
    expect(await validateSession(db, token, SESSION_TTL_MS)).toBeNull();
    expect(await db.select().from(sessions)).toHaveLength(0);
  });

  it('deleteSession revokes the session', async () => {
    const { token } = await createSession(db, 'u1');
    await deleteSession(db, token);
    expect(await validateSession(db, token)).toBeNull();
  });

  it('deleteUserSessions revokes every session of that user', async () => {
    const a = await createSession(db, 'u1');
    const b = await createSession(db, 'u1');
    await deleteUserSessions(db, 'u1');
    expect(await validateSession(db, a.token)).toBeNull();
    expect(await validateSession(db, b.token)).toBeNull();
  });

  it('deleting the user cascades to sessions', async () => {
    const { token } = await createSession(db, 'u1');
    await db.delete(users).where(eq(users.id, 'u1'));
    expect(await validateSession(db, token)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run lib/auth/sessions.test.ts`
Expected: FAIL — cannot resolve `./sessions`.

- [ ] **Step 3: Implement `lib/auth/sessions.ts`**

```ts
import { createHash, randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { sessions, users } from '@/lib/db/schema';
import type { Db } from '@/lib/core/test-helpers';

export type SessionUser = { id: string; username: string };

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function createSession(
  db: Db,
  userId: string,
  now: number = Date.now(),
): Promise<{ token: string; expiresAt: number }> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = now + SESSION_TTL_MS;
  await db.insert(sessions).values({ idHash: hashToken(token), userId, createdAt: now, expiresAt });
  return { token, expiresAt };
}

export async function validateSession(
  db: Db,
  token: string | null | undefined,
  now: number = Date.now(),
): Promise<SessionUser | null> {
  if (!token) return null;
  const idHash = hashToken(token);
  const row = await db
    .select({ expiresAt: sessions.expiresAt, id: users.id, username: users.username })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.idHash, idHash))
    .get();
  if (!row) return null;
  if (row.expiresAt <= now) {
    await db.delete(sessions).where(eq(sessions.idHash, idHash));
    return null;
  }
  return { id: row.id, username: row.username };
}

export async function deleteSession(db: Db, token: string | null | undefined): Promise<void> {
  if (!token) return;
  await db.delete(sessions).where(eq(sessions.idHash, hashToken(token)));
}

export async function deleteUserSessions(db: Db, userId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run lib/auth/sessions.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/auth/sessions.ts lib/auth/sessions.test.ts
git commit -m "feat(auth): add hashed-token session store"
```

---

### Task 3: User accounts + `user:set` CLI

**Files:**
- Create: `lib/auth/users.ts`, `scripts/user-set.ts`
- Modify: `package.json` (script `user:set`)
- Test: `lib/auth/users.test.ts`

**Interfaces:**
- Consumes: `hashPassword`, `verifyPassword` (Task 1); `deleteUserSessions`, `SessionUser` (Task 2); `MartrelloError` from `@/lib/errors` (code `INVALID_INPUT`).
- Produces:
  - `MIN_PASSWORD_LENGTH = 12`, `MAX_PASSWORD_LENGTH = 1024`
  - `normalizeUsername(raw: string): string`
  - `setUserPassword(db: Db, username: string, plain: string): Promise<{ id: string; username: string; created: boolean }>`
  - `authenticate(db: Db, username: string, plain: string): Promise<SessionUser | null>`

- [ ] **Step 1: Write the failing test**

`lib/auth/users.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { makeTestDb, type Db } from '@/lib/core/test-helpers';
import { users } from '@/lib/db/schema';
import { createSession, validateSession } from './sessions';
import { setUserPassword, authenticate, normalizeUsername, MAX_PASSWORD_LENGTH } from './users';

let db: Db;
beforeEach(() => {
  db = makeTestDb().db;
});

const PW = 'a-very-long-password-1';

describe('users', () => {
  it('creates a user with a hashed password', async () => {
    const r = await setUserPassword(db, 'marcelo', PW);
    expect(r.created).toBe(true);
    const rows = await db.select().from(users);
    expect(rows).toHaveLength(1);
    expect(rows[0].passwordHash.startsWith('$argon2id$')).toBe(true);
  });

  it('updating the password replaces the hash and revokes sessions', async () => {
    const { id } = await setUserPassword(db, 'marcelo', PW);
    const { token } = await createSession(db, id);
    const r = await setUserPassword(db, 'marcelo', 'another-long-password-2');
    expect(r).toEqual({ id, username: 'marcelo', created: false });
    expect(await validateSession(db, token)).toBeNull();
    expect(await authenticate(db, 'marcelo', PW)).toBeNull();
    expect(await authenticate(db, 'marcelo', 'another-long-password-2')).toEqual({ id, username: 'marcelo' });
  });

  it('rejects passwords shorter than 12 characters', async () => {
    await expect(setUserPassword(db, 'marcelo', 'short')).rejects.toThrow(/INVALID_INPUT/);
  });

  it('rejects an empty username', async () => {
    await expect(setUserPassword(db, '   ', PW)).rejects.toThrow(/INVALID_INPUT/);
  });

  it('authenticates with the right password', async () => {
    const { id } = await setUserPassword(db, 'marcelo', PW);
    expect(await authenticate(db, 'marcelo', PW)).toEqual({ id, username: 'marcelo' });
  });

  it('returns null for a wrong password or unknown user', async () => {
    await setUserPassword(db, 'marcelo', PW);
    expect(await authenticate(db, 'marcelo', 'wrong-password-123')).toBeNull();
    expect(await authenticate(db, 'ghost', PW)).toBeNull();
  });

  it('normalizes username on set and authenticate', async () => {
    expect(normalizeUsername('  Marcelo ')).toBe('marcelo');
    const { id } = await setUserPassword(db, ' Marcelo ', PW);
    expect(await authenticate(db, 'MARCELO', PW)).toEqual({ id, username: 'marcelo' });
  });

  it('rejects over-long passwords without hashing', async () => {
    await setUserPassword(db, 'marcelo', PW);
    const huge = 'x'.repeat(MAX_PASSWORD_LENGTH + 1);
    const started = Date.now();
    expect(await authenticate(db, 'marcelo', huge)).toBeNull();
    expect(Date.now() - started).toBeLessThan(20);
    await expect(setUserPassword(db, 'marcelo', huge)).rejects.toThrow(/INVALID_INPUT/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run lib/auth/users.test.ts`
Expected: FAIL — cannot resolve `./users`.

- [ ] **Step 3: Implement `lib/auth/users.ts`**

```ts
import { eq } from 'drizzle-orm';
import { ulid } from 'ulidx';
import { users } from '@/lib/db/schema';
import { MartrelloError } from '@/lib/errors';
import type { Db } from '@/lib/core/test-helpers';
import { hashPassword, verifyPassword } from './password';
import { deleteUserSessions, type SessionUser } from './sessions';

export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 1024;

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

export async function setUserPassword(
  db: Db,
  username: string,
  plain: string,
): Promise<{ id: string; username: string; created: boolean }> {
  const name = normalizeUsername(username);
  if (!name) throw new MartrelloError('INVALID_INPUT', 'username não pode ser vazio');
  if (plain.length < MIN_PASSWORD_LENGTH) {
    throw new MartrelloError('INVALID_INPUT', `senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres`);
  }
  if (plain.length > MAX_PASSWORD_LENGTH) {
    throw new MartrelloError('INVALID_INPUT', `senha pode ter no máximo ${MAX_PASSWORD_LENGTH} caracteres`);
  }

  const passwordHash = await hashPassword(plain);
  const existing = await db.select().from(users).where(eq(users.username, name)).get();
  if (existing) {
    await db.update(users).set({ passwordHash }).where(eq(users.id, existing.id));
    await deleteUserSessions(db, existing.id);
    return { id: existing.id, username: name, created: false };
  }

  const id = ulid();
  await db.insert(users).values({ id, username: name, passwordHash, createdAt: Date.now() });
  return { id, username: name, created: true };
}

// Verifying against a fixed hash when the user doesn't exist keeps response
// time indistinguishable from a wrong-password attempt.
let dummyHash: Promise<string> | null = null;
function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword('martrello-timing-equalizer');
  return dummyHash;
}

export async function authenticate(db: Db, username: string, plain: string): Promise<SessionUser | null> {
  if (plain.length > MAX_PASSWORD_LENGTH) return null;
  const name = normalizeUsername(username);
  const user = name ? await db.select().from(users).where(eq(users.username, name)).get() : undefined;
  if (!user) {
    await verifyPassword(await getDummyHash(), plain);
    return null;
  }
  const ok = await verifyPassword(user.passwordHash, plain);
  return ok ? { id: user.id, username: user.username } : null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run lib/auth/users.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Implement the CLI `scripts/user-set.ts`**

```ts
// scripts/user-set.ts — create the login user or change its password.
// Interactive (TTY): asks twice without echo. Piped stdin: reads the password once.
import readline from 'node:readline';
import { getDb, closeDb } from '@/lib/db/client';
import { setUserPassword } from '@/lib/auth/users';

function promptHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const writable = rl as unknown as { _writeToOutput: (s: string) => void };
    let muted = false;
    writable._writeToOutput = (s: string) => {
      if (!muted) process.stdout.write(s);
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
    muted = true;
  });
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8').replace(/\r?\n$/, '');
}

async function main() {
  const username = process.argv[2];
  if (!username) {
    console.error('uso: user-set <username>');
    process.exit(1);
  }

  let password: string;
  if (process.stdin.isTTY) {
    password = await promptHidden('Senha: ');
    const confirm = await promptHidden('Confirme a senha: ');
    if (password !== confirm) {
      console.error('As senhas não conferem.');
      process.exit(1);
    }
  } else {
    password = await readStdin();
  }

  const result = await setUserPassword(getDb(), username, password);
  closeDb();
  console.log(result.created ? `usuário "${result.username}" criado` : `senha de "${result.username}" atualizada (sessões encerradas)`);
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});
```

Add to `package.json` `scripts`: `"user:set": "tsx scripts/user-set.ts"`.

- [ ] **Step 6: Smoke-test the CLI against a throwaway DB**

Run:
```bash
mkdir -p tmp && rm -f tmp/cli-check.db*
DATABASE_URL=file:./tmp/cli-check.db pnpm db:migrate
printf 'smoke-test-password-xyz\n' | DATABASE_URL=file:./tmp/cli-check.db pnpm -s user:set Smoke
printf 'tiny\n' | DATABASE_URL=file:./tmp/cli-check.db pnpm -s user:set smoke; echo "exit=$?"
sqlite3 tmp/cli-check.db "select username, substr(password_hash,1,10) from users;"
```
Expected: `usuário "smoke" criado`; second call prints `INVALID_INPUT: senha precisa ter pelo menos 12 caracteres` and `exit=1`; sqlite shows `smoke|$argon2id$`.

Add `tmp/` to `.gitignore` (new line under `# misc`).

- [ ] **Step 7: Commit**

```bash
git add lib/auth/users.ts lib/auth/users.test.ts scripts/user-set.ts package.json .gitignore
git commit -m "feat(auth): add user accounts and user:set CLI"
```

---

### Task 4: Login rate limiter + client IP extraction

**Files:**
- Create: `lib/auth/rate-limit.ts`, `lib/auth/client-ip.ts`
- Test: `lib/auth/rate-limit.test.ts`, `lib/auth/client-ip.test.ts`

**Interfaces:**
- Produces:
  - `type RateLimitCheck = { allowed: true } | { allowed: false; retryAfterMs: number }`
  - `createRateLimiter(opts: { maxFailures: number; windowMs: number; blockMs: number; now?: () => number }): { check(key: string): RateLimitCheck; recordFailure(key: string): void; reset(key: string): void }`
  - `loginLimiter` singleton (5 / 15 min / 15 min)
  - `clientIp(headers: { get(name: string): string | null }): string`

- [ ] **Step 1: Write the failing tests**

`lib/auth/rate-limit.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createRateLimiter } from './rate-limit';

const MIN = 60_000;

function setup() {
  let t = 0;
  const limiter = createRateLimiter({ maxFailures: 5, windowMs: 15 * MIN, blockMs: 15 * MIN, now: () => t });
  return { limiter, advance: (ms: number) => { t += ms; } };
}

describe('rate limiter', () => {
  it('allows 5 failures, blocks the 6th attempt', () => {
    const { limiter } = setup();
    for (let i = 0; i < 4; i++) limiter.recordFailure('ip');
    expect(limiter.check('ip')).toEqual({ allowed: true });
    limiter.recordFailure('ip');
    const c = limiter.check('ip');
    expect(c.allowed).toBe(false);
    if (!c.allowed) expect(c.retryAfterMs).toBe(15 * MIN);
  });

  it('unblocks after the block period', () => {
    const { limiter, advance } = setup();
    for (let i = 0; i < 5; i++) limiter.recordFailure('ip');
    advance(15 * MIN);
    expect(limiter.check('ip')).toEqual({ allowed: true });
  });

  it('failures older than the window do not count', () => {
    const { limiter, advance } = setup();
    for (let i = 0; i < 4; i++) limiter.recordFailure('ip');
    advance(15 * MIN + 1);
    limiter.recordFailure('ip');
    expect(limiter.check('ip')).toEqual({ allowed: true });
  });

  it('reset clears failures immediately', () => {
    const { limiter } = setup();
    for (let i = 0; i < 5; i++) limiter.recordFailure('ip');
    limiter.reset('ip');
    expect(limiter.check('ip')).toEqual({ allowed: true });
  });

  it('keys are independent', () => {
    const { limiter } = setup();
    for (let i = 0; i < 5; i++) limiter.recordFailure('a');
    expect(limiter.check('a').allowed).toBe(false);
    expect(limiter.check('b')).toEqual({ allowed: true });
  });
});
```

`lib/auth/client-ip.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { clientIp } from './client-ip';

const h = (init: Record<string, string>) => new Headers(init);

describe('clientIp', () => {
  it('uses the first x-forwarded-for entry of a proxy chain', () => {
    expect(clientIp(h({ 'x-forwarded-for': '203.0.113.9, 10.0.0.2' }))).toBe('203.0.113.9');
  });
  it('falls back to x-real-ip', () => {
    expect(clientIp(h({ 'x-real-ip': ' 198.51.100.4 ' }))).toBe('198.51.100.4');
  });
  it('ignores an empty x-forwarded-for', () => {
    expect(clientIp(h({ 'x-forwarded-for': ' , ', 'x-real-ip': '198.51.100.4' }))).toBe('198.51.100.4');
  });
  it('returns "unknown" with no headers', () => {
    expect(clientIp(h({}))).toBe('unknown');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run lib/auth/rate-limit.test.ts lib/auth/client-ip.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `lib/auth/rate-limit.ts`**

```ts
export type RateLimitCheck = { allowed: true } | { allowed: false; retryAfterMs: number };

type Entry = { failures: number[]; blockedUntil: number };

export function createRateLimiter(opts: {
  maxFailures: number;
  windowMs: number;
  blockMs: number;
  now?: () => number;
}) {
  const now = opts.now ?? Date.now;
  const entries = new Map<string, Entry>();

  function fresh(key: string): Entry | undefined {
    const e = entries.get(key);
    if (!e) return undefined;
    const t = now();
    e.failures = e.failures.filter((ts) => t - ts < opts.windowMs);
    if (e.blockedUntil <= t && e.failures.length === 0) {
      entries.delete(key);
      return undefined;
    }
    return e;
  }

  return {
    check(key: string): RateLimitCheck {
      const e = fresh(key);
      const t = now();
      if (e && e.blockedUntil > t) return { allowed: false, retryAfterMs: e.blockedUntil - t };
      return { allowed: true };
    },
    recordFailure(key: string): void {
      const t = now();
      const e = fresh(key) ?? { failures: [], blockedUntil: 0 };
      e.failures.push(t);
      if (e.failures.length >= opts.maxFailures) {
        e.blockedUntil = t + opts.blockMs;
        e.failures = [];
      }
      entries.set(key, e);
    },
    reset(key: string): void {
      entries.delete(key);
    },
  };
}

const FIFTEEN_MIN = 15 * 60 * 1000;

export const loginLimiter = createRateLimiter({ maxFailures: 5, windowMs: FIFTEEN_MIN, blockMs: FIFTEEN_MIN });
```

- [ ] **Step 4: Implement `lib/auth/client-ip.ts`**

```ts
// Trusts proxy headers: in production the app is only reachable through Easypanel's Traefik.
export function clientIp(headers: { get(name: string): string | null }): string {
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  if (forwarded) return forwarded;
  const real = headers.get('x-real-ip')?.trim();
  if (real) return real;
  return 'unknown';
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm vitest run lib/auth/rate-limit.test.ts lib/auth/client-ip.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 6: Commit**

```bash
git add lib/auth/rate-limit.ts lib/auth/rate-limit.test.ts lib/auth/client-ip.ts lib/auth/client-ip.test.ts
git commit -m "feat(auth): add login rate limiter and client IP extraction"
```

---

### Task 5: Web login — proxy, route group, `/login`, logout, guarded actions

**Files:**
- Create: `lib/auth/cookie.ts`, `lib/auth/access.ts`, `lib/auth/current-user.ts`, `proxy.ts`, `app/(app)/layout.tsx`, `app/login/page.tsx`, `app/login/LoginForm.tsx`, `app/login/actions.ts`
- Move: `app/page.tsx` → `app/(app)/page.tsx`; `app/project/` → `app/(app)/project/`; `app/sprint/` → `app/(app)/sprint/`
- Modify: `app/layout.tsx`, `app/actions.ts`, `components/SidebarClient.tsx:274-280`
- Test: `lib/auth/access.test.ts`

**Interfaces:**
- Consumes: `validateSession`, `createSession`, `deleteSession`, `SessionUser` (Task 2); `authenticate` (Task 3); `loginLimiter`, `clientIp` (Task 4); `getDb` from `@/lib/db/client`.
- Produces:
  - `SESSION_COOKIE = 'martrello_session'`, `sessionCookieOptions(expiresAt: number)`
  - `type AccessDecision = 'allow' | 'redirect-login' | 'redirect-home' | 'unauthorized'`; `decideAccess(pathname: string, authenticated: boolean): AccessDecision`
  - `getCurrentUser(): Promise<SessionUser | null>`; `requireUser(): Promise<SessionUser>`
  - server actions `loginAction(prev: LoginState, formData: FormData): Promise<LoginState>` and `logoutAction(): Promise<void>` in `app/login/actions.ts`; `type LoginState = { error: string | null }`

- [ ] **Step 1: Write the failing test**

`lib/auth/access.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { decideAccess } from './access';

describe('decideAccess', () => {
  it('lets /api/mcp through regardless of session (it has its own auth)', () => {
    expect(decideAccess('/api/mcp', false)).toBe('allow');
    expect(decideAccess('/api/mcp/', false)).toBe('allow');
  });
  it('does not treat lookalike paths as the MCP endpoint', () => {
    expect(decideAccess('/api/mcpx', false)).toBe('unauthorized');
  });
  it('shows /login to anonymous users and bounces logged-in users home', () => {
    expect(decideAccess('/login', false)).toBe('allow');
    expect(decideAccess('/login', true)).toBe('redirect-home');
  });
  it('allows everything else when authenticated', () => {
    expect(decideAccess('/', true)).toBe('allow');
    expect(decideAccess('/api/stream', true)).toBe('allow');
  });
  it('answers anonymous API calls with 401 instead of a redirect', () => {
    expect(decideAccess('/api/stream', false)).toBe('unauthorized');
    expect(decideAccess('/api/card/abc', false)).toBe('unauthorized');
  });
  it('redirects anonymous page requests to /login', () => {
    expect(decideAccess('/', false)).toBe('redirect-login');
    expect(decideAccess('/project/123', false)).toBe('redirect-login');
    expect(decideAccess('/sprint', false)).toBe('redirect-login');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run lib/auth/access.test.ts`
Expected: FAIL — cannot resolve `./access`.

- [ ] **Step 3: Implement `lib/auth/access.ts` and `lib/auth/cookie.ts`**

`lib/auth/access.ts`:

```ts
export type AccessDecision = 'allow' | 'redirect-login' | 'redirect-home' | 'unauthorized';

function isMcpEndpoint(pathname: string): boolean {
  return pathname === '/api/mcp' || pathname.startsWith('/api/mcp/');
}

export function decideAccess(pathname: string, authenticated: boolean): AccessDecision {
  if (isMcpEndpoint(pathname)) return 'allow';
  if (pathname === '/login') return authenticated ? 'redirect-home' : 'allow';
  if (authenticated) return 'allow';
  if (pathname.startsWith('/api/')) return 'unauthorized';
  return 'redirect-login';
}
```

`lib/auth/cookie.ts`:

```ts
export const SESSION_COOKIE = 'martrello_session';

export function sessionCookieOptions(expiresAt: number) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    path: '/',
    secure: process.env.SESSION_COOKIE_SECURE === 'true',
    expires: new Date(expiresAt),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run lib/auth/access.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Implement `lib/auth/current-user.ts`**

```ts
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getDb } from '@/lib/db/client';
import { SESSION_COOKIE } from './cookie';
import { validateSession, type SessionUser } from './sessions';

export async function getCurrentUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return validateSession(getDb(), token);
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  return user;
}
```

- [ ] **Step 6: Implement `proxy.ts` (repo root)**

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { getDb } from '@/lib/db/client';
import { validateSession } from '@/lib/auth/sessions';
import { SESSION_COOKIE } from '@/lib/auth/cookie';
import { decideAccess } from '@/lib/auth/access';

function redirectTo(request: NextRequest, pathname: string) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = '';
  return NextResponse.redirect(url);
}

export async function proxy(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const user = token ? await validateSession(getDb(), token) : null;

  switch (decideAccess(request.nextUrl.pathname, user !== null)) {
    case 'allow':
      return NextResponse.next();
    case 'redirect-home':
      return redirectTo(request, '/');
    case 'redirect-login':
      return redirectTo(request, '/login');
    case 'unauthorized':
      return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
```

- [ ] **Step 7: Move the authenticated pages into a route group**

```bash
mkdir -p "app/(app)"
git mv app/page.tsx "app/(app)/page.tsx"
git mv app/project "app/(app)/project"
git mv app/sprint "app/(app)/sprint"
grep -rn "from '\.\./" "app/(app)" || echo "no parent-relative imports"
```
Expected: `no parent-relative imports` (all cross-dir imports use `@/`). URLs are unchanged because `(app)` is a route group.

- [ ] **Step 8: Split the layouts**

Replace `app/layout.tsx` with:

```tsx
// app/layout.tsx
import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'martrello',
  description: 'Personal Trello with Claude as the writer',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-dvh flex overflow-hidden">{children}</body>
    </html>
  );
}
```

Create `app/(app)/layout.tsx`:

```tsx
// app/(app)/layout.tsx
import { Sidebar } from '@/components/Sidebar';
import { ProjectPrivacyProvider } from '@/components/ProjectPrivacyContext';
import { requireUser } from '@/lib/auth/current-user';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  return (
    <>
      {/* a11y: skip to main content */}
      <a href="#main-content" className="skip-link">
        Pular para conteúdo principal
      </a>
      <ProjectPrivacyProvider>
        <Sidebar />
        <main id="main-content" className="flex-1 min-w-0">
          {children}
        </main>
      </ProjectPrivacyProvider>
    </>
  );
}
```

- [ ] **Step 9: Login/logout server actions — `app/login/actions.ts`**

```ts
'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getDb } from '@/lib/db/client';
import { authenticate } from '@/lib/auth/users';
import { createSession, deleteSession } from '@/lib/auth/sessions';
import { SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth/cookie';
import { loginLimiter } from '@/lib/auth/rate-limit';
import { clientIp } from '@/lib/auth/client-ip';

export type LoginState = { error: string | null };

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const username = String(formData.get('username') ?? '');
  const password = String(formData.get('password') ?? '');
  const ip = clientIp(await headers());

  const gate = loginLimiter.check(ip);
  if (!gate.allowed) {
    const minutes = Math.ceil(gate.retryAfterMs / 60_000);
    return { error: `Muitas tentativas. Tente de novo em ${minutes} minutos.` };
  }

  const db = getDb();
  const user = await authenticate(db, username, password);
  if (!user) {
    loginLimiter.recordFailure(ip);
    return { error: 'Usuário ou senha inválidos.' };
  }

  loginLimiter.reset(ip);
  const { token, expiresAt } = await createSession(db, user.id);
  (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt));
  redirect('/');
}

export async function logoutAction(): Promise<void> {
  const store = await cookies();
  await deleteSession(getDb(), store.get(SESSION_COOKIE)?.value);
  store.delete(SESSION_COOKIE);
  redirect('/login');
}
```

- [ ] **Step 10: Login page — `app/login/page.tsx` and `app/login/LoginForm.tsx`**

`app/login/page.tsx`:

```tsx
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/current-user';
import { LoginForm } from './LoginForm';

export default async function LoginPage() {
  if (await getCurrentUser()) redirect('/');
  return (
    <main className="flex-1 min-h-dvh flex items-center justify-center px-4 bg-[var(--color-mt-sidebar-bg)]">
      <LoginForm />
    </main>
  );
}
```

`app/login/LoginForm.tsx`:

```tsx
'use client';
import { useActionState } from 'react';
import { loginAction, type LoginState } from './actions';

const initial: LoginState = { error: null };

const inputClass = `
  w-full rounded-[4px] px-3 py-2 text-[14px]
  bg-[var(--color-mt-sidebar-hover)] text-[var(--color-mt-text)]
  border border-[var(--color-mt-line-subtle)]
  focus:outline-2 focus:outline-[var(--color-mt-accent)]
`;

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, initial);

  return (
    <form action={formAction} className="w-full max-w-[320px] flex flex-col gap-4" aria-describedby="login-error">
      <h1 className="text-[20px] font-semibold tracking-tight text-[var(--color-mt-text)] select-none text-center mb-2">
        <span className="text-[var(--color-mt-accent)]">mar</span>trello
      </h1>

      <label className="flex flex-col gap-1.5 text-[12px] text-[var(--color-mt-muted-hi)]">
        Usuário
        <input name="username" autoComplete="username" required autoFocus className={inputClass} />
      </label>

      <label className="flex flex-col gap-1.5 text-[12px] text-[var(--color-mt-muted-hi)]">
        Senha
        <input name="password" type="password" autoComplete="current-password" required className={inputClass} />
      </label>

      <p id="login-error" role="alert" className="min-h-[18px] text-[12px] text-red-400">
        {state.error}
      </p>

      <button
        type="submit"
        disabled={pending}
        className="
          rounded-[4px] px-3 py-2 text-[14px] font-medium
          bg-[var(--color-mt-accent)] text-black
          hover:opacity-90 disabled:opacity-50
          transition-opacity duration-[120ms]
        "
      >
        {pending ? 'Entrando…' : 'Entrar'}
      </button>
    </form>
  );
}
```

- [ ] **Step 11: Logout button in the sidebar footer**

In `components/SidebarClient.tsx`, add the import at the top (after the existing imports):

```tsx
import { logoutAction } from '@/app/login/actions';
```

Replace the footer block (currently lines 274-280, the `{/* Footer hint */}` div containing `Claude · MCP`) with:

```tsx
        {/* Footer: logout */}
        <form
          action={logoutAction}
          className="px-2 py-1.5 border-t border-[var(--color-mt-line-subtle)]"
        >
          <button
            type="submit"
            className="
              w-full text-left px-2 py-1.5 rounded-[4px]
              text-[12px] text-[var(--color-mt-muted)]
              hover:text-[var(--color-mt-text)] hover:bg-[var(--color-mt-sidebar-hover)]
              transition-colors duration-[120ms]
            "
          >
            Sair
          </button>
        </form>
```

- [ ] **Step 12: Guard every server action in `app/actions.ts`**

Add `import { requireUser } from '@/lib/auth/current-user';` to the imports, then make `await requireUser();` the first statement of every exported action: `quickCreateCardAction`, `updateCardAction`, `moveCardAction`, `archiveCardAction`, `moveInSprintAction`, `removeFromSprintAction`, `addToSprintAction`, `startSprintAction`, `closeSprintAction`, `toggleLabelAction`, `addDependencyAction`, `removeDependencyAction` (12 actions). In `quickCreateCardAction` it goes before the `if (!title.trim()) return;` line. Example:

```ts
export async function archiveCardAction(id: string) {
  await requireUser();
  await archiveCard(getDb(), id);
  revalidatePath('/sprint');
  revalidatePath('/');
}
```

Verify: `grep -c "await requireUser();" app/actions.ts` → `12` and `grep -c "^export async function" app/actions.ts` → `12`.

- [ ] **Step 13: Type-check and run the suite**

Run: `pnpm exec tsc --noEmit && pnpm test`
Expected: no type errors; all tests PASS.

- [ ] **Step 14: Browser verification against a copy of the DB**

Prepare a verification DB (never the real one) and credentials file:
```bash
mkdir -p tmp && rm -f tmp/verify.db*
sqlite3 martrello.db ".backup tmp/verify.db"
DATABASE_URL=file:./tmp/verify.db pnpm db:migrate
openssl rand -base64 18 > tmp/verify-password.txt
DATABASE_URL=file:./tmp/verify.db pnpm -s user:set verify < tmp/verify-password.txt
```

Add a preview config entry to `.claude/launch.json` (local-only file, not committed):
```json
{
  "name": "martrello-verify",
  "runtimeExecutable": "sh",
  "runtimeArgs": ["-c", "DATABASE_URL=file:./tmp/verify.db pnpm dev --port 3001"],
  "port": 3001
}
```

Start it with `preview_start {name: "martrello-verify"}` and check, in order:
1. Opening `/` lands on `/login` (no sidebar rendered).
2. Wrong password → `Usuário ou senha inválidos.`
3. Username `VERIFY` with the password from `tmp/verify-password.txt` → redirected to the first project board, sidebar visible.
4. Visiting `/login` while logged in → redirected to `/`.
5. `fetch('/api/stream')` from the page still streams (status 200).
6. "Sair" → back on `/login`; `fetch('/api/card/x')` from that page returns 401.
7. Five wrong passwords then a sixth attempt (even with the right password) → `Muitas tentativas. Tente de novo em 15 minutos.` Restart the dev server afterwards to clear the in-memory limiter.

Take a screenshot of the login page for the record. Stop the preview.

- [ ] **Step 15: Commit**

```bash
git add proxy.ts lib/auth/cookie.ts lib/auth/access.ts lib/auth/access.test.ts lib/auth/current-user.ts app components/SidebarClient.tsx
git commit -m "feat(auth): gate the app behind a login page with session cookies"
```

---

### Task 6: Remote MCP endpoint

**Files:**
- Create: `lib/auth/mcp-token.ts`, `app/api/mcp/route.ts`
- Modify: `vitest.config.ts` (include `app/**/*.test.ts`)
- Test: `lib/auth/mcp-token.test.ts`, `app/api/mcp/route.test.ts`

**Interfaces:**
- Consumes: `createServer()` from `@/mcp/server` (unchanged).
- Produces: `checkMcpAuth(request: Request, expectedToken: string | undefined): Response | null` (null = authorized); route exports `POST`, `GET`, `DELETE`.

- [ ] **Step 1: Write the failing tests**

`lib/auth/mcp-token.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { checkMcpAuth } from './mcp-token';

const req = (auth?: string) =>
  new Request('http://localhost/api/mcp', { method: 'POST', headers: auth ? { authorization: auth } : {} });

describe('checkMcpAuth', () => {
  it('503 MCP_DISABLED when no token is configured', async () => {
    for (const configured of [undefined, '', '   ']) {
      const res = checkMcpAuth(req('Bearer x'), configured)!;
      expect(res.status).toBe(503);
      expect(await res.json()).toEqual({ error: 'MCP_DISABLED' });
    }
  });
  it('401 without an Authorization header', async () => {
    const res = checkMcpAuth(req(), 'secret')!;
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'UNAUTHORIZED' });
  });
  it('401 for a non-Bearer scheme', () => {
    expect(checkMcpAuth(req('Basic secret'), 'secret')!.status).toBe(401);
  });
  it('401 for a wrong token', () => {
    expect(checkMcpAuth(req('Bearer nope'), 'secret')!.status).toBe(401);
  });
  it('authorizes the right token (case-insensitive scheme)', () => {
    expect(checkMcpAuth(req('Bearer secret'), 'secret')).toBeNull();
    expect(checkMcpAuth(req('bearer secret'), 'secret')).toBeNull();
  });
  it('trims surrounding whitespace in the configured token', () => {
    expect(checkMcpAuth(req('Bearer secret'), 'secret\n')).toBeNull();
  });
});
```

`app/api/mcp/route.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { makeTestDb, type Db } from '@/lib/core/test-helpers';
import * as clientModule from '@/lib/db/client';
import { createProject } from '@/lib/core/projects';
import { POST } from './route';

let db: Db;
beforeEach(() => {
  db = makeTestDb().db;
  vi.spyOn(clientModule, 'getDb').mockReturnValue(db as any);
  process.env.MCP_TOKEN = 'test-token';
});
afterEach(() => {
  delete process.env.MCP_TOKEN;
  vi.restoreAllMocks();
});

function rpc(body: unknown, token?: string) {
  return new Request('http://localhost/api/mcp', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe('/api/mcp', () => {
  it('rejects requests without the token', async () => {
    const res = await POST(rpc({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }));
    expect(res.status).toBe(401);
  });

  it('lists tools with a valid token', async () => {
    const res = await POST(rpc({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }, 'test-token'));
    expect(res.status).toBe(200);
    const body = await res.json();
    const names = body.result.tools.map((t: { name: string }) => t.name);
    expect(names).toContain('martrello_list_projects');
  });

  it('calls a tool against the database', async () => {
    await createProject(db, { name: 'Remote Check' });
    const res = await POST(
      rpc(
        { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'martrello_list_projects', arguments: {} } },
        'test-token',
      ),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.content[0].text).toContain('Remote Check');
  });
});
```

Update `vitest.config.ts` `include` to:

```ts
    include: ['tests/**/*.test.ts', 'lib/**/*.test.ts', 'mcp/**/*.test.ts', 'app/**/*.test.ts'],
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run lib/auth/mcp-token.test.ts app/api/mcp/route.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `lib/auth/mcp-token.ts`**

```ts
import { createHash, timingSafeEqual } from 'node:crypto';

const digest = (s: string) => createHash('sha256').update(s).digest();

export function checkMcpAuth(request: Request, expectedToken: string | undefined): Response | null {
  const expected = expectedToken?.trim();
  if (!expected) return Response.json({ error: 'MCP_DISABLED' }, { status: 503 });

  const match = /^Bearer\s+(.+)$/i.exec((request.headers.get('authorization') ?? '').trim());
  if (!match) return Response.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const ok = timingSafeEqual(digest(match[1].trim()), digest(expected));
  return ok ? null : Response.json({ error: 'UNAUTHORIZED' }, { status: 401 });
}
```

- [ ] **Step 4: Implement `app/api/mcp/route.ts`**

```ts
// app/api/mcp/route.ts
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { createServer } from '@/mcp/server';
import { checkMcpAuth } from '@/lib/auth/mcp-token';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handle(request: Request): Promise<Response> {
  const denied = checkMcpAuth(request, process.env.MCP_TOKEN);
  if (denied) return denied;

  // Stateless: a fresh server + transport per request, JSON responses (no SSE).
  const server = createServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  return transport.handleRequest(request);
}

export const POST = handle;
export const GET = handle;
export const DELETE = handle;
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm vitest run lib/auth/mcp-token.test.ts app/api/mcp/route.test.ts`
Expected: PASS (9 tests). If `tools/list` returns a JSON-RPC error saying the server is not initialized, send an `initialize` request first in the same test helper — but the SDK's stateless mode is expected to accept it directly; do not change `createServer()`.

- [ ] **Step 6: Full suite + types**

Run: `pnpm exec tsc --noEmit && pnpm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/auth/mcp-token.ts lib/auth/mcp-token.test.ts app/api/mcp vitest.config.ts
git commit -m "feat(mcp): expose the MCP server over token-protected Streamable HTTP"
```

---

### Task 7: Backups (library, CLI, in-process scheduler)

**Files:**
- Create: `lib/backup.ts`, `lib/backup-scheduler.ts`, `instrumentation.ts`
- Modify: `lib/db/client.ts` (export `DB_PATH`), `scripts/backup.ts` (rewrite), `.gitignore` (`/backups/`)
- Test: `lib/backup.test.ts`

**Interfaces:**
- Produces:
  - `DB_PATH: string` exported from `@/lib/db/client`
  - `backupFileName(date: Date): string` → `martrello-<ISO with : and . replaced by ->.db`
  - `listBackups(dir: string): string[]` (sorted oldest → newest, only `martrello-*.db`)
  - `pruneBackups(dir: string, keep: number): string[]` (returns removed file names)
  - `runBackup(opts: { dbPath: string; backupDir: string; keep: number; now?: Date }): Promise<{ file: string; removed: string[] }>`
  - `isBackupDue(latestMs: number | null, nowMs: number, intervalMs?: number): boolean`
  - `latestBackupTime(dir: string): number | null` (mtime ms of newest backup)
  - `startBackupScheduler(): void`

- [ ] **Step 1: Write the failing test**

`lib/backup.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { backupFileName, listBackups, pruneBackups, runBackup, isBackupDue } from './backup';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'mt-backup-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const DAY = 24 * 60 * 60 * 1000;

describe('backup', () => {
  it('file names sort chronologically', () => {
    const a = backupFileName(new Date('2026-01-02T03:04:05.006Z'));
    const b = backupFileName(new Date('2026-01-10T00:00:00.000Z'));
    expect(a).toBe('martrello-2026-01-02T03-04-05-006Z.db');
    expect([b, a].sort()).toEqual([a, b]);
  });

  it('runBackup produces a consistent copy of the database', async () => {
    const src = path.join(dir, 'live.db');
    const live = new Database(src);
    live.pragma('journal_mode = WAL');
    live.exec("CREATE TABLE t (v TEXT); INSERT INTO t VALUES ('hello');");
    live.close();

    const out = path.join(dir, 'backups');
    const { file } = await runBackup({ dbPath: src, backupDir: out, keep: 14, now: new Date('2026-10-08T03:00:00Z') });

    const copy = new Database(file, { readonly: true });
    expect(copy.prepare('SELECT v FROM t').get()).toEqual({ v: 'hello' });
    copy.close();
  });

  it('prune only touches martrello-*.db files', () => {
    for (let i = 1; i <= 16; i++) {
      writeFileSync(path.join(dir, backupFileName(new Date(Date.UTC(2026, 0, i)))), '');
    }
    writeFileSync(path.join(dir, 'notes.txt'), 'keep me');
    writeFileSync(path.join(dir, 'other.db'), 'keep me');

    const removed = pruneBackups(dir, 14);

    expect(removed).toEqual([
      backupFileName(new Date(Date.UTC(2026, 0, 1))),
      backupFileName(new Date(Date.UTC(2026, 0, 2))),
    ]);
    expect(listBackups(dir)).toHaveLength(14);
    expect(readdirSync(dir)).toEqual(expect.arrayContaining(['notes.txt', 'other.db']));
  });

  it('isBackupDue: no backup yet, stale, and fresh', () => {
    expect(isBackupDue(null, 0)).toBe(true);
    expect(isBackupDue(0, DAY)).toBe(true);
    expect(isBackupDue(0, DAY - 1)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run lib/backup.test.ts`
Expected: FAIL — cannot resolve `./backup`.

- [ ] **Step 3: Export `DB_PATH` from `lib/db/client.ts`**

Change line `const DB_PATH = ...` to `export const DB_PATH = ...` (same expression).

- [ ] **Step 4: Implement `lib/backup.ts`**

```ts
import Database from 'better-sqlite3';
import { mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';

const PREFIX = 'martrello-';
const SUFFIX = '.db';
const DAY_MS = 24 * 60 * 60 * 1000;

export function backupFileName(date: Date): string {
  return `${PREFIX}${date.toISOString().replace(/[:.]/g, '-')}${SUFFIX}`;
}

export function listBackups(dir: string): string[] {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  return names.filter((n) => n.startsWith(PREFIX) && n.endsWith(SUFFIX)).sort();
}

export function pruneBackups(dir: string, keep: number): string[] {
  const all = listBackups(dir);
  const excess = all.slice(0, Math.max(0, all.length - keep));
  for (const name of excess) rmSync(path.join(dir, name), { force: true });
  return excess;
}

export function latestBackupTime(dir: string): number | null {
  const all = listBackups(dir);
  const newest = all[all.length - 1];
  return newest ? statSync(path.join(dir, newest)).mtimeMs : null;
}

export function isBackupDue(latestMs: number | null, nowMs: number, intervalMs: number = DAY_MS): boolean {
  return latestMs === null || nowMs - latestMs >= intervalMs;
}

export async function runBackup(opts: {
  dbPath: string;
  backupDir: string;
  keep: number;
  now?: Date;
}): Promise<{ file: string; removed: string[] }> {
  mkdirSync(opts.backupDir, { recursive: true });
  const file = path.join(opts.backupDir, backupFileName(opts.now ?? new Date()));
  const source = new Database(opts.dbPath, { fileMustExist: true });
  try {
    await source.backup(file);
  } finally {
    source.close();
  }
  return { file, removed: pruneBackups(opts.backupDir, opts.keep) };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run lib/backup.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Scheduler + instrumentation**

`lib/backup-scheduler.ts`:

```ts
import path from 'node:path';
import { DB_PATH } from '@/lib/db/client';
import { isBackupDue, latestBackupTime, runBackup } from './backup';

const HOUR_MS = 60 * 60 * 1000;

export function startBackupScheduler(): void {
  const backupDir = process.env.BACKUP_DIR;
  if (!backupDir) return;
  const dir = path.resolve(backupDir);
  const keep = Number(process.env.BACKUP_KEEP ?? 14);

  const tick = async () => {
    try {
      if (!isBackupDue(latestBackupTime(dir), Date.now())) return;
      const { file, removed } = await runBackup({ dbPath: path.resolve(DB_PATH), backupDir: dir, keep });
      console.log(`[backup] ${file}${removed.length ? ` (removidos: ${removed.length})` : ''}`);
    } catch (e) {
      console.error(`[backup] falhou: ${(e as Error).message}`);
    }
  };

  void tick();
  setInterval(tick, HOUR_MS).unref();
}
```

`instrumentation.ts` (repo root):

```ts
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (!process.env.BACKUP_DIR) return;
  const { startBackupScheduler } = await import('./lib/backup-scheduler');
  startBackupScheduler();
}
```

- [ ] **Step 7: Rewrite the CLI `scripts/backup.ts`**

```ts
// scripts/backup.ts — manual backup. BACKUP_DIR (default ./backups), BACKUP_KEEP (default 14).
import path from 'node:path';
import { DB_PATH } from '@/lib/db/client';
import { runBackup } from '@/lib/backup';

runBackup({
  dbPath: path.resolve(DB_PATH),
  backupDir: path.resolve(process.env.BACKUP_DIR ?? './backups'),
  keep: Number(process.env.BACKUP_KEEP ?? 14),
})
  .then(({ file, removed }) => {
    console.log(`backup → ${file}`);
    if (removed.length) console.log(`removidos: ${removed.join(', ')}`);
  })
  .catch((e) => {
    console.error(`backup falhou: ${(e as Error).message}`);
    process.exit(1);
  });
```

Add `/backups/` to `.gitignore` under `# database (martrello)`.

- [ ] **Step 8: Smoke-test the CLI and the scheduler hook**

Run:
```bash
DATABASE_URL=file:./tmp/verify.db BACKUP_DIR=./tmp/backups pnpm -s backup
ls tmp/backups
```
Expected: one `martrello-<timestamp>.db` file. (`tmp/verify.db` exists from Task 5; if not, recreate it with `sqlite3 martrello.db ".backup tmp/verify.db"`.)

Run: `pnpm exec tsc --noEmit && pnpm test`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add lib/backup.ts lib/backup.test.ts lib/backup-scheduler.ts instrumentation.ts lib/db/client.ts scripts/backup.ts .gitignore
git commit -m "feat(ops): online SQLite backups with retention and in-process daily schedule"
```

---

### Task 8: Docker image (standalone build, ops scripts, entrypoint)

**Files:**
- Create: `Dockerfile`, `.dockerignore`, `scripts/start.sh`, `scripts/build-scripts.ts`
- Modify: `next.config.ts`, `package.json` (`packageManager`, `scripts:build`), `pnpm-workspace.yaml`, `.gitignore` (`/dist/`)

**Interfaces:**
- Consumes: `scripts/migrate.ts`, `scripts/user-set.ts` (Task 3), `scripts/backup.ts` (Task 7).
- Produces: image with `/app/server.js`, `/app/dist/scripts/{migrate,user-set,backup}.js`, `/app/start.sh`; defaults `DATABASE_URL=file:/data/martrello.db`, `BACKUP_DIR=/data/backups`, port 3000.

- [ ] **Step 1: Next config**

Replace `next.config.ts` with:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["better-sqlite3", "@node-rs/argon2"],
};

export default nextConfig;
```

- [ ] **Step 2: pnpm build approvals + package manager pin**

Replace `pnpm-workspace.yaml` with (the current file has unanswered `allowBuilds` placeholders):

```yaml
allowBuilds:
  better-sqlite3: true
  esbuild: true
onlyBuiltDependencies:
  - sharp
  - better-sqlite3
  - esbuild
```

In `package.json` add top-level `"packageManager": "pnpm@11.3.0"` and script `"scripts:build": "tsx scripts/build-scripts.ts"`. Add `/dist/` to `.gitignore` under `# mcp build artifacts`.

Run: `pnpm install` (lockfile must not change in unexpected ways — `git diff --stat pnpm-lock.yaml` should be empty or trivial).

- [ ] **Step 3: Bundle the ops scripts — `scripts/build-scripts.ts`**

```ts
// scripts/build-scripts.ts — bundles ops CLIs for the production image (no tsx there).
import { build } from 'esbuild';
import path from 'node:path';

const ENTRIES = ['migrate', 'user-set', 'backup'];

async function main() {
  for (const name of ENTRIES) {
    await build({
      entryPoints: [path.resolve(`scripts/${name}.ts`)],
      outfile: path.resolve(`dist/scripts/${name}.js`),
      bundle: true,
      platform: 'node',
      target: 'node24',
      format: 'esm',
      external: ['better-sqlite3', '@node-rs/argon2'],
      banner: {
        js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
      },
    });
    console.log(`built dist/scripts/${name}.js`);
  }
}

main().catch((e) => {
  process.stderr.write(`build failed: ${(e as Error).message}\n`);
  process.exit(1);
});
```

Run: `pnpm scripts:build && ls dist/scripts`
Expected: `backup.js  migrate.js  user-set.js`.

- [ ] **Step 4: Entrypoint — `scripts/start.sh`**

```sh
#!/bin/sh
set -e

DB_FILE="${DATABASE_URL#file:}"
DATA_DIR="$(dirname "$DB_FILE")"

if ! touch "$DATA_DIR/.write-test" 2>/dev/null; then
  echo "ERRO: $DATA_DIR não é gravável pelo usuário $(id -u). Verifique o volume montado em $DATA_DIR." >&2
  exit 1
fi
rm -f "$DATA_DIR/.write-test"

node dist/scripts/migrate.js
exec node server.js
```

Run: `chmod +x scripts/start.sh`

- [ ] **Step 5: `.dockerignore`**

```
.git
.github
.claude
.superpowers
.next
node_modules
dist
mcp/dist
tmp
backups
coverage
docs
*.db
*.db-wal
*.db-shm
*.db-journal
.env*
*.tsbuildinfo
```

- [ ] **Step 6: `Dockerfile`**

```dockerfile
# syntax=docker/dockerfile:1.7
FROM node:24-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /app

FROM base AS deps
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build && pnpm scripts:build

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DATABASE_URL=file:/data/martrello.db \
    BACKUP_DIR=/data/backups
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/lib/db/migrations ./lib/db/migrations
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node scripts/start.sh ./start.sh
RUN mkdir -p /data && chown node:node /data && chmod +x ./start.sh
USER node
VOLUME /data
EXPOSE 3000
CMD ["./start.sh"]
```

- [ ] **Step 7: Build the image locally**

Run: `docker build -t martrello:local .`
Expected: build succeeds. Then confirm the native binaries made it into the standalone output:

```bash
docker run --rm --entrypoint sh martrello:local -c "find node_modules -name '*.node' | grep -E 'better_sqlite3|argon2'"
```
Expected: a `better_sqlite3.node` path and an `argon2.linux-*.node` path. **If `better_sqlite3.node` is missing**, add to `next.config.ts`:

```ts
  outputFileTracingIncludes: {
    "/*": ["./node_modules/better-sqlite3/build/Release/better_sqlite3.node"],
  },
```
rebuild, and re-check.

- [ ] **Step 8: Run the container against a copy of the real data**

```bash
mkdir -p tmp/docker-data && rm -f tmp/docker-data/martrello.db*
sqlite3 martrello.db ".backup tmp/docker-data/martrello.db"
openssl rand -hex 32 > tmp/docker-mcp-token.txt
docker run -d --name martrello-verify -p 3100:3000 \
  -v "$PWD/tmp/docker-data:/data" \
  -e MCP_TOKEN="$(cat tmp/docker-mcp-token.txt)" \
  martrello:local
sleep 3 && docker logs martrello-verify
```
Expected logs: `migrations applied`, then Next `Ready`, then (within a few seconds) `[backup] /data/backups/martrello-....db`.

Create the login user and check the app:
```bash
openssl rand -base64 18 > tmp/docker-password.txt
docker exec -i martrello-verify node dist/scripts/user-set.js verify < tmp/docker-password.txt
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' http://localhost:3100/
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:3100/api/mcp
curl -s -X POST http://localhost:3100/api/mcp \
  -H "authorization: Bearer $(cat tmp/docker-mcp-token.txt)" \
  -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"martrello_list_projects","arguments":{}}}' | head -c 400; echo
```
Expected: `usuário "verify" criado`; `/` → `307 http://localhost:3100/login` (302/307 both fine — the Location must be `localhost:3100`, not `0.0.0.0`); unauthenticated MCP → `401`; authenticated MCP → JSON containing the real project names (e.g. `Motim`).

Open `http://localhost:3100` in the browser pane (`preview_start {url}`), log in as `verify` with `tmp/docker-password.txt`, confirm the board loads and that a change made through the MCP `curl` (e.g. `martrello_create_card` on project `Motim`, title `docker-verify`) appears on screen without reload. Then clean up:

```bash
docker rm -f martrello-verify
```

- [ ] **Step 9: Commit**

```bash
git add Dockerfile .dockerignore scripts/start.sh scripts/build-scripts.ts next.config.ts package.json pnpm-lock.yaml pnpm-workspace.yaml .gitignore
git commit -m "feat(deploy): production Docker image with standalone Next and bundled ops scripts"
```

---

### Task 9: CI/CD workflow + deploy runbook

**Files:**
- Create: `.github/workflows/deploy.yml`, `docs/deploy.md`
- Modify: `README.md` (link to the runbook)

**Interfaces:**
- Consumes: `Dockerfile` (Task 8), `packageManager` pin (Task 8).
- Produces: image `ghcr.io/marcelohfms/martrello:{latest,sha-<7>}` on each push to `main`; webhook call when `EASYPANEL_DEPLOY_WEBHOOK` is set.

- [ ] **Step 1: Workflow — `.github/workflows/deploy.yml`**

```yaml
name: deploy

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  packages: write

env:
  IMAGE: ghcr.io/marcelohfms/martrello

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm test

  build-push:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - id: vars
        run: echo "short_sha=${GITHUB_SHA::7}" >> "$GITHUB_OUTPUT"
      - uses: docker/build-push-action@v6
        with:
          context: .
          platforms: linux/amd64
          push: true
          tags: |
            ${{ env.IMAGE }}:latest
            ${{ env.IMAGE }}:sha-${{ steps.vars.outputs.short_sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

  deploy:
    needs: build-push
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Easypanel deploy
        env:
          WEBHOOK: ${{ secrets.EASYPANEL_DEPLOY_WEBHOOK }}
        run: |
          if [ -z "$WEBHOOK" ]; then
            echo "::warning::EASYPANEL_DEPLOY_WEBHOOK is not set; skipping deploy trigger"
            exit 0
          fi
          curl -fsS -X POST "$WEBHOOK"
```

Validate syntax: `ruby -ryaml -e 'YAML.load_file(".github/workflows/deploy.yml"); puts "ok"'` → `ok`.

- [ ] **Step 2: Runbook — `docs/deploy.md`**

````markdown
# Deploy (Easypanel + GHCR)

Every push to `main` runs the tests, builds `ghcr.io/marcelohfms/martrello`
(`latest` + `sha-<commit>`) and calls the Easypanel deploy webhook.

## One-time setup

1. **GHCR visibility.** After the first workflow run, the package appears under
   GitHub → Packages → `martrello`. Either make it public, or in Easypanel add
   registry credentials: `ghcr.io`, your GitHub user, and a PAT with
   `read:packages`.
2. **Easypanel project/service.** Create project `martrello` → service **App**:
   - Source: **Docker Image** `ghcr.io/marcelohfms/martrello:latest`.
   - Mounts: **Volume** at `/data`.
   - Domains: your subdomain → port `3000`, HTTPS on.
   - Environment:
     ```
     MCP_TOKEN=<openssl rand -hex 32>
     SESSION_COOKIE_SECURE=true
     ```
     (`DATABASE_URL` and `BACKUP_DIR` already default to `/data/...` in the image.)
   - Keep a single replica (SQLite).
3. **Deploy webhook.** Copy the service's deploy webhook URL into the GitHub
   repo secret `EASYPANEL_DEPLOY_WEBHOOK`.

## Loading the existing data (once)

1. Locally: `sqlite3 <path>/martrello.db ".backup /tmp/martrello-upload.db"`
   (consistent copy, WAL included).
2. Stop the service in Easypanel.
3. Copy `/tmp/martrello-upload.db` into the volume as `martrello.db`
   (`scp` to the volume path on the host, e.g.
   `/etc/easypanel/projects/martrello/<service>/volumes/data/`, or Easypanel's
   file browser). Make sure it is owned by uid 1000:
   `chown 1000:1000 martrello.db`.
4. Start the service. Logs should show `migrations applied` then `Ready`.

## Creating / changing the login

In the service **Console** (Easypanel → service → Console):

```bash
node dist/scripts/user-set.js marcelo
```

It asks for the password twice (min. 12 chars). Changing a password signs out
every existing session.

## Connecting Claude Code to the remote MCP

```bash
claude mcp remove martrello --scope user
claude mcp add --scope user --transport http martrello https://<subdomain>/api/mcp --header "Authorization: Bearer <MCP_TOKEN>"
claude mcp list
```

Rotate the token by changing `MCP_TOKEN` in Easypanel, redeploying, and
re-running the `add` command.

## Backups

The app writes `/data/backups/martrello-<timestamp>.db` once a day and keeps
the newest 14 (`BACKUP_KEEP`). Manual backup from the console:
`node dist/scripts/backup.js`.

## Rollback

Change the service image tag to a previous `sha-<commit>` and deploy.
````

- [ ] **Step 3: README pointer**

Add a short section to `README.md` (at the end):

```markdown
## Deploy

Production runs on Easypanel from the `ghcr.io/marcelohfms/martrello` image,
behind a single-user login, with the MCP server exposed at `/api/mcp`
(bearer token). See [docs/deploy.md](docs/deploy.md).
```

- [ ] **Step 4: Final full verification**

Run: `pnpm exec tsc --noEmit && pnpm test && pnpm build`
Expected: types clean, all tests PASS, Next build succeeds.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/deploy.yml docs/deploy.md README.md
git commit -m "ci: build and publish to GHCR and trigger Easypanel deploy; add deploy runbook"
```

---

## After the plan (not tasks — requires the user)

These happen after the PR is merged and need the user's accounts. They are listed so the executor can hand them off clearly:

1. Create the Easypanel service, volume, domain and env vars (runbook §One-time setup).
2. Add `EASYPANEL_DEPLOY_WEBHOOK` secret and, if the package is private, Easypanel registry credentials.
3. Upload the worktree DB (`/Users/marceloferro/martrello/.claude/worktrees/run-app-locally-ddb752/martrello.db`) per runbook §Loading the existing data.
4. Run `user-set` in the console, then switch Claude Code's `martrello` MCP to the remote URL.
````
