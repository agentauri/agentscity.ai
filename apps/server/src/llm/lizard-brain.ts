/**
 * Lizard Brain - Heuristic decision system for survival actions
 *
 * The "Lizard Brain" handles immediate survival needs without LLM calls:
 * - Critical hunger → find/consume food
 * - Critical energy → sleep
 * - Low balance → work
 * - No urgent needs → explore
 *
 * The "Wizard Brain" (LLM) is reserved for:
 * - Social interactions (trade, share_info, harm, steal)
 * - Strategic decisions when stable
 * - Complex multi-step planning
 *
 * This reduces LLM API calls by ~70-90% while maintaining emergent behavior
 * for social interactions where LLM reasoning matters most.
 */

import type { AgentDecision, AgentObservation } from './types';
import { getFallbackDecision } from './response-parser';

// =============================================================================
// Thresholds
// =============================================================================

/** Critical thresholds - below these, agent is in survival mode */
const CRITICAL_HUNGER = 40;
const CRITICAL_ENERGY = 30;
const CRITICAL_HEALTH = 30;

/** Stable thresholds - above these, agent can consider social actions */
const STABLE_HUNGER = 60;
const STABLE_ENERGY = 50;
const STABLE_BALANCE = 30;

/** Distance threshold for "nearby" agents (Manhattan distance) */
const SOCIAL_DISTANCE = 5;

// =============================================================================
// Types
// =============================================================================

export interface LizardBrainResult {
  /** Whether Lizard Brain handled this decision */
  handled: boolean;
  /** The decision if handled, null if should use Wizard Brain */
  decision: AgentDecision | null;
  /** Reason for the decision */
  reason: 'survival_critical' | 'no_social_opportunity' | 'wizard_brain_needed';
}

// =============================================================================
// Core Logic
// =============================================================================

/**
 * Determine if agent is in survival-critical state
 */
function isSurvivalCritical(obs: AgentObservation): boolean {
  return (
    obs.self.hunger < CRITICAL_HUNGER ||
    obs.self.energy < CRITICAL_ENERGY ||
    obs.self.health < CRITICAL_HEALTH
  );
}

/**
 * Determine if agent is in stable state (can consider social actions)
 */
function isStable(obs: AgentObservation): boolean {
  return (
    obs.self.hunger >= STABLE_HUNGER &&
    obs.self.energy >= STABLE_ENERGY &&
    obs.self.balance >= STABLE_BALANCE &&
    obs.self.health >= 50
  );
}

/**
 * Check if there are nearby agents for social interaction
 */
function hasSocialOpportunity(obs: AgentObservation): boolean {
  if (!obs.nearbyAgents || obs.nearbyAgents.length === 0) {
    return false;
  }

  // Check if any agent is within social distance
  return obs.nearbyAgents.some((agent) => {
    const distance = Math.abs(agent.x - obs.self.x) + Math.abs(agent.y - obs.self.y);
    return distance <= SOCIAL_DISTANCE && distance > 0; // Exclude self
  });
}

/**
 * Generate survival decision using heuristics
 * Includes social context for employment and trading decisions
 */
function getSurvivalDecision(obs: AgentObservation): AgentDecision {
  return getFallbackDecision(
    obs.self.hunger,
    obs.self.energy,
    obs.self.balance,
    obs.self.x,
    obs.self.y,
    obs.inventory,
    obs.nearbyResourceSpawns,
    obs.nearbyShelters,
    // Social context (Phase 1.2)
    obs.nearbyJobOffers,
    obs.activeEmployments,
    obs.nearbyAgents
  );
}

// =============================================================================
// Main Entry Point
// =============================================================================

/**
 * Attempt to make a decision using Lizard Brain (heuristics)
 *
 * Returns:
 * - { handled: true, decision: AgentDecision } if Lizard Brain can handle it
 * - { handled: false, decision: null } if Wizard Brain (LLM) is needed
 */
export function tryLizardBrain(obs: AgentObservation): LizardBrainResult {
  // Case 1: Survival critical - always use Lizard Brain
  if (isSurvivalCritical(obs)) {
    return {
      handled: true,
      decision: getSurvivalDecision(obs),
      reason: 'survival_critical',
    };
  }

  // Case 2: No social opportunity - use Lizard Brain for efficiency
  if (!hasSocialOpportunity(obs)) {
    // But only if not in a particularly stable state where strategic thinking helps
    if (!isStable(obs)) {
      return {
        handled: true,
        decision: getSurvivalDecision(obs),
        reason: 'no_social_opportunity',
      };
    }
  }

  // Case 3: Agent is stable AND has social opportunities - use Wizard Brain
  return {
    handled: false,
    decision: null,
    reason: 'wizard_brain_needed',
  };
}

/**
 * Check if Lizard Brain would handle this observation
 * (for statistics/logging without generating a decision)
 */
export function wouldUseLizardBrain(obs: AgentObservation): boolean {
  return isSurvivalCritical(obs) || (!hasSocialOpportunity(obs) && !isStable(obs));
}

// =============================================================================
// Statistics
// =============================================================================

/** Counters for tracking Lizard Brain usage */
let lizardBrainCount = 0;
let wizardBrainCount = 0;

export function recordLizardBrain(): void {
  lizardBrainCount++;
}

export function recordWizardBrain(): void {
  wizardBrainCount++;
}

export function getLizardBrainStats(): {
  lizardBrain: number;
  wizardBrain: number;
  lizardBrainRate: number;
} {
  const total = lizardBrainCount + wizardBrainCount;
  return {
    lizardBrain: lizardBrainCount,
    wizardBrain: wizardBrainCount,
    lizardBrainRate: total > 0 ? lizardBrainCount / total : 0,
  };
}

export function resetLizardBrainStats(): void {
  lizardBrainCount = 0;
  wizardBrainCount = 0;
}
