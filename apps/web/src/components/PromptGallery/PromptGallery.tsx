/**
 * PromptGallery - Main container for prompt template gallery
 *
 * Features:
 * - Category filtering
 * - Search
 * - Grid view of templates
 * - Detail view with full content
 * - Comparison mode
 */

import { useState, useMemo } from 'react';
import {
  PROMPT_TEMPLATES,
  getTemplatesByCategory,
  searchTemplates,
  CATEGORY_LABELS,
  CATEGORY_DESCRIPTIONS,
  type PromptTemplate,
  type TemplateCategory,
} from '../../data/prompt-templates';
import { TemplateCard } from './TemplateCard';
import { TemplateViewer } from './TemplateViewer';
import { TemplateComparison } from './TemplateComparison';

type ViewMode = 'gallery' | 'comparison';

export function PromptGallery() {
  const [viewMode, setViewMode] = useState<ViewMode>('gallery');
  const [selectedCategory, setSelectedCategory] = useState<TemplateCategory | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<PromptTemplate | null>(null);

  // Filter templates based on category and search
  const filteredTemplates = useMemo(() => {
    let templates = selectedCategory === 'all'
      ? PROMPT_TEMPLATES
      : getTemplatesByCategory(selectedCategory);

    if (searchQuery.trim()) {
      const searchResults = searchTemplates(searchQuery);
      templates = templates.filter((t) => searchResults.some((r) => r.id === t.id));
    }

    return templates;
  }, [selectedCategory, searchQuery]);

  // Group templates by category for display
  const groupedTemplates = useMemo(() => {
    const groups: Record<TemplateCategory, PromptTemplate[]> = {
      mode: [],
      safety: [],
      personality: [],
    };

    for (const template of filteredTemplates) {
      groups[template.category].push(template);
    }

    return groups;
  }, [filteredTemplates]);

  const categories: (TemplateCategory | 'all')[] = ['all', 'mode', 'safety', 'personality'];

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="flex-none px-4 py-3 bg-city-surface border-b border-city-border">
        <div className="flex flex-col lg:flex-row lg:items-center gap-3">
          {/* View mode toggle */}
          <div className="flex items-center gap-1 p-1 bg-city-bg rounded-lg">
            <button
              onClick={() => setViewMode('gallery')}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                viewMode === 'gallery'
                  ? 'bg-city-accent text-white'
                  : 'text-city-text-muted hover:text-city-text'
              }`}
            >
              Gallery
            </button>
            <button
              onClick={() => setViewMode('comparison')}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                viewMode === 'comparison'
                  ? 'bg-city-accent text-white'
                  : 'text-city-text-muted hover:text-city-text'
              }`}
            >
              Compare
            </button>
          </div>

          {/* Category filter (gallery mode only) */}
          {viewMode === 'gallery' && (
            <div className="flex items-center gap-1">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                    selectedCategory === cat
                      ? 'bg-city-border text-city-text'
                      : 'text-city-text-muted hover:text-city-text hover:bg-city-border/50'
                  }`}
                >
                  {cat === 'all' ? 'All' : CATEGORY_LABELS[cat]}
                </button>
              ))}
            </div>
          )}

          {/* Search (gallery mode only) */}
          {viewMode === 'gallery' && (
            <div className="flex-1 lg:max-w-xs">
              <div className="relative">
                <svg
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-city-text-muted"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search templates..."
                  className="w-full pl-10 pr-4 py-2 bg-city-bg border border-city-border rounded-lg text-sm text-city-text placeholder:text-city-text-muted focus:outline-none focus:ring-2 focus:ring-city-accent/50"
                />
              </div>
            </div>
          )}

          {/* Stats */}
          <div className="text-xs text-city-text-muted">
            {filteredTemplates.length} template{filteredTemplates.length !== 1 ? 's' : ''}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {viewMode === 'comparison' ? (
          <div className="p-4">
            <TemplateComparison />
          </div>
        ) : (
          <div className="flex h-full">
            {/* Template list */}
            <div className={`${selectedTemplate ? 'w-1/3 lg:w-1/4' : 'w-full'} overflow-auto border-r border-city-border`}>
              {selectedCategory === 'all' ? (
                // Show grouped by category
                Object.entries(groupedTemplates).map(([category, templates]) => {
                  if (templates.length === 0) return null;
                  return (
                    <div key={category} className="p-4 border-b border-city-border/50">
                      <div className="mb-3">
                        <h3 className="text-sm font-semibold text-city-text">
                          {CATEGORY_LABELS[category as TemplateCategory]}
                        </h3>
                        <p className="text-xs text-city-text-muted mt-0.5">
                          {CATEGORY_DESCRIPTIONS[category as TemplateCategory]}
                        </p>
                      </div>
                      <div className={`grid gap-3 ${selectedTemplate ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'}`}>
                        {templates.map((template) => (
                          <TemplateCard
                            key={template.id}
                            template={template}
                            isSelected={selectedTemplate?.id === template.id}
                            onSelect={setSelectedTemplate}
                            compact={!!selectedTemplate}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })
              ) : (
                // Show flat list for single category
                <div className="p-4">
                  <div className="mb-4">
                    <h3 className="text-sm font-semibold text-city-text">
                      {CATEGORY_LABELS[selectedCategory]}
                    </h3>
                    <p className="text-xs text-city-text-muted mt-0.5">
                      {CATEGORY_DESCRIPTIONS[selectedCategory]}
                    </p>
                  </div>
                  <div className={`grid gap-3 ${selectedTemplate ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'}`}>
                    {filteredTemplates.map((template) => (
                      <TemplateCard
                        key={template.id}
                        template={template}
                        isSelected={selectedTemplate?.id === template.id}
                        onSelect={setSelectedTemplate}
                        compact={!!selectedTemplate}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Detail view */}
            {selectedTemplate && (
              <div className="flex-1 overflow-auto p-4">
                <div className="mb-4 flex items-start justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-city-text">{selectedTemplate.name}</h2>
                    <p className="text-sm text-city-text-muted mt-1">{selectedTemplate.description}</p>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {selectedTemplate.tags.map((tag) => (
                        <span
                          key={tag}
                          className="px-2 py-0.5 rounded bg-city-border/50 text-xs text-city-text-muted"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedTemplate(null)}
                    className="p-2 rounded-lg hover:bg-city-border/50 text-city-text-muted hover:text-city-text transition-colors"
                    title="Close"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <TemplateViewer
                  content={selectedTemplate.content}
                  title="Full Template Content"
                  maxHeight="calc(100vh - 300px)"
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
