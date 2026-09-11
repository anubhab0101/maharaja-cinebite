CREATE TABLE `showtimes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`venueName` varchar(160) NOT NULL,
	`city` varchar(80) NOT NULL,
	`address` text NOT NULL,
	`movieTitle` varchar(180) NOT NULL,
	`certificate` varchar(16),
	`language` varchar(40),
	`format` varchar(40),
	`screenName` varchar(80),
	`showDate` varchar(10) NOT NULL,
	`startTime` varchar(8) NOT NULL,
	`availability` varchar(24) NOT NULL,
	`source` varchar(32) NOT NULL,
	`sourceUrl` text NOT NULL,
	`sourceShowId` varchar(160) NOT NULL,
	`syncedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `showtimes_id` PRIMARY KEY(`id`),
	CONSTRAINT `showtimes_source_show_idx` UNIQUE(`source`,`sourceShowId`)
);
--> statement-breakpoint
CREATE INDEX `showtimes_venue_date_idx` ON `showtimes` (`venueName`,`showDate`);