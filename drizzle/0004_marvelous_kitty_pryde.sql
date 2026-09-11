CREATE TABLE `session_links` (
	`id` int AUTO_INCREMENT NOT NULL,
	`token` varchar(96) NOT NULL,
	`showtimeId` int NOT NULL,
	`screenName` varchar(80) NOT NULL,
	`active` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`expiresAt` timestamp,
	CONSTRAINT `session_links_id` PRIMARY KEY(`id`),
	CONSTRAINT `session_links_token_unique` UNIQUE(`token`),
	CONSTRAINT `session_links_showtime_screen_idx` UNIQUE(`showtimeId`,`screenName`)
);
--> statement-breakpoint
CREATE INDEX `session_links_active_idx` ON `session_links` (`active`);