/**
 * Prompt Inspector API Routes
 *
 * Phase 2: Live Inspector - API for viewing prompt logs
 *
 * Endpoints:
 * - GET /api/prompt/inspector/status - Check if logging is enabled
 * - GET /api/prompt/inspector/:agentId - Get prompt logs for an agent
 * - GET /api/prompt/inspector/:agentId/current - Get most recent prompt log
 * - GET /api/prompt/inspector/:agentId/tick/:tick - Get prompt log for specific tick
 * - GET /api/prompt/inspector/:agentId/timeline - Get timeline summaries
 * - GET /api/prompt/inspector/tick/:tick - Get all agents' prompts for a tick
 */

import type { FastifyInstance } from 'fastify';
import { CONFIG } from '../config';
import {
  isPromptLoggingEnabled,
  getPromptLogs,
  getCurrentPromptLog,
  getPromptLogByTick,
  getPromptLogSummaries,
  getPromptLogsByTick,
  getPromptLogCount,
  hasAnyPromptLogs,
} from '../llm/prompt-logger';
import type { PromptLog } from '../db/schema';

// =============================================================================
// Types
// =============================================================================

interface InspectorStatusResponse {
  enabled: boolean;
  hasData: boolean;
  config: {
    maxLogsPerAgent: number;
    retentionTicks: number;
  };
}

interface PromptLogResponse {
  success: boolean;
  data: PromptLog | null;
  error?: string;
}

interface PromptLogsResponse {
  success: boolean;
  data: PromptLog[];
  total: number;
  error?: string;
}

interface TimelineSummary {
  id: number;
  agentId: string;
  tick: number;
  llmType: string;
  action: string | null;
  processingTimeMs: number | null;
  usedFallback: boolean;
  usedCache: boolean;
  createdAt: Date;
}

interface TimelineResponse {
  success: boolean;
  data: TimelineSummary[];
  error?: string;
}

// =============================================================================
// Routes
// =============================================================================

