ALTER TABLE `attendance_records` MODIFY COLUMN `checked_in_at` timestamp(3);--> statement-breakpoint
ALTER TABLE `attendance_records` MODIFY COLUMN `status` enum('PRESENT','LATE','LEAVE','ABSENT') NOT NULL DEFAULT 'PRESENT';--> statement-breakpoint
ALTER TABLE `attendance_records` ADD `source` enum('SELF_CHECKIN','ADMIN') NOT NULL;--> statement-breakpoint
ALTER TABLE `attendance_records` ADD `created_by_user_id` varchar(36);--> statement-breakpoint
ALTER TABLE `attendance_records` ADD `voided_at` timestamp(3);--> statement-breakpoint
ALTER TABLE `attendance_records` ADD `voided_by_user_id` varchar(36);--> statement-breakpoint
ALTER TABLE `attendance_records` ADD `updated_at` timestamp(3) DEFAULT (now()) NOT NULL;--> statement-breakpoint
ALTER TABLE `attendance_records` ADD CONSTRAINT `attendance_records_created_by_user_id_users_id_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `attendance_records` ADD CONSTRAINT `attendance_records_voided_by_user_id_users_id_fk` FOREIGN KEY (`voided_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `event_sessions` ADD CONSTRAINT `event_sessions_rule_start_uq` UNIQUE(`schedule_rule_id`,`scheduled_start_at`);
--> statement-breakpoint
ALTER TABLE `attendance_policies` ADD `location_name` varchar(255);
