/**
 * Event Filters Component
 *
 * Provides UI for filtering events by type in the EventFeed.
 * Features:
 * - Toggle individual event types on/off
 * - Select all / deselect all
 * - Color-coded event type badges
 * - Collapsible panel
 */

import { useState } from 'react';
import {
  useVisualizationStore,
  ALL_EVENT_TYPES,
  EVENT_TYPE_COLORS,
  EVENT_TYPE_LABELS,
  type EventTypeFilter,
} from '../../stores/visualization';

export function EventFilters() {
  const [isExpanded, setIsExpanded] = useState(false);

  const {
    visibleEventTypes,
    eventFilterEnabled,
    toggleEventType,
    setAllEventTypes,
    toggleEventFilter,
  } = useVisualizationStore();

  const visibleCount = visibleEventTypes.size;
  const totalCount = ALL_EVENT_TYPES.length;

  // Group event types by category
  const categories: { label: string; types: EventTypeFilter[] }[] = [
    {
      label: 'Survival',
      types: ['move', 'gather', 'consume', 'sleep', 'work'],
    },
    {
      label: 'Economy',
      types: ['buy', 'trade'],
    },
    {
      label: 'Social',
      types: ['share_info', 'harm', 'steal', 'deceive', 'death'],
    },
    {
      label: 'System',
      types: ['system'],
    },
  ];

  return (
    <div className="bg-city-surface/95 backdrop-blur-sm rounded-lg border border-city-border overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-3 py-2 flex items-center justify-between hover:bg-city-border/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <svg
            className={`w-4 h-4 text-city-text-muted transition-transform ${
              isExpanded ? 'rotate-90' : ''
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
          <span className="text-xs font-medium text-city-text">Event Filters</span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[10px] text-city-text-muted">
            {visibleCount}/{totalCount}
          </span>
          <div
            role="switch"
            aria-checked={eventFilterEnabled}
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              toggleEventFilter();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                toggleEventFilter();
              }
            }}
            className={`relative w-8 h-4 rounded-full transition-colors cursor-pointer ${
              eventFilterEnabled ? 'bg-city-accent' : 'bg-city-border'
            }`}
          >
            <div
              className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${
                eventFilterEnabled ? 'left-4' : 'left-0.5'
              }`}
            />
          </div>
        </div>
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="px-3 pb-3 border-t border-city-border/50">
          {/* Quick actions */}
          <div className="flex gap-2 mt-2 mb-3">
            <button
              onClick={() => setAllEventTypes(true)}
              className="flex-1 px-2 py-1 text-[10px] bg-city-bg rounded hover:bg-city-border transition-colors text-city-text-muted"
            >
              Select All
            </button>
            <button
              onClick={() => setAllEventTypes(false)}
              className="flex-1 px-2 py-1 text-[10px] bg-city-bg rounded hover:bg-city-border transition-colors text-city-text-muted"
            >
              Clear All
            </button>
          </div>

          {/* Categories */}
          <div className="space-y-3">
            {categories.map((category) => (
              <div key={category.label}>
                <div className="text-[10px] text-city-text-muted mb-1.5 font-medium">
                  {category.label}
                </div>
                <div className="flex flex-wrap gap-1">
                  {category.types.map((type) => {
                    const isVisible = visibleEventTypes.has(type);
                    const color = EVENT_TYPE_COLORS[type];
                    const label = EVENT_TYPE_LABELS[type];

                    return (
                      <button
                        key={type}
                        onClick={() => toggleEventType(type)}
                        className={`px-2 py-0.5 rounded text-[10px] font-medium transition-all ${
                          isVisible
                            ? 'text-white shadow-sm'
                            : 'text-city-text-muted bg-city-bg hover:bg-city-border'
                        }`}
                        style={{
                          backgroundColor: isVisible ? color : undefined,
                          opacity: isVisible ? 1 : 0.5,
                        }}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Compact Event Filter Pills
 * Inline version for use in tight spaces
 */
export function EventFilterPills() {
  const { visibleEventTypes, toggleEventType } = useVisualizationStore();

  // Only show most important types inline
  const inlineTypes: EventTypeFilter[] = ['trade', 'harm', 'steal', 'share_info', 'death'];

  return (
    <div className="flex flex-wrap gap-1">
      {inlineTypes.map((type) => {
        const isVisible = visibleEventTypes.has(type);
        const color = EVENT_TYPE_COLORS[type];
        const label = EVENT_TYPE_LABELS[type];

        return (
          <button
            key={type}
            onClick={() => toggleEventType(type)}
            className={`px-1.5 py-0.5 rounded text-[9px] font-medium transition-all ${
              isVisible
                ? 'text-white'
                : 'text-city-text-muted bg-city-bg/50 hover:bg-city-border'
            }`}
            style={{
              backgroundColor: isVisible ? color : undefined,
              opacity: isVisible ? 1 : 0.4,
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
