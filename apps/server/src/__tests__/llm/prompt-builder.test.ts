/**
 * Tests for Prompt Builder
 *
 * Tests cover:
 * - System prompt generation
 * - Observation prompt with all fields
 * - Empty inventory handling
 * - Nearby agents/resources formatting
 * - Urgency warnings at critical levels
 * - Available actions filtering
 */

import { describe, expect, test } from 'bun:test';
import {
  buildSystemPrompt,
  buildObservationPrompt,
  buildFullPrompt,
  buildAvailableActions,
} from '../../llm/prompt-builder';
import type { AgentObservation, AvailableAction } from '../../llm/types';

// Helper to create minimal observation
function createMockObservation(overrides: Partial<AgentObservation> = {}): AgentObservation {
  return {
    tick: 1,
    timestamp: Date.now(),
    self: {
      id: 'test-agent-id',
      x: 50,
      y: 50,
      hunger: 80,
      energy: 80,
      health: 100,
      balance: 100,
      state: 'idle',
    },
    nearbyAgents: [],
    nearbyLocations: [],
    availableActions: [],
    recentEvents: [],
    inventory: [],
    ...overrides,
  };
}

describe('buildSystemPrompt', () => {
  test('returns non-empty string', () => {
    const prompt = buildSystemPrompt();
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(100);
  });

  test('contains survival goal', () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toContain('SURVIVE');
  });

  test('contains JSON response format', () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toContain('JSON');
    expect(prompt).toContain('"action"');
  });

  test('lists available actions', () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toContain('move:');
    expect(prompt).toContain('gather:');
    expect(prompt).toContain('buy:');
    expect(prompt).toContain('consume:');
    expect(prompt).toContain('sleep:');
    expect(prompt).toContain('work:');
  });

  test('contains world model explanation', () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toContain('World Model');
    expect(prompt).toContain('SHELTER');
  });

  test('contains survival strategy', () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toContain('Survival Strategy');
    expect(prompt).toContain('PRIORITY ORDER');
  });

  test('contains death conditions', () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toContain('DEATH CONDITIONS');
    expect(prompt).toContain('Hunger = 0');
    expect(prompt).toContain('Energy = 0');
  });
});

