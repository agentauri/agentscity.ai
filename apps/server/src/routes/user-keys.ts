/**
 * User LLM Keys Routes
 *
 * Handles secure storage and retrieval of user LLM API keys.
 *
 * Endpoints:
 * - GET /api/user/llm-keys - List all keys (metadata only, no secrets)
 * - POST /api/user/llm-keys - Save a new key (encrypted at rest)
 * - DELETE /api/user/llm-keys/:provider - Delete a key
 * - POST /api/user/llm-keys/:provider/validate - Validate key with provider
 *
 * All endpoints require JWT authentication.
 */

import type { FastifyInstance } from 'fastify';
import { getLlmKeyService, type LlmProvider } from '../services/llm-key-service';
import { requireJwtAuth, type AuthenticatedRequest } from '../middleware/jwt-auth';
import { z } from 'zod';

// =============================================================================
// Request Schemas
// =============================================================================

const VALID_PROVIDERS: LlmProvider[] = [
  'anthropic',
  'openai',
  'google',
  'deepseek',
  'qwen',
  'glm',
  'grok',
];

const saveKeySchema = z.object({
  provider: z.enum(VALID_PROVIDERS as [LlmProvider, ...LlmProvider[]]),
  apiKey: z.string().min(10, 'API key too short'),
});

const providerParamSchema = z.object({
  provider: z.enum(VALID_PROVIDERS as [LlmProvider, ...LlmProvider[]]),
});

// =============================================================================
// Response Types
// =============================================================================

interface KeyListItem {
  id: string;
  provider: LlmProvider;
  keyPrefix: string | null;
  lastUsed: string | null;
  lastValidated: string | null;
  isValid: boolean;
  createdAt: string | null;
}

interface KeyListResponse {
  keys: KeyListItem[];
}

interface SaveKeyResponse {
  success: boolean;
  key: KeyListItem;
}

interface DeleteKeyResponse {
  success: boolean;
  provider: string;
}

interface ValidateKeyResponse {
  success: boolean;
  isValid: boolean;
  provider: string;
}

interface ErrorResponse {
  error: string;
  message: string;
}

// =============================================================================
// Route Registration
// =============================================================================

export async function registerUserKeysRoutes(server: FastifyInstance): Promise<void> {
  /**
   * GET /api/user/llm-keys
   *
   * List all LLM API keys for the authenticated user.
   * Returns metadata only (no secrets).
   */
  server.get<{
    Reply: KeyListResponse | ErrorResponse;
  }>(
    '/api/user/llm-keys',
    {
      preHandler: [requireJwtAuth],
    },
    async (request, reply) => {
      try {
        const { user } = request as AuthenticatedRequest;
        const llmKeyService = getLlmKeyService();

        const keys = await llmKeyService.listKeys(user.id);

        return reply.send({
          keys: keys.map((key) => ({
            id: key.id,
            provider: key.provider,
            keyPrefix: key.keyPrefix,
            lastUsed: key.lastUsed?.toISOString() || null,
            lastValidated: key.lastValidated?.toISOString() || null,
            isValid: key.isValid,
            createdAt: key.createdAt?.toISOString() || null,
          })),
        });
      } catch (error) {
        return reply.code(500).send({
          error: 'Server Error',
          message: 'Failed to list API keys',
        });
      }
    }
  );

  /**
   * POST /api/user/llm-keys
   *
   * Save a new LLM API key for the authenticated user.
   * The key is encrypted before storage.
   */
  server.post<{
    Body: z.infer<typeof saveKeySchema>;
    Reply: SaveKeyResponse | ErrorResponse;
  }>(
    '/api/user/llm-keys',
    {
      preHandler: [requireJwtAuth],
    },
    async (request, reply) => {
      try {
        // Validate request body
        const validation = saveKeySchema.safeParse(request.body);
        if (!validation.success) {
          return reply.code(400).send({
            error: 'Validation Error',
            message: validation.error.errors[0].message,
          });
        }

        const { provider, apiKey } = validation.data;
        const { user } = request as AuthenticatedRequest;
        const llmKeyService = getLlmKeyService();

        const key = await llmKeyService.saveKey({
          userId: user.id,
          provider,
          apiKey,
        });

        return reply.code(201).send({
          success: true,
          key: {
            id: key.id,
            provider: key.provider,
            keyPrefix: key.keyPrefix,
            lastUsed: key.lastUsed?.toISOString() || null,
            lastValidated: key.lastValidated?.toISOString() || null,
            isValid: key.isValid,
            createdAt: key.createdAt?.toISOString() || null,
          },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to save API key';

        // Check for specific validation errors
        if (message.includes('Invalid') || message.includes('format')) {
          return reply.code(400).send({
            error: 'Validation Error',
            message,
          });
        }

        return reply.code(500).send({
          error: 'Server Error',
          message,
        });
      }
    }
  );

  /**
   * DELETE /api/user/llm-keys/:provider
   *
   * Delete an LLM API key for the authenticated user.
   */
  server.delete<{
    Params: z.infer<typeof providerParamSchema>;
    Reply: DeleteKeyResponse | ErrorResponse;
  }>(
    '/api/user/llm-keys/:provider',
    {
      preHandler: [requireJwtAuth],
    },
    async (request, reply) => {
      try {
        // Validate params
        const validation = providerParamSchema.safeParse(request.params);
        if (!validation.success) {
          return reply.code(400).send({
            error: 'Validation Error',
            message: 'Invalid provider',
          });
        }

        const { provider } = validation.data;
        const { user } = request as AuthenticatedRequest;
        const llmKeyService = getLlmKeyService();

        const deleted = await llmKeyService.deleteKey(user.id, provider);

        if (!deleted) {
          return reply.code(404).send({
            error: 'Not Found',
            message: `No API key found for provider: ${provider}`,
          });
        }

        return reply.send({
          success: true,
          provider,
        });
      } catch (error) {
        return reply.code(500).send({
          error: 'Server Error',
          message: 'Failed to delete API key',
        });
      }
    }
  );

  /**
   * POST /api/user/llm-keys/:provider/validate
   *
   * Validate an API key by making a test call to the provider.
   */
  server.post<{
    Params: z.infer<typeof providerParamSchema>;
    Reply: ValidateKeyResponse | ErrorResponse;
  }>(
    '/api/user/llm-keys/:provider/validate',
    {
      preHandler: [requireJwtAuth],
    },
    async (request, reply) => {
      try {
        // Validate params
        const validation = providerParamSchema.safeParse(request.params);
        if (!validation.success) {
          return reply.code(400).send({
            error: 'Validation Error',
            message: 'Invalid provider',
          });
        }

        const { provider } = validation.data;
        const { user } = request as AuthenticatedRequest;
        const llmKeyService = getLlmKeyService();

        // Check if key exists
        const hasKey = await llmKeyService.hasKey(user.id, provider);
        if (!hasKey) {
          return reply.code(404).send({
            error: 'Not Found',
            message: `No API key found for provider: ${provider}`,
          });
        }

        const isValid = await llmKeyService.validateKeyWithProvider(user.id, provider);

        return reply.send({
          success: true,
          isValid,
          provider,
        });
      } catch (error) {
        return reply.code(500).send({
          error: 'Server Error',
          message: 'Failed to validate API key',
        });
      }
    }
  );

  /**
   * GET /api/user/llm-keys/providers
   *
   * Get list of supported LLM providers.
   */
  server.get<{
    Reply: { providers: LlmProvider[] };
  }>('/api/user/llm-keys/providers', async (request, reply) => {
    return reply.send({
      providers: VALID_PROVIDERS,
    });
  });
}
