CREATE INDEX "agent_knowledge_discovery_idx" ON "agent_knowledge" USING btree ("discovery_type");--> statement-breakpoint
CREATE INDEX "agent_relationships_trust_idx" ON "agent_relationships" USING btree ("trust_score");--> statement-breakpoint
CREATE INDEX "events_type_tick_idx" ON "events" USING btree ("event_type","tick");