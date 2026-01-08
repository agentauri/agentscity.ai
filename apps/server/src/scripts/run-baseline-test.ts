/**
 * Run Baseline Experiment Test
 *
 * Runs a short baseline experiment in TEST_MODE to verify:
 * 1. Experiment starts with correct seed
 * 2. Random walk decisions are deterministic
 * 3. Results can be compared
 *
 * Usage:
 *   TEST_MODE=true bun run src/scripts/run-baseline-test.ts
 */

import { initializeRNG, resetRNG, random, getCurrentSeed } from '../utils/random';
import { getRandomWalkDecision } from '../llm/random-walk';
import type { Agent } from '../db/schema';

// =============================================================================
// Mock Agent Data
// =============================================================================

function createMockAgent(id: number): Agent {
  return {
    id: `agent-${id}`,
    llmType: 'claude',
    x: 50,
    y: 50,
    hunger: 80,
    energy: 70,
    health: 100,
    balance: 100,
    state: 'idle',
    color: '#ff0000',
    createdAt: new Date(),
    updatedAt: new Date(),
    diedAt: null,
    tenantId: null,
    personality: null,
  };
}

function createMockObservation(agent: Agent) {
  return {
    self: {
      id: agent.id,
      x: agent.x,
      y: agent.y,
      hunger: agent.hunger,
      energy: agent.energy,
      health: agent.health,
      balance: agent.balance,
      state: agent.state,
    },
    inventory: [],
    nearbyAgents: [],
    nearbyResources: [
      { x: 51, y: 50, resourceType: 'food', currentAmount: 10, maxAmount: 10 },
      { x: 49, y: 50, resourceType: 'energy', currentAmount: 5, maxAmount: 10 },
    ],
    nearbyShelters: [],
    nearbyLocations: [],
    nearbyResourceSpawns: [
      { id: 'res-1', x: 51, y: 50, resourceType: 'food', currentAmount: 10, maxAmount: 10 },
      { id: 'res-2', x: 49, y: 50, resourceType: 'energy', currentAmount: 5, maxAmount: 10 },
    ],
    availableActions: [],
    recentEvents: [],
    tick: 1,
    timestamp: Date.now(),
    worldSize: { width: 100, height: 100 },
  };
}

// =============================================================================
// Test: Random Walk Reproducibility
// =============================================================================

function testRandomWalkReproducibility(): boolean {
  console.log('\n[Test] Random Walk Decision Reproducibility');
  console.log('─'.repeat(50));

  const seed = '42001';
  const numDecisions = 20;

  // First run
  initializeRNG(seed);
  const decisions1: string[] = [];
  for (let i = 0; i < numDecisions; i++) {
    const agent = createMockAgent(i);
    const obs = createMockObservation(agent);
    const decision = getRandomWalkDecision(obs);
    decisions1.push(`${decision.action}-${JSON.stringify(decision.params)}`);
  }

  // Reset and second run
  resetRNG();
  initializeRNG(seed);
  const decisions2: string[] = [];
  for (let i = 0; i < numDecisions; i++) {
    const agent = createMockAgent(i);
    const obs = createMockObservation(agent);
    const decision = getRandomWalkDecision(obs);
    decisions2.push(`${decision.action}-${JSON.stringify(decision.params)}`);
  }

  // Compare
  let identical = true;
  for (let i = 0; i < numDecisions; i++) {
    if (decisions1[i] !== decisions2[i]) {
      console.log(`  ✗ Mismatch at decision ${i}:`);
      console.log(`    Run 1: ${decisions1[i]}`);
      console.log(`    Run 2: ${decisions2[i]}`);
      identical = false;
      break;
    }
  }

  if (identical) {
    console.log(`  ✓ ${numDecisions} random walk decisions identical`);
    console.log(`    Sample decisions:`);
    for (let i = 0; i < 5; i++) {
      console.log(`      [${i}] ${decisions1[i]}`);
    }
  }

  resetRNG();
  return identical;
}

// =============================================================================
// Test: Multiple Agents Same Tick
// =============================================================================

