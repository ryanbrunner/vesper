CREATE TABLE `run` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`trigger` text NOT NULL,
	`status` text NOT NULL,
	`started_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`finished_at` integer,
	`result_text` text,
	`total_cost_usd` real,
	`usage_json` text,
	`num_turns` integer,
	`error_message` text,
	FOREIGN KEY (`task_id`) REFERENCES `task`(`id`) ON UPDATE no action ON DELETE cascade
);
