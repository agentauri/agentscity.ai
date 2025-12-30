import { useCallback, useRef } from 'react';

/**
 * Error report structure for external reporting services
 */
export interface ErrorReport {
  /** Error message */
  message: string;
  /** Error stack trace */
  stack?: string;
  /** React component stack */
  componentStack?: string;
  /** Section/component name where error occurred */
  sectionName?: string;
  /** Timestamp of when the error occurred */
  timestamp: number;
  /** Additional context metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Configuration options for error reporting
 */
export interface ErrorReportingConfig {
  /** Whether error reporting is enabled */
  enabled?: boolean;
  /** Custom endpoint for error reporting */
  endpoint?: string;
  /** Maximum number of errors to report per session */
  maxErrorsPerSession?: number;
  /** Custom error transformer before sending */
  transformError?: (report: ErrorReport) => ErrorReport;
  /** Callback when error is reported */
  onReport?: (report: ErrorReport) => void;
}

const DEFAULT_CONFIG: ErrorReportingConfig = {
  enabled: true,
  maxErrorsPerSession: 10,
};

/**
 * useErrorReporting - A hook for error reporting and analytics
 *
 * Provides a consistent interface for capturing and reporting errors
 * from React error boundaries. Can be integrated with services like
 * Sentry, LogRocket, Datadog, or custom error tracking.
 *
 * Features:
 * - Deduplicates repeated errors
 * - Rate limits error reports per session
 * - Supports custom error transformation
 * - Provides error history for debugging
 *
 * Usage:
 * ```tsx
 * const { reportError, errorHistory } = useErrorReporting({
 *   onReport: (report) => {
 *     // Send to Sentry, LogRocket, etc.
 *     Sentry.captureException(report);
 *   }
 * });
 *
 * <ErrorBoundary onError={(error, info) => reportError(error, info, 'Canvas')}>
 *   <ScientificCanvas />
 * </ErrorBoundary>
 * ```
 */
export function useErrorReporting(config: ErrorReportingConfig = {}) {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };
  const errorCountRef = useRef(0);
  const errorHistoryRef = useRef<ErrorReport[]>([]);
  const reportedErrorsRef = useRef<Set<string>>(new Set());

  /**
   * Generate a unique key for error deduplication
   */
  const getErrorKey = useCallback((error: Error, sectionName?: string): string => {
    return `${sectionName || 'unknown'}:${error.message}:${error.stack?.slice(0, 200) || ''}`;
  }, []);

  /**
   * Report an error from an error boundary
   */
  const reportError = useCallback(
    (
      error: Error,
      errorInfo?: { componentStack?: string } | null,
      sectionName?: string,
      metadata?: Record<string, unknown>
    ): void => {
      if (!mergedConfig.enabled) return;

      // Check rate limit
      if (
        mergedConfig.maxErrorsPerSession &&
        errorCountRef.current >= mergedConfig.maxErrorsPerSession
      ) {
        console.warn('[ErrorReporting] Max errors per session reached, skipping report');
        return;
      }

      // Check for duplicate errors
      const errorKey = getErrorKey(error, sectionName);
      if (reportedErrorsRef.current.has(errorKey)) {
        console.debug('[ErrorReporting] Duplicate error, skipping report');
        return;
      }

      // Create error report
      let report: ErrorReport = {
        message: error.message,
        stack: error.stack,
        componentStack: errorInfo?.componentStack || undefined,
        sectionName,
        timestamp: Date.now(),
        metadata: {
          ...metadata,
          userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
          url: typeof window !== 'undefined' ? window.location.href : undefined,
        },
      };

      // Apply custom transformation if provided
      if (mergedConfig.transformError) {
        report = mergedConfig.transformError(report);
      }

      // Track error
      errorCountRef.current += 1;
      reportedErrorsRef.current.add(errorKey);
      errorHistoryRef.current.push(report);

      // Log to console in development
      if (import.meta.env.DEV) {
        console.group('[ErrorReporting] Error captured');
        console.error('Error:', error);
        console.info('Report:', report);
        console.groupEnd();
      }

      // Call custom onReport handler
      mergedConfig.onReport?.(report);

      // Send to endpoint if configured
      if (mergedConfig.endpoint) {
        fetch(mergedConfig.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(report),
        }).catch((fetchError) => {
          console.error('[ErrorReporting] Failed to send error report:', fetchError);
        });
      }
    },
    [mergedConfig, getErrorKey]
  );

  /**
   * Create an error handler function for use with ErrorBoundary onError prop
   */
  const createErrorHandler = useCallback(
    (sectionName?: string, metadata?: Record<string, unknown>) => {
      return (error: Error, errorInfo: { componentStack?: string }) => {
        reportError(error, errorInfo, sectionName, metadata);
      };
    },
    [reportError]
  );

  /**
   * Clear error history and reset counter
   */
  const clearHistory = useCallback(() => {
    errorCountRef.current = 0;
    errorHistoryRef.current = [];
    reportedErrorsRef.current.clear();
  }, []);

  /**
   * Get current error history
   */
  const getErrorHistory = useCallback((): readonly ErrorReport[] => {
    return errorHistoryRef.current;
  }, []);

  return {
    /** Report an error manually */
    reportError,
    /** Create an error handler for a specific section */
    createErrorHandler,
    /** Clear error history */
    clearHistory,
    /** Get current error history */
    getErrorHistory,
    /** Current error count this session */
    errorCount: errorCountRef.current,
  };
}

export default useErrorReporting;