function testMultiAgentTick(): boolean {
  console.log('\n[Test] Multi-Agent Tick Reproducibility');
  console.log('─'.repeat(50));

  const seed = '43001';
  const numAgents = 6;
  const numTicks = 5;

  interface TickResult {
    tick: number;
    decisions: { agentId: string; action: string }[];
  }

  function simulateTicks(): TickResult[] {
    const results: TickResult[] = [];
    const agents = Array.from({ length: numAgents }, (_, i) => createMockAgent(i));

    for (let tick = 0; tick < numTicks; tick++) {
      const tickDecisions: { agentId: string; action: string }[] = [];

      for (const agent of agents) {
        const obs = createMockObservation(agent);
        obs.tick = tick;
        const decision = getRandomWalkDecision(obs);
        tickDecisions.push({ agentId: agent.id, action: decision.action });
      }

      results.push({ tick, decisions: tickDecisions });
    }

    return results;
  }

  // First simulation
  initializeRNG(seed);
  const sim1 = simulateTicks();

  // Reset and second simulation
  resetRNG();
  initializeRNG(seed);
  const sim2 = simulateTicks();

  // Compare
  let identical = true;
  for (let t = 0; t < numTicks; t++) {
    for (let a = 0; a < numAgents; a++) {
      if (sim1[t].decisions[a].action !== sim2[t].decisions[a].action) {
        console.log(`  ✗ Mismatch at tick ${t}, agent ${a}`);
        identical = false;
        break;
      }
    }
    if (!identical) break;
  }

  if (identical) {
    console.log(`  ✓ ${numTicks} ticks × ${numAgents} agents = ${numTicks * numAgents} decisions identical`);
    console.log(`    Tick 0 decisions:`);
    for (const d of sim1[0].decisions) {
      console.log(`      ${d.agentId}: ${d.action}`);
    }
  }

  resetRNG();
  return identical;
}

// =============================================================================
// Test: Different Seeds Different Results
// =============================================================================

function testDifferentSeeds(): boolean {
  console.log('\n[Test] Different Seeds → Different Decisions');
  console.log('─'.repeat(50));

  const numDecisions = 10;

  // Seed 1
  initializeRNG('seed_A');
  const decisions1: string[] = [];
  for (let i = 0; i < numDecisions; i++) {
    const agent = createMockAgent(i);
    const obs = createMockObservation(agent);
    const decision = getRandomWalkDecision(obs);
    // Include params to capture direction differences
    decisions1.push(`${decision.action}-${JSON.stringify(decision.params)}`);
  }

  // Seed 2
  resetRNG();
  initializeRNG('seed_B');
  const decisions2: string[] = [];
  for (let i = 0; i < numDecisions; i++) {
    const agent = createMockAgent(i);
    const obs = createMockObservation(agent);
    const decision = getRandomWalkDecision(obs);
    decisions2.push(`${decision.action}-${JSON.stringify(decision.params)}`);
  }

  // Count differences
  let differences = 0;
  for (let i = 0; i < numDecisions; i++) {
    if (decisions1[i] !== decisions2[i]) {
      differences++;
    }
  }

  // At least some should differ (not all will differ since some actions are deterministic)
  const hasDifferences = differences > 0;

  if (hasDifferences) {
    console.log(`  ✓ ${differences}/${numDecisions} decisions differ between seeds`);
    console.log(`    Seed 'seed_A': [${decisions1.slice(0, 3).join(', ')}, ...]`);
    console.log(`    Seed 'seed_B': [${decisions2.slice(0, 3).join(', ')}, ...]`);
  } else {
    console.log(`  ✗ No differences between seeds (unexpected)`);
  }

  resetRNG();
  return hasDifferences;
}

// =============================================================================
// Main
// =============================================================================

function main() {
  console.log('========================================');
  console.log('  SimAgents Baseline Experiment Test');
  console.log('========================================');
  console.log(`  TEST_MODE: ${process.env.TEST_MODE || 'false'}`);

  const results: { name: string; passed: boolean }[] = [];

  results.push({
    name: 'Random Walk Reproducibility',
    passed: testRandomWalkReproducibility(),
  });

  results.push({
    name: 'Multi-Agent Tick Reproducibility',
    passed: testMultiAgentTick(),
  });

  results.push({
    name: 'Different Seeds → Different Results',
    passed: testDifferentSeeds(),
  });

  // Summary
  console.log('\n========================================');
  console.log('  Summary');
  console.log('========================================\n');

  const passed = results.filter((r) => r.passed).length;
  const total = results.length;

  for (const result of results) {
    const status = result.passed ? '✓ PASS' : '✗ FAIL';
    console.log(`  ${status}  ${result.name}`);
  }

  console.log(`\n  Total: ${passed}/${total} tests passed`);

  if (passed === total) {
    console.log('\n  🎉 Baseline experiment tests passed!');
    console.log('     Random walk decisions are deterministic.\n');
    process.exit(0);
  } else {
    console.log('\n  ⚠️  Some tests failed.\n');
    process.exit(1);
  }
}

main();
