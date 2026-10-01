CREATE TABLE `card_dependencies` (
	`blocked_card_id` text NOT NULL,
	`blocker_card_id` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`blocked_card_id`, `blocker_card_id`),
	FOREIGN KEY (`blocked_card_id`) REFERENCES `cards`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`blocker_card_id`) REFERENCES `cards`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `deps_by_blocked` ON `card_dependencies` (`blocked_card_id`);--> statement-breakpoint
CREATE INDEX `deps_by_blocker` ON `card_dependencies` (`blocker_card_id`);