export async function registerPromptInspectorRoutes(server: FastifyInstance): Promise<void> {
  /**
   * GET /api/prompt/inspector/status
   *
   * Returns whether prompt logging is enabled and has any data.
   */
  server.get<{
    Reply: InspectorStatusResponse;
  }>('/api/prompt/inspector/status', async (_request, reply) => {
    const enabled = isPromptLoggingEnabled();
    let hasData = false;

    if (enabled) {
      hasData = await hasAnyPromptLogs();
    }

    return reply.send({
      enabled,
      hasData,
      config: {
        maxLogsPerAgent: CONFIG.promptInspector.maxLogsPerAgent,
        retentionTicks: CONFIG.promptInspector.retentionTicks,
      },
    });
  });

  /**
   * GET /api/prompt/inspector/:agentId
   *
   * Get prompt logs for a specific agent.
   * Query params: limit (default 50), offset (default 0)
   */
  server.get<{
    Params: { agentId: string };
    Querystring: { limit?: string; offset?: string };
    Reply: PromptLogsResponse;
  }>('/api/prompt/inspector/:agentId', async (request, reply) => {
    if (!isPromptLoggingEnabled()) {
      return reply.status(503).send({
        success: false,
        data: [],
        total: 0,
        error: 'Prompt logging is disabled. Set PROMPT_LOGGING_ENABLED=true to enable.',
      });
    }

    const { agentId } = request.params;
    const limit = Math.min(parseInt(request.query.limit ?? '50', 10) || 50, 100);
    const offset = parseInt(request.query.offset ?? '0', 10) || 0;

    try {
      const [logs, total] = await Promise.all([
        getPromptLogs(agentId, limit, offset),
        getPromptLogCount(agentId),
      ]);

      return reply.send({
        success: true,
        data: logs,
        total,
      });
    } catch (error) {
      console.error('[PromptInspectorAPI] Error fetching logs:', error);
      return reply.status(500).send({
        success: false,
        data: [],
        total: 0,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  });

  /**
   * GET /api/prompt/inspector/:agentId/current
   *
   * Get the most recent prompt log for an agent.
   */
  server.get<{
    Params: { agentId: string };
    Reply: PromptLogResponse;
  }>('/api/prompt/inspector/:agentId/current', async (request, reply) => {
    if (!isPromptLoggingEnabled()) {
      return reply.status(503).send({
        success: false,
        data: null,
        error: 'Prompt logging is disabled. Set PROMPT_LOGGING_ENABLED=true to enable.',
      });
    }

    const { agentId } = request.params;

    try {
      const log = await getCurrentPromptLog(agentId);

      return reply.send({
        success: true,
        data: log,
      });
    } catch (error) {
      console.error('[PromptInspectorAPI] Error fetching current log:', error);
      return reply.status(500).send({
        success: false,
        data: null,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  });

  /**
   * GET /api/prompt/inspector/:agentId/tick/:tick
   *
   * Get prompt log for a specific agent at a specific tick.
   */
  server.get<{
    Params: { agentId: string; tick: string };
    Reply: PromptLogResponse;
  }>('/api/prompt/inspector/:agentId/tick/:tick', async (request, reply) => {
    if (!isPromptLoggingEnabled()) {
      return reply.status(503).send({
        success: false,
        data: null,
        error: 'Prompt logging is disabled. Set PROMPT_LOGGING_ENABLED=true to enable.',
      });
    }

    const { agentId, tick: tickStr } = request.params;
    const tick = parseInt(tickStr, 10);

    if (isNaN(tick)) {
      return reply.status(400).send({
        success: false,
        data: null,
        error: 'Invalid tick number',
      });
    }

    try {
      const log = await getPromptLogByTick(agentId, tick);

      return reply.send({
        success: true,
        data: log,
      });
    } catch (error) {
      console.error('[PromptInspectorAPI] Error fetching log by tick:', error);
      return reply.status(500).send({
        success: false,
        data: null,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  });

  /**
   * GET /api/prompt/inspector/:agentId/timeline
   *
   * Get lightweight timeline summaries for an agent.
   * Query params: limit (default 50)
   */
  server.get<{
    Params: { agentId: string };
    Querystring: { limit?: string };
    Reply: TimelineResponse;
  }>('/api/prompt/inspector/:agentId/timeline', async (request, reply) => {
    if (!isPromptLoggingEnabled()) {
      return reply.status(503).send({
        success: false,
        data: [],
        error: 'Prompt logging is disabled. Set PROMPT_LOGGING_ENABLED=true to enable.',
      });
    }

    const { agentId } = request.params;
    const limit = Math.min(parseInt(request.query.limit ?? '50', 10) || 50, 100);

    try {
      const summaries = await getPromptLogSummaries(agentId, limit);

      return reply.send({
        success: true,
        data: summaries,
      });
    } catch (error) {
      console.error('[PromptInspectorAPI] Error fetching timeline:', error);
      return reply.status(500).send({
        success: false,
        data: [],
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  });

  /**
   * GET /api/prompt/inspector/tick/:tick
   *
   * Get all agents' prompt logs for a specific tick.
   */
  server.get<{
    Params: { tick: string };
    Reply: PromptLogsResponse;
  }>('/api/prompt/inspector/tick/:tick', async (request, reply) => {
    if (!isPromptLoggingEnabled()) {
      return reply.status(503).send({
        success: false,
        data: [],
        total: 0,
        error: 'Prompt logging is disabled. Set PROMPT_LOGGING_ENABLED=true to enable.',
      });
    }

    const { tick: tickStr } = request.params;
    const tick = parseInt(tickStr, 10);

    if (isNaN(tick)) {
      return reply.status(400).send({
        success: false,
        data: [],
        total: 0,
        error: 'Invalid tick number',
      });
    }

    try {
      const logs = await getPromptLogsByTick(tick);

      return reply.send({
        success: true,
        data: logs,
        total: logs.length,
      });
    } catch (error) {
      console.error('[PromptInspectorAPI] Error fetching logs by tick:', error);
      return reply.status(500).send({
        success: false,
        data: [],
        total: 0,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  });
}
