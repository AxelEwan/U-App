CREATE TABLE `attendance_field_values` (
	`id` varchar(36) NOT NULL,
	`attendance_record_id` varchar(36) NOT NULL,
	`field_definition_id` varchar(36) NOT NULL,
	`text_value` text,
	`selected_values` json,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `attendance_field_values_id` PRIMARY KEY(`id`),
	CONSTRAINT `attendance_field_values_record_definition_uq` UNIQUE(`attendance_record_id`,`field_definition_id`)
);
--> statement-breakpoint
CREATE TABLE `attendance_policies` (
	`id` varchar(36) NOT NULL,
	`project_id` varchar(36) NOT NULL,
	`roster_mode` enum('ROSTER','FREE_FORM','MIXED') NOT NULL DEFAULT 'ROSTER',
	`check_in_open_minutes_before` int unsigned NOT NULL DEFAULT 15,
	`check_in_close_minutes_after` int unsigned NOT NULL DEFAULT 15,
	`require_location` boolean NOT NULL DEFAULT false,
	`require_passcode` boolean NOT NULL DEFAULT false,
	`location_name` varchar(255),
	`center_latitude` decimal(10,7),
	`center_longitude` decimal(10,7),
	`radius_meters` int unsigned,
	`passcode_hash` varchar(255),
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `attendance_policies_id` PRIMARY KEY(`id`),
	CONSTRAINT `attendance_policies_project_uq` UNIQUE(`project_id`)
);
--> statement-breakpoint
CREATE TABLE `attendance_records` (
	`id` varchar(36) NOT NULL,
	`session_id` varchar(36) NOT NULL,
	`project_member_id` varchar(36) NOT NULL,
	`user_id` varchar(36),
	`checked_in_at` timestamp(3),
	`method` enum('MANUAL','PASSCODE','LOCATION','COMBINED') NOT NULL,
	`source` enum('SELF_CHECKIN','ADMIN') NOT NULL,
	`status` enum('PRESENT','LATE','LEAVE','ABSENT') NOT NULL DEFAULT 'PRESENT',
	`distance_meters` decimal(10,2),
	`accuracy_meters` decimal(10,2),
	`location_passed` boolean,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`created_by_user_id` varchar(36),
	`voided_at` timestamp(3),
	`voided_by_user_id` varchar(36),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `attendance_records_id` PRIMARY KEY(`id`),
	CONSTRAINT `attendance_records_session_member_uq` UNIQUE(`session_id`,`project_member_id`)
);
--> statement-breakpoint
CREATE TABLE `custom_field_definitions` (
	`id` varchar(36) NOT NULL,
	`project_id` varchar(36) NOT NULL,
	`name` varchar(120) NOT NULL,
	`type` enum('TEXT','SINGLE_SELECT','MULTI_SELECT') NOT NULL,
	`required` boolean NOT NULL DEFAULT false,
	`options` json,
	`sort_order` int NOT NULL DEFAULT 0,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `custom_field_definitions_id` PRIMARY KEY(`id`),
	CONSTRAINT `custom_field_definitions_project_name_uq` UNIQUE(`project_id`,`name`)
);
--> statement-breakpoint
CREATE TABLE `event_sessions` (
	`id` varchar(36) NOT NULL,
	`project_id` varchar(36) NOT NULL,
	`schedule_rule_id` varchar(36),
	`scheduled_start_at` timestamp(3) NOT NULL,
	`scheduled_end_at` timestamp(3) NOT NULL,
	`checkin_open_at` timestamp(3) NOT NULL,
	`checkin_close_at` timestamp(3) NOT NULL,
	`location_name` varchar(255),
	`status` enum('SCHEDULED','CANCELLED','COMPLETED') NOT NULL DEFAULT 'SCHEDULED',
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `event_sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `event_sessions_rule_start_uq` UNIQUE(`schedule_rule_id`,`scheduled_start_at`)
);
--> statement-breakpoint
CREATE TABLE `mini_program_auth_sessions` (
	`id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`token_hash` char(64) NOT NULL,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`expires_at` timestamp(3) NOT NULL,
	`revoked_at` timestamp(3),
	`last_seen_at` timestamp(3),
	CONSTRAINT `mini_program_auth_sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `mini_program_auth_sessions_token_hash_uq` UNIQUE(`token_hash`)
);
--> statement-breakpoint
CREATE TABLE `project_admins` (
	`id` varchar(36) NOT NULL,
	`project_id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`role` enum('OWNER','MANAGER') NOT NULL DEFAULT 'MANAGER',
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `project_admins_id` PRIMARY KEY(`id`),
	CONSTRAINT `project_admins_project_user_uq` UNIQUE(`project_id`,`user_id`)
);
--> statement-breakpoint
CREATE TABLE `project_groups` (
	`id` varchar(36) NOT NULL,
	`project_id` varchar(36) NOT NULL,
	`name` varchar(120) NOT NULL,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `project_groups_id` PRIMARY KEY(`id`),
	CONSTRAINT `project_groups_project_name_uq` UNIQUE(`project_id`,`name`)
);
--> statement-breakpoint
CREATE TABLE `project_members` (
	`id` varchar(36) NOT NULL,
	`project_id` varchar(36) NOT NULL,
	`group_id` varchar(36),
	`display_name` varchar(120) NOT NULL,
	`external_code` varchar(120),
	`user_id` varchar(36),
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `project_members_id` PRIMARY KEY(`id`),
	CONSTRAINT `project_members_project_user_uq` UNIQUE(`project_id`,`user_id`)
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` varchar(36) NOT NULL,
	`name` varchar(160) NOT NULL,
	`description` text,
	`type` enum('COURSE','ACTIVITY') NOT NULL,
	`timezone` varchar(64) NOT NULL DEFAULT 'Asia/Shanghai',
	`effective_start_date` date NOT NULL,
	`effective_end_date` date,
	`status` enum('DRAFT','ACTIVE','ARCHIVED') NOT NULL DEFAULT 'DRAFT',
	`created_by` varchar(36) NOT NULL,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `projects_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `schedule_rules` (
	`id` varchar(36) NOT NULL,
	`project_id` varchar(36) NOT NULL,
	`weekdays` json NOT NULL,
	`local_start_time` time NOT NULL,
	`local_end_time` time NOT NULL,
	`start_date` date NOT NULL,
	`end_date` date NOT NULL,
	`interval_weeks` int unsigned NOT NULL DEFAULT 1,
	`timezone` varchar(64) NOT NULL,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `schedule_rules_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `user_identities` (
	`id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`provider` enum('WECHAT_MINIPROGRAM','CASDOOR') NOT NULL,
	`provider_subject` varchar(255) NOT NULL,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `user_identities_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_identities_provider_subject_uq` UNIQUE(`provider`,`provider_subject`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` varchar(36) NOT NULL,
	`display_name` varchar(120) NOT NULL,
	`avatar_url` varchar(500),
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `web_auth_sessions` (
	`id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`token_hash` char(64) NOT NULL,
	`auth_method` enum('CASDOOR','WECHAT_CONFIRMATION','H5_STUDENT','ADMIN_PASSWORD','DEV') NOT NULL,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`expires_at` timestamp(3) NOT NULL,
	`revoked_at` timestamp(3),
	`last_seen_at` timestamp(3),
	CONSTRAINT `web_auth_sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `web_auth_sessions_token_hash_uq` UNIQUE(`token_hash`)
);
--> statement-breakpoint
CREATE TABLE `web_login_challenges` (
	`id` varchar(36) NOT NULL,
	`challenge_hash` char(64) NOT NULL,
	`short_code_hash` char(64) NOT NULL,
	`browser_binding_hash` char(64) NOT NULL,
	`status` enum('PENDING','APPROVED','DENIED','CONSUMED','EXPIRED') NOT NULL DEFAULT 'PENDING',
	`approved_user_id` varchar(36),
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`expires_at` timestamp(3) NOT NULL,
	`approved_at` timestamp(3),
	`consumed_at` timestamp(3),
	CONSTRAINT `web_login_challenges_id` PRIMARY KEY(`id`),
	CONSTRAINT `web_login_challenges_hash_uq` UNIQUE(`challenge_hash`)
);
--> statement-breakpoint
ALTER TABLE `attendance_field_values` ADD CONSTRAINT `attendance_field_values_attendance_record_id_attendance_records_id_fk` FOREIGN KEY (`attendance_record_id`) REFERENCES `attendance_records`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `attendance_field_values` ADD CONSTRAINT `attendance_field_values_field_definition_id_custom_field_definitions_id_fk` FOREIGN KEY (`field_definition_id`) REFERENCES `custom_field_definitions`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `attendance_policies` ADD CONSTRAINT `attendance_policies_project_id_projects_id_fk` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `attendance_records` ADD CONSTRAINT `attendance_records_session_id_event_sessions_id_fk` FOREIGN KEY (`session_id`) REFERENCES `event_sessions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `attendance_records` ADD CONSTRAINT `attendance_records_project_member_id_project_members_id_fk` FOREIGN KEY (`project_member_id`) REFERENCES `project_members`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `attendance_records` ADD CONSTRAINT `attendance_records_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `attendance_records` ADD CONSTRAINT `attendance_records_created_by_user_id_users_id_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `attendance_records` ADD CONSTRAINT `attendance_records_voided_by_user_id_users_id_fk` FOREIGN KEY (`voided_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `custom_field_definitions` ADD CONSTRAINT `custom_field_definitions_project_id_projects_id_fk` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `event_sessions` ADD CONSTRAINT `event_sessions_project_id_projects_id_fk` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `event_sessions` ADD CONSTRAINT `event_sessions_schedule_rule_id_schedule_rules_id_fk` FOREIGN KEY (`schedule_rule_id`) REFERENCES `schedule_rules`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mini_program_auth_sessions` ADD CONSTRAINT `mini_program_auth_sessions_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `project_admins` ADD CONSTRAINT `project_admins_project_id_projects_id_fk` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `project_admins` ADD CONSTRAINT `project_admins_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `project_groups` ADD CONSTRAINT `project_groups_project_id_projects_id_fk` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `project_members` ADD CONSTRAINT `project_members_project_id_projects_id_fk` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `project_members` ADD CONSTRAINT `project_members_group_id_project_groups_id_fk` FOREIGN KEY (`group_id`) REFERENCES `project_groups`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `project_members` ADD CONSTRAINT `project_members_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `projects` ADD CONSTRAINT `projects_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `schedule_rules` ADD CONSTRAINT `schedule_rules_project_id_projects_id_fk` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_identities` ADD CONSTRAINT `user_identities_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `web_auth_sessions` ADD CONSTRAINT `web_auth_sessions_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `web_login_challenges` ADD CONSTRAINT `web_login_challenges_approved_user_id_users_id_fk` FOREIGN KEY (`approved_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `attendance_records_user_checked_idx` ON `attendance_records` (`user_id`,`checked_in_at`);--> statement-breakpoint
CREATE INDEX `event_sessions_project_start_idx` ON `event_sessions` (`project_id`,`scheduled_start_at`);--> statement-breakpoint
CREATE INDEX `event_sessions_rule_idx` ON `event_sessions` (`schedule_rule_id`);--> statement-breakpoint
CREATE INDEX `mini_program_auth_sessions_user_expiry_idx` ON `mini_program_auth_sessions` (`user_id`,`expires_at`);--> statement-breakpoint
CREATE INDEX `project_admins_user_idx` ON `project_admins` (`user_id`);--> statement-breakpoint
CREATE INDEX `project_members_project_group_idx` ON `project_members` (`project_id`,`group_id`);--> statement-breakpoint
CREATE INDEX `project_members_external_code_idx` ON `project_members` (`project_id`,`external_code`);--> statement-breakpoint
CREATE INDEX `projects_status_start_idx` ON `projects` (`status`,`effective_start_date`);--> statement-breakpoint
CREATE INDEX `schedule_rules_project_dates_idx` ON `schedule_rules` (`project_id`,`start_date`,`end_date`);--> statement-breakpoint
CREATE INDEX `user_identities_user_idx` ON `user_identities` (`user_id`);--> statement-breakpoint
CREATE INDEX `web_auth_sessions_user_expiry_idx` ON `web_auth_sessions` (`user_id`,`expires_at`);--> statement-breakpoint
CREATE INDEX `web_login_challenges_short_code_idx` ON `web_login_challenges` (`short_code_hash`,`status`);--> statement-breakpoint
CREATE INDEX `web_login_challenges_expiry_idx` ON `web_login_challenges` (`expires_at`);
