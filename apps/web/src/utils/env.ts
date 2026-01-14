/**
 * Environment Utilities
 *
 * Determines if the app is running in development or production mode.
 * In production, authentication is required for certain operations.
 */

/**
 * Check if we're running in development mode
 * Development = localhost or explicitly set VITE_DEV_MODE
 */
export function isDevelopment(): boolean {
  // Check for explicit dev mode override
  if (import.meta.env.VITE_DEV_MODE === 'true') {
    return true;
  }

  // Check if running on localhost
  const hostname = window.location.hostname;
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname.startsWith('192.168.') ||
    hostname.endsWith('.local')
  );
}

/**
 * Check if we're running in production mode
 */
export function isProduction(): boolean {
  return !isDevelopment();
}

/**
 * Check if authentication is required
 * - Production: always required
 * - Development: optional (configurable via VITE_REQUIRE_AUTH)
 */
export function isAuthRequired(): boolean {
  // In production, auth is always required
  if (isProduction()) {
    return true;
  }

  // In development, check for explicit requirement
  return import.meta.env.VITE_REQUIRE_AUTH === 'true';
}
