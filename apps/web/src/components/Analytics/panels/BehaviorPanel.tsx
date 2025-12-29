/**
 * BehaviorPanel - Behavior metrics visualization
 */

import { useBehaviorMetrics } from '../../../stores/analytics';
import { MetricCard } from '../MetricCard';
import { BarChart } from '../charts/BarChart';

// Action type colors
const actionColors: Record<string, string> = {
  move: '#6a8caf',
  work: '#81b29a',
  sleep: '#9a8bc2',
  buy: '#f2cc8f',
  consume: '#e07a5f',
};

export function BehaviorPanel() {
  const behavior = useBehaviorMetrics();

  if (!behavior) {
    return (
      <div className="flex items-center justify-center h-32 text-city-text-muted text-sm">
        Loading behavior metrics...
      </div>
    );
  }

  const { actionFrequency, byLlmType } = behavior;

  // Prepare action frequency data
  const actionData = actionFrequency.map((d) => ({
    label: d.actionType,
    value: d.count,
    color: actionColors[d.actionType] || '#888888',
  }));

  // Calculate total actions
  const totalActions = actionFrequency.reduce((sum, d) => sum + d.count, 0);

  // Calculate average fallback rate
  const avgFallbackRate = byLlmType.length > 0
    ? byLlmType.reduce((sum, d) => sum + d.fallbackRate, 0) / byLlmType.length
    : 0;

  // Calculate average processing time
  const avgProcessingTime = byLlmType.length > 0
    ? byLlmType.reduce((sum, d) => sum + d.avgProcessingTime, 0) / byLlmType.length
    : 0;

  return (
    <div className="space-y-4">
      {/* Overview cards */}
      <div className="grid grid-cols-3 gap-2">
        <MetricCard
          label="Total Actions"
          value={totalActions.toLocaleString()}
        />
        <MetricCard
          label="Fallback Rate"
          value={`${(avgFallbackRate * 100).toFixed(1)}%`}
          color={avgFallbackRate > 0.3 ? 'warning' : 'success'}
        />
        <MetricCard
          label="Avg Time"
          value={`${avgProcessingTime.toFixed(0)}ms`}
        />
      </div>

      {/* Action frequency */}
      <div>
        <div className="text-xs text-city-text-muted mb-2 uppercase tracking-wide">
          Action Frequency
        </div>
        <BarChart
          data={actionData}
          height={120}
          formatValue={(v) => v.toLocaleString()}
        />
      </div>

      {/* Action percentages */}
      <div className="bg-city-surface-hover/20 rounded-lg p-3">
        <div className="text-xs text-city-text-muted mb-2 uppercase tracking-wide">
          Action Distribution
        </div>
        <div className="flex flex-wrap gap-2">
          {actionFrequency.map((action) => (
            <div
              key={action.actionType}
              className="flex items-center gap-1 px-2 py-1 bg-city-surface rounded text-xs"
            >
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: actionColors[action.actionType] || '#888' }}
              />
              <span className="text-city-text">{action.actionType}</span>
              <span className="text-city-text-muted">
                {action.percentage.toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Behavior by LLM */}
      <div>
        <div className="text-xs text-city-text-muted mb-2 uppercase tracking-wide">
          Behavior by LLM
        </div>
        <div className="space-y-2">
          {byLlmType.map((llm) => {
            const actions = llm.actions;
            const total = Object.values(actions).reduce((sum, v) => sum + v, 0);
            const dominant = Object.entries(actions).sort((a, b) => b[1] - a[1])[0];

            return (
              <div
                key={llm.llmType}
                className="bg-city-surface-hover/20 rounded-lg p-2"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-city-text">
                    {llm.llmType}
                  </span>
                  <span className="text-xs text-city-text-muted">
                    {total} actions
                  </span>
                </div>

                {/* Action breakdown bar */}
                <div className="flex h-2 rounded-full overflow-hidden bg-city-surface">
                  {Object.entries(actions)
                    .filter(([, count]) => count > 0)
                    .map(([actionType, count]) => (
                      <div
                        key={actionType}
                        className="h-full"
                        style={{
                          width: `${(count / total) * 100}%`,
                          backgroundColor: actionColors[actionType] || '#888',
                        }}
                        title={`${actionType}: ${count} (${((count / total) * 100).toFixed(1)}%)`}
                      />
                    ))}
                </div>

                {/* Stats */}
                <div className="flex items-center gap-3 mt-1 text-xs text-city-text-muted">
                  {dominant && (
                    <span>
                      Top: <span className="text-city-text">{dominant[0]}</span>
                    </span>
                  )}
                  <span>
                    Fallback: <span className={llm.fallbackRate > 0.3 ? 'text-status-warning' : 'text-status-success'}>
                      {(llm.fallbackRate * 100).toFixed(0)}%
                    </span>
                  </span>
                  <span>
                    {llm.avgProcessingTime.toFixed(0)}ms
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
