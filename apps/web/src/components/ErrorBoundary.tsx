import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ErrorFallback, type ErrorFallbackProps } from './ErrorFallback';

/**
 * Props for the ErrorBoundary component
 */
export interface ErrorBoundaryProps {
  /** The content to render when no error has occurred */
  children: ReactNode;
  /** Custom fallback component to render on error */
  fallback?: ReactNode;
  /** Custom fallback render function for more control */
  fallbackRender?: (props: ErrorFallbackProps) => ReactNode;
  /** Callback when an error is caught */
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  /** Callback when the error boundary is reset */
  onReset?: () => void;
  /** A name for the boundary section (used in error messages) */
  sectionName?: string;
  /** Whether to show a compact error message */
  compact?: boolean;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * ErrorBoundary - A React error boundary component that catches JavaScript errors
 * in child components and displays a fallback UI.
 *
 * Features:
 * - Catches render errors in child component tree
 * - Displays user-friendly error message with retry option
 * - Logs errors to console with component stack trace
 * - Supports custom fallback UI via render prop or component
 * - Prevents one component crash from breaking the whole app
 *
 * Usage:
 * ```tsx
 * <ErrorBoundary sectionName="Canvas">
 *   <ScientificCanvas />
 * </ErrorBoundary>
 * ```
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    // Update state so the next render shows the fallback UI
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Store error info for display
    this.setState({ errorInfo });

    // Log error details to console
    const { sectionName } = this.props;
    const sectionLabel = sectionName ? `[${sectionName}] ` : '';

    console.group(`${sectionLabel}Error Boundary Caught an Error`);
    console.error('Error:', error);
    console.error('Error Message:', error.message);
    console.error('Component Stack:', errorInfo.componentStack);
    if (error.stack) {
      console.error('Stack Trace:', error.stack);
    }
    console.groupEnd();

    // Call optional error callback for external error reporting
    this.props.onError?.(error, errorInfo);
  }

  handleReset = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
    this.props.onReset?.();
  };

  render(): ReactNode {
    const { hasError, error, errorInfo } = this.state;
    const { children, fallback, fallbackRender, sectionName, compact } = this.props;

    if (hasError && error) {
      // Custom fallback component
      if (fallback) {
        return fallback;
      }

      // Custom fallback render function
      if (fallbackRender) {
        return fallbackRender({
          error,
          errorInfo,
          resetError: this.handleReset,
          sectionName,
          compact,
        });
      }

      // Default fallback UI
      return (
        <ErrorFallback
          error={error}
          errorInfo={errorInfo}
          resetError={this.handleReset}
          sectionName={sectionName}
          compact={compact}
        />
      );
    }

    return children;
  }
}

/**
 * Hook-based error boundary wrapper for functional components
 * that need to programmatically trigger error boundary resets
 */
export function withErrorBoundary<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  errorBoundaryProps?: Omit<ErrorBoundaryProps, 'children'>
) {
  const displayName = WrappedComponent.displayName || WrappedComponent.name || 'Component';

  const ComponentWithErrorBoundary = (props: P) => (
    <ErrorBoundary {...errorBoundaryProps}>
      <WrappedComponent {...props} />
    </ErrorBoundary>
  );

  ComponentWithErrorBoundary.displayName = `withErrorBoundary(${displayName})`;

  return ComponentWithErrorBoundary;
}

export default ErrorBoundary;
