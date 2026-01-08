/**
 * LLM API Key Manager
 *
 * Centralized management of API keys for LLM providers.
 * Handles both environment-provided keys and user-provided runtime keys.
 *
 * Key precedence:
 * 1. If key is disabled -> no key (adapter unavailable)
 * 2. Runtime key (user-provided) -> takes priority
 * 3. Environment variable -> fallback
 *
 * Note: Runtime keys are stored in memory and lost on server restart.
 * The frontend re-syncs keys from localStorage on page load.
 */

import type { LLMType } from './types';
import { LLM_PROVIDERS, getProviderInfo } from './providers';

// Runtime storage (in-memory, not persisted)
const runtimeApiKeys = new Map<LLMType, string>();
const disabledKeys = new Set<LLMType>();

/**
 * Get a runtime key (user-provided, stored in memory)
 */
export function getRuntimeKey(type: LLMType): string | undefined {
  return runtimeApiKeys.get(type);
}

/**
 * Set a runtime key (user-provided)
 */
export function setRuntimeKey(type: LLMType, key: string): void {
  if (key && key.trim()) {
    runtimeApiKeys.set(type, key.trim());
  } else {
    runtimeApiKeys.delete(type);
  }
}

/**
 * Clear a runtime key
 */
export function clearRuntimeKey(type: LLMType): void {
  runtimeApiKeys.delete(type);
}

/**
 * Check if a key is disabled by the user
 */
export function isKeyDisabled(type: LLMType): boolean {
  return disabledKeys.has(type);
}

/**
 * Set key disabled status
 */
export function setKeyDisabled(type: LLMType, disabled: boolean): void {
  if (disabled) {
    disabledKeys.add(type);
  } else {
    disabledKeys.delete(type);
  }
}

/**
 * Get the effective API key for a provider.
 * Returns undefined if:
 * - Key is disabled
 * - No runtime key AND no env key
 */
export function getEffectiveKey(type: LLMType): string | undefined {
  // Check if disabled
  if (disabledKeys.has(type)) {
    return undefined;
  }

  // Check runtime key first (user-provided takes precedence)
  const runtimeKey = runtimeApiKeys.get(type);
  if (runtimeKey) {
    return runtimeKey;
  }

  // Fall back to environment variable
  const provider = getProviderInfo(type);
  if (provider) {
    return process.env[provider.envVar];
  }

  return undefined;
}

/**
 * Check if an env key exists for a provider
 */
export function hasEnvKey(type: LLMType): boolean {
  const provider = getProviderInfo(type);
  if (!provider) return false;
  return !!process.env[provider.envVar];
}

/**
 * Check if a runtime key exists for a provider
 */
export function hasRuntimeKey(type: LLMType): boolean {
  return runtimeApiKeys.has(type);
}

/**
 * Mask an API key for display (show last 4 characters)
 */
export function maskKey(key: string): string {
  if (!key || key.length < 8) {
    return '••••••••';
  }
  return '••••••••' + key.slice(-4);
}

/**
 * Get the source of the current active key
 */
export function getKeySource(type: LLMType): 'env' | 'user' | 'none' {
  if (disabledKeys.has(type)) {
    // Even if keys exist, disabled means "none" active
    return 'none';
  }

  if (runtimeApiKeys.has(type)) {
    return 'user';
  }

  const provider = getProviderInfo(type);
  if (provider && process.env[provider.envVar]) {
    return 'env';
  }

  return 'none';
}

/**
 * Get masked key for display
 */
export function getMaskedKey(type: LLMType): string | undefined {
  const effectiveKey = getEffectiveKey(type);
  if (effectiveKey) {
    return maskKey(effectiveKey);
  }

  // If disabled but key exists, still show masked version
  const runtimeKey = runtimeApiKeys.get(type);
  if (runtimeKey) {
    return maskKey(runtimeKey);
  }

  const provider = getProviderInfo(type);
  if (provider) {
    const envKey = process.env[provider.envVar];
    if (envKey) {
      return maskKey(envKey);
    }
  }

  return undefined;
}

/**
 * Get status for all providers
 */
export interface ProviderKeyStatus {
  type: LLMType;
  displayName: string;
  source: 'env' | 'user' | 'none';
  isDisabled: boolean;
  hasEnvKey: boolean;
  hasUserKey: boolean;
  maskedKey?: string;
  docsUrl: string;
  costInfo: string;
}

export function getAllProvidersStatus(): ProviderKeyStatus[] {
  return LLM_PROVIDERS.map((provider) => ({
    type: provider.type,
    displayName: provider.displayName,
    source: getKeySource(provider.type),
    isDisabled: isKeyDisabled(provider.type),
    hasEnvKey: hasEnvKey(provider.type),
    hasUserKey: hasRuntimeKey(provider.type),
    maskedKey: getMaskedKey(provider.type),
    docsUrl: provider.docsUrl,
    costInfo: provider.costInfo,
  }));
}

/**
 * Check if any provider has an available key
 */
export function hasAnyAvailableKey(): boolean {
  return LLM_PROVIDERS.some((provider) => {
    if (isKeyDisabled(provider.type)) return false;
    return hasRuntimeKey(provider.type) || hasEnvKey(provider.type);
  });
}

/**
 * Bulk set runtime keys (used when syncing from frontend)
 */
export function setRuntimeKeys(keys: Record<string, string>): void {
  for (const [type, key] of Object.entries(keys)) {
    if (key && key.trim()) {
      runtimeApiKeys.set(type as LLMType, key.trim());
    }
  }
}

/**
 * Bulk set disabled keys (used when syncing from frontend)
 */
export function setDisabledKeys(types: LLMType[]): void {
  disabledKeys.clear();
  for (const type of types) {
    disabledKeys.add(type);
  }
}

/**
 * Get list of disabled keys
 */
export function getDisabledKeys(): LLMType[] {
  return Array.from(disabledKeys);
}

/**
 * Reset all runtime state (for testing)
 */
export function resetKeyManager(): void {
  runtimeApiKeys.clear();
  disabledKeys.clear();
}
