CREATE TABLE "agent_memories" (
	"id" uuid PRIMARY KEY NOT NULL,
	"agent_id" uuid NOT NULL,
	"type" varchar(20) NOT NULL,
	"content" text NOT NULL,
	"importance" real DEFAULT 5 NOT NULL,
	"emotional_valence" real DEFAULT 0 NOT NULL,
	"involved_agent_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"x" integer,
	"y" integer,
	"tick" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_relationships" (
	"id" uuid PRIMARY KEY NOT NULL,
	"agent_id" uuid NOT NULL,
	"other_agent_id" uuid NOT NULL,
	"trust_score" real DEFAULT 0 NOT NULL,
	"interaction_count" integer DEFAULT 0 NOT NULL,
	"last_interaction_tick" bigint,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_memories" ADD CONSTRAINT "agent_memories_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_relationships" ADD CONSTRAINT "agent_relationships_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_relationships" ADD CONSTRAINT "agent_relationships_other_agent_id_agents_id_fk" FOREIGN KEY ("other_agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_memories_agent_idx" ON "agent_memories" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "agent_memories_tick_idx" ON "agent_memories" USING btree ("tick");--> statement-breakpoint
CREATE INDEX "agent_memories_type_idx" ON "agent_memories" USING btree ("type");--> statement-breakpoint
CREATE INDEX "agent_memories_importance_idx" ON "agent_memories" USING btree ("importance");--> statement-breakpoint
CREATE INDEX "agent_relationships_agent_idx" ON "agent_relationships" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "agent_relationships_other_idx" ON "agent_relationships" USING btree ("other_agent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_relationships_pair_idx" ON "agent_relationships" USING btree ("agent_id","other_agent_id");