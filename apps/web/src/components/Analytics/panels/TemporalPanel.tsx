/**
 * TemporalPanel - Temporal metrics visualization
 */

import { useTemporalMetrics } from '../../../stores/analytics';
import { MetricCard } from '../MetricCard';
import { LineChart } from '../charts/LineChart';

export function TemporalPanel() {
  const temporal = useTemporalMetrics();

  if (!temporal) {
    return (
      <div className="flex items-center justify-center h-32 text-city-text-muted text-sm">
        Loading temporal metrics...
      </div>
    );
  }

  const { tickDurations, eventsByTick, currentTick } = temporal;

  // Calculate averages
  const avgDuration = tickDurations.length > 0
    ? tickDurations.reduce((sum, d) => sum + d.duration, 0) / tickDurations.length
    : 0;

  const avgActions = tickDurations.length > 0
    ? tickDurations.reduce((sum, d) => sum + d.actionsExecuted, 0) / tickDurations.length
    : 0;

  const totalEvents = eventsByTick.reduce((sum, d) => sum + d.eventCount, 0);

  // Prepare line chart data for tick durations
  const durationLineData = [{
    id: 'duration',
    color: '#e07a5f',
    points: tickDurations.map((d) => ({
      x: d.tick,
      y: d.duration,
    })),
  }];

  // Prepare line chart data for actions per tick
  const actionsLineData = [{
    id: 'actions',
    color: '#81b29a',
    points: tickDurations.map((d) => ({
      x: d.tick,
      y: d.actionsExecuted,
    })),
  }];

  // Prepare line chart data for events per tick
  const eventsLineData = [{
    id: 'events',
    color: '#6a8caf',
    points: eventsByTick.map((d) => ({
      x: d.tick,
      y: d.eventCount,
    })),
  }];

  // Prepare line chart data for agent count over time
  const agentCountData = [{
    id: 'agents',
    color: '#9a8bc2',
    points: tickDurations.map((d) => ({
      x: d.tick,
      y: d.agentCount,
    })),
  }];

  return (
    <div className="space-y-4">
      {/* Overview cards */}
      <div className="grid grid-cols-3 gap-2">
        <MetricCard
          label="Current Tick"
          value={currentTick}
        />
        <MetricCard
          label="Avg Duration"
          value={`${avgDuration.toFixed(0)}ms`}
          color={avgDuration > 5000 ? 'warning' : 'default'}
        />
        <MetricCard
          label="Total Events"
          value={totalEvents.toLocaleString()}
        />
      </div>

      {/* Actions per tick */}
      <div className="bg-city-surface-hover/20 rounded-lg p-3">
        <div className="text-xs text-city-text-muted mb-2 uppercase tracking-wide">
          Avg Actions/Tick: {avgActions.toFixed(1)}
        </div>
      </div>

      {/* Tick duration over time */}
      {tickDurations.length > 0 && (
        <div>
          <div className="text-xs text-city-text-muted mb-2 uppercase tracking-wide">
            Tick Duration (ms)
          </div>
          <LineChart
            data={durationLineData}
            height={120}
          />
        </div>
      )}

      {/* Actions per tick over time */}
      {tickDurations.length > 0 && (
        <div>
          <div className="text-xs text-city-text-muted mb-2 uppercase tracking-wide">
            Actions per Tick
          </div>
          <LineChart
            data={actionsLineData}
            height={120}
          />
        </div>
      )}

      {/* Events per tick */}
      {eventsByTick.length > 0 && (
        <div>
          <div className="text-xs text-city-text-muted mb-2 uppercase tracking-wide">
            Events per Tick
          </div>
          <LineChart
            data={eventsLineData}
            height={120}
          />
        </div>
      )}

      {/* Agent count over time */}
      {tickDurations.length > 0 && tickDurations.some((d) => d.agentCount > 0) && (
        <div>
          <div className="text-xs text-city-text-muted mb-2 uppercase tracking-wide">
            Active Agents over Time
          </div>
          <LineChart
            data={agentCountData}
            height={120}
          />
        </div>
      )}

      {/* Recent ticks table */}
      {tickDurations.length > 0 && (
        <div>
          <div className="text-xs text-city-text-muted mb-2 uppercase tracking-wide">
            Recent Ticks
          </div>
          <div className="bg-city-surface-hover/20 rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-city-border">
                  <th className="px-2 py-1 text-left text-city-text-muted">Tick</th>
                  <th className="px-2 py-1 text-right text-city-text-muted">Duration</th>
                  <th className="px-2 py-1 text-right text-city-text-muted">Agents</th>
                  <th className="px-2 py-1 text-right text-city-text-muted">Actions</th>
                </tr>
              </thead>
              <tbody>
                {tickDurations.slice(-5).reverse().map((d) => (
                  <tr key={d.tick} className="border-b border-city-border/50 last:border-0">
                    <td className="px-2 py-1 text-city-text">{d.tick}</td>
                    <td className="px-2 py-1 text-right text-city-text">
                      {d.duration.toLocaleString()}ms
                    </td>
                    <td className="px-2 py-1 text-right text-city-text">{d.agentCount}</td>
                    <td className="px-2 py-1 text-right text-city-text">{d.actionsExecuted}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
