/**
 * Prompt Store
 *
 * Manages custom system prompt state.
 * - Prompt stored in localStorage (browser-side)
 * - Syncs with backend on page load
 * - Backend never stores prompt permanently (runtime only)
 */

import { create } from 'zustand';

// =============================================================================
// Types
// =============================================================================

export interface PlaceholderInfo {
  key: string;
  description: string;
  example: string;
}

export interface JsonValidationError {
  blockIndex: number;
  startPos: number;
  endPos: number;
  error: string;
  preview: string;
  lineNumber: number;
}

export interface PromptState {
  // State
  customPrompt: string | null;
  defaultPrompt: string;
  pendingPrompt: string;
  placeholders: PlaceholderInfo[];
  isLoading: boolean;
  error: string | null;
  warning: string | null;
  isSynced: boolean;
  jsonErrors: JsonValidationError[];

  // Actions
  fetchPrompt: () => Promise<void>;
  setPendingPrompt: (prompt: string) => void;
  applyPrompt: () => Promise<void>;
  resetToDefault: () => Promise<void>;
  discardChanges: () => void;
  hasPendingChanges: () => boolean;
  isUsingCustom: () => boolean;
  hasJsonErrors: () => boolean;
}

// =============================================================================
// LocalStorage Persistence
// =============================================================================

const PROMPT_STORAGE_KEY = 'simagents_custom_prompt';

function loadPromptFromStorage(): string | null {
  try {
    const saved = localStorage.getItem(PROMPT_STORAGE_KEY);
    return saved;
  } catch (e) {
    console.warn('[PromptStore] Failed to load prompt from localStorage:', e);
  }
  return null;
}

function savePromptToStorage(prompt: string | null): void {
  try {
    if (prompt === null || prompt.trim() === '') {
      localStorage.removeItem(PROMPT_STORAGE_KEY);
    } else {
      localStorage.setItem(PROMPT_STORAGE_KEY, prompt);
    }
  } catch (e) {
    console.warn('[PromptStore] Failed to save prompt to localStorage:', e);
  }
}

// =============================================================================
// API Functions
// =============================================================================

const API_BASE = '';

interface PromptStatusResponse {
  customPrompt: string | null;
  defaultPrompt: string;
  isCustom: boolean;
  placeholders: PlaceholderInfo[];
}

interface PromptResponse {
  success: boolean;
  error?: string;
  status: PromptStatusResponse;
}

async function fetchPromptFromAPI(): Promise<PromptStatusResponse> {
  const response = await fetch(`${API_BASE}/api/prompt/current`);
  if (!response.ok) {
    throw new Error(`Failed to fetch prompt status: ${response.statusText}`);
  }
  return response.json();
}

async function syncPromptToBackend(prompt: string | null): Promise<PromptResponse> {
  const response = await fetch(`${API_BASE}/api/prompt/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  });
  if (!response.ok) {
    throw new Error(`Failed to sync prompt: ${response.statusText}`);
  }
  return response.json();
}

async function setPromptAPI(prompt: string): Promise<PromptResponse> {
  const response = await fetch(`${API_BASE}/api/prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  });
  if (!response.ok) {
    throw new Error(`Failed to set prompt: ${response.statusText}`);
  }
  return response.json();
}

async function clearPromptAPI(): Promise<PromptResponse> {
  const response = await fetch(`${API_BASE}/api/prompt/clear`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`Failed to clear prompt: ${response.statusText}`);
  }
  return response.json();
}

// =============================================================================
// JSON Validation
// =============================================================================

/**
 * Calculate line number from character position in text.
 */
function getLineNumber(text: string, position: number): number {
  const lines = text.substring(0, position).split('\n');
  return lines.length;
}

/**
 * Extract and validate JSON blocks from prompt text.
 * Only validates "response format" blocks (multi-line JSON with "action" key).
 * Ignores inline parameter examples like { "toX": number }.
 */
