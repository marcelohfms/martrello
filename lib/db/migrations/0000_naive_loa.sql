CREATE TABLE `card_labels` (
	`card_id` text NOT NULL,
	`label_id` text NOT NULL,
	PRIMARY KEY(`card_id`, `label_id`),
	FOREIGN KEY (`card_id`) REFERENCES `cards`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`label_id`) REFERENCES `labels`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `cards` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`list_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`due_date` text,
	`position` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`archived_at` integer,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`list_id`) REFERENCES `lists`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `cards_by_list` ON `cards` (`list_id`);--> statement-breakpoint
CREATE INDEX `cards_by_project` ON `cards` (`project_id`);--> statement-breakpoint
CREATE TABLE `labels` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`color` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `labels_name_unique` ON `labels` (`name`);--> statement-breakpoint
CREATE TABLE `lists` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`position` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `lists_by_project` ON `lists` (`project_id`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`color` text NOT NULL,
	`position` integer NOT NULL,
	`created_at` integer NOT NULL,
	`archived_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `projects_name_unique` ON `projects` (`name`);--> statement-breakpoint
CREATE TABLE `sprint_slots` (
	`card_id` text PRIMARY KEY NOT NULL,
	`sprint_id` text NOT NULL,
	`sprint_list` text NOT NULL,
	`position` integer NOT NULL,
	`added_at` integer NOT NULL,
	FOREIGN KEY (`card_id`) REFERENCES `cards`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`sprint_id`) REFERENCES `sprints`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `slots_by_sprint` ON `sprint_slots` (`sprint_id`);--> statement-breakpoint
CREATE TABLE `sprints` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text,
	`started_at` integer NOT NULL,
	`closed_at` integer,
	`cards_snapshot` text
);
