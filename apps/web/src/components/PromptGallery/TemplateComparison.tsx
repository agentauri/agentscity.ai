/**
 * TemplateComparison - Side-by-side template comparison view
 *
 * Features:
 * - Two dropdowns to select templates
 * - Side-by-side code view
 * - Stats comparison
 */

import { useState } from 'react';
import { PROMPT_TEMPLATES, type PromptTemplate, CATEGORY_LABELS } from '../../data/prompt-templates';
import { TemplateViewer } from './TemplateViewer';

interface TemplateComparisonProps {
  initialLeft?: string;
  initialRight?: string;
}

export function TemplateComparison({
  initialLeft = 'prescriptive',
  initialRight = 'emergent',
}: TemplateComparisonProps) {
  const [leftId, setLeftId] = useState(initialLeft);
  const [rightId, setRightId] = useState(initialRight);

  const leftTemplate = PROMPT_TEMPLATES.find((t) => t.id === leftId);
  const rightTemplate = PROMPT_TEMPLATES.find((t) => t.id === rightId);

  const groupedTemplates = PROMPT_TEMPLATES.reduce(
    (acc, template) => {
      if (!acc[template.category]) {
        acc[template.category] = [];
      }
      acc[template.category].push(template);
      return acc;
    },
    {} as Record<string, PromptTemplate[]>
  );

  const renderSelect = (value: string, onChange: (id: string) => void, label: string) => (
    <div className="flex-1">
      <label className="block text-xs text-city-text-muted mb-1">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 bg-city-surface border border-city-border rounded-lg text-sm text-city-text focus:outline-none focus:ring-2 focus:ring-city-accent/50"
      >
        {Object.entries(groupedTemplates).map(([category, templates]) => (
          <optgroup key={category} label={CATEGORY_LABELS[category as keyof typeof CATEGORY_LABELS]}>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  );

  const renderStats = (template: PromptTemplate | undefined) => {
    if (!template) return null;
    const lines = template.content.split('\n').length;
    const chars = template.content.length;
    const words = template.content.split(/\s+/).length;

    return (
      <div className="flex items-center gap-3 text-xs text-city-text-muted">
        <span>{lines} lines</span>
        <span>{words.toLocaleString()} words</span>
        <span>{chars.toLocaleString()} chars</span>
      </div>
    );
  };

  return (
    <div className="bg-city-surface rounded-lg border border-city-border overflow-hidden">
      {/* Header with selectors */}
      <div className="px-4 py-3 bg-city-surface-hover/50 border-b border-city-border">
        <div className="flex items-center gap-4">
          {renderSelect(leftId, setLeftId, 'Left Template')}
          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-city-border/30">
            <svg className="w-4 h-4 text-city-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>
          </div>
          {renderSelect(rightId, setRightId, 'Right Template')}
        </div>
      </div>

      {/* Stats comparison */}
      <div className="grid grid-cols-2 gap-4 px-4 py-2 bg-city-bg/50 border-b border-city-border/50">
        <div>{renderStats(leftTemplate)}</div>
        <div>{renderStats(rightTemplate)}</div>
      </div>

      {/* Side-by-side content */}
      <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-city-border">
        <div className="p-4">
          {leftTemplate ? (
            <div>
              <div className="mb-3">
                <h3 className="text-sm font-semibold text-city-text">{leftTemplate.name}</h3>
                <p className="text-xs text-city-text-muted mt-1">{leftTemplate.description}</p>
              </div>
              <TemplateViewer content={leftTemplate.content} maxHeight="400px" />
            </div>
          ) : (
            <div className="text-center text-city-text-muted py-8">Select a template</div>
          )}
        </div>
        <div className="p-4">
          {rightTemplate ? (
            <div>
              <div className="mb-3">
                <h3 className="text-sm font-semibold text-city-text">{rightTemplate.name}</h3>
                <p className="text-xs text-city-text-muted mt-1">{rightTemplate.description}</p>
              </div>
              <TemplateViewer content={rightTemplate.content} maxHeight="400px" />
            </div>
          ) : (
            <div className="text-center text-city-text-muted py-8">Select a template</div>
          )}
        </div>
      </div>

      {/* Tags comparison */}
      <div className="grid grid-cols-2 gap-4 px-4 py-3 bg-city-bg/30 border-t border-city-border/50">
        <div>
          {leftTemplate && (
            <div className="flex flex-wrap gap-1">
              {leftTemplate.tags.map((tag) => (
                <span
                  key={tag}
                  className={`px-1.5 py-0.5 rounded text-[10px] ${
                    rightTemplate?.tags.includes(tag)
                      ? 'bg-green-600/20 text-green-400'
                      : 'bg-city-border/50 text-city-text-muted'
                  }`}
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
        <div>
          {rightTemplate && (
            <div className="flex flex-wrap gap-1">
              {rightTemplate.tags.map((tag) => (
                <span
                  key={tag}
                  className={`px-1.5 py-0.5 rounded text-[10px] ${
                    leftTemplate?.tags.includes(tag)
                      ? 'bg-green-600/20 text-green-400'
                      : 'bg-city-border/50 text-city-text-muted'
                  }`}
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
