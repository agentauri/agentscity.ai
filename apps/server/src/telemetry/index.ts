/**
 * OpenTelemetry Instrumentation Setup
 *
 * This module initializes OpenTelemetry tracing for the AgentsCity server.
 * It MUST be imported before any other modules to ensure proper instrumentation.
 *
 * Features:
 * - Automatic HTTP/Fastify instrumentation
 * - Custom spans for tick engine cycles
 * - Custom spans for LLM calls with token tracking
 * - BullMQ job tracing
 * - Console exporter for dev, configurable OTLP endpoint for prod
 */

import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { ConsoleSpanExporter, BatchSpanProcessor, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-node';
import { Resource } from '@opentelemetry/resources';
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
  SEMRESATTRS_DEPLOYMENT_ENVIRONMENT,
} from '@opentelemetry/semantic-conventions';
import {
  trace,
  context,
  SpanKind,
  SpanStatusCode,
  type Span,
  type Tracer,
  type Context,
} from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';

// =============================================================================
// Configuration
// =============================================================================

export interface TelemetryConfig {
  /** Service name for tracing */
  serviceName: string;
  /** Service version */
  serviceVersion: string;
  /** Environment (development, staging, production) */
  environment: string;
  /** Whether telemetry is enabled */
  enabled: boolean;
  /** OTLP endpoint URL (null for console-only in dev) */
  otlpEndpoint: string | null;
  /** Whether to use console exporter */
  consoleExporter: boolean;
  /** Sampling ratio (0.0 to 1.0) */
  samplingRatio: number;
}

function getConfig(): TelemetryConfig {
  const env = process.env.NODE_ENV || 'development';
  const isDev = env === 'development';

  return {
    serviceName: process.env.OTEL_SERVICE_NAME || 'agentscity-server',
    serviceVersion: process.env.npm_package_version || '0.1.0',
    environment: env,
    enabled: process.env.OTEL_ENABLED !== 'false',
    otlpEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || null,
    consoleExporter: process.env.OTEL_CONSOLE_EXPORTER === 'true' || isDev,
    samplingRatio: parseFloat(process.env.OTEL_SAMPLING_RATIO || '1.0'),
  };
}

// =============================================================================
// SDK Initialization
// =============================================================================

let sdk: NodeSDK | null = null;
let isInitialized = false;

/**
 * Initialize OpenTelemetry SDK
 * Must be called before importing any other modules
 */
