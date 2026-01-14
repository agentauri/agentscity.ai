/**
 * Unit Tests for API Key Encryption Module
 *
 * Tests cover:
 * - Basic encrypt/decrypt round-trip
 * - Context binding (different contexts produce different ciphertext)
 * - Tampering detection (modified ciphertext fails)
 * - Error handling (invalid inputs)
 * - Key masking
 * - Master key generation
 */

import { describe, expect, test } from 'bun:test';
import {
  ApiKeyEncryption,
  createEncryptionContext,
  maskApiKey,
  generateMasterKey,
  type EncryptedData,
} from '../../crypto/key-encryption';

// Test master key (64 hex chars = 256 bits)
const TEST_MASTER_KEY = 'a'.repeat(64);
const TEST_CONTEXT = 'user:test-user-id:provider:anthropic';

describe('ApiKeyEncryption', () => {
  describe('constructor', () => {
    test('accepts valid 256-bit hex key', () => {
      const encryption = new ApiKeyEncryption(TEST_MASTER_KEY);
      expect(encryption).toBeDefined();
    });

    test('accepts key with whitespace', () => {
      const keyWithSpaces = `  ${TEST_MASTER_KEY}  `;
      const encryption = new ApiKeyEncryption(keyWithSpaces);
      expect(encryption).toBeDefined();
    });

    test('rejects empty key', () => {
      expect(() => new ApiKeyEncryption('')).toThrow('Master key is required');
    });

    test('rejects null/undefined key', () => {
      expect(() => new ApiKeyEncryption(null as unknown as string)).toThrow('Master key is required');
      expect(() => new ApiKeyEncryption(undefined as unknown as string)).toThrow(
        'Master key is required'
      );
    });

    test('rejects invalid hex characters', () => {
      const invalidKey = 'g'.repeat(64); // 'g' is not valid hex
      expect(() => new ApiKeyEncryption(invalidKey)).toThrow('valid hex string');
    });

    test('rejects key with wrong length', () => {
      const shortKey = 'a'.repeat(32); // Only 128 bits
      expect(() => new ApiKeyEncryption(shortKey)).toThrow('256 bits');

      const longKey = 'a'.repeat(128); // 512 bits
      expect(() => new ApiKeyEncryption(longKey)).toThrow('256 bits');
    });
  });

  describe('encrypt', () => {
    test('encrypts plaintext and returns valid structure', () => {
      const encryption = new ApiKeyEncryption(TEST_MASTER_KEY);
      const plaintext = 'sk-test-api-key-12345';

      const result = encryption.encrypt(plaintext, TEST_CONTEXT);

      expect(result).toBeDefined();
      expect(result.ciphertext).toBeDefined();
      expect(result.iv).toBeDefined();
      expect(result.authTag).toBeDefined();
      expect(result.salt).toBeDefined();
      expect(result.version).toBe(1);
    });

    test('produces base64 encoded output', () => {
      const encryption = new ApiKeyEncryption(TEST_MASTER_KEY);
      const result = encryption.encrypt('test-key', TEST_CONTEXT);

      // All fields should be valid base64
      const base64Regex = /^[A-Za-z0-9+/]+=*$/;
      expect(result.ciphertext).toMatch(base64Regex);
      expect(result.iv).toMatch(base64Regex);
      expect(result.authTag).toMatch(base64Regex);
      expect(result.salt).toMatch(base64Regex);
    });

    test('produces unique ciphertext for same plaintext (different salt)', () => {
      const encryption = new ApiKeyEncryption(TEST_MASTER_KEY);
      const plaintext = 'sk-same-key';

      const result1 = encryption.encrypt(plaintext, TEST_CONTEXT);
      const result2 = encryption.encrypt(plaintext, TEST_CONTEXT);

      // Same plaintext should produce different ciphertext
      expect(result1.ciphertext).not.toBe(result2.ciphertext);
      expect(result1.iv).not.toBe(result2.iv);
      expect(result1.salt).not.toBe(result2.salt);
    });

    test('rejects empty plaintext', () => {
      const encryption = new ApiKeyEncryption(TEST_MASTER_KEY);
      expect(() => encryption.encrypt('', TEST_CONTEXT)).toThrow('Plaintext is required');
    });

    test('rejects empty context', () => {
      const encryption = new ApiKeyEncryption(TEST_MASTER_KEY);
      expect(() => encryption.encrypt('test-key', '')).toThrow('Context is required');
    });
  });

  describe('decrypt', () => {
    test('decrypts back to original plaintext', () => {
      const encryption = new ApiKeyEncryption(TEST_MASTER_KEY);
      const plaintext = 'sk-my-super-secret-api-key';

      const encrypted = encryption.encrypt(plaintext, TEST_CONTEXT);
      const decrypted = encryption.decrypt(encrypted, TEST_CONTEXT);

      expect(decrypted).toBe(plaintext);
    });

    test('decrypts various API key formats', () => {
      const encryption = new ApiKeyEncryption(TEST_MASTER_KEY);
      const testKeys = [
        'sk-proj-abc123',
        'anthropic-key-12345',
        'AIzaSyC-very-long-google-api-key-here',
        'simple',
        'key-with-special-chars-!@#$%',
        'unicode-key-日本語-中文',
      ];

      for (const key of testKeys) {
        const encrypted = encryption.encrypt(key, TEST_CONTEXT);
        const decrypted = encryption.decrypt(encrypted, TEST_CONTEXT);
        expect(decrypted).toBe(key);
      }
    });

    test('fails with wrong context', () => {
      const encryption = new ApiKeyEncryption(TEST_MASTER_KEY);
      const plaintext = 'sk-test-key';
      const context1 = 'user:user1:provider:openai';
      const context2 = 'user:user2:provider:openai'; // Different user

      const encrypted = encryption.encrypt(plaintext, context1);

      // Should fail to decrypt with different context
      expect(() => encryption.decrypt(encrypted, context2)).toThrow('Decryption failed');
    });

    test('fails with wrong master key', () => {
      const encryption1 = new ApiKeyEncryption(TEST_MASTER_KEY);
      const encryption2 = new ApiKeyEncryption('b'.repeat(64)); // Different key

      const plaintext = 'sk-test-key';
      const encrypted = encryption1.encrypt(plaintext, TEST_CONTEXT);

      // Should fail to decrypt with different master key
      expect(() => encryption2.decrypt(encrypted, TEST_CONTEXT)).toThrow('Decryption failed');
    });

    test('fails with tampered ciphertext', () => {
      const encryption = new ApiKeyEncryption(TEST_MASTER_KEY);
      const encrypted = encryption.encrypt('sk-test-key', TEST_CONTEXT);

      // Tamper with ciphertext
      const tampered: EncryptedData = {
        ...encrypted,
        ciphertext: Buffer.from('tampered-data').toString('base64'),
      };

      expect(() => encryption.decrypt(tampered, TEST_CONTEXT)).toThrow('Decryption failed');
    });

    test('fails with tampered auth tag', () => {
      const encryption = new ApiKeyEncryption(TEST_MASTER_KEY);
      const encrypted = encryption.encrypt('sk-test-key', TEST_CONTEXT);

      // Tamper with auth tag
      const tampered: EncryptedData = {
        ...encrypted,
        authTag: Buffer.from('wrong-tag-12345!').toString('base64'),
      };

      expect(() => encryption.decrypt(tampered, TEST_CONTEXT)).toThrow('Decryption failed');
    });

    test('fails with tampered IV', () => {
      const encryption = new ApiKeyEncryption(TEST_MASTER_KEY);
      const encrypted = encryption.encrypt('sk-test-key', TEST_CONTEXT);

      // Tamper with IV
      const tampered: EncryptedData = {
        ...encrypted,
        iv: Buffer.from('wrong-iv-123').toString('base64'),
      };

      expect(() => encryption.decrypt(tampered, TEST_CONTEXT)).toThrow('Decryption failed');
    });

    test('rejects invalid encrypted data structure', () => {
      const encryption = new ApiKeyEncryption(TEST_MASTER_KEY);

      expect(() => encryption.decrypt(null as unknown as EncryptedData, TEST_CONTEXT)).toThrow(
        'Encrypted data is required'
      );

      expect(() =>
        encryption.decrypt({ ciphertext: 'abc' } as EncryptedData, TEST_CONTEXT)
      ).toThrow('Invalid encrypted data structure');
    });

    test('rejects unsupported version', () => {
      const encryption = new ApiKeyEncryption(TEST_MASTER_KEY);
      const encrypted = encryption.encrypt('sk-test-key', TEST_CONTEXT);

      const futureVersion: EncryptedData = {
        ...encrypted,
        version: 99,
      };

      expect(() => encryption.decrypt(futureVersion, TEST_CONTEXT)).toThrow(
        'Unsupported encryption version'
      );
    });
  });

  describe('verify', () => {
    test('returns true for valid data and context', () => {
      const encryption = new ApiKeyEncryption(TEST_MASTER_KEY);
      const encrypted = encryption.encrypt('sk-test-key', TEST_CONTEXT);

      expect(encryption.verify(encrypted, TEST_CONTEXT)).toBe(true);
    });

    test('returns false for wrong context', () => {
      const encryption = new ApiKeyEncryption(TEST_MASTER_KEY);
      const encrypted = encryption.encrypt('sk-test-key', TEST_CONTEXT);

      expect(encryption.verify(encrypted, 'different-context')).toBe(false);
    });

    test('returns false for tampered data', () => {
      const encryption = new ApiKeyEncryption(TEST_MASTER_KEY);
      const encrypted = encryption.encrypt('sk-test-key', TEST_CONTEXT);

      const tampered: EncryptedData = {
        ...encrypted,
        ciphertext: 'tampered',
      };

      expect(encryption.verify(tampered, TEST_CONTEXT)).toBe(false);
    });
  });
});

