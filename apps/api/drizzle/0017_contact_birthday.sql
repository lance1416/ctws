ALTER TABLE "contacts" ADD COLUMN "birthday_calendar" text;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "birthday_year" integer;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "birthday_month" integer;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "birthday_day" integer;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "birthday_leap_month" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "birthday_hour_branch" integer;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "birthday_remind_lead" integer DEFAULT 7 NOT NULL;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "gender" text;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "hometown" text;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "city" text;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "title" text;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "circle" text;--> statement-breakpoint
CREATE INDEX "contacts_birthday_idx" ON "contacts" USING btree ("workspace_id","birthday_month","birthday_day");--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_birthday_calendar_check" CHECK ("contacts"."birthday_calendar" in ('solar', 'lunar'));--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_gender_check" CHECK ("contacts"."gender" in ('male', 'female', 'other'));--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_circle_check" CHECK ("contacts"."circle" in ('family', 'friend', 'work'));--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_birthday_month_check" CHECK ("contacts"."birthday_month" is null or "contacts"."birthday_month" between 1 and 12);--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_birthday_day_check" CHECK ("contacts"."birthday_day" is null or "contacts"."birthday_day" between 1 and 31);--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_birthday_hour_check" CHECK ("contacts"."birthday_hour_branch" is null or "contacts"."birthday_hour_branch" between 0 and 11);--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_birthday_lead_check" CHECK ("contacts"."birthday_remind_lead" in (0, 1, 3, 7));--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_birthday_group_check" CHECK (("contacts"."birthday_calendar" is null and "contacts"."birthday_month" is null and "contacts"."birthday_day" is null)
          or ("contacts"."birthday_calendar" is not null and "contacts"."birthday_month" is not null and "contacts"."birthday_day" is not null));