CREATE TABLE `bubbles` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`map_id` text NOT NULL,
	`name` text NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`confidence` text DEFAULT 'candidate' NOT NULL,
	`x` real NOT NULL,
	`y` real NOT NULL,
	`rx` real NOT NULL,
	`ry` real NOT NULL,
	`theta` real NOT NULL,
	`ra` real NOT NULL,
	`dec` real NOT NULL,
	`a_arcsec` real NOT NULL,
	`b_arcsec` real NOT NULL,
	`pa_deg` real NOT NULL,
	`pa_defined` integer NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `bubbles_owner_updated` ON `bubbles` (`user_id`,`updated_at`);