describe('createEncryptionContext', () => {
  test('creates context from user and provider', () => {
    const context = createEncryptionContext('user-123', 'anthropic');
    expect(context).toBe('user:user-123:provider:anthropic');
  });

  test('handles UUID format', () => {
    const context = createEncryptionContext('550e8400-e29b-41d4-a716-446655440000', 'openai');
    expect(context).toBe('user:550e8400-e29b-41d4-a716-446655440000:provider:openai');
  });

  test('rejects empty userId', () => {
    expect(() => createEncryptionContext('', 'anthropic')).toThrow('userId and provider');
  });

  test('rejects empty provider', () => {
    expect(() => createEncryptionContext('user-123', '')).toThrow('userId and provider');
  });
});

describe('maskApiKey', () => {
  test('masks long key showing first 4 and last 4 chars', () => {
    expect(maskApiKey('sk-proj-abcdefghij123456')).toBe('sk-p...3456');
  });

  test('masks standard OpenAI key format', () => {
    expect(maskApiKey('sk-proj-abc123xyz789')).toBe('sk-p...z789');
  });

  test('returns *** for short keys', () => {
    expect(maskApiKey('short')).toBe('***');
    expect(maskApiKey('1234567')).toBe('***');
  });

  test('returns *** for empty/null', () => {
    expect(maskApiKey('')).toBe('***');
    expect(maskApiKey(null as unknown as string)).toBe('***');
    expect(maskApiKey(undefined as unknown as string)).toBe('***');
  });

  test('handles exactly 8 characters', () => {
    expect(maskApiKey('12345678')).toBe('1234...5678');
  });
});

