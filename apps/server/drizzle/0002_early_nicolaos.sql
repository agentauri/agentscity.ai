CREATE TABLE "agent_knowledge" (
	"id" uuid PRIMARY KEY NOT NULL,
	"agent_id" uuid NOT NULL,
	"known_agent_id" uuid NOT NULL,
	"discovery_type" varchar(20) NOT NULL,
	"referred_by_id" uuid,
	"referral_depth" integer DEFAULT 0 NOT NULL,
	"shared_info" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"information_age" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_knowledge" ADD CONSTRAINT "agent_knowledge_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_knowledge" ADD CONSTRAINT "agent_knowledge_known_agent_id_agents_id_fk" FOREIGN KEY ("known_agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_knowledge" ADD CONSTRAINT "agent_knowledge_referred_by_id_agents_id_fk" FOREIGN KEY ("referred_by_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_knowledge_agent_idx" ON "agent_knowledge" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "agent_knowledge_known_idx" ON "agent_knowledge" USING btree ("known_agent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_knowledge_pair_idx" ON "agent_knowledge" USING btree ("agent_id","known_agent_id");