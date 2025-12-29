CREATE TABLE "agents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"llm_type" varchar(20) NOT NULL,
	"x" integer DEFAULT 0 NOT NULL,
	"y" integer DEFAULT 0 NOT NULL,
	"hunger" real DEFAULT 100 NOT NULL,
	"energy" real DEFAULT 100 NOT NULL,
	"health" real DEFAULT 100 NOT NULL,
	"balance" real DEFAULT 100 NOT NULL,
	"state" varchar(20) DEFAULT 'idle' NOT NULL,
	"color" varchar(7) DEFAULT '#888888' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"died_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"tick" bigint NOT NULL,
	"agent_id" uuid,
	"event_type" varchar(50) NOT NULL,
	"payload" jsonb NOT NULL,
	"version" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory" (
	"id" uuid PRIMARY KEY NOT NULL,
	"agent_id" uuid NOT NULL,
	"item_type" varchar(50) NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"properties" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tx_id" uuid NOT NULL,
	"tick" bigint NOT NULL,
	"from_agent_id" uuid,
	"to_agent_id" uuid,
	"amount" real NOT NULL,
	"category" varchar(20) NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resource_spawns" (
	"id" uuid PRIMARY KEY NOT NULL,
	"x" integer NOT NULL,
	"y" integer NOT NULL,
	"resource_type" varchar(20) NOT NULL,
	"max_amount" integer DEFAULT 10 NOT NULL,
	"current_amount" integer DEFAULT 10 NOT NULL,
	"regen_rate" real DEFAULT 0.5 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shelters" (
	"id" uuid PRIMARY KEY NOT NULL,
	"x" integer NOT NULL,
	"y" integer NOT NULL,
	"can_sleep" boolean DEFAULT true NOT NULL,
	"owner_agent_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "snapshots" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "snapshots_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"agent_id" uuid NOT NULL,
	"state" jsonb NOT NULL,
	"event_version" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "world_state" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"current_tick" bigint DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_tick_at" timestamp with time zone,
	"is_paused" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger" ADD CONSTRAINT "ledger_from_agent_id_agents_id_fk" FOREIGN KEY ("from_agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger" ADD CONSTRAINT "ledger_to_agent_id_agents_id_fk" FOREIGN KEY ("to_agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shelters" ADD CONSTRAINT "shelters_owner_agent_id_agents_id_fk" FOREIGN KEY ("owner_agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "snapshots" ADD CONSTRAINT "snapshots_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agents_state_idx" ON "agents" USING btree ("state");--> statement-breakpoint
CREATE INDEX "agents_position_idx" ON "agents" USING btree ("x","y");--> statement-breakpoint
CREATE INDEX "events_tick_idx" ON "events" USING btree ("tick");--> statement-breakpoint
CREATE INDEX "events_agent_idx" ON "events" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "events_type_idx" ON "events" USING btree ("event_type");--> statement-breakpoint
CREATE UNIQUE INDEX "events_agent_version_idx" ON "events" USING btree ("agent_id","version");--> statement-breakpoint
CREATE INDEX "inventory_agent_idx" ON "inventory" USING btree ("agent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_agent_item_idx" ON "inventory" USING btree ("agent_id","item_type");--> statement-breakpoint
CREATE INDEX "ledger_tick_idx" ON "ledger" USING btree ("tick");--> statement-breakpoint
CREATE INDEX "ledger_from_idx" ON "ledger" USING btree ("from_agent_id");--> statement-breakpoint
CREATE INDEX "ledger_to_idx" ON "ledger" USING btree ("to_agent_id");--> statement-breakpoint
CREATE INDEX "ledger_tx_idx" ON "ledger" USING btree ("tx_id");--> statement-breakpoint
CREATE INDEX "resource_spawns_position_idx" ON "resource_spawns" USING btree ("x","y");--> statement-breakpoint
CREATE INDEX "resource_spawns_type_idx" ON "resource_spawns" USING btree ("resource_type");--> statement-breakpoint
CREATE INDEX "shelters_position_idx" ON "shelters" USING btree ("x","y");--> statement-breakpoint
CREATE UNIQUE INDEX "snapshots_agent_version_idx" ON "snapshots" USING btree ("agent_id","event_version");