describe('buildObservationPrompt', () => {
  describe('basic state', () => {
    test('includes tick number', () => {
      const obs = createMockObservation({ tick: 42 });
      const prompt = buildObservationPrompt(obs);
      expect(prompt).toContain('Tick: 42');
    });

    test('includes agent position', () => {
      const obs = createMockObservation({
        self: { ...createMockObservation().self, x: 25, y: 30 },
      });
      const prompt = buildObservationPrompt(obs);
      expect(prompt).toContain('Position: (25, 30)');
    });

    test('includes hunger with status emoji', () => {
      const obs = createMockObservation({
        self: { ...createMockObservation().self, hunger: 75 },
      });
      const prompt = buildObservationPrompt(obs);
      expect(prompt).toContain('Hunger: 75.0/100');
    });

    test('includes energy with status emoji', () => {
      const obs = createMockObservation({
        self: { ...createMockObservation().self, energy: 50 },
      });
      const prompt = buildObservationPrompt(obs);
      expect(prompt).toContain('Energy: 50.0/100');
    });

    test('includes health', () => {
      const obs = createMockObservation({
        self: { ...createMockObservation().self, health: 85 },
      });
      const prompt = buildObservationPrompt(obs);
      expect(prompt).toContain('Health: 85.0/100');
    });

    test('includes balance', () => {
      const obs = createMockObservation({
        self: { ...createMockObservation().self, balance: 150 },
      });
      const prompt = buildObservationPrompt(obs);
      expect(prompt).toContain('Balance: 150 CITY');
    });

    test('includes state', () => {
      const obs = createMockObservation({
        self: { ...createMockObservation().self, state: 'working' },
      });
      const prompt = buildObservationPrompt(obs);
      expect(prompt).toContain('State: working');
    });
  });

  describe('status emojis', () => {
    test('shows green emoji for high values (>=70)', () => {
      const obs = createMockObservation({
        self: { ...createMockObservation().self, hunger: 80 },
      });
      const prompt = buildObservationPrompt(obs);
      expect(prompt).toContain('80.0/100 🟢');
    });

    test('shows yellow emoji for moderate values (40-69)', () => {
      const obs = createMockObservation({
        self: { ...createMockObservation().self, hunger: 50 },
      });
      const prompt = buildObservationPrompt(obs);
      expect(prompt).toContain('50.0/100 🟡');
    });

    test('shows orange emoji for low values (20-39)', () => {
      const obs = createMockObservation({
        self: { ...createMockObservation().self, hunger: 25 },
      });
      const prompt = buildObservationPrompt(obs);
      expect(prompt).toContain('25.0/100 🟠');
    });

    test('shows red emoji for critical values (<20)', () => {
      const obs = createMockObservation({
        self: { ...createMockObservation().self, hunger: 15 },
      });
      const prompt = buildObservationPrompt(obs);
      expect(prompt).toContain('15.0/100 🔴');
    });
  });

  describe('inventory', () => {
    test('shows empty inventory message when no items', () => {
      const obs = createMockObservation({ inventory: [] });
      const prompt = buildObservationPrompt(obs);
      expect(prompt).toContain('Your Inventory');
      expect(prompt).toContain('Empty');
    });

    test('lists inventory items', () => {
      const obs = createMockObservation({
        inventory: [
          { type: 'food', quantity: 3 },
          { type: 'water', quantity: 2 },
        ],
      });
      const prompt = buildObservationPrompt(obs);
      expect(prompt).toContain('- food: 3');
      expect(prompt).toContain('- water: 2');
    });
  });

  describe('nearby agents', () => {
    test('lists nearby agents with position and state', () => {
      const obs = createMockObservation({
        nearbyAgents: [
          { id: 'agent-12345678-abcd', x: 51, y: 50, state: 'idle' },
        ],
      });
      const prompt = buildObservationPrompt(obs);
      expect(prompt).toContain('Nearby Agents');
      expect(prompt).toContain('agent-12');
      expect(prompt).toContain('(51, 50)');
      expect(prompt).toContain('[idle]');
    });

    test('shows relationship info when available', () => {
      const obs = createMockObservation({
        nearbyAgents: [
          { id: 'agent-12345678-abcd', x: 51, y: 50, state: 'idle' },
        ],
        relationships: {
          'agent-12345678-abcd': {
            trustScore: 30,
            interactionCount: 5,
          },
        },
      });
      const prompt = buildObservationPrompt(obs);
      expect(prompt).toContain('trusted');
      expect(prompt).toContain('5 interactions');
    });

    test('shows distrusted label for negative trust', () => {
      const obs = createMockObservation({
        nearbyAgents: [
          { id: 'agent-12345678-abcd', x: 51, y: 50, state: 'idle' },
        ],
        relationships: {
          'agent-12345678-abcd': {
            trustScore: -30,
            interactionCount: 2,
          },
        },
      });
      const prompt = buildObservationPrompt(obs);
      expect(prompt).toContain('distrusted');
    });
  });

  describe('nearby resource spawns', () => {
    test('lists resource spawns with emoji', () => {
      const obs = createMockObservation({
        nearbyResourceSpawns: [
          { id: 'spawn-1', x: 55, y: 50, resourceType: 'food', currentAmount: 15, maxAmount: 20 },
        ],
      });
      const prompt = buildObservationPrompt(obs);
      expect(prompt).toContain('Nearby Resource Spawns');
      expect(prompt).toContain('🍎');
      expect(prompt).toContain('food');
      expect(prompt).toContain('15/20');
    });

    test('shows energy spawn with lightning emoji', () => {
      const obs = createMockObservation({
        nearbyResourceSpawns: [
          { id: 'spawn-1', x: 55, y: 50, resourceType: 'energy', currentAmount: 10, maxAmount: 15 },
        ],
      });
      const prompt = buildObservationPrompt(obs);
      expect(prompt).toContain('⚡');
    });

    test('shows material spawn with wood emoji', () => {
      const obs = createMockObservation({
        nearbyResourceSpawns: [
          { id: 'spawn-1', x: 55, y: 50, resourceType: 'material', currentAmount: 5, maxAmount: 10 },
        ],
      });
      const prompt = buildObservationPrompt(obs);
      expect(prompt).toContain('🪵');
    });

    test('shows distance to spawn', () => {
      const obs = createMockObservation({
        self: { ...createMockObservation().self, x: 50, y: 50 },
        nearbyResourceSpawns: [
          { id: 'spawn-1', x: 55, y: 50, resourceType: 'food', currentAmount: 10, maxAmount: 20 },
        ],
      });
      const prompt = buildObservationPrompt(obs);
      expect(prompt).toContain('5 tiles away');
    });

    test('shows star when at spawn location', () => {
      const obs = createMockObservation({
        self: { ...createMockObservation().self, x: 50, y: 50 },
        nearbyResourceSpawns: [
          { id: 'spawn-1', x: 50, y: 50, resourceType: 'food', currentAmount: 10, maxAmount: 20 },
        ],
      });
      const prompt = buildObservationPrompt(obs);
      expect(prompt).toContain('⭐ YOU ARE HERE');
    });
  });

  describe('nearby shelters', () => {
    test('lists shelters with house emoji', () => {
      const obs = createMockObservation({
        nearbyShelters: [
          { id: 'shelter-1', x: 52, y: 50, canSleep: true },
        ],
      });
      const prompt = buildObservationPrompt(obs);
      expect(prompt).toContain('Nearby Shelters');
      expect(prompt).toContain('🏠');
      expect(prompt).toContain('Shelter at (52, 50)');
    });

    test('shows can rest indicator', () => {
      const obs = createMockObservation({
        nearbyShelters: [
          { id: 'shelter-1', x: 52, y: 50, canSleep: true },
        ],
      });
      const prompt = buildObservationPrompt(obs);
      expect(prompt).toContain('can rest');
    });

    test('shows star when at shelter', () => {
      const obs = createMockObservation({
        self: { ...createMockObservation().self, x: 52, y: 50 },
        nearbyShelters: [
          { id: 'shelter-1', x: 52, y: 50, canSleep: true },
        ],
      });
      const prompt = buildObservationPrompt(obs);
      expect(prompt).toContain('⭐ YOU ARE HERE');
    });
  });

  describe('nearby claims', () => {
    test('shows territory claim with flag emoji', () => {
      const obs = createMockObservation({
        nearbyClaims: [
          { id: 'claim-1', agentId: 'other-agent', x: 48, y: 50, claimType: 'territory', strength: 5, claimedAtTick: 10 },
        ],
      });
      const prompt = buildObservationPrompt(obs);
      expect(prompt).toContain('🚩');
      expect(prompt).toContain('territory');
    });

    test('shows YOUR label for own claims', () => {
      const obs = createMockObservation({
        nearbyClaims: [
          { id: 'claim-1', agentId: 'test-agent-id', x: 50, y: 50, claimType: 'home', strength: 3, claimedAtTick: 5 },
        ],
      });
      const prompt = buildObservationPrompt(obs);
      expect(prompt).toContain('YOURS');
    });

    test('shows strength label', () => {
      const obs = createMockObservation({
        nearbyClaims: [
          { id: 'claim-1', agentId: 'other', x: 48, y: 50, claimType: 'resource', strength: 5, claimedAtTick: 10 },
        ],
      });
      const prompt = buildObservationPrompt(obs);
      expect(prompt).toContain('strong');
    });

    test('shows claim description if provided', () => {
      const obs = createMockObservation({
        nearbyClaims: [
          { id: 'claim-1', agentId: 'other', x: 48, y: 50, claimType: 'danger', strength: 2, claimedAtTick: 10, description: 'Dangerous area!' },
        ],
      });
      const prompt = buildObservationPrompt(obs);
      expect(prompt).toContain('"Dangerous area!"');
    });
  });

  describe('recent memories', () => {
    test('shows recent memories section', () => {
      const obs = createMockObservation({
        recentMemories: [
          { tick: 5, content: 'Found food at (20, 15)', type: 'observation', importance: 6, emotionalValence: 0.5 },
        ],
      });
      const prompt = buildObservationPrompt(obs);
      expect(prompt).toContain('Your Recent Memories');
      expect(prompt).toContain('[Tick 5]');
      expect(prompt).toContain('Found food at (20, 15)');
    });

    test('shows positive sentiment indicator', () => {
      const obs = createMockObservation({
        recentMemories: [
          { tick: 5, content: 'Something good', type: 'action', importance: 5, emotionalValence: 0.5 },
        ],
      });
      const prompt = buildObservationPrompt(obs);
      expect(prompt).toContain('(+)');
    });

    test('shows negative sentiment indicator', () => {
      const obs = createMockObservation({
        recentMemories: [
          { tick: 5, content: 'Something bad', type: 'action', importance: 5, emotionalValence: -0.5 },
        ],
      });
      const prompt = buildObservationPrompt(obs);
      expect(prompt).toContain('(-)');
    });

    test('limits to 3 memories', () => {
      const obs = createMockObservation({
        recentMemories: [
          { tick: 1, content: 'Memory 1', type: 'action', importance: 5, emotionalValence: 0 },
          { tick: 2, content: 'Memory 2', type: 'action', importance: 5, emotionalValence: 0 },
          { tick: 3, content: 'Memory 3', type: 'action', importance: 5, emotionalValence: 0 },
          { tick: 4, content: 'Memory 4', type: 'action', importance: 5, emotionalValence: 0 },
          { tick: 5, content: 'Memory 5', type: 'action', importance: 5, emotionalValence: 0 },
        ],
      });
      const prompt = buildObservationPrompt(obs);
      expect(prompt).toContain('Memory 1');
      expect(prompt).toContain('Memory 2');
      expect(prompt).toContain('Memory 3');
      expect(prompt).not.toContain('Memory 4');
      expect(prompt).not.toContain('Memory 5');
    });
  });

  describe('available actions', () => {
    test('lists available actions', () => {
      const obs = createMockObservation({
        availableActions: [
          { type: 'move', description: 'Move to adjacent cell', cost: { energy: 1 } },
          { type: 'work', description: 'Work to earn CITY', cost: { energy: 2 } },
        ],
      });
      const prompt = buildObservationPrompt(obs);
      expect(prompt).toContain('Available Actions');
      expect(prompt).toContain('move: Move to adjacent cell');
      expect(prompt).toContain('work: Work to earn CITY');
    });

    test('shows energy cost', () => {
      const obs = createMockObservation({
        availableActions: [
          { type: 'work', description: 'Work', cost: { energy: 2 } },
        ],
      });
      const prompt = buildObservationPrompt(obs);
      expect(prompt).toContain('costs 2 energy');
    });

    test('shows money cost', () => {
      const obs = createMockObservation({
        availableActions: [
          { type: 'buy', description: 'Buy items', cost: { money: 10 } },
        ],
      });
      const prompt = buildObservationPrompt(obs);
      expect(prompt).toContain('costs 10 CITY');
    });
  });

  describe('recent events', () => {
    test('lists recent events', () => {
      const obs = createMockObservation({
        recentEvents: [
          { type: 'agent_moved', tick: 5, description: 'Agent moved to (51, 50)' },
        ],
      });
      const prompt = buildObservationPrompt(obs);
      expect(prompt).toContain('Recent Events');
      expect(prompt).toContain('[Tick 5]');
      expect(prompt).toContain('Agent moved to (51, 50)');
    });

    test('limits to 5 events', () => {
      const obs = createMockObservation({
        recentEvents: [
          { type: 'e1', tick: 1, description: 'Event 1' },
          { type: 'e2', tick: 2, description: 'Event 2' },
          { type: 'e3', tick: 3, description: 'Event 3' },
          { type: 'e4', tick: 4, description: 'Event 4' },
          { type: 'e5', tick: 5, description: 'Event 5' },
          { type: 'e6', tick: 6, description: 'Event 6' },
          { type: 'e7', tick: 7, description: 'Event 7' },
        ],
      });
      const prompt = buildObservationPrompt(obs);
      expect(prompt).toContain('Event 5');
      expect(prompt).not.toContain('Event 6');
      expect(prompt).not.toContain('Event 7');
    });
  });

  describe('urgency warnings', () => {
    test('shows critical hunger warning with food in inventory', () => {
      const obs = createMockObservation({
        self: { ...createMockObservation().self, hunger: 15 },
        inventory: [{ type: 'food', quantity: 1 }],
      });
      const prompt = buildObservationPrompt(obs);
      expect(prompt).toContain('WARNINGS');
      expect(prompt).toContain('🚨');
      expect(prompt).toContain('CRITICAL HUNGER');
      expect(prompt).toContain('"action": "consume"');
    });

    test('shows critical hunger warning with money to buy food', () => {
      const obs = createMockObservation({
        self: { ...createMockObservation().self, hunger: 15, balance: 50 },
        inventory: [],
      });
      const prompt = buildObservationPrompt(obs);
      expect(prompt).toContain('CRITICAL HUNGER');
      expect(prompt).toContain('"action": "buy"');
    });

    test('shows critical hunger warning with no food and no money', () => {
      const obs = createMockObservation({
        self: { ...createMockObservation().self, hunger: 15, balance: 5 },
        inventory: [],
      });
      const prompt = buildObservationPrompt(obs);
      expect(prompt).toContain('CRITICAL HUNGER');
      expect(prompt).toContain('WORK NOW');
    });

    test('shows hunger warning (not critical) with food', () => {
      const obs = createMockObservation({
        self: { ...createMockObservation().self, hunger: 40 },
        inventory: [{ type: 'food', quantity: 2 }],
      });
      const prompt = buildObservationPrompt(obs);
      expect(prompt).toContain('⚠️');
      expect(prompt).toContain('HUNGER WARNING');
      expect(prompt).toContain('Consider consuming');
    });

    test('shows critical energy warning', () => {
      const obs = createMockObservation({
        self: { ...createMockObservation().self, energy: 15 },
      });
      const prompt = buildObservationPrompt(obs);
      expect(prompt).toContain('🚨');
      expect(prompt).toContain('CRITICAL ENERGY');
      expect(prompt).toContain('"action": "sleep"');
    });

    test('shows low energy warning', () => {
      const obs = createMockObservation({
        self: { ...createMockObservation().self, energy: 35 },
      });
      const prompt = buildObservationPrompt(obs);
      expect(prompt).toContain('⚠️');
      expect(prompt).toContain('LOW ENERGY');
    });

    test('shows dying warning for low health', () => {
      const obs = createMockObservation({
        self: { ...createMockObservation().self, health: 25 },
      });
      const prompt = buildObservationPrompt(obs);
      expect(prompt).toContain('🚨');
      expect(prompt).toContain('DYING');
    });

    test('shows tip when hunger moderate and no food/money', () => {
      const obs = createMockObservation({
        self: { ...createMockObservation().self, hunger: 65, balance: 5 },
        inventory: [],
      });
      const prompt = buildObservationPrompt(obs);
      expect(prompt).toContain('💡');
      expect(prompt).toContain('TIP');
      expect(prompt).toContain('Work now');
    });

    test('no warnings when all values are good', () => {
      const obs = createMockObservation({
        self: { ...createMockObservation().self, hunger: 80, energy: 80, health: 100 },
      });
      const prompt = buildObservationPrompt(obs);
      expect(prompt).not.toContain('WARNINGS');
    });
  });

  describe('known agents (Phase 2)', () => {
    test('shows agents discovered directly', () => {
      const obs = createMockObservation({
        knownAgents: [
          { id: 'other-12345678', discoveryType: 'direct', referralDepth: 0, informationAge: 5 },
        ],
      });
      const prompt = buildObservationPrompt(obs);
      expect(prompt).toContain("Agents You've Heard About");
      expect(prompt).toContain('other-12');
      expect(prompt).toContain('met directly');
    });

    test('shows agents discovered through referral', () => {
      const obs = createMockObservation({
        knownAgents: [
          { id: 'other-12345678', discoveryType: 'referral', referredBy: 'source-abcdefgh', referralDepth: 1, informationAge: 3 },
        ],
      });
      const prompt = buildObservationPrompt(obs);
      expect(prompt).toContain('heard from source-a'); // slice(0, 8) = 'source-a'
    });

    test('shows danger warning', () => {
      const obs = createMockObservation({
        knownAgents: [
          { id: 'other-12345678', discoveryType: 'direct', referralDepth: 0, informationAge: 2, dangerWarning: 'Attacked me!' },
        ],
      });
      const prompt = buildObservationPrompt(obs);
      expect(prompt).toContain('⚠️ WARNING');
    });

    test('shows information age', () => {
      const obs = createMockObservation({
        knownAgents: [
          { id: 'other-12345678', discoveryType: 'direct', referralDepth: 0, informationAge: 10 },
        ],
      });
      const prompt = buildObservationPrompt(obs);
      expect(prompt).toContain('10 ticks ago');
    });
  });
});

