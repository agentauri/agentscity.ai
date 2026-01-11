/**
 * TemplateCard - Card component for displaying a prompt template
 *
 * Features:
 * - Category badge
 * - Name and description
 * - Tags
 * - View/Select button
 */

import type { ReactNode } from 'react';
import type { PromptTemplate, TemplateCategory } from '../../data/prompt-templates';

interface TemplateCardProps {
  template: PromptTemplate;
  isSelected?: boolean;
  onSelect?: (template: PromptTemplate) => void;
  compact?: boolean;
}

const CATEGORY_COLORS: Record<TemplateCategory, string> = {
  mode: 'bg-blue-600/20 text-blue-400 border-blue-500/30',
  safety: 'bg-amber-600/20 text-amber-400 border-amber-500/30',
  personality: 'bg-purple-600/20 text-purple-400 border-purple-500/30',
};

const CATEGORY_ICONS: Record<TemplateCategory, ReactNode> = {
  mode: (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
    </svg>
  ),
  safety: (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  ),
  personality: (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  ),
};

export function TemplateCard({
  template,
  isSelected = false,
  onSelect,
  compact = false,
}: TemplateCardProps) {
  const categoryColor = CATEGORY_COLORS[template.category];
  const categoryIcon = CATEGORY_ICONS[template.category];

  if (compact) {
    return (
      <button
        onClick={() => onSelect?.(template)}
        className={`w-full text-left p-3 rounded-lg border transition-all ${
          isSelected
            ? 'bg-city-accent/10 border-city-accent'
            : 'bg-city-surface border-city-border hover:bg-city-surface-hover hover:border-city-border/80'
        }`}
      >
        <div className="flex items-center gap-2 mb-1">
          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border ${categoryColor}`}>
            {categoryIcon}
            {template.category}
          </span>
        </div>
        <div className="text-sm font-medium text-city-text truncate">{template.name}</div>
      </button>
    );
  }

  return (
    <div
      className={`bg-city-surface rounded-lg border overflow-hidden transition-all ${
        isSelected
          ? 'border-city-accent ring-1 ring-city-accent/30'
          : 'border-city-border hover:border-city-border/80'
      }`}
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-city-border/50 bg-city-surface-hover/30">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border ${categoryColor}`}>
                {categoryIcon}
                {template.category}
              </span>
            </div>
            <h3 className="text-sm font-semibold text-city-text truncate">
              {template.name}
            </h3>
          </div>
          {onSelect && (
            <button
              onClick={() => onSelect(template)}
              className={`shrink-0 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                isSelected
                  ? 'bg-city-accent text-white'
                  : 'bg-city-border/50 text-city-text hover:bg-city-border'
              }`}
            >
              {isSelected ? 'Selected' : 'View'}
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="px-4 py-3">
        <p className="text-xs text-city-text-muted mb-3 line-clamp-2">
          {template.description}
        </p>

        {/* Tags */}
        <div className="flex flex-wrap gap-1">
          {template.tags.slice(0, 4).map((tag) => (
            <span
              key={tag}
              className="px-1.5 py-0.5 rounded bg-city-bg text-[10px] text-city-text-muted"
            >
              {tag}
            </span>
          ))}
          {template.tags.length > 4 && (
            <span className="px-1.5 py-0.5 text-[10px] text-city-text-muted">
              +{template.tags.length - 4}
            </span>
          )}
        </div>
      </div>

      {/* Footer - content preview */}
      <div className="px-4 py-2 bg-city-bg/50 border-t border-city-border/30">
        <p className="text-[10px] text-city-text-muted font-mono truncate">
          {template.content.slice(0, 80)}...
        </p>
      </div>
    </div>
  );
}
