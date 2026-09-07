CREATE TABLE `attendance_audit_logs` (
	`id` varchar(36) NOT NULL,
	`attendance_record_id` varchar(36) NOT NULL,
	`operator_user_id` varchar(36) NOT NULL,
	`previous_status` enum('PRESENT','LATE','LEAVE','ABSENT'),
	`new_status` enum('PRESENT','LATE','LEAVE','ABSENT') NOT NULL,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `attendance_audit_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `event_sessions` ADD `attendance_started_at` timestamp(3);--> statement-breakpoint
ALTER TABLE `event_sessions` ADD `attendance_finalized_at` timestamp(3);--> statement-breakpoint
ALTER TABLE `attendance_audit_logs` ADD CONSTRAINT `aal_attendance_record_fk` FOREIGN KEY (`attendance_record_id`) REFERENCES `attendance_records`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `attendance_audit_logs` ADD CONSTRAINT `attendance_audit_logs_operator_user_id_users_id_fk` FOREIGN KEY (`operator_user_id`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `attendance_audit_record_created_idx` ON `attendance_audit_logs` (`attendance_record_id`,`created_at`);
