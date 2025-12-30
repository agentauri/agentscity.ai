/**
 * Revoke Credential Action Handler - Phase 4: Verifiable Credentials (§34)
 *
 * Allows issuers to revoke previously issued credentials.
 * Only the original issuer can revoke a credential.
 */

import { v4 as uuid } from 'uuid';
import type { ActionIntent, ActionResult, RevokeCredentialParams } from '../types';
import type { Agent } from '../../db/schema';
import { revokeCredential, getCredentialById } from '../../db/queries/credentials';
import { storeMemory } from '../../db/queries/memories';

export async function handleRevokeCredential(
  intent: ActionIntent<RevokeCredentialParams>,
  agent: Agent
): Promise<ActionResult> {
  const { credentialId } = intent.params;

  // Validate credential ID
  if (!credentialId) {
    return {
      success: false,
      error: 'Credential ID is required',
    };
  }

  // Get the credential to verify ownership and get subject ID
  const credential = await getCredentialById(credentialId);
  if (!credential) {
    return {
      success: false,
      error: 'Credential not found',
    };
  }

  // Verify issuer is the one revoking
  if (credential.issuerId !== agent.id) {
    return {
      success: false,
      error: 'Only the issuer can revoke a credential',
    };
  }

  // Attempt to revoke
  const result = await revokeCredential(credentialId, agent.id, intent.tick);

  if (!result.success) {
    return {
      success: false,
      error: result.error,
    };
  }

  // Store memory for issuer
  await storeMemory({
    agentId: agent.id,
    type: 'action',
    content: `Revoked a ${credential.claimType} credential previously issued to another agent`,
    importance: 5,
    emotionalValence: -0.2,
    involvedAgentIds: [credential.subjectId],
    x: agent.x,
    y: agent.y,
    tick: intent.tick,
  });

  // Store memory for subject
  await storeMemory({
    agentId: credential.subjectId,
    type: 'interaction',
    content: `A ${credential.claimType} credential was revoked by its issuer`,
    importance: 6,
    emotionalValence: -0.4,
    involvedAgentIds: [agent.id],
    x: agent.x,
    y: agent.y,
    tick: intent.tick,
  });

  return {
    success: true,
    events: [
      {
        id: uuid(),
        type: 'credential_revoked',
        tick: intent.tick,
        timestamp: Date.now(),
        agentId: agent.id,
        payload: {
          credentialId,
          issuerId: agent.id,
          subjectId: credential.subjectId,
          claimType: credential.claimType,
          position: { x: agent.x, y: agent.y },
        },
      },
    ],
  };
}
