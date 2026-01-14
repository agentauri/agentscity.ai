/**
 * Tests for Work Action Handler
 *
 * EMPLOYMENT SYSTEM: Work requires active employment contract.
 *
 * Tests cover:
 * - Work success (per_tick payment)
 * - Work success (contract completion)
 * - Work fail (no active employment)
 * - Work fail (not enough energy)
 * - Work fail (employer cannot pay)
 */

import { describe, expect, test, mock, beforeEach, afterAll } from 'bun:test';
import { v4 as uuid } from 'uuid';
import type { Agent, Employment } from '../../db/schema';
import type { ActionIntent, WorkParams } from '../../actions/types';

// Mock IDs
const WORKER_ID = '12345678-1234-1234-1234-1234567890ab';
const EMPLOYER_ID = '87654321-4321-4321-4321-ba0987654321';
const EMPLOYMENT_ID = 'abcdef12-abcd-ef12-3456-7890abcdef12';

// Mock database calls before importing the module
const mockGetOldestActiveEmployment = mock(() => Promise.resolve(null as Employment | null));
const mockUpdateEmploymentStatus = mock(() => Promise.resolve());
const mockGetAgentById = mock((_id: string) => Promise.resolve(null as Agent | null));
const mockUpdateAgentBalance = mock(() => Promise.resolve());
const mockStoreMemory = mock(() => Promise.resolve({ id: 'test-memory' }));
const mockUpdateRelationshipTrust = mock(() => Promise.resolve());

mock.module('../../db/queries/employment', () => ({
  getOldestActiveEmployment: mockGetOldestActiveEmployment,
  updateEmploymentStatus: mockUpdateEmploymentStatus,
}));

mock.module('../../db/queries/agents', () => ({
  getAgentById: mockGetAgentById,
  updateAgentBalance: mockUpdateAgentBalance,
}));

mock.module('../../db/queries/memories', () => ({
  storeMemory: mockStoreMemory,
  updateRelationshipTrust: mockUpdateRelationshipTrust,
}));

// Import after mocking
import { handleWork } from '../../actions/handlers/work';

// Helper to create mock agent
function createMockAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: WORKER_ID,
    llmType: 'claude',
    x: 50,
    y: 50,
    hunger: 80,
    energy: 80,
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

// Helper to create mock employer
function createMockEmployer(overrides: Partial<Agent> = {}): Agent {
  return {
    id: EMPLOYER_ID,
    llmType: 'gemini',
    x: 55,
    y: 55,
    hunger: 80,
    energy: 100,
    health: 100,
    balance: 1000, // Rich employer
    state: 'idle',
    color: '#0000ff',
    createdAt: new Date(),
    updatedAt: new Date(),
    diedAt: null,
    tenantId: null,
    personality: null,
    ...overrides,
  };
}

