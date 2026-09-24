CREATE TABLE `debt_payments` (
	`id` text PRIMARY KEY NOT NULL,
	`debt_id` text NOT NULL,
	`amount` integer NOT NULL,
	`date` text NOT NULL,
	`payment_method` text DEFAULT 'cash' NOT NULL,
	`payment_method_other` text,
	`proof_file` text,
	`note` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`debt_id`) REFERENCES `debts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `debt_proofs` (
	`id` text PRIMARY KEY NOT NULL,
	`debt_id` text NOT NULL,
	`file` text NOT NULL,
	`content_type` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`debt_id`) REFERENCES `debts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `debts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`person` text NOT NULL,
	`direction` text NOT NULL,
	`amount` integer NOT NULL,
	`date` text NOT NULL,
	`time` text,
	`due_date` text,
	`payment_method` text DEFAULT 'cash' NOT NULL,
	`payment_method_other` text,
	`note` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `debt_user_status` ON `debts` (`user_id`,`status`);