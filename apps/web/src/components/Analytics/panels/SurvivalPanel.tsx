/**
 * SurvivalPanel - Survival metrics visualization
 */

import { useSurvivalMetrics } from '../../../stores/analytics';
import { MetricCard } from '../MetricCard';
import { BarChart } from '../charts/BarChart';

export function SurvivalPanel() {
  const survival = useSurvivalMetrics();

  if (!survival) {
    return (
      <div className="flex items-center justify-center h-32 text-city-text-muted text-sm">
        Loading survival metrics...
      </div>
    );
  }

  const { byLlmType, overall, deathCauses } = survival;

  // Prepare data for alive/dead chart
  const aliveData = byLlmType.map((d) => ({
    label: d.llmType,
    value: d.aliveCount,
  }));

  // Prepare data for health chart
  const healthData = byLlmType.map((d) => ({
    label: d.llmType,
    value: Math.round(d.avgHealth),
  }));

  // Prepare data for balance chart
  const balanceData = byLlmType
    .map((d) => ({
      label: d.llmType,
      value: Math.round(d.avgBalance),
    }))
    .sort((a, b) => b.value - a.value);

  return (
    <div className="space-y-4">
      {/* Overview cards */}
      <div className="grid grid-cols-3 gap-2">
        <MetricCard
          label="Alive"
          value={overall.totalAlive}
          color="success"
        />
        <MetricCard
          label="Dead"
          value={overall.totalDead}
          color={overall.totalDead > 0 ? 'error' : 'default'}
        />
        <MetricCard
          label="Total"
          value={overall.totalAgents}
        />
      </div>

      {/* Death causes */}
      {(deathCauses.starvation > 0 || deathCauses.exhaustion > 0) && (
        <div className="bg-city-surface-hover/20 rounded-lg p-2">
          <div className="text-xs text-city-text-muted mb-1">Death Causes</div>
          <div className="flex gap-4 text-sm">
            <span className="text-status-warning">
              🍽️ Starvation: {deathCauses.starvation}
            </span>
            <span className="text-status-error">
              ⚡ Exhaustion: {deathCauses.exhaustion}
            </span>
          </div>
        </div>
      )}

      {/* Alive agents by LLM */}
      <div>
        <div className="text-xs text-city-text-muted mb-2 uppercase tracking-wide">
          Alive Agents by LLM
        </div>
        <BarChart data={aliveData} height={100} />
      </div>

      {/* Health by LLM */}
      <div>
        <div className="text-xs text-city-text-muted mb-2 uppercase tracking-wide">
          Avg Health by LLM
        </div>
        <BarChart
          data={healthData}
          height={100}
          formatValue={(v) => `${v}%`}
        />
      </div>

      {/* Balance ranking */}
      <div>
        <div className="text-xs text-city-text-muted mb-2 uppercase tracking-wide">
          Avg Balance by LLM (CITY)
        </div>
        <BarChart
          data={balanceData}
          height={100}
          formatValue={(v) => v.toLocaleString()}
        />
      </div>

      {/* Vitals summary */}
      <div className="bg-city-surface-hover/20 rounded-lg p-2">
        <div className="text-xs text-city-text-muted mb-2">Average Vitals by LLM</div>
        <div className="space-y-1">
          {byLlmType.map((d) => (
            <div key={d.llmType} className="flex items-center gap-2 text-xs">
              <span className="w-16 text-city-text truncate">{d.llmType}</span>
              <span className="text-status-error">❤️ {Math.round(d.avgHealth)}</span>
              <span className="text-status-warning">🍽️ {Math.round(d.avgHunger)}</span>
              <span className="text-status-success">⚡ {Math.round(d.avgEnergy)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
