/**
 * Tests for LLM Adapters
 *
 * Tests cover:
 * - Adapter registry (getAdapter, getAllAdapters)
 * - Adapter interface compliance
 * - isAvailable checks for each adapter type
 * - Adapter type and method properties
 */

import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { getAdapter, getAllAdapters } from '../../llm';
import type { LLMType, LLMAdapter, LLMMethod } from '../../llm/types';

// =============================================================================
// Adapter Registry Tests
// =============================================================================

describe('Adapter Registry', () => {
  describe('getAdapter', () => {
    const validTypes: LLMType[] = ['claude', 'codex', 'gemini', 'deepseek', 'qwen', 'glm', 'grok'];

    test.each(validTypes)('returns adapter for type: %s', (type) => {
      const adapter = getAdapter(type);

      expect(adapter).toBeDefined();
      expect(adapter?.type).toBe(type);
    });

    test('returns undefined for unknown type', () => {
      const adapter = getAdapter('unknown' as LLMType);
      expect(adapter).toBeUndefined();
    });

    test('returns undefined for external type (no default adapter)', () => {
      const adapter = getAdapter('external');
      expect(adapter).toBeUndefined();
    });
  });

  describe('getAllAdapters', () => {
    test('returns array of adapters', () => {
      const adapters = getAllAdapters();

      expect(Array.isArray(adapters)).toBe(true);
      expect(adapters.length).toBeGreaterThan(0);
    });

    test('returns at least 7 adapters (all LLM types)', () => {
      const adapters = getAllAdapters();

      // claude, codex, gemini, deepseek, qwen, glm, grok = 7
      expect(adapters.length).toBeGreaterThanOrEqual(7);
    });

    test('all adapters have required interface', () => {
      const adapters = getAllAdapters();

      for (const adapter of adapters) {
        expect(adapter.type).toBeDefined();
        expect(adapter.method).toBeDefined();
        expect(adapter.name).toBeDefined();
        expect(typeof adapter.isAvailable).toBe('function');
        expect(typeof adapter.decide).toBe('function');
      }
    });
  });
});

// =============================================================================
// Adapter Interface Tests
// =============================================================================

describe('Adapter Interface Compliance', () => {
  describe('Claude adapter', () => {
    test('has correct type and method', () => {
      const adapter = getAdapter('claude');

      expect(adapter?.type).toBe('claude');
      expect(adapter?.method).toBe('api');
      expect(adapter?.name).toContain('Claude');
    });
  });

  describe('Codex (OpenAI) adapter', () => {
    test('has correct type and method', () => {
      const adapter = getAdapter('codex');

      expect(adapter?.type).toBe('codex');
      expect(adapter?.method).toBe('api');
      expect(adapter?.name).toContain('GPT');
    });
  });

  describe('Gemini adapter', () => {
    test('has correct type and method', () => {
      const adapter = getAdapter('gemini');

      expect(adapter?.type).toBe('gemini');
      expect(adapter?.method).toBe('api');
      expect(adapter?.name).toContain('Gemini');
    });
  });

  describe('DeepSeek adapter', () => {
    test('has correct type and method', () => {
      const adapter = getAdapter('deepseek');

      expect(adapter?.type).toBe('deepseek');
      expect(adapter?.method).toBe('api');
      expect(adapter?.name).toContain('DeepSeek');
    });
  });

  describe('Qwen adapter', () => {
    test('has correct type and method', () => {
      const adapter = getAdapter('qwen');

      expect(adapter?.type).toBe('qwen');
      expect(adapter?.method).toBe('api');
      expect(adapter?.name).toContain('Qwen');
    });
  });

  describe('GLM adapter', () => {
    test('has correct type and method', () => {
      const adapter = getAdapter('glm');

      expect(adapter?.type).toBe('glm');
      expect(adapter?.method).toBe('api');
      expect(adapter?.name).toContain('GLM');
    });
  });

  describe('Grok adapter', () => {
    test('has correct type and method', () => {
      const adapter = getAdapter('grok');

      expect(adapter?.type).toBe('grok');
      expect(adapter?.method).toBe('api');
      expect(adapter?.name).toContain('Grok');
    });
  });
});

// =============================================================================
// isAvailable Tests
// =============================================================================

