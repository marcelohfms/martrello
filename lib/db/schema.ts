// lib/db/schema.ts
import { sqliteTable, text, integer, primaryKey, uniqueIndex, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  color: text('color').notNull(),
  position: integer('position').notNull(),
  createdAt: integer('created_at').notNull(),
  archivedAt: integer('archived_at'),
});

export const lists = sqliteTable(
  'lists',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    position: integer('position').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({
    byProject: index('lists_by_project').on(t.projectId),
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

export const sprints = sqliteTable(
  'sprints',
  {
    id: text('id').primaryKey(),
    name: text('name'),
    startedAt: integer('started_at').notNull(),
    closedAt: integer('closed_at'),
    cardsSnapshot: text('cards_snapshot'),
  },
  (t) => ({
    oneActive: uniqueIndex('one_active_sprint').on(t.closedAt).where(sql`${t.closedAt} IS NULL`),
  }),
);

export const sprintSlots = sqliteTable(
  'sprint_slots',
  {
    cardId: text('card_id').primaryKey().references(() => cards.id, { onDelete: 'cascade' }),
    sprintId: text('sprint_id').notNull().references(() => sprints.id, { onDelete: 'cascade' }),
    sprintList: text('sprint_list', { enum: ['backlog', 'doing', 'done'] }).notNull(),
    position: integer('position').notNull(),
    addedAt: integer('added_at').notNull(),
  },
  (t) => ({
    bySprint: index('slots_by_sprint').on(t.sprintId),
  }),
);

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type List = typeof lists.$inferSelect;
export type Card = typeof cards.$inferSelect;
export type Label = typeof labels.$inferSelect;
export type Sprint = typeof sprints.$inferSelect;
export type SprintSlot = typeof sprintSlots.$inferSelect;
export type SprintList = 'backlog' | 'doing' | 'done';
