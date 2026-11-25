CREATE TABLE `profile_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`profile_id` text NOT NULL,
	`expires_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sessions_expiry` ON `profile_sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`normalized_name` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `profiles_normalized_name_unique` ON `profiles` (`normalized_name`);