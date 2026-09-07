CREATE TABLE `class_timetable` (
	`id` varchar(36) NOT NULL,
	`class_id` varchar(36) NOT NULL,
	`course_id` varchar(36) NOT NULL,
	`weekday` int unsigned NOT NULL,
	`start_period` int unsigned NOT NULL,
	`end_period` int unsigned NOT NULL,
	`classroom` varchar(160),
	`teacher` varchar(120),
	`start_week` int unsigned NOT NULL,
	`end_week` int unsigned NOT NULL,
	`week_pattern` enum('ALL','ODD','EVEN') NOT NULL DEFAULT 'ALL',
	`specified_weeks` json,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `class_timetable_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `classes` (
	`id` varchar(36) NOT NULL,
	`semester_id` varchar(36) NOT NULL,
	`class_code` varchar(64) NOT NULL,
	`name` varchar(120) NOT NULL,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `classes_id` PRIMARY KEY(`id`),
	CONSTRAINT `classes_semester_code_uq` UNIQUE(`semester_id`,`class_code`)
);
--> statement-breakpoint
CREATE TABLE `courses` (
	`id` varchar(36) NOT NULL,
	`semester_id` varchar(36) NOT NULL,
	`project_id` varchar(36),
	`course_code` varchar(64) NOT NULL,
	`name` varchar(160) NOT NULL,
	`kind` enum('REQUIRED','ELECTIVE') NOT NULL,
	`teacher` varchar(120),
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `courses_id` PRIMARY KEY(`id`),
	CONSTRAINT `courses_semester_code_uq` UNIQUE(`semester_id`,`course_code`)
);
--> statement-breakpoint
CREATE TABLE `semester_configs` (
	`id` varchar(36) NOT NULL,
	`code` varchar(32) NOT NULL,
	`name` varchar(120) NOT NULL,
	`standard_periods` json NOT NULL,
	`active` boolean NOT NULL DEFAULT false,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `semester_configs_id` PRIMARY KEY(`id`),
	CONSTRAINT `semester_configs_code_uq` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `student_bindings` (
	`id` varchar(36) NOT NULL,
	`student_id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`provider` enum('WECHAT_MINIPROGRAM','H5_WEB') NOT NULL DEFAULT 'WECHAT_MINIPROGRAM',
	`provider_subject` varchar(255) NOT NULL,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `student_bindings_id` PRIMARY KEY(`id`),
	CONSTRAINT `student_bindings_student_provider_uq` UNIQUE(`student_id`,`provider`),
	CONSTRAINT `student_bindings_user_uq` UNIQUE(`user_id`),
	CONSTRAINT `student_bindings_subject_uq` UNIQUE(`provider`,`provider_subject`)
);
--> statement-breakpoint
CREATE TABLE `student_course_enrollments` (
	`id` varchar(36) NOT NULL,
	`student_id` varchar(36) NOT NULL,
	`course_id` varchar(36) NOT NULL,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `student_course_enrollments_id` PRIMARY KEY(`id`),
	CONSTRAINT `student_course_enrollments_student_course_uq` UNIQUE(`student_id`,`course_id`)
);
--> statement-breakpoint
CREATE TABLE `students` (
	`id` varchar(36) NOT NULL,
	`student_no` varchar(64) NOT NULL,
	`display_name` varchar(120) NOT NULL,
	`class_id` varchar(36) NOT NULL,
	`active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `students_id` PRIMARY KEY(`id`),
	CONSTRAINT `students_student_no_uq` UNIQUE(`student_no`)
);
--> statement-breakpoint
ALTER TABLE `event_sessions` ADD `course_id` varchar(36);--> statement-breakpoint
ALTER TABLE `class_timetable` ADD CONSTRAINT `class_timetable_class_id_classes_id_fk` FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `class_timetable` ADD CONSTRAINT `class_timetable_course_id_courses_id_fk` FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `classes` ADD CONSTRAINT `classes_semester_id_semester_configs_id_fk` FOREIGN KEY (`semester_id`) REFERENCES `semester_configs`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `courses` ADD CONSTRAINT `courses_semester_id_semester_configs_id_fk` FOREIGN KEY (`semester_id`) REFERENCES `semester_configs`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `courses` ADD CONSTRAINT `courses_project_id_projects_id_fk` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `student_bindings` ADD CONSTRAINT `student_bindings_student_id_students_id_fk` FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `student_bindings` ADD CONSTRAINT `student_bindings_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `student_course_enrollments` ADD CONSTRAINT `student_course_enrollments_student_id_students_id_fk` FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `student_course_enrollments` ADD CONSTRAINT `student_course_enrollments_course_id_courses_id_fk` FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `students` ADD CONSTRAINT `students_class_id_classes_id_fk` FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `class_timetable_class_weekday_idx` ON `class_timetable` (`class_id`,`weekday`);--> statement-breakpoint
CREATE INDEX `students_class_active_idx` ON `students` (`class_id`,`active`);--> statement-breakpoint
CREATE INDEX `event_sessions_course_start_idx` ON `event_sessions` (`course_id`,`scheduled_start_at`);