describe('generateMasterKey', () => {
  test('generates 64 hex character key', () => {
    const key = generateMasterKey();
    expect(key).toHaveLength(64);
    expect(key).toMatch(/^[0-9a-f]+$/);
  });

  test('generates unique keys each time', () => {
    const key1 = generateMasterKey();
    const key2 = generateMasterKey();
    expect(key1).not.toBe(key2);
  });

  test('generated key works with ApiKeyEncryption', () => {
    const masterKey = generateMasterKey();
    const encryption = new ApiKeyEncryption(masterKey);

    const plaintext = 'test-api-key';
    const encrypted = encryption.encrypt(plaintext, TEST_CONTEXT);
    const decrypted = encryption.decrypt(encrypted, TEST_CONTEXT);

    expect(decrypted).toBe(plaintext);
  });
});

describe('Integration: Full encryption flow', () => {
  test('simulate real user API key storage flow', () => {
    const masterKey = generateMasterKey();
    const encryption = new ApiKeyEncryption(masterKey);

    // User 1 stores their Anthropic key
    const user1Id = 'user-uuid-1';
    const user1AnthropicKey = 'sk-ant-api03-abc123xyz';
    const user1Context = createEncryptionContext(user1Id, 'anthropic');

    const user1Encrypted = encryption.encrypt(user1AnthropicKey, user1Context);

    // User 2 stores their Anthropic key (same provider, different user)
    const user2Id = 'user-uuid-2';
    const user2AnthropicKey = 'sk-ant-api03-different-key';
    const user2Context = createEncryptionContext(user2Id, 'anthropic');

    const user2Encrypted = encryption.encrypt(user2AnthropicKey, user2Context);

    // Verify each user can decrypt only their own key
    expect(encryption.decrypt(user1Encrypted, user1Context)).toBe(user1AnthropicKey);
    expect(encryption.decrypt(user2Encrypted, user2Context)).toBe(user2AnthropicKey);

    // Verify cross-user decryption fails
    expect(() => encryption.decrypt(user1Encrypted, user2Context)).toThrow();
    expect(() => encryption.decrypt(user2Encrypted, user1Context)).toThrow();
  });

  test('simulate key rotation scenario', () => {
    const oldMasterKey = generateMasterKey();
    const newMasterKey = generateMasterKey();

    const oldEncryption = new ApiKeyEncryption(oldMasterKey);
    const newEncryption = new ApiKeyEncryption(newMasterKey);

    const apiKey = 'sk-important-key';
    const context = createEncryptionContext('user-123', 'openai');

    // Encrypt with old key
    const encryptedOld = oldEncryption.encrypt(apiKey, context);

    // Can decrypt with old key
    expect(oldEncryption.decrypt(encryptedOld, context)).toBe(apiKey);

    // Cannot decrypt with new key
    expect(() => newEncryption.decrypt(encryptedOld, context)).toThrow();

    // Re-encrypt with new key for rotation
    const decrypted = oldEncryption.decrypt(encryptedOld, context);
    const encryptedNew = newEncryption.encrypt(decrypted, context);

    // Now can decrypt with new key
    expect(newEncryption.decrypt(encryptedNew, context)).toBe(apiKey);
  });
});
