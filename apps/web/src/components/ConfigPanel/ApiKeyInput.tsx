/**
 * ApiKeyInput Component
 *
 * Input for a single LLM API key with:
 * - Status badge (From ENV / User Provided / Not Set)
 * - Password input with show/hide toggle
 * - Enable/Disable toggle
 * - Link to get API key
 */

import { useState } from 'react';
import type { LLMProviderInfo, ProviderKeyStatus, LLMType } from '../../stores/apiKeys';

interface ApiKeyInputProps {
  provider: LLMProviderInfo;
  status: ProviderKeyStatus;
  pendingKey?: string;
  onKeyChange: (key: string) => void;
  onToggleDisabled: () => void;
  onClear: () => void;
  isLoading: boolean;
}

export function ApiKeyInput({
  provider,
  status,
  pendingKey,
  onKeyChange,
  onToggleDisabled,
  onClear,
  isLoading,
}: ApiKeyInputProps) {
  const [showKey, setShowKey] = useState(false);

  // Determine badge color and text
  const getBadge = () => {
    if (status.disabled) {
      return { text: 'Disabled', color: 'bg-gray-600 text-gray-300' };
    }
    switch (status.source) {
      case 'env':
        return { text: 'From ENV', color: 'bg-green-800 text-green-200' };
      case 'user':
        return { text: 'User Key', color: 'bg-blue-800 text-blue-200' };
      default:
        return { text: 'Not Set', color: 'bg-gray-700 text-gray-400' };
    }
  };

  const badge = getBadge();
  const hasKey = status.source !== 'none';
  const displayValue = pendingKey ?? (hasKey ? status.maskedKey ?? '' : '');
  const isEditing = pendingKey !== undefined;

  return (
    <div className="py-3 px-4 border-b border-gray-700/50 last:border-b-0">
      {/* Header row: Provider name + Badge */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-200">
          {provider.displayName}
        </span>
        <span className={`text-xs px-2 py-0.5 rounded ${badge.color}`}>
          {badge.text}
        </span>
      </div>

      {/* Input row */}
      <div className="flex items-center gap-2 mb-2">
        <div className="relative flex-1">
          <input
            type={showKey ? 'text' : 'password'}
            value={displayValue}
            onChange={(e) => onKeyChange(e.target.value)}
            placeholder={hasKey ? '••••••••' : 'Enter API key...'}
            disabled={isLoading || status.disabled}
            className={`w-full bg-gray-800 border border-gray-600 rounded px-3 py-1.5 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed pr-10 ${
              isEditing ? 'border-yellow-500' : ''
            }`}
          />
          {/* Show/Hide toggle */}
          <button
            type="button"
            onClick={() => setShowKey(!showKey)}
            disabled={isLoading || status.disabled}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none"
            aria-label={showKey ? 'Hide key' : 'Show key'}
          >
            {showKey ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            )}
          </button>
        </div>

        {/* Enable/Disable toggle */}
        {hasKey && (
          <button
            onClick={onToggleDisabled}
            disabled={isLoading}
            className={`px-2 py-1.5 text-xs rounded transition-colors focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed ${
              status.disabled
                ? 'bg-green-800/50 text-green-300 hover:bg-green-800'
                : 'bg-yellow-800/50 text-yellow-300 hover:bg-yellow-800'
            }`}
          >
            {status.disabled ? 'Enable' : 'Disable'}
          </button>
        )}

        {/* Clear button for user keys only */}
        {status.source === 'user' && (
          <button
            onClick={onClear}
            disabled={isLoading}
            className="px-2 py-1.5 text-xs rounded bg-red-800/50 text-red-300 hover:bg-red-800 transition-colors focus:outline-none focus:ring-1 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Clear
          </button>
        )}
      </div>

      {/* Footer row: Cost info + Get Key link */}
      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-500">{provider.costInfo}</span>
        <a
          href={provider.docsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-400 hover:text-blue-300 hover:underline"
        >
          Get API Key &rarr;
        </a>
      </div>
    </div>
  );
}

export default ApiKeyInput;
