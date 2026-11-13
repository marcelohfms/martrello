CREATE TABLE `slack_deliveries` (
	`project_id` text NOT NULL,
	`day` text NOT NULL,
	`status` text NOT NULL,
	`attempts` integer NOT NULL,
	`error` text,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`project_id`, `day`),
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `projects` ADD `slack_channel_id` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `slack_channel_name` text;