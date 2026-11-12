-- Personal weekly sprint. Hand-written data part: no existing table is rebuilt
-- (DROP/CREATE/RENAME of a parent table cascade-deletes its children under
-- PRAGMA foreign_keys=ON). Only UPDATE/INSERT on existing tables, and DROP of
-- `sprint_slots`, which nothing references.
--
-- Active cards in A fazer that are not in the open sprint go to their project's
-- Backlog (A fazer was the general pile; Backlog takes that role now). Each move
-- gets a `stage` event with no author. The event `at` is +1 ms so it sorts after
-- the `migrated` event 0006 wrote in the same second.
INSERT INTO `card_events` (`id`, `card_id`, `actor_id`, `type`, `from_value`, `to_value`, `at`)
  SELECT lower(hex(randomblob(16))), c.`id`, NULL, 'stage', 'A fazer', 'Backlog', CAST(strftime('%s','now') AS INTEGER) * 1000 + 1
  FROM `cards` c
  JOIN `lists` l ON l.`id` = c.`list_id`
  WHERE l.`stage` = 'todo'
    AND c.`archived_at` IS NULL
    AND c.`id` NOT IN (
      SELECT ss.`card_id` FROM `sprint_slots` ss JOIN `sprints` s ON s.`id` = ss.`sprint_id` WHERE s.`closed_at` IS NULL
    );--> statement-breakpoint
UPDATE `cards`
  SET `list_id` = (SELECT b.`id` FROM `lists` b WHERE b.`project_id` = `cards`.`project_id` AND b.`stage` = 'backlog')
  WHERE `archived_at` IS NULL
    AND `list_id` IN (SELECT `id` FROM `lists` WHERE `stage` = 'todo')
    AND `id` NOT IN (
      SELECT ss.`card_id` FROM `sprint_slots` ss JOIN `sprints` s ON s.`id` = ss.`sprint_id` WHERE s.`closed_at` IS NULL
    );--> statement-breakpoint
DROP TABLE `sprint_slots`;--> statement-breakpoint
-- Dependencies never cross projects, but the old moveCard kept them when a card
-- changed project. Drop those leftovers so a blocker's title never shows on a card
-- of another project. No event is recorded for this cleanup.
DELETE FROM `card_dependencies`
  WHERE (SELECT a.`project_id` FROM `cards` a WHERE a.`id` = `card_dependencies`.`blocked_card_id`)
     <> (SELECT b.`project_id` FROM `cards` b WHERE b.`id` = `card_dependencies`.`blocker_card_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `sprints_user_week_unique` ON `sprints` (`user_id`,`week_start`);