function validateJsonBlocks(prompt: string): JsonValidationError[] {
  const errors: JsonValidationError[] = [];

  // Find all JSON-like blocks
  const matches = findJsonBlocks(prompt);

  matches.forEach((match, blockIndex) => {
    const { block, startPos } = match;

    // Only validate blocks that look like the COMPLETE response format:
    // Must have all three keys: "action", "params", and "reasoning"
    const hasActionKey = /"action"\s*:/.test(block);
    const hasParamsKey = /"params"\s*:/.test(block);
    const hasReasoningKey = /"reasoning"\s*:/.test(block);

    if (!hasActionKey || !hasParamsKey || !hasReasoningKey) {
      // Skip blocks that don't look like the response format
      // This avoids false positives from parameter examples
      return;
    }

    // Skip blocks inside markdown code fences
    const textBefore = prompt.substring(0, startPos);
    const codeBlockStarts = (textBefore.match(/```/g) || []).length;
    if (codeBlockStarts % 2 === 1) {
      return;
    }

    // Skip blocks that contain template placeholders (they're documentation examples)
    // These patterns indicate it's a template, not actual JSON the user typed
    const hasTemplatePatterns =
      /\{\s*<[^>]+>\s*\}/.test(block) || // { <params> }
      /<[a-z_]+>/.test(block); // <action_type>, <required_params>, etc.

    if (hasTemplatePatterns) {
      // This is a documentation template block, not user-entered JSON
      return;
    }

    // Prepare block for JSON parsing by replacing template placeholders
    const testBlock = block
      // Replace { <params> } style with empty object FIRST
      .replace(/\{\s*<[^>]+>\s*\}/g, '{}')
      // Replace <placeholder> with valid JSON string
      .replace(/<[^>]+>/g, '"__placeholder__"')
      // Replace : number with : 0
      .replace(/:\s*number\b/g, ': 0')
      // Replace : string with : ""
      .replace(/:\s*string\b/g, ': ""')
      // Replace "value1"|"value2" patterns with just first value
      .replace(/"[^"]+"\|"[^"]+"/g, '"__choice__"')
      // Replace -100 to 100 range patterns
      .replace(/-?\d+\s+to\s+-?\d+/g, '0')
      // Replace 1-5, 1-10 style ranges
      .replace(/:\s*\d+-\d+/g, ': 0')
      // Replace boolean
      .replace(/:\s*boolean\b/g, ': true');

    try {
      JSON.parse(testBlock);
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Invalid JSON';
      // Simplify error message
      const simplifiedError = errorMessage
        .replace(/at position \d+/, '')
        .replace(/in JSON/, '')
        .trim();

      errors.push({
        blockIndex,
        startPos,
        endPos: startPos + block.length,
        error: simplifiedError,
        preview: block.slice(0, 60) + (block.length > 60 ? '...' : ''),
        lineNumber: getLineNumber(prompt, startPos),
      });
    }
  });

  return errors;
}

/**
 * Find JSON blocks in text by tracking brace balance.
 */
function findJsonBlocks(text: string): Array<{ block: string; startPos: number }> {
  const blocks: Array<{ block: string; startPos: number }> = [];
  let i = 0;

  while (i < text.length) {
    if (text[i] === '{') {
      // Found start of potential JSON block
      const startPos = i;
      let depth = 1;
      let j = i + 1;

      while (j < text.length && depth > 0) {
        if (text[j] === '{') depth++;
        else if (text[j] === '}') depth--;
        j++;
      }

      if (depth === 0) {
        const block = text.substring(startPos, j);
        // Only include blocks that look like JSON objects (have a colon for key:value)
        if (block.includes(':') && block.includes('"')) {
          blocks.push({ block, startPos });
        }
        i = j;
      } else {
        i++;
      }
    } else {
      i++;
    }
  }

  return blocks;
}

// =============================================================================
// Store
// =============================================================================

export const usePromptStore = create<PromptState>((set, get) => ({
  // Initial state
  customPrompt: null,
  defaultPrompt: '',
  pendingPrompt: '',
  placeholders: [],
  isLoading: false,
  error: null,
  warning: null,
  isSynced: false,
  jsonErrors: [],

  // Fetch prompt status from backend and sync localStorage
  fetchPrompt: async () => {
    set({ isLoading: true, error: null });
    try {
      // First, sync localStorage to backend
      const storedPrompt = loadPromptFromStorage();
      if (storedPrompt) {
        await syncPromptToBackend(storedPrompt);
      }

      // Then fetch current status
      const data = await fetchPromptFromAPI();
      set({
        customPrompt: data.customPrompt,
        defaultPrompt: data.defaultPrompt,
        pendingPrompt: data.customPrompt ?? data.defaultPrompt,
        placeholders: data.placeholders,
        isLoading: false,
        isSynced: true,
      });
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Failed to fetch prompt';
      set({ error, isLoading: false });
      console.error('[PromptStore] Fetch error:', e);
    }
  },

  // Set pending prompt (not yet applied)
  setPendingPrompt: (prompt: string) => {
    // Run JSON validation
    const jsonErrors = validateJsonBlocks(prompt);

    // Debug logging
    if (jsonErrors.length > 0) {
      console.log('[PromptStore] JSON validation errors:', jsonErrors);
    }

    // Check for JSON warning
    let warning: string | null = null;
    if (!prompt.toLowerCase().includes('json')) {
      warning = 'Warning: Prompt should mention JSON for proper response format';
    }

    // Force new array reference for React reactivity
    set({ pendingPrompt: prompt, warning, jsonErrors: [...jsonErrors] });
  },

  // Apply pending prompt to backend and localStorage
  applyPrompt: async () => {
    const { pendingPrompt, defaultPrompt } = get();

    // If pending is same as default, treat as reset
    if (pendingPrompt.trim() === defaultPrompt.trim()) {
      return get().resetToDefault();
    }

    set({ isLoading: true, error: null });
    try {
      const result = await setPromptAPI(pendingPrompt);

      if (!result.success) {
        set({ error: result.error ?? 'Failed to apply prompt', isLoading: false });
        return;
      }

      // Save to localStorage
      savePromptToStorage(pendingPrompt);

      set({
        customPrompt: pendingPrompt,
        warning: result.error ?? null, // Backend may return warning
        isLoading: false,
      });
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Failed to apply prompt';
      set({ error, isLoading: false });
      console.error('[PromptStore] Apply error:', e);
    }
  },

  // Reset to default prompt
  resetToDefault: async () => {
    set({ isLoading: true, error: null });
    try {
      await clearPromptAPI();

      // Clear localStorage
      savePromptToStorage(null);

      const { defaultPrompt } = get();
      set({
        customPrompt: null,
        pendingPrompt: defaultPrompt,
        warning: null,
        isLoading: false,
      });
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Failed to reset prompt';
      set({ error, isLoading: false });
      console.error('[PromptStore] Reset error:', e);
    }
  },

  // Discard pending changes
  discardChanges: () => {
    const { customPrompt, defaultPrompt } = get();
    set({
      pendingPrompt: customPrompt ?? defaultPrompt,
      warning: null,
    });
  },

  // Check if there are pending changes
  hasPendingChanges: () => {
    const { pendingPrompt, customPrompt, defaultPrompt } = get();
    const currentPrompt = customPrompt ?? defaultPrompt;
    return pendingPrompt.trim() !== currentPrompt.trim();
  },

  // Check if using custom prompt
  isUsingCustom: () => {
    const { customPrompt } = get();
    return customPrompt !== null;
  },

  // Check if there are JSON validation errors
  hasJsonErrors: () => {
    const { jsonErrors } = get();
    return jsonErrors.length > 0;
  },
}));

// =============================================================================
// Selectors
// =============================================================================

export const useCustomPrompt = () => usePromptStore((state) => state.customPrompt);
export const useDefaultPrompt = () => usePromptStore((state) => state.defaultPrompt);
export const usePendingPrompt = () => usePromptStore((state) => state.pendingPrompt);
export const usePlaceholders = () => usePromptStore((state) => state.placeholders);
export const usePromptLoading = () => usePromptStore((state) => state.isLoading);
export const usePromptError = () => usePromptStore((state) => state.error);
export const usePromptWarning = () => usePromptStore((state) => state.warning);
export const usePromptSynced = () => usePromptStore((state) => state.isSynced);
export const useJsonErrors = () => usePromptStore((state) => state.jsonErrors);
