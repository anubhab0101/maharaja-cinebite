CREATE TABLE `store_entities` (
	`key` varchar(160) NOT NULL,
	`kind` varchar(20) NOT NULL,
	`payload` json NOT NULL,
	CONSTRAINT `store_entities_key` PRIMARY KEY(`key`)
);
--> statement-breakpoint
ALTER TABLE `orders` ADD `publicId` varchar(80);--> statement-breakpoint
ALTER TABLE `orders` ADD `snapshot` json;--> statement-breakpoint
ALTER TABLE `orders` ADD `providerOrderId` varchar(128);--> statement-breakpoint
ALTER TABLE `orders` ADD `checkoutHash` varchar(64);--> statement-breakpoint
ALTER TABLE `orders` ADD `showtimeId` int;--> statement-breakpoint
ALTER TABLE `orders` ADD CONSTRAINT `orders_publicId_unique` UNIQUE(`publicId`);--> statement-breakpoint
ALTER TABLE `orders` ADD CONSTRAINT `orders_providerOrderId_unique` UNIQUE(`providerOrderId`);
