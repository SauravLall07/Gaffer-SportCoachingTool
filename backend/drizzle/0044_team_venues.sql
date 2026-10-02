ALTER TABLE "teams" ADD COLUMN "country_code" text;
--> statement-breakpoint
CREATE TABLE "venues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"latitude" double precision,
	"longitude" double precision,
	"notes" text,
	"tags" jsonb,
	"source" text DEFAULT 'custom' NOT NULL,
	"external_id" text,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "venues_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX "venues_team_id_index" ON "venues" USING btree ("team_id");
--> statement-breakpoint
CREATE INDEX "venues_team_last_used_index" ON "venues" USING btree ("team_id", "last_used_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "venues_team_source_external_unique" ON "venues" USING btree ("team_id", "source", "external_id");
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "venue_id" uuid;
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "venue_source" text;
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "venue_tags" jsonb;
--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE set null;
--> statement-breakpoint
CREATE TABLE "geoapify_daily_usage" (
	"usage_date" date PRIMARY KEY NOT NULL,
	"search_credits" integer DEFAULT 0 NOT NULL,
	"nearby_credits" integer DEFAULT 0 NOT NULL,
	"reverse_credits" integer DEFAULT 0 NOT NULL
);
