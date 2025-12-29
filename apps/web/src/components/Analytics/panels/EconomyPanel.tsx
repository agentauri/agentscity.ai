/**
 * EconomyPanel - Economy metrics visualization
 */

import { useEconomyMetrics } from '../../../stores/analytics';
import { MetricCard } from '../MetricCard';
import { BarChart } from '../charts/BarChart';

export function EconomyPanel() {
  const economy = useEconomyMetrics();

  if (!economy) {
    return (
      <div className="flex items-center justify-center h-32 text-city-text-muted text-sm">
        Loading economy metrics...
      </div>
    );
  }

  const { moneySupply, giniCoefficient, balanceDistribution, byLlmType } = economy;

  // Prepare data for total balance by LLM
  const totalBalanceData = byLlmType
    .map((d) => ({
      label: d.llmType,
      value: Math.round(d.totalBalance),
    }))
    .sort((a, b) => b.value - a.value);

  // Prepare data for average balance by LLM
  const avgBalanceData = byLlmType
    .map((d) => ({
      label: d.llmType,
      value: Math.round(d.avgBalance),
    }))
    .sort((a, b) => b.value - a.value);

  // Gini interpretation
  const getGiniInterpretation = (gini: number) => {
    if (gini < 0.2) return { text: 'Very Equal', color: 'success' as const };
    if (gini < 0.35) return { text: 'Equal', color: 'success' as const };
    if (gini < 0.5) return { text: 'Moderate', color: 'warning' as const };
    if (gini < 0.7) return { text: 'Unequal', color: 'warning' as const };
    return { text: 'Very Unequal', color: 'error' as const };
  };

  const giniInfo = getGiniInterpretation(giniCoefficient);

  return (
    <div className="space-y-4">
      {/* Overview cards */}
      <div className="grid grid-cols-2 gap-2">
        <MetricCard
          label="Money Supply"
          value={moneySupply.toLocaleString()}
          subtitle="Total CITY in circulation"
        />
        <MetricCard
          label="Gini Index"
          value={giniCoefficient.toFixed(3)}
          color={giniInfo.color}
          subtitle={giniInfo.text}
        />
      </div>

      {/* Balance distribution */}
      <div className="bg-city-surface-hover/20 rounded-lg p-3">
        <div className="text-xs text-city-text-muted mb-2 uppercase tracking-wide">
          Balance Distribution
        </div>
        <div className="grid grid-cols-4 gap-2 text-center">
          <div>
            <div className="text-lg font-bold text-city-text">
              {balanceDistribution.min.toLocaleString()}
            </div>
            <div className="text-xs text-city-text-muted">Min</div>
          </div>
          <div>
            <div className="text-lg font-bold text-city-text">
              {Math.round(balanceDistribution.median).toLocaleString()}
            </div>
            <div className="text-xs text-city-text-muted">Median</div>
          </div>
          <div>
            <div className="text-lg font-bold text-city-text">
              {Math.round(balanceDistribution.mean).toLocaleString()}
            </div>
            <div className="text-xs text-city-text-muted">Mean</div>
          </div>
          <div>
            <div className="text-lg font-bold text-city-text">
              {balanceDistribution.max.toLocaleString()}
            </div>
            <div className="text-xs text-city-text-muted">Max</div>
          </div>
        </div>
      </div>

      {/* Gini visualization */}
      <div className="bg-city-surface-hover/20 rounded-lg p-3">
        <div className="text-xs text-city-text-muted mb-2 uppercase tracking-wide">
          Wealth Inequality (Gini)
        </div>
        <div className="relative h-3 bg-city-surface-hover rounded-full overflow-hidden">
          {/* Background gradient from green to red */}
          <div
            className="absolute inset-0"
            style={{
              background: 'linear-gradient(to right, #81b29a 0%, #f2cc8f 50%, #e07a5f 100%)',
            }}
          />
          {/* Gini marker */}
          <div
            className="absolute top-0 h-full w-1 bg-white shadow-md"
            style={{ left: `${giniCoefficient * 100}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-city-text-muted mt-1">
          <span>0 (Equal)</span>
          <span>1 (Unequal)</span>
        </div>
      </div>

      {/* Total balance by LLM */}
      <div>
        <div className="text-xs text-city-text-muted mb-2 uppercase tracking-wide">
          Total Wealth by LLM
        </div>
        <BarChart
          data={totalBalanceData}
          height={100}
          formatValue={(v) => v.toLocaleString()}
        />
      </div>

      {/* Average balance by LLM */}
      <div>
        <div className="text-xs text-city-text-muted mb-2 uppercase tracking-wide">
          Avg Balance by LLM
        </div>
        <BarChart
          data={avgBalanceData}
          height={100}
          formatValue={(v) => v.toLocaleString()}
        />
      </div>
    </div>
  );
}