describe('Adapter Availability', () => {
  // Store original env vars
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Claude adapter availability', () => {
    test('returns true when ANTHROPIC_API_KEY is set', async () => {
      process.env.ANTHROPIC_API_KEY = 'test-key';
      const adapter = getAdapter('claude');

      const available = await adapter?.isAvailable();
      expect(available).toBe(true);
    });

    test('returns false when ANTHROPIC_API_KEY is not set', async () => {
      delete process.env.ANTHROPIC_API_KEY;
      const adapter = getAdapter('claude');

      const available = await adapter?.isAvailable();
      expect(available).toBe(false);
    });
  });

  describe('OpenAI (Codex) adapter availability', () => {
    test('returns true when OPENAI_API_KEY is set', async () => {
      process.env.OPENAI_API_KEY = 'test-key';
      const adapter = getAdapter('codex');

      const available = await adapter?.isAvailable();
      expect(available).toBe(true);
    });

    test('returns false when OPENAI_API_KEY is not set', async () => {
      delete process.env.OPENAI_API_KEY;
      const adapter = getAdapter('codex');

      const available = await adapter?.isAvailable();
      expect(available).toBe(false);
    });
  });

  describe('Gemini adapter availability', () => {
    test('returns true when GOOGLE_AI_API_KEY is set', async () => {
      process.env.GOOGLE_AI_API_KEY = 'test-key';
      const adapter = getAdapter('gemini');

      const available = await adapter?.isAvailable();
      expect(available).toBe(true);
    });

    test('returns false when GOOGLE_AI_API_KEY is not set', async () => {
      delete process.env.GOOGLE_AI_API_KEY;
      const adapter = getAdapter('gemini');

      const available = await adapter?.isAvailable();
      expect(available).toBe(false);
    });
  });

  describe('DeepSeek adapter availability', () => {
    test('returns true when DEEPSEEK_API_KEY is set', async () => {
      process.env.DEEPSEEK_API_KEY = 'test-key';
      const adapter = getAdapter('deepseek');

      const available = await adapter?.isAvailable();
      expect(available).toBe(true);
    });
  });

  describe('Qwen adapter availability', () => {
    test('returns true when DASHSCOPE_API_KEY is set', async () => {
      process.env.DASHSCOPE_API_KEY = 'test-key';
      const adapter = getAdapter('qwen');

      const available = await adapter?.isAvailable();
      expect(available).toBe(true);
    });
  });

  describe('GLM adapter availability', () => {
    test('returns true when ZHIPU_API_KEY is set', async () => {
      process.env.ZHIPU_API_KEY = 'test-key';
      const adapter = getAdapter('glm');

      const available = await adapter?.isAvailable();
      expect(available).toBe(true);
    });
  });

  describe('Grok adapter availability', () => {
    test('returns true when XAI_API_KEY is set', async () => {
      process.env.XAI_API_KEY = 'test-key';
      const adapter = getAdapter('grok');

      const available = await adapter?.isAvailable();
      expect(available).toBe(true);
    });
  });
});

// =============================================================================
// Adapter Type Constants Tests
// =============================================================================

describe('LLM Type Constants', () => {
  test('LLM method is either cli or api', () => {
    const adapters = getAllAdapters();
    const validMethods: LLMMethod[] = ['cli', 'api'];

    for (const adapter of adapters) {
      expect(validMethods).toContain(adapter.method);
    }
  });

  test('all adapters currently use api method', () => {
    const adapters = getAllAdapters();

    for (const adapter of adapters) {
      expect(adapter.method).toBe('api');
    }
  });

  test('adapter names are descriptive', () => {
    const adapters = getAllAdapters();

    for (const adapter of adapters) {
      expect(adapter.name.length).toBeGreaterThan(3);
      expect(adapter.name).toMatch(/[A-Z]/); // Has at least one capital letter
    }
  });
});

// =============================================================================
// Adapter Decision Interface Tests
// =============================================================================

describe('Adapter Decision Interface', () => {
  test('decide method exists on all adapters', () => {
    const adapters = getAllAdapters();

    for (const adapter of adapters) {
      expect(typeof adapter.decide).toBe('function');
    }
  });

  test('decide method is async', () => {
    const adapters = getAllAdapters();

    for (const adapter of adapters) {
      // The decide method should be async (returns a promise)
      expect(adapter.decide.constructor.name).toBe('AsyncFunction');
    }
  });
});