export function initTelemetry(): void {
  if (isInitialized) {
    console.log('[Telemetry] Already initialized, skipping');
    return;
  }

  const config = getConfig();

  if (!config.enabled) {
    console.log('[Telemetry] Disabled via OTEL_ENABLED=false');
    isInitialized = true;
    return;
  }

  console.log('[Telemetry] Initializing OpenTelemetry...');
  console.log(`[Telemetry] Service: ${config.serviceName}@${config.serviceVersion}`);
  console.log(`[Telemetry] Environment: ${config.environment}`);

  // Create resource with service information
  const resource = new Resource({
    [ATTR_SERVICE_NAME]: config.serviceName,
    [ATTR_SERVICE_VERSION]: config.serviceVersion,
    [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]: config.environment,
  });

  // Configure exporters
  const spanProcessors: Array<BatchSpanProcessor | SimpleSpanProcessor> = [];

  // Console exporter for development
  if (config.consoleExporter) {
    console.log('[Telemetry] Console exporter enabled');
    spanProcessors.push(new SimpleSpanProcessor(new ConsoleSpanExporter()));
  }

  // OTLP exporter for production
  if (config.otlpEndpoint) {
    console.log(`[Telemetry] OTLP exporter enabled: ${config.otlpEndpoint}`);
    const otlpExporter = new OTLPTraceExporter({
      url: `${config.otlpEndpoint}/v1/traces`,
    });
    spanProcessors.push(new BatchSpanProcessor(otlpExporter));
  }

  // Initialize SDK with auto-instrumentations
  sdk = new NodeSDK({
    resource,
    spanProcessors,
    instrumentations: [
      getNodeAutoInstrumentations({
        // Enable HTTP instrumentation for Fastify
        '@opentelemetry/instrumentation-http': {
          enabled: true,
        },
        // Enable Redis instrumentation for BullMQ
        '@opentelemetry/instrumentation-redis-4': {
          enabled: true,
        },
        '@opentelemetry/instrumentation-ioredis': {
          enabled: true,
        },
        // Enable PostgreSQL instrumentation
        '@opentelemetry/instrumentation-pg': {
          enabled: true,
        },
        // Disable noisy instrumentations
        '@opentelemetry/instrumentation-fs': {
          enabled: false,
        },
        '@opentelemetry/instrumentation-dns': {
          enabled: false,
        },
        '@opentelemetry/instrumentation-net': {
          enabled: false,
        },
      }),
    ],
    contextManager: new AsyncLocalStorageContextManager(),
  });

  // Start the SDK
  sdk.start();
  isInitialized = true;

  console.log('[Telemetry] OpenTelemetry initialized successfully');

  // Graceful shutdown
  const shutdown = async () => {
    console.log('[Telemetry] Shutting down...');
    try {
      await sdk?.shutdown();
      console.log('[Telemetry] Shutdown complete');
    } catch (err) {
      console.error('[Telemetry] Shutdown error:', err);
    }
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

// =============================================================================
// Tracer Access
// =============================================================================

const TRACER_NAME = 'agentscity';

/**
 * Get the tracer instance for creating custom spans
 */
export function getTracer(): Tracer {
  return trace.getTracer(TRACER_NAME);
}

/**
 * Get current active span (if any)
 */
export function getCurrentSpan(): Span | undefined {
  return trace.getActiveSpan();
}

/**
 * Get current trace context
 */
export function getCurrentContext(): Context {
  return context.active();
}

/**
 * Get trace ID from current context (for logging)
 */
export function getTraceId(): string | undefined {
  const span = getCurrentSpan();
  if (!span) return undefined;
  return span.spanContext().traceId;
}

/**
 * Get span ID from current context (for logging)
 */
export function getSpanId(): string | undefined {
  const span = getCurrentSpan();
  if (!span) return undefined;
  return span.spanContext().spanId;
}

// =============================================================================
// Custom Span Helpers
// =============================================================================

export interface SpanOptions {
  attributes?: Record<string, string | number | boolean>;
  kind?: SpanKind;
}

/**
 * Create a span for tick engine operations
 */
export function startTickSpan(tick: number, options?: SpanOptions): Span {
  const tracer = getTracer();
  const span = tracer.startSpan('tick.process', {
    kind: options?.kind ?? SpanKind.INTERNAL,
    attributes: {
      'tick.number': tick,
      'tick.timestamp': Date.now(),
      ...options?.attributes,
    },
  });
  return span;
}

/**
 * Create a span for LLM calls
 */
export function startLLMSpan(
  llmType: string,
  agentId: string,
  options?: SpanOptions
): Span {
  const tracer = getTracer();
  const span = tracer.startSpan('llm.call', {
    kind: SpanKind.CLIENT,
    attributes: {
      'llm.type': llmType,
      'llm.agent_id': agentId,
      'llm.timestamp': Date.now(),
      ...options?.attributes,
    },
  });
  return span;
}

/**
 * Create a span for BullMQ job processing
 */
export function startJobSpan(
  jobName: string,
  jobId: string,
  options?: SpanOptions
): Span {
  const tracer = getTracer();
  const span = tracer.startSpan(`job.${jobName}`, {
    kind: SpanKind.CONSUMER,
    attributes: {
      'job.name': jobName,
      'job.id': jobId,
      'job.timestamp': Date.now(),
      ...options?.attributes,
    },
  });
  return span;
}

/**
 * Create a span for action execution
 */
export function startActionSpan(
  actionType: string,
  agentId: string,
  options?: SpanOptions
): Span {
  const tracer = getTracer();
  const span = tracer.startSpan(`action.${actionType}`, {
    kind: SpanKind.INTERNAL,
    attributes: {
      'action.type': actionType,
      'action.agent_id': agentId,
      'action.timestamp': Date.now(),
      ...options?.attributes,
    },
  });
  return span;
}

/**
 * Add LLM metrics to a span
 */
export function addLLMMetrics(
  span: Span,
  metrics: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    durationMs?: number;
    model?: string;
    usedFallback?: boolean;
  }
): void {
  if (metrics.inputTokens !== undefined) {
    span.setAttribute('llm.input_tokens', metrics.inputTokens);
  }
  if (metrics.outputTokens !== undefined) {
    span.setAttribute('llm.output_tokens', metrics.outputTokens);
  }
  if (metrics.totalTokens !== undefined) {
    span.setAttribute('llm.total_tokens', metrics.totalTokens);
  }
  if (metrics.durationMs !== undefined) {
    span.setAttribute('llm.duration_ms', metrics.durationMs);
  }
  if (metrics.model !== undefined) {
    span.setAttribute('llm.model', metrics.model);
  }
  if (metrics.usedFallback !== undefined) {
    span.setAttribute('llm.used_fallback', metrics.usedFallback);
  }
}

/**
 * Add tick metrics to a span
 */
export function addTickMetrics(
  span: Span,
  metrics: {
    agentCount?: number;
    actionsExecuted?: number;
    deaths?: number;
    durationMs?: number;
    isPaused?: boolean;
  }
): void {
  if (metrics.agentCount !== undefined) {
    span.setAttribute('tick.agent_count', metrics.agentCount);
  }
  if (metrics.actionsExecuted !== undefined) {
    span.setAttribute('tick.actions_executed', metrics.actionsExecuted);
  }
  if (metrics.deaths !== undefined) {
    span.setAttribute('tick.deaths', metrics.deaths);
  }
  if (metrics.durationMs !== undefined) {
    span.setAttribute('tick.duration_ms', metrics.durationMs);
  }
  if (metrics.isPaused !== undefined) {
    span.setAttribute('tick.is_paused', metrics.isPaused);
  }
}

/**
 * Mark span as successful
 */
export function markSpanSuccess(span: Span): void {
  span.setStatus({ code: SpanStatusCode.OK });
}

/**
 * Mark span as failed with error
 */
export function markSpanError(span: Span, error: Error | string): void {
  span.setStatus({
    code: SpanStatusCode.ERROR,
    message: typeof error === 'string' ? error : error.message,
  });
  if (error instanceof Error) {
    span.recordException(error);
  }
}

/**
 * Execute a function within a new span context
 */
export async function withSpan<T>(
  name: string,
  fn: (span: Span) => Promise<T>,
  options?: SpanOptions
): Promise<T> {
  const tracer = getTracer();
  const span = tracer.startSpan(name, {
    kind: options?.kind ?? SpanKind.INTERNAL,
    attributes: options?.attributes,
  });

  try {
    const result = await context.with(trace.setSpan(context.active(), span), () => fn(span));
    markSpanSuccess(span);
    return result;
  } catch (error) {
    markSpanError(span, error instanceof Error ? error : String(error));
    throw error;
  } finally {
    span.end();
  }
}

/**
 * Execute a synchronous function within a new span context
 */
export function withSpanSync<T>(
  name: string,
  fn: (span: Span) => T,
  options?: SpanOptions
): T {
  const tracer = getTracer();
  const span = tracer.startSpan(name, {
    kind: options?.kind ?? SpanKind.INTERNAL,
    attributes: options?.attributes,
  });

  try {
    const result = context.with(trace.setSpan(context.active(), span), () => fn(span));
    markSpanSuccess(span);
    return result;
  } catch (error) {
    markSpanError(span, error instanceof Error ? error : String(error));
    throw error;
  } finally {
    span.end();
  }
}

// =============================================================================
// Logging Integration
// =============================================================================

/**
 * Get trace context for structured logging
 * Returns an object with trace_id and span_id if available
 */
export function getLogContext(): Record<string, string> {
  const traceId = getTraceId();
  const spanId = getSpanId();

  const ctx: Record<string, string> = {};
  if (traceId) ctx.trace_id = traceId;
  if (spanId) ctx.span_id = spanId;

  return ctx;
}

/**
 * Create a logger function that includes trace context
 */
export function createTracedLogger(prefix: string) {
  return {
    info: (message: string, data?: Record<string, unknown>) => {
      const ctx = getLogContext();
      console.log(`[${prefix}]`, message, { ...ctx, ...data });
    },
    warn: (message: string, data?: Record<string, unknown>) => {
      const ctx = getLogContext();
      console.warn(`[${prefix}]`, message, { ...ctx, ...data });
    },
    error: (message: string, error?: Error | unknown, data?: Record<string, unknown>) => {
      const ctx = getLogContext();
      console.error(`[${prefix}]`, message, error, { ...ctx, ...data });
    },
    debug: (message: string, data?: Record<string, unknown>) => {
      const ctx = getLogContext();
      console.debug(`[${prefix}]`, message, { ...ctx, ...data });
    },
  };
}

// =============================================================================
// Re-exports for convenience
// =============================================================================

export { SpanKind, SpanStatusCode } from '@opentelemetry/api';
export type { Span, Tracer, Context } from '@opentelemetry/api';
