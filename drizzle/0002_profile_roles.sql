ALTER TABLE `profile_sessions` ADD `access_code_hash` text;--> statement-breakpoint
ALTER TABLE `profiles` ADD `role` text DEFAULT 'standard' NOT NULL;--> statement-breakpoint
ALTER TABLE `profiles` ADD `access_code_hash` text;