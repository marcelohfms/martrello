DROP INDEX `users_username_unique`;--> statement-breakpoint
ALTER TABLE `users` ADD `email` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `name` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `role` text DEFAULT 'member' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `disabled_at` integer;--> statement-breakpoint
UPDATE `users` SET
  `email` = CASE WHEN `username` = 'marcelo' THEN 'marcelo.ferro@axivero.com.br' ELSE `username` END,
  `name` = CASE WHEN `username` = 'marcelo' THEN 'Marcelo' ELSE `username` END,
  `role` = CASE WHEN `username` = 'marcelo' THEN 'admin' ELSE 'member' END,
  `disabled_at` = NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `username`;
