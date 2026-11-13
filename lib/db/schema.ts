// lib/db/schema.ts
import { sqliteTable, text, integer, primaryKey, index, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  // default('') is a leftover migration-safety net from the original 2-phase rollout
  // (see migrations 0002/0003) — createProject/updateProject always supply a real
  // value, so '' should never actually appear in a new row.
  acronym: text('acronym').notNull().unique().default(''),
  color: text('color').notNull(),
  position: integer('position').notNull(),
  createdAt: integer('created_at').notNull(),
  archivedAt: integer('archived_at'),
  slackChannelId: text('slack_channel_id'),
  slackChannelName: text('slack_channel_name'),
});

export const lists = sqliteTable(
  'lists',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    // NOT NULL here for app typing; migration 0006 adds the column nullable (SQLite
    // ADD COLUMN limitation, no table rebuild to avoid cascading deletes) and a guard
    // aborts the migration if any list is left without a stage.
    stage: text('stage', { enum: ['backlog', 'todo', 'doing', 'done'] }).notNull(),
    position: integer('position').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({
    byProject: index('lists_by_project').on(t.projectId),
    byProjectStage: uniqueIndex('lists_project_stage_unique').on(t.projectId, t.stage),
  }),
);

export const cards = sqliteTable(
  'cards',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    listId: text('list_id').notNull().references(() => lists.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    dueDate: text('due_date'),
    position: integer('position').notNull(),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    archivedAt: integer('archived_at'),
    assigneeId: text('assignee_id').references(() => users.id, { onDelete: 'set null' }),
    completedAt: integer('completed_at'),
  },
  (t) => ({
    byList: index('cards_by_list').on(t.listId),
    byProject: index('cards_by_project').on(t.projectId),
  }),
);

export const labels = sqliteTable('labels', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  color: text('color').notNull(),
});

export const cardLabels = sqliteTable(
  'card_labels',
  {
    cardId: text('card_id').notNull().references(() => cards.id, { onDelete: 'cascade' }),
    labelId: text('label_id').notNull().references(() => labels.id, { onDelete: 'cascade' }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.cardId, t.labelId] }),
  }),
);

export const cardDependencies = sqliteTable(
  'card_dependencies',
  {
    blockedCardId: text('blocked_card_id').notNull().references(() => cards.id, { onDelete: 'cascade' }),
    blockerCardId: text('blocker_card_id').notNull().references(() => cards.id, { onDelete: 'cascade' }),
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.blockedCardId, t.blockerCardId] }),
    byBlocked: index('deps_by_blocked').on(t.blockedCardId),
    byBlocker: index('deps_by_blocker').on(t.blockerCardId),
  }),
);

// One sprint per person per week (Monday–Sunday, São Paulo). The weekly sprint shows the
// person's cards in A fazer/Fazendo/Feito; lib/core/sprint.ts opens and closes it.
export const sprints = sqliteTable(
  'sprints',
  {
    id: text('id').primaryKey(),
    name: text('name'),
    startedAt: integer('started_at').notNull(),
    closedAt: integer('closed_at'),
    cardsSnapshot: text('cards_snapshot'),
    // Nullable in SQL because of the migration; core always fills them.
    userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
    weekStart: text('week_start'), // YYYY-MM-DD, the Monday
  },
  (t) => ({
    byUserWeek: uniqueIndex('sprints_user_week_unique').on(t.userId, t.weekStart),
  }),
);

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  role: text('role', { enum: ['admin', 'member'] }).notNull().default('member'),
  createdAt: integer('created_at').notNull(),
  disabledAt: integer('disabled_at'),
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

export const projectMembers = sqliteTable(
  'project_members',
  {
    projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    addedAt: integer('added_at').notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.projectId, t.userId] }),
  }),
);

export const cardEvents = sqliteTable(
  'card_events',
  {
    id: text('id').primaryKey(),
    cardId: text('card_id').notNull().references(() => cards.id, { onDelete: 'cascade' }),
    actorId: text('actor_id').references(() => users.id, { onDelete: 'set null' }),
    type: text('type').notNull(),
    fromValue: text('from_value'),
    toValue: text('to_value'),
    at: integer('at').notNull(),
  },
  (t) => ({
    byCard: index('card_events_by_card').on(t.cardId),
  }),
);

export const mcpTokens = sqliteTable('mcp_tokens', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  name: text('name').notNull(),
  createdAt: integer('created_at').notNull(),
  lastUsedAt: integer('last_used_at'),
  revokedAt: integer('revoked_at'),
});

export const authTokens = sqliteTable('auth_tokens', {
  idHash: text('id_hash').primaryKey(),
  kind: text('kind', { enum: ['invite', 'reset'] }).notNull(),
  email: text('email').notNull(),
  name: text('name'),
  userId: text('user_id'),
  createdBy: text('created_by'),
  createdAt: integer('created_at').notNull(),
  expiresAt: integer('expires_at').notNull(),
  usedAt: integer('used_at'),
  revokedAt: integer('revoked_at'),
});

export type Stage = 'backlog' | 'todo' | 'doing' | 'done';
export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type List = typeof lists.$inferSelect;
export type Card = typeof cards.$inferSelect;
export type Label = typeof labels.$inferSelect;
export type CardDependency = typeof cardDependencies.$inferSelect;
export type Sprint = typeof sprints.$inferSelect;
export type Role = 'admin' | 'member';
export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;

export type DeliveryStatus = 'sending' | 'sent' | 'empty' | 'retry' | 'failed';

// One row per project per São Paulo day: guarantees at most one Slack message a day.
export const slackDeliveries = sqliteTable(
  'slack_deliveries',
  {
    projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    day: text('day').notNull(), // YYYY-MM-DD, America/Sao_Paulo
    status: text('status', { enum: ['sending', 'sent', 'empty', 'retry', 'failed'] }).notNull(),
    attempts: integer('attempts').notNull(),
    error: text('error'),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.projectId, t.day] }),
  }),
);
