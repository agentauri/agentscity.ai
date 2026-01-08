/**
 * LLM API Keys Routes
 *
 * Manages API keys for LLM providers.
 * - GET /api/llm/keys/status - Get status of all providers (masked keys only)
 * - POST /api/llm/keys - Set user-provided API keys
 * - POST /api/llm/keys/disable - Disable specific providers
 * - POST /api/llm/keys/enable - Enable specific providers
 */

import type { FastifyInstance } from 'fastify';
import type { LLMType } from '../llm/types';
import { LLM_PROVIDERS, type LLMProviderInfo } from '../llm/providers';
import {
  getAllProvidersStatus,
  hasAnyAvailableKey,
  setRuntimeKeys,
  setKeyDisabled,
  setDisabledKeys,
  clearRuntimeKey,
} from '../llm/key-manager';

// =============================================================================
// Types
// =============================================================================

// Frontend-expected status shape
interface ProviderKeyStatusForFrontend {
  type: LLMType;
  source: 'env' | 'user' | 'none';
  disabled: boolean;
  maskedKey?: string;
}

interface KeysStatusResponse {
  providers: LLMProviderInfo[];
  status: Record<LLMType, ProviderKeyStatusForFrontend>;
  hasAnyKey: boolean;
}

function buildStatusResponse(): KeysStatusResponse {
  const providerStatuses = getAllProvidersStatus();
  const status: Record<string, ProviderKeyStatusForFrontend> = {};

  for (const ps of providerStatuses) {
    status[ps.type] = {
      type: ps.type,
      source: ps.source,
      disabled: ps.isDisabled,
      maskedKey: ps.maskedKey,
    };
  }

  return {
    providers: LLM_PROVIDERS,
    status: status as Record<LLMType, ProviderKeyStatusForFrontend>,
    hasAnyKey: hasAnyAvailableKey(),
  };
}

interface SetKeysRequest {
  keys: Record<string, string>; // LLMType -> API key
}

interface DisableKeysRequest {
  types: LLMType[];
}

interface EnableKeysRequest {
  types: LLMType[];
}

interface ClearKeyRequest {
  type: LLMType;
}

// =============================================================================
// Routes
// =============================================================================

export async function registerLLMKeysRoutes(server: FastifyInstance): Promise<void> {
  /**
   * GET /api/llm/keys/status
   *
   * Returns the status of all LLM providers.
   * Never returns full API keys, only masked versions.
   */
  server.get<{
    Reply: KeysStatusResponse;
  }>('/api/llm/keys/status', async (_request, reply) => {
    return reply.send(buildStatusResponse());
  });

  /**
   * POST /api/llm/keys
   *
   * Set user-provided API keys.
   * Keys are stored in runtime memory (lost on restart).
   * Frontend should re-sync from localStorage on page load.
   */
  server.post<{
    Body: SetKeysRequest;
    Reply: KeysStatusResponse;
  }>('/api/llm/keys', async (request, reply) => {
    const { keys } = request.body || {};

    if (keys && typeof keys === 'object') {
      setRuntimeKeys(keys);
    }

    return reply.send(buildStatusResponse());
  });

  /**
   * POST /api/llm/keys/disable
   *
   * Disable specific providers.
   * Disabled providers won't be used even if keys exist.
   */
  server.post<{
    Body: DisableKeysRequest;
    Reply: KeysStatusResponse;
  }>('/api/llm/keys/disable', async (request, reply) => {
    const { types } = request.body || {};

    if (Array.isArray(types)) {
      for (const type of types) {
        setKeyDisabled(type, true);
      }
    }

    return reply.send(buildStatusResponse());
  });

  /**
   * POST /api/llm/keys/enable
   *
   * Re-enable specific providers.
   */
  server.post<{
    Body: EnableKeysRequest;
    Reply: KeysStatusResponse;
  }>('/api/llm/keys/enable', async (request, reply) => {
    const { types } = request.body || {};

    if (Array.isArray(types)) {
      for (const type of types) {
        setKeyDisabled(type, false);
      }
    }

    return reply.send(buildStatusResponse());
  });

  /**
   * POST /api/llm/keys/clear
   *
   * Clear a user-provided API key for a specific provider.
   * Does not affect environment variable keys.
   */
  server.post<{
    Body: ClearKeyRequest;
    Reply: KeysStatusResponse;
  }>('/api/llm/keys/clear', async (request, reply) => {
    const { type } = request.body || {};

    if (type) {
      clearRuntimeKey(type);
    }

    return reply.send(buildStatusResponse());
  });

  /**
   * POST /api/llm/keys/sync
   *
   * Bulk sync from frontend.
   * Sets both keys and disabled status in one request.
   * Used on page load to restore state from localStorage.
   */
  server.post<{
    Body: {
      keys?: Record<string, string>;
      disabled?: LLMType[];
    };
    Reply: KeysStatusResponse;
  }>('/api/llm/keys/sync', async (request, reply) => {
    const { keys, disabled } = request.body || {};

    if (keys && typeof keys === 'object') {
      setRuntimeKeys(keys);
    }

    if (Array.isArray(disabled)) {
      setDisabledKeys(disabled);
    }

    return reply.send(buildStatusResponse());
  });
}