// Helper to create mock employment
function createMockEmployment(overrides: Partial<Employment> = {}): Employment {
  return {
    id: EMPLOYMENT_ID,
    tenantId: null,
    jobOfferId: uuid(),
    employerId: EMPLOYER_ID,
    workerId: WORKER_ID,
    salary: 50,
    paymentType: 'per_tick',
    escrowAmount: 0,
    ticksRequired: 5,
    ticksWorked: 0,
    amountPaid: 0,
    status: 'active',
    startedAtTick: 1,
    endedAtTick: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// Helper to create work intent
function createWorkIntent(duration = 1, agentId = WORKER_ID): ActionIntent<WorkParams> {
  return {
    agentId,
    type: 'work',
    params: { duration }, // duration param is ignored by new handler but kept for types
    tick: 10,
    timestamp: Date.now(),
  };
}

describe('handleWork', () => {
  afterAll(() => {
    // Restore all mocked modules to allow other tests to use real implementations
    mock.restore();
  });

  beforeEach(() => {
    // Reset mocks
    mockGetOldestActiveEmployment.mockClear();
    mockUpdateEmploymentStatus.mockClear();
    mockGetAgentById.mockClear();
    mockUpdateAgentBalance.mockClear();
    mockStoreMemory.mockClear();
    mockUpdateRelationshipTrust.mockClear();

    // Default setups
    mockGetOldestActiveEmployment.mockImplementation(() => Promise.resolve(createMockEmployment()));
    mockGetAgentById.mockImplementation((id: string) => {
      if (id === EMPLOYER_ID) return Promise.resolve(createMockEmployer());
      if (id === WORKER_ID) return Promise.resolve(createMockAgent());
      return Promise.resolve(null);
    });
  });

  describe('validation', () => {
    test('fails if agent is sleeping', async () => {
      const agent = createMockAgent({ state: 'sleeping' });
      const intent = createWorkIntent();

      const result = await handleWork(intent, agent);

      expect(result.success).toBe(false);
      expect(result.error).toContain('sleeping');
    });

    test('fails if not enough energy', async () => {
      const agent = createMockAgent({ energy: 1 }); // Need 2
      const intent = createWorkIntent();

      const result = await handleWork(intent, agent);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Not enough energy');
    });

    test('fails if no active employment', async () => {
      mockGetOldestActiveEmployment.mockImplementation(() => Promise.resolve(null));
      const agent = createMockAgent();
      const intent = createWorkIntent();

      const result = await handleWork(intent, agent);

      expect(result.success).toBe(false);
      expect(result.error).toContain('No active employment');
    });

    test('fails if employer does not exist (or dead)', async () => {
      mockGetAgentById.mockImplementation(() => Promise.resolve(null));
      const agent = createMockAgent();
      const intent = createWorkIntent();

      const result = await handleWork(intent, agent);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Employer is no longer available');
      expect(mockUpdateEmploymentStatus).toHaveBeenCalledWith(EMPLOYMENT_ID, 'abandoned', 10);
    });
  });

  describe('successful work (per_tick)', () => {
    test('deducts energy and hunger', async () => {
      const agent = createMockAgent({ energy: 10, hunger: 10 });
      const intent = createWorkIntent();

      const result = await handleWork(intent, agent);

      expect(result.success).toBe(true);
      expect(result.changes?.energy).toBe(8); // -2
      expect(result.changes?.hunger).toBe(9.5); // -0.5
    });

    test('pays worker per tick', async () => {
      const agent = createMockAgent({ balance: 100 });
      // Salary 50 for 5 ticks = 10 per tick
      const intent = createWorkIntent();

      const result = await handleWork(intent, agent);

      expect(result.success).toBe(true);
      expect(result.changes?.balance).toBe(110); // +10
      expect(mockUpdateAgentBalance).toHaveBeenCalledWith(WORKER_ID, 110);
      expect(mockUpdateAgentBalance).toHaveBeenCalledWith(EMPLOYER_ID, 990); // 1000 - 10
    });

    test('terminates if employer cannot pay', async () => {
      // Employer has only 5 CITY, needs 10
      mockGetAgentById.mockImplementation((id: string) => {
        if (id === EMPLOYER_ID) return Promise.resolve(createMockEmployer({ balance: 5 }));
        return Promise.resolve(createMockAgent());
      });

      const agent = createMockAgent();
      const intent = createWorkIntent();

      const result = await handleWork(intent, agent);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Employer cannot afford');
      expect(mockUpdateEmploymentStatus).toHaveBeenCalledWith(EMPLOYMENT_ID, 'unpaid', 10);
      expect(mockUpdateRelationshipTrust).toHaveBeenCalled(); // Trust penalty
    });
  });

  describe('contract completion', () => {
    test('completes contract when ticks required reached', async () => {
      // Contract needs 5 ticks, has worked 4. This is the 5th.
      mockGetOldestActiveEmployment.mockImplementation(() =>
        Promise.resolve(createMockEmployment({ ticksWorked: 4, ticksRequired: 5 }))
      );

      const agent = createMockAgent();
      const intent = createWorkIntent();

      const result = await handleWork(intent, agent);

      expect(result.success).toBe(true);
      // Verify completion logic
      expect(mockUpdateEmploymentStatus).toHaveBeenCalledWith(EMPLOYMENT_ID, 'completed', 10);
      expect(mockUpdateRelationshipTrust).toHaveBeenCalledTimes(2); // Both parties trust gain
    });

    test('returns escrow to employer on completion', async () => {
      // Per tick payment with escrow
      mockGetOldestActiveEmployment.mockImplementation(() =>
        Promise.resolve(createMockEmployment({
          ticksWorked: 4,
          ticksRequired: 5,
          paymentType: 'per_tick',
          escrowAmount: 50,
          amountPaid: 40 // Paid 40 so far
        }))
      );

      const agent = createMockAgent();
      const intent = createWorkIntent();

      // Pay last 10 this tick, then return 50 escrow
      await handleWork(intent, agent);

      // Worker gets last payment (10) -> Balance 110
      expect(mockUpdateAgentBalance).toHaveBeenCalledWith(WORKER_ID, 110);

      // Employer pays 10, gets 50 back -> 1000 - 10 + 50 = 1040
      expect(mockUpdateAgentBalance).toHaveBeenCalledWith(EMPLOYER_ID, 1040);
    });
  });

  describe('events and memory', () => {
    test('stores memory for worker and employer', async () => {
      const agent = createMockAgent();
      const intent = createWorkIntent();

      await handleWork(intent, agent);

      expect(mockStoreMemory).toHaveBeenCalledTimes(2);
      // Worker memory
      expect(mockStoreMemory).toHaveBeenCalledWith(expect.objectContaining({
        agentId: WORKER_ID,
        type: 'action',
        importance: 3,
      }));
      // Employer memory
      expect(mockStoreMemory).toHaveBeenCalledWith(expect.objectContaining({
        agentId: EMPLOYER_ID,
        type: 'interaction',
        importance: 2,
      }));
    });

    test('emits agent_worked event', async () => {
      const agent = createMockAgent();
      const intent = createWorkIntent();

      const result = await handleWork(intent, agent);

      const event = result.events?.find(e => e.type === 'agent_worked');
      expect(event).toBeDefined();
      expect(event?.payload).toMatchObject({
        employmentId: EMPLOYMENT_ID,
        ticksWorked: 1,
        paymentThisTick: 10,
        energyCost: 2,
      });
    });
  });
});