CREATE TABLE `audit_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`actorUserId` int,
	`action` varchar(80) NOT NULL,
	`entityType` varchar(40) NOT NULL,
	`entityId` varchar(80),
	`detail` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `categories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(64) NOT NULL,
	`sortOrder` int NOT NULL DEFAULT 0,
	CONSTRAINT `categories_id` PRIMARY KEY(`id`),
	CONSTRAINT `categories_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `consent_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderId` int NOT NULL,
	`policyVersion` varchar(32) NOT NULL,
	`terms` int NOT NULL,
	`privacy` int NOT NULL,
	`refund` int NOT NULL,
	`retention` int NOT NULL,
	`support` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `consent_records_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `menu_item_options` (
	`id` int AUTO_INCREMENT NOT NULL,
	`menuItemId` int NOT NULL,
	`name` varchar(80) NOT NULL,
	`pricePaise` int NOT NULL DEFAULT 0,
	CONSTRAINT `menu_item_options_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `menu_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`categoryId` int NOT NULL,
	`name` varchar(120) NOT NULL,
	`description` text NOT NULL,
	`pricePaise` int NOT NULL,
	`available` int NOT NULL DEFAULT 1,
	`sortOrder` int NOT NULL DEFAULT 0,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `menu_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `order_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderId` int NOT NULL,
	`menuItemId` int NOT NULL,
	`nameSnapshot` varchar(120) NOT NULL,
	`quantity` int NOT NULL,
	`unitPricePaise` int NOT NULL,
	`optionsSnapshot` text,
	CONSTRAINT `order_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderNumber` varchar(32) NOT NULL,
	`status` enum('NEW','PREPARING','READY','DELIVERED') NOT NULL DEFAULT 'NEW',
	`source` enum('ONLINE','OFFLINE_SMS') NOT NULL DEFAULT 'ONLINE',
	`paymentStatus` enum('PENDING','CONFIRMED','FAILED') NOT NULL DEFAULT 'PENDING',
	`screenId` int NOT NULL,
	`seatId` int NOT NULL,
	`customerName` varchar(120) NOT NULL,
	`customerPhoneLast4` varchar(4) NOT NULL,
	`totalPaise` int NOT NULL,
	`instructions` text,
	`idempotencyKey` varchar(128) NOT NULL,
	`paymentConfirmedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `orders_id` PRIMARY KEY(`id`),
	CONSTRAINT `orders_orderNumber_unique` UNIQUE(`orderNumber`),
	CONSTRAINT `orders_idempotencyKey_unique` UNIQUE(`idempotencyKey`)
);
--> statement-breakpoint
CREATE TABLE `payments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderId` int NOT NULL,
	`provider` varchar(32) NOT NULL,
	`providerPaymentId` varchar(128) NOT NULL,
	`providerOrderId` varchar(128),
	`amountPaise` int NOT NULL,
	`signatureVerified` int NOT NULL DEFAULT 0,
	`webhookEventId` varchar(128),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `payments_id` PRIMARY KEY(`id`),
	CONSTRAINT `payments_providerPaymentId_unique` UNIQUE(`providerPaymentId`)
);
--> statement-breakpoint
CREATE TABLE `refunds` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderId` int NOT NULL,
	`paymentId` int NOT NULL,
	`refundId` varchar(128),
	`amountPaise` int NOT NULL,
	`reason` text NOT NULL,
	`approvingAdminId` int NOT NULL,
	`status` enum('REQUESTED','APPROVED','PROCESSING','SUCCEEDED','FAILED') NOT NULL DEFAULT 'REQUESTED',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `refunds_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `screens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(64) NOT NULL,
	`active` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `screens_id` PRIMARY KEY(`id`),
	CONSTRAINT `screens_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `seats` (
	`id` int AUTO_INCREMENT NOT NULL,
	`screenId` int NOT NULL,
	`label` varchar(16) NOT NULL,
	`qrToken` varchar(128) NOT NULL,
	CONSTRAINT `seats_id` PRIMARY KEY(`id`),
	CONSTRAINT `seats_qrToken_unique` UNIQUE(`qrToken`),
	CONSTRAINT `seat_screen_label_idx` UNIQUE(`screenId`,`label`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` varchar(32) NOT NULL DEFAULT 'READ_ONLY';--> statement-breakpoint
CREATE INDEX `audit_logs_created_idx` ON `audit_logs` (`createdAt`,`action`);--> statement-breakpoint
CREATE INDEX `menu_items_available_idx` ON `menu_items` (`available`);--> statement-breakpoint
CREATE INDEX `orders_active_queue_idx` ON `orders` (`status`,`createdAt`);--> statement-breakpoint
CREATE INDEX `orders_payment_idx` ON `orders` (`paymentStatus`);--> statement-breakpoint
CREATE INDEX `payments_order_idx` ON `payments` (`orderId`);--> statement-breakpoint
CREATE INDEX `users_role_idx` ON `users` (`role`);