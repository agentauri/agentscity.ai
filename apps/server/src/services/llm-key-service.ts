/**
 * LLM Key Service
 *
 * Handles secure storage and retrieval of user LLM API keys.
 *
 * Security features:
 * - Keys encrypted at rest with AES-256-GCM
 * - Context binding (userId + provider) prevents key reuse
 * - Keys are never logged or exposed in responses
 * - Only masked versions (sk-...abc) shown to users
 */

import { eq, and } from 'drizzle-orm';
import { db } from '../db';
import { userLlmKeys, type EncryptedKeyData } from '../db/schema';
import {
  ApiKeyEncryption,
  createEncryptionContext,
  maskApiKey,
  type EncryptedData,
} from '../crypto/key-encryption';

// =============================================================================
// Types
// =============================================================================

export type LlmProvider = 'anthropic' | 'openai' | 'google' | 'deepseek' | 'qwen' | 'glm' | 'grok';

export interface UserLlmKey {
  id: string;
  provider: LlmProvider;
  keyPrefix: string | null;
  lastUsed: Date | null;
  lastValidated: Date | null;
  isValid: boolean;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface SaveKeyInput {
  userId: string;
  provider: LlmProvider;
  apiKey: string;
}

// =============================================================================
// LLM Key Service Class
// =============================================================================

export class LlmKeyService {
  private encryption: ApiKeyEncryption;

  constructor(masterKeyHex?: string) {
    const masterKey = masterKeyHex || process.env.ENCRYPTION_MASTER_KEY;
    if (!masterKey) {
      throw new Error('ENCRYPTION_MASTER_KEY environment variable is required');
    }
    this.encryption = new ApiKeyEncryption(masterKey);
  }

  // ===========================================================================
  // Save Key
  // ===========================================================================

  /**
   * Save an LLM API key for a user.
   * The key is encrypted before storage and never logged.
   *
   * @throws Error if encryption fails
   */
  async saveKey(input: SaveKeyInput): Promise<UserLlmKey> {
    const { userId, provider, apiKey } = input;

    // Validate key format (basic check)
    this.validateKeyFormat(provider, apiKey);

    // Create context for encryption (binds key to user + provider)
    const context = createEncryptionContext(userId, provider);

    // Encrypt the API key
    const encryptedKey = this.encryption.encrypt(apiKey, context);

    // Get masked prefix for display
    const keyPrefix = maskApiKey(apiKey);

    // Upsert the key (update if exists, insert if not)
    const [result] = await db
      .insert(userLlmKeys)
      .values({
        userId,
        provider,
        encryptedKey: encryptedKey as EncryptedKeyData,
        keyPrefix,
        isValid: true,
        lastValidated: new Date(),
      })
      .onConflictDoUpdate({
        target: [userLlmKeys.userId, userLlmKeys.provider],
        set: {
          encryptedKey: encryptedKey as EncryptedKeyData,
          keyPrefix,
          isValid: true,
          lastValidated: new Date(),
          updatedAt: new Date(),
        },
      })
      .returning();

    return this.toUserLlmKey(result);
  }

  // ===========================================================================
  // Get Key (Decrypted)
  // ===========================================================================

  /**
   * Get a decrypted API key for a user.
   * This should only be called when actually making LLM API calls.
   *
   * @returns Decrypted API key or null if not found
   * @throws Error if decryption fails (tampered data)
   */
  async getDecryptedKey(userId: string, provider: LlmProvider): Promise<string | null> {
    const row = await db.query.userLlmKeys.findFirst({
      where: and(eq(userLlmKeys.userId, userId), eq(userLlmKeys.provider, provider)),
    });

    if (!row) {
      return null;
    }

    // Create context for decryption (must match encryption context)
    const context = createEncryptionContext(userId, provider);

    // Decrypt the key
    const decryptedKey = this.encryption.decrypt(row.encryptedKey as EncryptedData, context);

    // Update last used timestamp
    await db
      .update(userLlmKeys)
      .set({ lastUsed: new Date() })
      .where(eq(userLlmKeys.id, row.id));

    return decryptedKey;
  }

  // ===========================================================================
  // List Keys (Metadata Only)
  // ===========================================================================

  /**
   * List all API keys for a user (metadata only, no decryption).
   * Safe to expose to frontend.
   */
  async listKeys(userId: string): Promise<UserLlmKey[]> {
    const rows = await db.query.userLlmKeys.findMany({
      where: eq(userLlmKeys.userId, userId),
    });

    return rows.map((row) => this.toUserLlmKey(row));
  }

  // ===========================================================================
  // Check Key Exists
  // ===========================================================================

