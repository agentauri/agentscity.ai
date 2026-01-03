/**
 * Memory Retriever - RAG-lite Contextual Memory System
 *
 * Retrieves relevant memories based on the agent's current context:
 * - Recent memories (what just happened)
 * - Memories about nearby agents (reputation/vendetta)
 * - Location-relevant memories (what happened here before)
 * - Important memories (significant past events)
 *
 * This enables long-term behavior patterns like:
 * - Vendetta formation (remembering who harmed you)
 * - Reputation tracking (remembering who is trustworthy)
 * - Location associations (remembering dangers/opportunities)
 */

import type { AgentObservation, AgentMemoryEntry } from './types';
import type { AgentMemory } from '../db/schema';
import {
  getRecentMemories,
  getMemoriesAboutAgents,
  getMemoriesAtLocation,
  getMostImportantMemories,
} from '../db/queries/memories';
import { CONFIG } from '../config';

// =============================================================================
// Types
// =============================================================================

export interface RetrievedMemories {
  /** Last few memories (chronological context) */
  recent: AgentMemory[];
  /** Memories about agents currently visible */
  aboutNearbyAgents: AgentMemory[];
  /** Memories about the current location */
  locationRelevant: AgentMemory[];
  /** High-importance memories regardless of recency */
  important: AgentMemory[];
}

export interface MemoryRetrievalConfig {
  /** Maximum recent memories to retrieve */
  recentLimit: number;
  /** Maximum memories per nearby agent */
  perAgentLimit: number;
  /** Maximum location-relevant memories */
  locationLimit: number;
  /** Maximum important memories */
  importantLimit: number;
  /** Radius for location-based memory search */
  locationRadius: number;
  /** Total maximum memories to include in context */
  totalLimit: number;
}

const DEFAULT_CONFIG: MemoryRetrievalConfig = {
  recentLimit: 3,
  perAgentLimit: 2,
  locationLimit: 3,
  importantLimit: 3,
  locationRadius: 3,
  totalLimit: 12, // Keep context manageable for LLM
};

// =============================================================================
// Memory Retrieval
// =============================================================================

/**
 * Retrieve contextually relevant memories for an agent
 *
 * This function implements a RAG-lite approach:
 * 1. Always include recent memories (chronological context)
 * 2. Query memories about nearby agents (social context)
 * 3. Query memories about current location (spatial context)
 * 4. Include high-importance memories (long-term significant events)
 *
 * Memories are deduplicated and limited to prevent context overflow.
 */
export async function retrieveContextualMemories(
  agentId: string,
  observation: AgentObservation,
  config: Partial<MemoryRetrievalConfig> = {}
): Promise<RetrievedMemories> {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // Parallel queries for efficiency
  const [recent, locationRelevant, important] = await Promise.all([
    // Recent memories (what just happened)
    getRecentMemories(agentId, cfg.recentLimit),

    // Location-relevant memories (what happened here before)
    getMemoriesAtLocation(
      agentId,
      observation.self.x,
      observation.self.y,
      cfg.locationRadius,
      cfg.locationLimit
    ),

    // Most important memories (significant past events)
    getMostImportantMemories(agentId, cfg.importantLimit),
  ]);

  // Get memories about nearby agents (if any)
  const nearbyAgentIds = observation.nearbyAgents.map((a) => a.id);
  const aboutNearbyAgentsMap = nearbyAgentIds.length > 0
    ? await getMemoriesAboutAgents(agentId, nearbyAgentIds, cfg.perAgentLimit)
    : new Map<string, AgentMemory[]>();

  // Flatten the map into a single array
  const aboutNearbyAgents: AgentMemory[] = [];
  for (const memories of aboutNearbyAgentsMap.values()) {
    aboutNearbyAgents.push(...memories);
  }

  return {
    recent,
    aboutNearbyAgents,
    locationRelevant,
    important,
  };
}

/**
 * Deduplicate memories across categories
 * Returns unique memories, preferring to keep them in priority order:
 * recent > aboutNearbyAgents > locationRelevant > important
 */
