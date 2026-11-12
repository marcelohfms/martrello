CREATE TABLE `auth_tokens` (
	`id_hash` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`email` text NOT NULL,
	`name` text,
	`user_id` text,
	`created_by` text,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	`revoked_at` integer
);
--> statement-breakpoint
CREATE TABLE `card_events` (
	`id` text PRIMARY KEY NOT NULL,
	`card_id` text NOT NULL,
	`actor_id` text,
	`type` text NOT NULL,
	`from_value` text,
	`to_value` text,
	`at` integer NOT NULL,
	FOREIGN KEY (`card_id`) REFERENCES `cards`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `card_events_by_card` ON `card_events` (`card_id`);--> statement-breakpoint
CREATE TABLE `mcp_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_used_at` integer,
	`revoked_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mcp_tokens_token_hash_unique` ON `mcp_tokens` (`token_hash`);--> statement-breakpoint
CREATE TABLE `project_members` (
	`project_id` text NOT NULL,
	`user_id` text NOT NULL,
	`added_at` integer NOT NULL,
	PRIMARY KEY(`project_id`, `user_id`),
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
-- NOTE: no existing table is rebuilt (DROP/CREATE/RENAME of `lists` would cascade-delete
-- every card under PRAGMA foreign_keys=ON). Columns are added in place with ALTER TABLE.
-- DRIFT: `lists.stage` is nullable in the DB (SQLite ADD COLUMN cannot add NOT NULL without
-- a default) but declared .notNull() in schema.ts/snapshot; the guard below enforces it.
ALTER TABLE `cards` ADD `assignee_id` text REFERENCES users(id) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `cards` ADD `completed_at` integer;--> statement-breakpoint
ALTER TABLE `lists` ADD `stage` text;--> statement-breakpoint
ALTER TABLE `sprints` ADD `user_id` text REFERENCES users(id) ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE `sprints` ADD `week_start` text;--> statement-breakpoint
UPDATE `lists` SET `stage` = CASE `name`
  WHEN 'A fazer' THEN 'todo'
  WHEN 'Fazendo' THEN 'doing'
  WHEN 'Feito' THEN 'done'
END;--> statement-breakpoint
-- Guard: a list with an unknown name has stage NULL; the NOT NULL violation below aborts
-- the whole migration transaction (drizzle wraps it in BEGIN/ROLLBACK).
CREATE TABLE `_stage_guard` (`x` text NOT NULL);--> statement-breakpoint
INSERT INTO `_stage_guard` SELECT NULL FROM `lists` WHERE `stage` IS NULL;--> statement-breakpoint
DROP TABLE `_stage_guard`;--> statement-breakpoint
-- Guard: data exists but the admin user is missing -> abort instead of leaving NULL owners.
CREATE TABLE `_admin_guard` (`x` text NOT NULL);--> statement-breakpoint
INSERT INTO `_admin_guard` SELECT NULL
  WHERE NOT EXISTS (SELECT 1 FROM `users` WHERE `email` = 'marcelo.ferro@axivero.com.br')
    AND (EXISTS (SELECT 1 FROM `projects`) OR EXISTS (SELECT 1 FROM `cards`) OR EXISTS (SELECT 1 FROM `sprints`));--> statement-breakpoint
DROP TABLE `_admin_guard`;--> statement-breakpoint
-- Ensure every project has all four stages (the old build allowed deleting/renaming lists).
INSERT INTO `lists` (`id`, `project_id`, `name`, `stage`, `position`, `created_at`)
  SELECT lower(hex(randomblob(16))), p.`id`, s.`name`, s.`stage`, s.`position`, CAST(strftime('%s','now') AS INTEGER) * 1000
  FROM `projects` p
  CROSS JOIN (
    SELECT 'Backlog' AS `name`, 'backlog' AS `stage`, 0 AS `position`
    UNION ALL SELECT 'A fazer', 'todo', 1000
    UNION ALL SELECT 'Fazendo', 'doing', 2000
    UNION ALL SELECT 'Feito', 'done', 3000
  ) s
  WHERE NOT EXISTS (SELECT 1 FROM `lists` l WHERE l.`project_id` = p.`id` AND l.`stage` = s.`stage`);--> statement-breakpoint
CREATE UNIQUE INDEX `lists_project_stage_unique` ON `lists` (`project_id`,`stage`);--> statement-breakpoint
UPDATE `cards` SET `assignee_id` = (SELECT `id` FROM `users` WHERE `email` = 'marcelo.ferro@axivero.com.br');--> statement-breakpoint
UPDATE `cards` SET `completed_at` = `updated_at` WHERE `list_id` IN (SELECT `id` FROM `lists` WHERE `stage` = 'done');--> statement-breakpoint
INSERT INTO `project_members` (`project_id`, `user_id`, `added_at`)
  SELECT p.`id`, u.`id`, CAST(strftime('%s','now') AS INTEGER) * 1000
  FROM `projects` p, `users` u WHERE u.`email` = 'marcelo.ferro@axivero.com.br';--> statement-breakpoint
UPDATE `sprints` SET `user_id` = (SELECT `id` FROM `users` WHERE `email` = 'marcelo.ferro@axivero.com.br');--> statement-breakpoint
INSERT INTO `card_events` (`id`, `card_id`, `actor_id`, `type`, `at`)
  SELECT lower(hex(randomblob(16))), `id`, NULL, 'migrated', CAST(strftime('%s','now') AS INTEGER) * 1000
  FROM `cards`;
