import { describe, expect, test, mock } from 'bun:test';
import { handleSignal } from '../../actions/handlers/signal';
import type { ActionIntent, SignalParams } from '../../actions/types';
import type { Agent } from '../../db/schema';

// Helper to create mock agent
function createMockAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: 'agent-123',
    llmType: 'claude',
    x: 50,
    y: 50,
    hunger: 80,
    energy: 100,
    health: 100,
    balance: 100,
    state: 'idle',
    color: '#ff0000',
    createdAt: new Date(),
    updatedAt: new Date(),
    diedAt: null,
    tenantId: null,
    personality: null,
    ...overrides,
  };
}

describe('handleSignal', () => {
  test('successful signal emits event and deducts energy', async () => {
    const agent = createMockAgent({ energy: 50 });
    const intent: ActionIntent<SignalParams> = {
      agentId: agent.id,
      type: 'signal',
      params: { message: 'Hello World', intensity: 3 },
      tick: 10,
      timestamp: Date.now(),
    };

    const result = await handleSignal(intent, agent);

    expect(result.success).toBe(true);
    // Base cost 5 * intensity 3 = 15
    expect(result.changes?.energy).toBe(35);
    expect(result.events).toHaveLength(1);
    expect(result.events![0].type).toBe('agent_signaled');
    expect(result.events![0].payload.message).toBe('Hello World');
    expect(result.events![0].payload.range).toBe(30); // 3 * 10
  });

  test('fails if not enough energy', async () => {
    const agent = createMockAgent({ energy: 10 });
    const intent: ActionIntent<SignalParams> = {
      agentId: agent.id,
      type: 'signal',
      params: { message: 'Too expensive', intensity: 5 }, // Needs 25
      tick: 10,
      timestamp: Date.now(),
    };

    const result = await handleSignal(intent, agent);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Not enough energy');
  });

  test('validates message length', async () => {
    const agent = createMockAgent();
    const intent: ActionIntent<SignalParams> = {
      agentId: agent.id,
      type: 'signal',
      params: { message: 'a'.repeat(51), intensity: 1 },
      tick: 10,
      timestamp: Date.now(),
    };

    const result = await handleSignal(intent, agent);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Message too long');
  });
});