export function deduplicateMemories(retrieved: RetrievedMemories): AgentMemory[] {
  const seen = new Set<string>();
  const result: AgentMemory[] = [];

  // Add in priority order
  for (const memory of retrieved.recent) {
    if (!seen.has(memory.id)) {
      seen.add(memory.id);
      result.push(memory);
    }
  }

  for (const memory of retrieved.aboutNearbyAgents) {
    if (!seen.has(memory.id)) {
      seen.add(memory.id);
      result.push(memory);
    }
  }

  for (const memory of retrieved.locationRelevant) {
    if (!seen.has(memory.id)) {
      seen.add(memory.id);
      result.push(memory);
    }
  }

  for (const memory of retrieved.important) {
    if (!seen.has(memory.id)) {
      seen.add(memory.id);
      result.push(memory);
    }
  }

  return result;
}

/**
 * Convert database memory to observation entry format
 */
export function memoryToEntry(memory: AgentMemory): AgentMemoryEntry {
  return {
    tick: memory.tick,
    content: memory.content,
    type: memory.type,
    importance: memory.importance,
    emotionalValence: memory.emotionalValence,
  };
}

/**
 * Format retrieved memories for inclusion in the LLM prompt
 * Groups memories by category with headers for clarity
 */
export function formatMemoriesForPrompt(
  retrieved: RetrievedMemories,
  nearbyAgentIds: string[],
  config: Partial<MemoryRetrievalConfig> = {}
): string {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const lines: string[] = [];
  const seen = new Set<string>();
  let totalCount = 0;

  // Helper to format a single memory
  const formatMemory = (memory: AgentMemory): string => {
    const sentiment = memory.emotionalValence > 0.2
      ? '(+)'
      : memory.emotionalValence < -0.2
        ? '(-)'
        : '';
    const importance = memory.importance >= 7 ? ' [!]' : '';
    return `- [Tick ${memory.tick}] ${memory.content} ${sentiment}${importance}`;
  };

  // Recent memories
  if (retrieved.recent.length > 0) {
    lines.push('### Recent Memories');
    for (const memory of retrieved.recent) {
      if (totalCount >= cfg.totalLimit) break;
      if (!seen.has(memory.id)) {
        seen.add(memory.id);
        lines.push(formatMemory(memory));
        totalCount++;
      }
    }
  }

  // Memories about nearby agents
  if (retrieved.aboutNearbyAgents.length > 0 && totalCount < cfg.totalLimit) {
    lines.push('', '### Memories About Nearby Agents');
    for (const memory of retrieved.aboutNearbyAgents) {
      if (totalCount >= cfg.totalLimit) break;
      if (!seen.has(memory.id)) {
        seen.add(memory.id);
        // Try to identify which nearby agent this memory is about
        const involvedIds = memory.involvedAgentIds as string[];
        const relevantAgents = involvedIds.filter((id) => nearbyAgentIds.includes(id));
        const agentLabel = relevantAgents.length > 0
          ? ` (about ${relevantAgents.map((id) => id.slice(0, 8)).join(', ')})`
          : '';
        lines.push(formatMemory(memory) + agentLabel);
        totalCount++;
      }
    }
  }

  // Location-relevant memories
  if (retrieved.locationRelevant.length > 0 && totalCount < cfg.totalLimit) {
    lines.push('', '### Memories About This Location');
    for (const memory of retrieved.locationRelevant) {
      if (totalCount >= cfg.totalLimit) break;
      if (!seen.has(memory.id)) {
        seen.add(memory.id);
        const locationInfo = memory.x !== null && memory.y !== null
          ? ` (at ${memory.x}, ${memory.y})`
          : '';
        lines.push(formatMemory(memory) + locationInfo);
        totalCount++;
      }
    }
  }

  // Important memories (only if we have room and they're not already included)
  if (retrieved.important.length > 0 && totalCount < cfg.totalLimit) {
    const importantNotSeen = retrieved.important.filter((m) => !seen.has(m.id));
    if (importantNotSeen.length > 0) {
      lines.push('', '### Significant Past Events');
      for (const memory of importantNotSeen) {
        if (totalCount >= cfg.totalLimit) break;
        seen.add(memory.id);
        lines.push(formatMemory(memory));
        totalCount++;
      }
    }
  }

  return lines.join('\n');
}

/**
 * Check if RAG-lite memory retrieval is enabled
 */
export function isRAGMemoryEnabled(): boolean {
  return CONFIG.memory.enableRAGRetrieval ?? false;
}