  /**
   * Check if a user has a key for a specific provider.
   */
  async hasKey(userId: string, provider: LlmProvider): Promise<boolean> {
    const row = await db.query.userLlmKeys.findFirst({
      where: and(eq(userLlmKeys.userId, userId), eq(userLlmKeys.provider, provider)),
      columns: { id: true },
    });

    return !!row;
  }

  // ===========================================================================
  // Delete Key
  // ===========================================================================

  /**
   * Delete an API key for a user.
   */
  async deleteKey(userId: string, provider: LlmProvider): Promise<boolean> {
    const result = await db
      .delete(userLlmKeys)
      .where(and(eq(userLlmKeys.userId, userId), eq(userLlmKeys.provider, provider)))
      .returning({ id: userLlmKeys.id });

    return result.length > 0;
  }

  // ===========================================================================
  // Mark Key Invalid
  // ===========================================================================

  /**
   * Mark a key as invalid (e.g., after failed API call due to invalid key).
   */
  async markKeyInvalid(userId: string, provider: LlmProvider): Promise<void> {
    await db
      .update(userLlmKeys)
      .set({ isValid: false, updatedAt: new Date() })
      .where(and(eq(userLlmKeys.userId, userId), eq(userLlmKeys.provider, provider)));
  }

  // ===========================================================================
  // Validate Key with Provider
  // ===========================================================================

  /**
   * Validate a key by making a test API call to the provider.
   * Updates the validation status in the database.
   *
   * @returns true if key is valid, false otherwise
   */
  async validateKeyWithProvider(userId: string, provider: LlmProvider): Promise<boolean> {
    const apiKey = await this.getDecryptedKey(userId, provider);
    if (!apiKey) {
      return false;
    }

    const isValid = await this.testProviderKey(provider, apiKey);

    await db
      .update(userLlmKeys)
      .set({
        isValid,
        lastValidated: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(userLlmKeys.userId, userId), eq(userLlmKeys.provider, provider)));

    return isValid;
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  private validateKeyFormat(provider: LlmProvider, apiKey: string): void {
    if (!apiKey || apiKey.trim().length === 0) {
      throw new Error('API key cannot be empty');
    }

    // Basic format validation per provider
    switch (provider) {
      case 'anthropic':
        if (!apiKey.startsWith('sk-ant-')) {
          throw new Error('Invalid Anthropic API key format (should start with sk-ant-)');
        }
        break;
      case 'openai':
        if (!apiKey.startsWith('sk-')) {
          throw new Error('Invalid OpenAI API key format (should start with sk-)');
        }
        break;
      case 'google':
        // Google API keys have various formats
        if (apiKey.length < 20) {
          throw new Error('Invalid Google API key format');
        }
        break;
      case 'deepseek':
        if (!apiKey.startsWith('sk-')) {
          throw new Error('Invalid DeepSeek API key format (should start with sk-)');
        }
        break;
      // Other providers - minimal validation
      default:
        if (apiKey.length < 10) {
          throw new Error('API key too short');
        }
    }
  }

  private async testProviderKey(provider: LlmProvider, apiKey: string): Promise<boolean> {
    try {
      switch (provider) {
        case 'anthropic':
          return await this.testAnthropicKey(apiKey);
        case 'openai':
          return await this.testOpenAIKey(apiKey);
        case 'google':
          return await this.testGoogleKey(apiKey);
        default:
          // For other providers, assume valid if format is correct
          return true;
      }
    } catch {
      return false;
    }
  }

  private async testAnthropicKey(apiKey: string): Promise<boolean> {
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-3-haiku-20240307',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'Hi' }],
        }),
      });

      // 200 = valid key, 401 = invalid key, other errors might be rate limits etc.
      return response.status === 200 || response.status === 429;
    } catch {
      return false;
    }
  }

  private async testOpenAIKey(apiKey: string): Promise<boolean> {
    try {
      const response = await fetch('https://api.openai.com/v1/models', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      });

      return response.status === 200;
    } catch {
      return false;
    }
  }

  private async testGoogleKey(apiKey: string): Promise<boolean> {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
        {
          method: 'GET',
        }
      );

      return response.status === 200;
    } catch {
      return false;
    }
  }

  private toUserLlmKey(row: typeof userLlmKeys.$inferSelect): UserLlmKey {
    return {
      id: row.id,
      provider: row.provider as LlmProvider,
      keyPrefix: row.keyPrefix,
      lastUsed: row.lastUsed,
      lastValidated: row.lastValidated,
      isValid: row.isValid ?? true,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let llmKeyServiceInstance: LlmKeyService | null = null;

/**
 * Get the singleton LlmKeyService instance.
 * Lazily initialized to allow ENCRYPTION_MASTER_KEY to be set after module load.
 */
export function getLlmKeyService(): LlmKeyService {
  if (!llmKeyServiceInstance) {
    llmKeyServiceInstance = new LlmKeyService();
  }
  return llmKeyServiceInstance;
}
