/**
 * Agent queries
 */

import { eq, and, sql } from 'drizzle-orm';
import { db, agents, type Agent, type NewAgent } from '../index';

export async function getAllAgents(): Promise<Agent[]> {
  return db.select().from(agents);
}

export async function getAliveAgents(): Promise<Agent[]> {
  return db.select().from(agents).where(sql`${agents.state} != 'dead'`);
}

export async function getAgentById(id: string): Promise<Agent | undefined> {
  const result = await db.select().from(agents).where(eq(agents.id, id)).limit(1);
  return result[0];
}

export async function getAgentsAtPosition(x: number, y: number): Promise<Agent[]> {
  return db.select().from(agents).where(
    and(eq(agents.x, x), eq(agents.y, y), sql`${agents.state} != 'dead'`)
  );
}

export async function createAgent(agent: NewAgent): Promise<Agent> {
  const result = await db.insert(agents).values(agent).returning();
  return result[0];
}

export async function updateAgent(id: string, updates: Partial<Agent>): Promise<Agent | undefined> {
  const result = await db
    .update(agents)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(agents.id, id))
    .returning();
  return result[0];
}

export async function updateAgentNeeds(
  id: string,
  hunger: number,
  energy: number,
  health: number
): Promise<Agent | undefined> {
  return updateAgent(id, { hunger, energy, health });
}

export async function updateAgentPosition(
  id: string,
  x: number,
  y: number
): Promise<Agent | undefined> {
  return updateAgent(id, { x, y });
}

export async function updateAgentBalance(
  id: string,
  balance: number
): Promise<Agent | undefined> {
  return updateAgent(id, { balance });
}

export async function killAgent(id: string): Promise<Agent | undefined> {
  return updateAgent(id, { state: 'dead', diedAt: new Date() });
}
