/**
 * API Key Encryption Module
 *
 * Provides AES-256-GCM encryption with envelope encryption pattern for secure
 * storage of user API keys. Uses scrypt for key derivation with context binding.
 *
 * Security features:
 * - AES-256-GCM authenticated encryption
 * - Unique salt per encryption operation
 * - Context binding (userId + provider) prevents key reuse across contexts
 * - Additional Authenticated Data (AAD) for integrity
 * - Key versioning for future rotation support
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

const ALGORITHM = 'aes-256-gcm' as const;
const IV_LENGTH = 12; // GCM recommended IV length
const AUTH_TAG_LENGTH = 16; // GCM auth tag length
const SALT_LENGTH = 16;
const KEY_LENGTH = 32; // 256 bits

// scrypt parameters (memory-hard to resist GPU attacks)
const SCRYPT_PARAMS = {
  N: 16384, // CPU/memory cost parameter
  r: 8, // Block size
  p: 1, // Parallelization parameter
} as const;

/**
 * Encrypted data structure stored in database
 */
export interface EncryptedData {
  /** Base64 encoded ciphertext */
  ciphertext: string;
  /** Base64 encoded initialization vector */
  iv: string;
  /** Base64 encoded GCM authentication tag */
  authTag: string;
  /** Base64 encoded salt for key derivation */
  salt: string;
  /** Version number for future key rotation */
  version: number;
}

/**
 * API Key Encryption class using AES-256-GCM with envelope encryption.
 *
 * Each encryption operation derives a unique Data Encryption Key (DEK) from:
 * - Master key (from environment/KMS)
 * - Random salt (unique per encryption)
 * - Context string (binds encryption to specific user/provider)
 *
 * This ensures that even if two users store the same API key, the ciphertext
 * will be different, and keys cannot be moved between contexts.
 */
export class ApiKeyEncryption {
  private masterKey: Buffer;

  /**
   * Create a new ApiKeyEncryption instance
   * @param masterKeyHex - Master key as hex string (must be 64 hex chars = 256 bits)
   * @throws Error if master key is not 256 bits
   */
  constructor(masterKeyHex: string) {
    if (!masterKeyHex || typeof masterKeyHex !== 'string') {
      throw new Error('Master key is required');
    }

    // Remove any whitespace and validate hex format
    const cleanKey = masterKeyHex.trim().toLowerCase();
    if (!/^[0-9a-f]+$/.test(cleanKey)) {
      throw new Error('Master key must be a valid hex string');
    }

    this.masterKey = Buffer.from(cleanKey, 'hex');

    if (this.masterKey.length !== KEY_LENGTH) {
      throw new Error(
        `Master key must be ${KEY_LENGTH * 8} bits (${KEY_LENGTH * 2} hex characters), ` +
          `got ${this.masterKey.length * 8} bits`
      );
    }
  }

  /**
   * Derive a Data Encryption Key (DEK) from master key, salt, and context.
   * Uses scrypt which is memory-hard and resistant to GPU/ASIC attacks.
   */
  private deriveKey(salt: Buffer, context: string): Buffer {
    return scryptSync(
      Buffer.concat([this.masterKey, Buffer.from(context, 'utf8')]),
      salt,
      KEY_LENGTH,
      SCRYPT_PARAMS
    );
  }

  /**
   * Encrypt a plaintext API key.
   *
   * @param plaintext - The API key to encrypt
   * @param context - Context string for binding (e.g., "user:uuid:provider:anthropic")
   * @returns Encrypted data structure ready for database storage
   * @throws Error if encryption fails
   */
  encrypt(plaintext: string, context: string): EncryptedData {
    if (!plaintext || typeof plaintext !== 'string') {
      throw new Error('Plaintext is required');
    }
    if (!context || typeof context !== 'string') {
      throw new Error('Context is required');
    }

    // Generate unique salt for this encryption
    const salt = randomBytes(SALT_LENGTH);

    // Derive unique DEK for this encryption
    const dek = this.deriveKey(salt, context);

    // Generate random IV
    const iv = randomBytes(IV_LENGTH);

    // Create cipher
    const cipher = createCipheriv(ALGORITHM, dek, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });

    // Set Additional Authenticated Data (context is authenticated but not encrypted)
    cipher.setAAD(Buffer.from(context, 'utf8'));

    // Encrypt
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);

    // Get authentication tag
    const authTag = cipher.getAuthTag();

    return {
      ciphertext: encrypted.toString('base64'),
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64'),
      salt: salt.toString('base64'),
      version: 1,
    };
  }

  /**
   * Decrypt an encrypted API key.
   *
   * @param data - Encrypted data structure from database
   * @param context - Context string (must match the one used for encryption)
   * @returns Decrypted plaintext API key
   * @throws Error if decryption fails or context doesn't match
   */
  decrypt(data: EncryptedData, context: string): string {
    if (!data) {
      throw new Error('Encrypted data is required');
    }
    if (!context || typeof context !== 'string') {
      throw new Error('Context is required');
    }

    // Validate data structure
    if (!data.ciphertext || !data.iv || !data.authTag || !data.salt) {
      throw new Error('Invalid encrypted data structure');
    }

    // Check version for future migration support
    if (data.version !== 1) {
      throw new Error(`Unsupported encryption version: ${data.version}`);
    }

    try {
      // Decode from base64
      const salt = Buffer.from(data.salt, 'base64');
      const iv = Buffer.from(data.iv, 'base64');
      const authTag = Buffer.from(data.authTag, 'base64');
      const ciphertext = Buffer.from(data.ciphertext, 'base64');

      // Derive the same DEK
      const dek = this.deriveKey(salt, context);

      // Create decipher
      const decipher = createDecipheriv(ALGORITHM, dek, iv, {
        authTagLength: AUTH_TAG_LENGTH,
      });

      // Set AAD and auth tag
      decipher.setAAD(Buffer.from(context, 'utf8'));
      decipher.setAuthTag(authTag);

      // Decrypt
      const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

      return decrypted.toString('utf8');
    } catch (error) {
      // Don't leak information about why decryption failed
      throw new Error('Decryption failed: invalid data or context mismatch');
    }
  }

  /**
   * Verify that encrypted data can be decrypted with the given context.
   * Useful for validation without exposing the plaintext.
   *
   * @param data - Encrypted data structure
   * @param context - Context string to verify
   * @returns true if decryption succeeds, false otherwise
   */
  verify(data: EncryptedData, context: string): boolean {
    try {
      this.decrypt(data, context);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Create an encryption context string from user and provider.
 * This ensures keys are bound to a specific user and provider combination.
 *
 * @param userId - User UUID
 * @param provider - LLM provider name (e.g., 'anthropic', 'openai')
 * @returns Context string for encryption
 */
export function createEncryptionContext(userId: string, provider: string): string {
  if (!userId || !provider) {
    throw new Error('userId and provider are required for encryption context');
  }
  return `user:${userId}:provider:${provider}`;
}

/**
 * Mask an API key for display purposes.
 * Shows only the first 4 and last 4 characters.
 *
 * @param key - API key to mask
 * @returns Masked key (e.g., "sk-a...xyz")
 */
export function maskApiKey(key: string): string {
  if (!key || key.length < 8) {
    return '***';
  }
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

/**
 * Generate a random master key for development/testing.
 * In production, use a proper key management service (KMS, Vault, etc.)
 *
 * @returns 256-bit key as hex string
 */
export function generateMasterKey(): string {
  return randomBytes(KEY_LENGTH).toString('hex');
}