describe('buildFullPrompt', () => {
  test('combines system and observation prompts', () => {
    const obs = createMockObservation();
    const fullPrompt = buildFullPrompt(obs);
    const systemPrompt = buildSystemPrompt();
    const observationPrompt = buildObservationPrompt(obs);

    expect(fullPrompt).toContain('SURVIVE');
    expect(fullPrompt).toContain('Current State');
    expect(fullPrompt).toBe(`${systemPrompt}\n\n${observationPrompt}`);
  });
});

describe('buildAvailableActions', () => {
  describe('move action', () => {
    test('available when has energy', () => {
      const obs = createMockObservation({
        self: { ...createMockObservation().self, energy: 10 },
      });
      const actions = buildAvailableActions(obs);
      const moveAction = actions.find((a) => a.type === 'move');

      expect(moveAction).toBeDefined();
      expect(moveAction?.cost?.energy).toBe(1);
    });

    test('not available when energy is 0', () => {
      const obs = createMockObservation({
        self: { ...createMockObservation().self, energy: 0 },
      });
      const actions = buildAvailableActions(obs);
      const moveAction = actions.find((a) => a.type === 'move');

      expect(moveAction).toBeUndefined();
    });
  });

  describe('gather action', () => {
    test('available when at resource spawn with resources', () => {
      const obs = createMockObservation({
        self: { ...createMockObservation().self, x: 50, y: 50, energy: 10 },
        nearbyResourceSpawns: [
          { id: 'spawn-1', x: 50, y: 50, resourceType: 'food', currentAmount: 10, maxAmount: 20 },
        ],
      });
      const actions = buildAvailableActions(obs);
      const gatherAction = actions.find((a) => a.type === 'gather');

      expect(gatherAction).toBeDefined();
      expect(gatherAction?.description).toContain('food');
      expect(gatherAction?.description).toContain('10 available');
    });

    test('not available when not at spawn', () => {
      const obs = createMockObservation({
        self: { ...createMockObservation().self, x: 50, y: 50, energy: 10 },
        nearbyResourceSpawns: [
          { id: 'spawn-1', x: 55, y: 50, resourceType: 'food', currentAmount: 10, maxAmount: 20 },
        ],
      });
      const actions = buildAvailableActions(obs);
      const gatherAction = actions.find((a) => a.type === 'gather');

      expect(gatherAction).toBeUndefined();
    });

    test('not available when spawn is depleted', () => {
      const obs = createMockObservation({
        self: { ...createMockObservation().self, x: 50, y: 50, energy: 10 },
        nearbyResourceSpawns: [
          { id: 'spawn-1', x: 50, y: 50, resourceType: 'food', currentAmount: 0, maxAmount: 20 },
        ],
      });
      const actions = buildAvailableActions(obs);
      const gatherAction = actions.find((a) => a.type === 'gather');

      expect(gatherAction).toBeUndefined();
    });
  });

  describe('buy action', () => {
    test('available when has money (>= 5)', () => {
      const obs = createMockObservation({
        self: { ...createMockObservation().self, balance: 10 },
      });
      const actions = buildAvailableActions(obs);
      const buyAction = actions.find((a) => a.type === 'buy');

      expect(buyAction).toBeDefined();
      expect(buyAction?.description).toContain('food: 10 CITY');
    });

    test('not available when balance < 5', () => {
      const obs = createMockObservation({
        self: { ...createMockObservation().self, balance: 4 },
      });
      const actions = buildAvailableActions(obs);
      const buyAction = actions.find((a) => a.type === 'buy');

      expect(buyAction).toBeUndefined();
    });
  });

  describe('consume action', () => {
    test('available when has inventory items', () => {
      const obs = createMockObservation({
        inventory: [{ type: 'food', quantity: 2 }],
      });
      const actions = buildAvailableActions(obs);
      const consumeAction = actions.find((a) => a.type === 'consume');

      expect(consumeAction).toBeDefined();
      expect(consumeAction?.description).toContain('2x food');
    });

    test('not available when inventory is empty', () => {
      const obs = createMockObservation({
        inventory: [],
      });
      const actions = buildAvailableActions(obs);
      const consumeAction = actions.find((a) => a.type === 'consume');

      expect(consumeAction).toBeUndefined();
    });
  });

  describe('sleep action', () => {
    test('available when not sleeping', () => {
      const obs = createMockObservation({
        self: { ...createMockObservation().self, state: 'idle' },
      });
      const actions = buildAvailableActions(obs);
      const sleepAction = actions.find((a) => a.type === 'sleep');

      expect(sleepAction).toBeDefined();
    });

    test('not available when already sleeping', () => {
      const obs = createMockObservation({
        self: { ...createMockObservation().self, state: 'sleeping' },
      });
      const actions = buildAvailableActions(obs);
      const sleepAction = actions.find((a) => a.type === 'sleep');

      expect(sleepAction).toBeUndefined();
    });
  });

  describe('work action', () => {
    test('available when not sleeping and has energy', () => {
      const obs = createMockObservation({
        self: { ...createMockObservation().self, state: 'idle', energy: 10 },
      });
      const actions = buildAvailableActions(obs);
      const workAction = actions.find((a) => a.type === 'work');

      expect(workAction).toBeDefined();
      expect(workAction?.cost?.energy).toBe(2);
    });

    test('not available when sleeping', () => {
      const obs = createMockObservation({
        self: { ...createMockObservation().self, state: 'sleeping', energy: 10 },
      });
      const actions = buildAvailableActions(obs);
      const workAction = actions.find((a) => a.type === 'work');

      expect(workAction).toBeUndefined();
    });

    test('not available when energy < 2', () => {
      const obs = createMockObservation({
        self: { ...createMockObservation().self, state: 'idle', energy: 1 },
      });
      const actions = buildAvailableActions(obs);
      const workAction = actions.find((a) => a.type === 'work');

      expect(workAction).toBeUndefined();
    });
  });

  describe('trade action', () => {
    test('available when nearby agents within range and has inventory', () => {
      const obs = createMockObservation({
        self: { ...createMockObservation().self, x: 50, y: 50 },
        nearbyAgents: [{ id: 'agent-12345678', x: 52, y: 50, state: 'idle' }],
        inventory: [{ type: 'food', quantity: 1 }],
      });
      const actions = buildAvailableActions(obs);
      const tradeAction = actions.find((a) => a.type === 'trade');

      expect(tradeAction).toBeDefined();
      expect(tradeAction?.description).toContain('agent-12');
    });

    test('not available when no inventory', () => {
      const obs = createMockObservation({
        self: { ...createMockObservation().self, x: 50, y: 50 },
        nearbyAgents: [{ id: 'agent-12345678', x: 52, y: 50, state: 'idle' }],
        inventory: [],
      });
      const actions = buildAvailableActions(obs);
      const tradeAction = actions.find((a) => a.type === 'trade');

      expect(tradeAction).toBeUndefined();
    });

    test('not available when agents too far', () => {
      const obs = createMockObservation({
        self: { ...createMockObservation().self, x: 50, y: 50 },
        nearbyAgents: [{ id: 'agent-12345678', x: 60, y: 50, state: 'idle' }], // 10 tiles away
        inventory: [{ type: 'food', quantity: 1 }],
      });
      const actions = buildAvailableActions(obs);
      const tradeAction = actions.find((a) => a.type === 'trade');

      expect(tradeAction).toBeUndefined();
    });
  });

  describe('harm action', () => {
    test('available when adjacent agent and has energy', () => {
      const obs = createMockObservation({
        self: { ...createMockObservation().self, x: 50, y: 50, energy: 10 },
        nearbyAgents: [{ id: 'agent-12345678', x: 51, y: 50, state: 'idle' }],
      });
      const actions = buildAvailableActions(obs);
      const harmAction = actions.find((a) => a.type === 'harm');

      expect(harmAction).toBeDefined();
      expect(harmAction?.cost?.energy).toBe(5);
    });

    test('not available when no adjacent agents', () => {
      const obs = createMockObservation({
        self: { ...createMockObservation().self, x: 50, y: 50, energy: 10 },
        nearbyAgents: [{ id: 'agent-12345678', x: 52, y: 50, state: 'idle' }], // 2 tiles away
      });
      const actions = buildAvailableActions(obs);
      const harmAction = actions.find((a) => a.type === 'harm');

      expect(harmAction).toBeUndefined();
    });

    test('not available when energy < 5', () => {
      const obs = createMockObservation({
        self: { ...createMockObservation().self, x: 50, y: 50, energy: 4 },
        nearbyAgents: [{ id: 'agent-12345678', x: 51, y: 50, state: 'idle' }],
      });
      const actions = buildAvailableActions(obs);
      const harmAction = actions.find((a) => a.type === 'harm');

      expect(harmAction).toBeUndefined();
    });
  });

  describe('steal action', () => {
    test('available when adjacent agent and enough energy', () => {
      const obs = createMockObservation({
        self: { ...createMockObservation().self, x: 50, y: 50, energy: 10 },
        nearbyAgents: [{ id: 'agent-12345678', x: 51, y: 50, state: 'idle' }],
      });
      const actions = buildAvailableActions(obs);
      const stealAction = actions.find((a) => a.type === 'steal');

      expect(stealAction).toBeDefined();
      expect(stealAction?.cost?.energy).toBe(8);
    });

    test('not available when energy < 8', () => {
      const obs = createMockObservation({
        self: { ...createMockObservation().self, x: 50, y: 50, energy: 7 },
        nearbyAgents: [{ id: 'agent-12345678', x: 51, y: 50, state: 'idle' }],
      });
      const actions = buildAvailableActions(obs);
      const stealAction = actions.find((a) => a.type === 'steal');

      expect(stealAction).toBeUndefined();
    });
  });

  describe('claim and name_location actions', () => {
    test('claim is always available', () => {
      const obs = createMockObservation();
      const actions = buildAvailableActions(obs);
      const claimAction = actions.find((a) => a.type === 'claim');

      expect(claimAction).toBeDefined();
    });

    test('name_location is always available', () => {
      const obs = createMockObservation();
      const actions = buildAvailableActions(obs);
      const nameAction = actions.find((a) => a.type === 'name_location');

      expect(nameAction).toBeDefined();
    });
  });
});
