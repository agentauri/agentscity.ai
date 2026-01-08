/**
 * System Prompt API Routes
 *
 * Manages custom system prompts for LLM agents.
 * - GET /api/prompt/current - Get current prompt status
 * - POST /api/prompt - Set custom prompt
 * - POST /api/prompt/clear - Clear custom prompt (use default)
 * - POST /api/prompt/sync - Sync from frontend localStorage
 */

import type { FastifyInstance } from 'fastify';
import {
  getCustomSystemPrompt,
  setCustomSystemPrompt,
  clearCustomPrompt,
  hasCustomPrompt,
  getDefaultSystemPrompt,
  getPlaceholderInfo,
  validatePrompt,
} from '../llm/prompt-manager';

// =============================================================================
// Types
// =============================================================================

interface PromptStatusResponse {
  customPrompt: string | null;
  defaultPrompt: string;
  isCustom: boolean;
  placeholders: Array<{
    key: string;
    description: string;
    example: string;
  }>;
}

interface SetPromptRequest {
  prompt: string;
}

interface SyncPromptRequest {
  prompt: string | null;
}

interface PromptResponse {
  success: boolean;
  error?: string;
  status: PromptStatusResponse;
}

// =============================================================================
// Helper Functions
// =============================================================================

function buildStatusResponse(): PromptStatusResponse {
  return {
    customPrompt: getCustomSystemPrompt(),
    defaultPrompt: getDefaultSystemPrompt(),
    isCustom: hasCustomPrompt(),
    placeholders: getPlaceholderInfo(),
  };
}

// =============================================================================
// Routes
// =============================================================================

export async function registerPromptRoutes(server: FastifyInstance): Promise<void> {
  /**
   * GET /api/prompt/current
   *
   * Returns the current prompt status including custom prompt, default, and placeholders.
   */
  server.get<{
    Reply: PromptStatusResponse;
  }>('/api/prompt/current', async (_request, reply) => {
    return reply.send(buildStatusResponse());
  });

  /**
   * POST /api/prompt
   *
   * Set a custom system prompt.
   * Validates the prompt before setting.
   */
  server.post<{
    Body: SetPromptRequest;
    Reply: PromptResponse;
  }>('/api/prompt', async (request, reply) => {
    const { prompt } = request.body || {};

    if (!prompt) {
      return reply.status(400).send({
        success: false,
        error: 'Prompt is required',
        status: buildStatusResponse(),
      });
    }

    // Validate prompt
    const validationError = validatePrompt(prompt);
    if (validationError && !validationError.startsWith('Warning:')) {
      return reply.status(400).send({
        success: false,
        error: validationError,
        status: buildStatusResponse(),
      });
    }

    // Set the custom prompt
    setCustomSystemPrompt(prompt);

    return reply.send({
      success: true,
      error: validationError ?? undefined, // Include warning if any
      status: buildStatusResponse(),
    });
  });

  /**
   * POST /api/prompt/clear
   *
   * Clear the custom prompt and revert to default.
   */
  server.post<{
    Reply: PromptResponse;
  }>('/api/prompt/clear', async (_request, reply) => {
    clearCustomPrompt();

    return reply.send({
      success: true,
      status: buildStatusResponse(),
    });
  });

  /**
   * POST /api/prompt/sync
   *
   * Bulk sync from frontend localStorage.
   * Used on page load to restore custom prompt state.
   */
  server.post<{
    Body: SyncPromptRequest;
    Reply: PromptResponse;
  }>('/api/prompt/sync', async (request, reply) => {
    const { prompt } = request.body || {};

    if (prompt === null || prompt === undefined) {
      // Clear if null/undefined
      clearCustomPrompt();
    } else if (typeof prompt === 'string' && prompt.trim() !== '') {
      // Validate before setting
      const validationError = validatePrompt(prompt);
      if (validationError && !validationError.startsWith('Warning:')) {
        // Invalid prompt from localStorage - clear it
        clearCustomPrompt();
        return reply.send({
          success: false,
          error: `Invalid prompt from localStorage: ${validationError}`,
          status: buildStatusResponse(),
        });
      }
      setCustomSystemPrompt(prompt);
    } else {
      clearCustomPrompt();
    }

    return reply.send({
      success: true,
      status: buildStatusResponse(),
    });
  });
}
