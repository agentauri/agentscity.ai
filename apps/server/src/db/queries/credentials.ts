/**
 * Credential Queries - Phase 4: Verifiable Credentials (§34)
 */

import { db } from '../index';
import { agentCredentials, type NewAgentCredential, type AgentCredential } from '../schema';
import { eq, and, desc, isNull, or, gt } from 'drizzle-orm';

/**
 * Create a new credential
 */
export async function createCredential(credential: NewAgentCredential): Promise<AgentCredential> {
  const [result] = await db.insert(agentCredentials).values(credential).returning();
  return result;
}

/**
 * Get credential by ID
 */
export async function getCredentialById(id: string): Promise<AgentCredential | undefined> {
  const [credential] = await db
    .select()
    .from(agentCredentials)
    .where(eq(agentCredentials.id, id))
    .limit(1);
  return credential;
}

/**
 * Get all credentials issued by an agent
 */
export async function getCredentialsIssuedBy(issuerId: string): Promise<AgentCredential[]> {
  return db
    .select()
    .from(agentCredentials)
    .where(eq(agentCredentials.issuerId, issuerId))
    .orderBy(desc(agentCredentials.tick));
}

/**
 * Get all credentials received by an agent (subject)
 */
export async function getCredentialsReceivedBy(subjectId: string): Promise<AgentCredential[]> {
  return db
    .select()
    .from(agentCredentials)
    .where(eq(agentCredentials.subjectId, subjectId))
    .orderBy(desc(agentCredentials.tick));
}

/**
 * Get active (non-revoked, non-expired) credentials for an agent
 */
export async function getActiveCredentials(subjectId: string, currentTick: number): Promise<AgentCredential[]> {
  return db
    .select()
    .from(agentCredentials)
    .where(
      and(
        eq(agentCredentials.subjectId, subjectId),
        eq(agentCredentials.revoked, false),
        or(
          isNull(agentCredentials.expiresAtTick),
          gt(agentCredentials.expiresAtTick, currentTick)
        )
      )
    )
    .orderBy(desc(agentCredentials.tick));
}

/**
 * Get credentials by claim type
 */
export async function getCredentialsByType(
  subjectId: string,
  claimType: string
): Promise<AgentCredential[]> {
  return db
    .select()
    .from(agentCredentials)
    .where(
      and(
        eq(agentCredentials.subjectId, subjectId),
        eq(agentCredentials.claimType, claimType),
        eq(agentCredentials.revoked, false)
      )
    )
    .orderBy(desc(agentCredentials.tick));
}

/**
 * Revoke a credential
 */
export async function revokeCredential(
  credentialId: string,
  issuerId: string,
  currentTick: number
): Promise<{ success: boolean; error?: string }> {
  // First verify the issuer owns this credential
  const [credential] = await db
    .select()
    .from(agentCredentials)
    .where(
      and(
        eq(agentCredentials.id, credentialId),
        eq(agentCredentials.issuerId, issuerId)
      )
    )
    .limit(1);

  if (!credential) {
    return { success: false, error: 'Credential not found or not owned by issuer' };
  }

  if (credential.revoked) {
    return { success: false, error: 'Credential already revoked' };
  }

  await db
    .update(agentCredentials)
    .set({
      revoked: true,
      revokedAtTick: currentTick,
      updatedAt: new Date(),
    })
    .where(eq(agentCredentials.id, credentialId));

  return { success: true };
}

/**
 * Verify a credential signature
 */
export function verifyCredentialSignature(
  credential: AgentCredential,
  computedSignature: string
): boolean {
  return credential.issuerSignature === computedSignature;
}

/**
 * Get credential statistics for an agent
 */
export async function getCredentialStats(agentId: string): Promise<{
  issued: number;
  received: number;
  revoked: number;
}> {
  const issued = await db
    .select()
    .from(agentCredentials)
    .where(eq(agentCredentials.issuerId, agentId));

  const received = await db
    .select()
    .from(agentCredentials)
    .where(eq(agentCredentials.subjectId, agentId));

  const revoked = await db
    .select()
    .from(agentCredentials)
    .where(
      and(
        eq(agentCredentials.issuerId, agentId),
        eq(agentCredentials.revoked, true)
      )
    );

  return {
    issued: issued.length,
    received: received.length,
    revoked: revoked.length,
  };
}
