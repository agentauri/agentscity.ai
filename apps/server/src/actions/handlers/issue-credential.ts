/**
 * Issue Credential Action Handler - Phase 4: Verifiable Credentials (§34)
 *
 * Enables agents to issue cryptographically-signed claims about other agents.
 * Creates decentralized attestation where agents can vouch for skills, experience,
 * or membership without any central authority.
 *
 * System imposes:
 * - Cryptographic signature (HMAC-SHA256)
 * - Energy cost
 * - Proximity requirement
 *
 * EMERGENT: Trust networks, credential chains, fraud detection.
 */

import { v4 as uuid } from 'uuid';
import { createHmac } from 'crypto';
import type { ActionIntent, ActionResult, IssueCredentialParams } from '../types';
import type { Agent } from '../../db/schema';
import { getAgentById } from '../../db/queries/agents';
import { storeMemory, updateRelationshipTrust } from '../../db/queries/memories';
import { createCredential } from '../../db/queries/credentials';
import { getDistance } from '../../world/grid';
import { CONFIG } from '../../config';

const VALID_CLAIM_TYPES = ['skill', 'experience', 'membership', 'character', 'custom'];

/**
 * Generate cryptographic signature for a credential
 */
function generateSignature(issuerId: string, subjectId: string, claimDescription: string, tick: number): string {
  const payload = `${issuerId}:${subjectId}:${claimDescription}:${tick}`;
  return createHmac('sha256', issuerId).update(payload).digest('hex');
}

export async function handleIssueCredential(
  intent: ActionIntent<IssueCredentialParams>,
  agent: Agent
): Promise<ActionResult> {
  const { subjectAgentId, claimType, description, evidence, level, expiresAtTick } = intent.params;

  // Validate claim type
  if (!VALID_CLAIM_TYPES.includes(claimType)) {
    return {
      success: false,
      error: `Invalid claim type. Must be one of: ${VALID_CLAIM_TYPES.join(', ')}`,
    };
  }

  // Cannot issue credential to self
  if (subjectAgentId === agent.id) {
    return {
      success: false,
      error: 'Cannot issue a credential to yourself',
    };
  }

  // Validate level if provided (1-10)
  if (level !== undefined && (level < 1 || level > 10)) {
    return {
      success: false,
      error: 'Credential level must be between 1 and 10',
    };
  }

  // Validate description length
  if (description.length < 5 || description.length > 500) {
    return {
      success: false,
      error: 'Description must be between 5 and 500 characters',
    };
  }

  // Get subject agent
  const subjectAgent = await getAgentById(subjectAgentId);
  if (!subjectAgent) {
    return {
      success: false,
      error: 'Subject agent not found',
    };
  }

  if (subjectAgent.state === 'dead') {
    return {
      success: false,
      error: 'Cannot issue credential to a dead agent',
    };
  }

  // Check proximity
  const distance = getDistance(
    { x: agent.x, y: agent.y },
    { x: subjectAgent.x, y: subjectAgent.y }
  );
  if (distance > CONFIG.actions.issueCredential.maxDistance) {
    return {
      success: false,
      error: `Subject agent is too far (distance: ${distance}, max: ${CONFIG.actions.issueCredential.maxDistance})`,
    };
  }

  // Check energy
  const energyCost = CONFIG.actions.issueCredential.energyCost;
  if (agent.energy < energyCost) {
    return {
      success: false,
      error: `Not enough energy (have: ${agent.energy}, need: ${energyCost})`,
    };
  }

  const newEnergy = Math.max(0, agent.energy - energyCost);

  // Generate cryptographic signature
  const signature = generateSignature(agent.id, subjectAgentId, description, intent.tick);

  // Create the credential
  const credentialId = uuid();
  await createCredential({
    id: credentialId,
    tick: intent.tick,
    issuerId: agent.id,
    issuerSignature: signature,
    subjectId: subjectAgentId,
    claimType,
    claimDescription: description,
    claimEvidence: evidence,
    claimLevel: level,
    expiresAtTick,
  });

  // Update trust - issuing a credential builds trust
  await updateRelationshipTrust(
    subjectAgentId,
    agent.id,
    CONFIG.actions.issueCredential.trustGainOnIssue,
    intent.tick,
    `Received ${claimType} credential: "${truncate(description, 50)}"`
  );

  // Store memory for issuer
  await storeMemory({
    agentId: agent.id,
    type: 'action',
    content: `Issued a ${claimType} credential to another agent: "${truncate(description, 80)}"`,
    importance: 6,
    emotionalValence: 0.3,
    involvedAgentIds: [subjectAgentId],
    x: agent.x,
    y: agent.y,
    tick: intent.tick,
  });

  // Store memory for subject
  await storeMemory({
    agentId: subjectAgentId,
    type: 'interaction',
    content: `Received a ${claimType} credential from another agent: "${truncate(description, 80)}"`,
    importance: 7,
    emotionalValence: 0.5,
    involvedAgentIds: [agent.id],
    x: subjectAgent.x,
    y: subjectAgent.y,
    tick: intent.tick,
  });

  return {
    success: true,
    changes: { energy: newEnergy },
    events: [
      {
        id: uuid(),
        type: 'credential_issued',
        tick: intent.tick,
        timestamp: Date.now(),
        agentId: agent.id,
        payload: {
          credentialId,
          issuerId: agent.id,
          subjectId: subjectAgentId,
          claimType,
          description: truncate(description, 100),
          level,
          signature: signature.substring(0, 16) + '...', // Truncated for event payload
          position: { x: agent.x, y: agent.y },
        },
      },
    ],
  };
}

/**
 * Truncate string for storage
 */
function truncate(str: string, maxLen: number): string {
  return str.length > maxLen ? str.slice(0, maxLen) + '...' : str;
}
