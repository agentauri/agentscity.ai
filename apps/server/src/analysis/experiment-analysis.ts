/**
 * Experiment Analysis Module
 *
 * Statistical helpers for analyzing and comparing scientific baseline experiments.
 * Provides functions for:
 * - Statistical comparison between variants
 * - Survival rate analysis
 * - Economic metrics analysis
 * - Behavioral pattern analysis
 */

import type { VariantComparisonResult } from '../db/queries/experiments';

// =============================================================================
// Types
// =============================================================================

export interface StatisticalTest {
  /** Test name (e.g., 't-test', 'mann-whitney') */
  test: string;
  /** Statistic value */
  statistic: number;
  /** P-value */
  pValue: number;
  /** Significance level */
  significant: boolean;
  /** Effect size (Cohen's d or similar) */
  effectSize?: number;
  /** Effect size interpretation */
  effectInterpretation?: 'negligible' | 'small' | 'medium' | 'large';
}

export interface MetricComparison {
  metric: string;
  controlValue: number;
  treatmentValue: number;
  difference: number;
  percentChange: number;
  statisticalTest?: StatisticalTest;
}

export interface SurvivalAnalysis {
  variantId: string;
  variantName: string;
  initialAgents: number;
  finalAgents: number;
  survivalRate: number;
  /** Estimated half-life in ticks (when 50% would die) */
  halfLifeTicks?: number;
  deathsByTick: { tick: number; deaths: number }[];
}

export interface EconomicAnalysis {
  variantId: string;
  variantName: string;
  /** Initial Gini coefficient */
  initialGini: number;
  /** Final Gini coefficient */
  finalGini: number;
  /** Change in inequality */
  giniChange: number;
  /** Wealth concentration trend */
  concentrationTrend: 'increasing' | 'stable' | 'decreasing';
  /** Wealth per capita over time */
  wealthTimeSeries: { tick: number; avgWealth: number }[];
}

export interface BehavioralAnalysis {
  variantId: string;
  variantName: string;
  /** Action distribution */
  actionDistribution: Record<string, number>;
  /** Most common action */
  dominantAction: string;
  /** Cooperation index (0-1) */
  cooperationIndex: number;
  /** Conflict events count */
  conflictCount: number;
  /** Trade count */
  tradeCount: number;
  /** Behavioral diversity (entropy) */
  behavioralEntropy: number;
}

export interface ExperimentReport {
  experimentId: string;
  experimentName: string;
  hypothesis: string | null;
  totalTicks: number;
  variants: {
    id: string;
    name: string;
    ticksRun: number;
    status: string;
  }[];
  metricComparisons: MetricComparison[];
  survivalAnalysis: SurvivalAnalysis[];
  economicAnalysis: EconomicAnalysis[];
  behavioralAnalysis: BehavioralAnalysis[];
  conclusion: string;
  significantFindings: string[];
}

// =============================================================================
// Statistical Functions
// =============================================================================

/**
 * Calculate mean of an array
 */
export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Calculate standard deviation
 */
export function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const avg = mean(values);
  const squaredDiffs = values.map((v) => Math.pow(v - avg, 2));
  return Math.sqrt(squaredDiffs.reduce((sum, v) => sum + v, 0) / (values.length - 1));
}

/**
 * Calculate variance
 */
export function variance(values: number[]): number {
  const sd = stdDev(values);
  return sd * sd;
}

/**
 * Calculate median
 */
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Calculate percentile
 */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower];
  return sorted[lower] * (upper - idx) + sorted[upper] * (idx - lower);
}

/**
 * Calculate Shannon entropy (behavioral diversity)
 */
export function entropy(probabilities: number[]): number {
  const nonZero = probabilities.filter((p) => p > 0);
  if (nonZero.length === 0) return 0;
  return -nonZero.reduce((sum, p) => sum + p * Math.log2(p), 0);
}

/**
 * Calculate Gini coefficient from an array of values
 */
export function giniCoefficient(values: number[]): number {
  if (values.length === 0 || values.every((v) => v === 0)) return 0;

  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const cumulative = sorted.reduce((acc, v, i) => {
    acc.push((acc[i] || 0) + v);
    return acc;
  }, [0] as number[]);

  const sum = cumulative[n];
  if (sum === 0) return 0;

  const B = cumulative.reduce((acc, c) => acc + c, 0) / (n * sum);
  return 1 - 2 * B + 1 / n;
}

/**
 * Calculate Cohen's d effect size
 */
export function cohensD(group1: number[], group2: number[]): number {
  const mean1 = mean(group1);
  const mean2 = mean(group2);
  const var1 = variance(group1);
  const var2 = variance(group2);

  const n1 = group1.length;
  const n2 = group2.length;

  // Pooled standard deviation
  const pooledStd = Math.sqrt(
    ((n1 - 1) * var1 + (n2 - 1) * var2) / (n1 + n2 - 2)
  );

  if (pooledStd === 0) return 0;
  return (mean1 - mean2) / pooledStd;
}

/**
 * Interpret Cohen's d effect size
 */
export function interpretEffectSize(d: number): 'negligible' | 'small' | 'medium' | 'large' {
  const absD = Math.abs(d);
  if (absD < 0.2) return 'negligible';
  if (absD < 0.5) return 'small';
  if (absD < 0.8) return 'medium';
  return 'large';
}

/**
 * Simple t-test (Welch's t-test for unequal variances)
 * Returns approximate p-value using normal approximation
 */
export function tTest(group1: number[], group2: number[]): StatisticalTest {
  const mean1 = mean(group1);
  const mean2 = mean(group2);
  const var1 = variance(group1);
  const var2 = variance(group2);
  const n1 = group1.length;
  const n2 = group2.length;

  if (n1 < 2 || n2 < 2) {
    return {
      test: 't-test',
      statistic: 0,
      pValue: 1,
      significant: false,
    };
  }

  // Welch's t-statistic
  const se = Math.sqrt(var1 / n1 + var2 / n2);
  if (se === 0) {
    return {
      test: 't-test',
      statistic: 0,
      pValue: 1,
      significant: false,
    };
  }

  const t = (mean1 - mean2) / se;

  // Degrees of freedom (Welch-Satterthwaite)
  const df =
    Math.pow(var1 / n1 + var2 / n2, 2) /
    (Math.pow(var1 / n1, 2) / (n1 - 1) + Math.pow(var2 / n2, 2) / (n2 - 1));

  // Approximate p-value using normal distribution for large df
  // For small df, this is an approximation
  const pValue = 2 * (1 - normalCDF(Math.abs(t)));

  const d = cohensD(group1, group2);

  return {
    test: 't-test',
    statistic: t,
    pValue,
    significant: pValue < 0.05,
    effectSize: d,
    effectInterpretation: interpretEffectSize(d),
  };
}

/**
 * Standard normal CDF approximation
 */
function normalCDF(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.SQRT2;

  const t = 1 / (1 + p * x);
  const y =
    1 -
    ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

  return 0.5 * (1 + sign * y);
}

// =============================================================================
// Analysis Functions
// =============================================================================

/**
 * Compare two variants' metrics
 */
export function compareMetrics(
  control: VariantComparisonResult,
  treatment: VariantComparisonResult
): MetricComparison[] {
  const comparisons: MetricComparison[] = [];

  const metricPairs: Array<{ key: keyof typeof control.metrics; label: string }> = [
    { key: 'avgGiniCoefficient', label: 'Gini Coefficient' },
    { key: 'avgCooperationIndex', label: 'Cooperation Index' },
    { key: 'avgWealth', label: 'Average Wealth' },
    { key: 'avgHealth', label: 'Average Health' },
    { key: 'avgHunger', label: 'Average Hunger' },
    { key: 'avgEnergy', label: 'Average Energy' },
    { key: 'survivalRate', label: 'Survival Rate' },
    { key: 'totalEvents', label: 'Total Events' },
    { key: 'tradeCount', label: 'Trade Count' },
    { key: 'conflictCount', label: 'Conflict Count' },
  ];

  for (const { key, label } of metricPairs) {
    const controlValue = control.metrics[key];
    const treatmentValue = treatment.metrics[key];
    const difference = treatmentValue - controlValue;
    const percentChange = controlValue !== 0
      ? ((treatmentValue - controlValue) / controlValue) * 100
      : treatmentValue > 0 ? 100 : 0;

    comparisons.push({
      metric: label,
      controlValue,
      treatmentValue,
      difference,
      percentChange,
    });
  }

  return comparisons;
}

/**
 * Analyze survival patterns from snapshots
 */
export function analyzeSurvival(
  variantId: string,
  variantName: string,
  snapshots: Array<{
    tick: number;
    metricsSnapshot: { aliveAgents?: number } | null;
    agentStates: Array<{ state: string }> | null;
  }>
): SurvivalAnalysis {
  if (snapshots.length === 0) {
    return {
      variantId,
      variantName,
      initialAgents: 0,
      finalAgents: 0,
      survivalRate: 0,
      deathsByTick: [],
    };
  }

  // Get agent counts per snapshot
  const agentCounts = snapshots.map((s) => {
    const metrics = s.metricsSnapshot as { aliveAgents?: number } | null;
    return {
      tick: Number(s.tick),
      alive: metrics?.aliveAgents ?? s.agentStates?.filter((a) => a.state !== 'dead').length ?? 0,
    };
  });

  const initialAgents = agentCounts[0]?.alive ?? 0;
  const finalAgents = agentCounts[agentCounts.length - 1]?.alive ?? 0;

  // Calculate deaths per tick
  const deathsByTick: { tick: number; deaths: number }[] = [];
  for (let i = 1; i < agentCounts.length; i++) {
    const deaths = agentCounts[i - 1].alive - agentCounts[i].alive;
    if (deaths > 0) {
      deathsByTick.push({ tick: agentCounts[i].tick, deaths });
    }
  }

  // Estimate half-life (tick when population would drop to 50%)
  let halfLifeTicks: number | undefined;
  const halfPoint = initialAgents / 2;
  for (const count of agentCounts) {
    if (count.alive <= halfPoint) {
      halfLifeTicks = count.tick;
      break;
    }
  }

  return {
    variantId,
    variantName,
    initialAgents,
    finalAgents,
    survivalRate: initialAgents > 0 ? finalAgents / initialAgents : 0,
    halfLifeTicks,
    deathsByTick,
  };
}

/**
 * Analyze economic patterns from snapshots
 */
export function analyzeEconomics(
  variantId: string,
  variantName: string,
  snapshots: Array<{
    tick: number;
    metricsSnapshot: { giniCoefficient?: number; avgWealth?: number } | null;
    agentStates: Array<{ balance: number }> | null;
  }>
): EconomicAnalysis {
  if (snapshots.length === 0) {
    return {
      variantId,
      variantName,
      initialGini: 0,
      finalGini: 0,
      giniChange: 0,
      concentrationTrend: 'stable',
      wealthTimeSeries: [],
    };
  }

  const getGini = (s: typeof snapshots[0]): number => {
    const metrics = s.metricsSnapshot as { giniCoefficient?: number } | null;
    if (metrics?.giniCoefficient !== undefined) {
      return metrics.giniCoefficient;
    }
    if (s.agentStates) {
      return giniCoefficient(s.agentStates.map((a) => a.balance));
    }
    return 0;
  };

  const getWealth = (s: typeof snapshots[0]): number => {
    const metrics = s.metricsSnapshot as { avgWealth?: number } | null;
    if (metrics?.avgWealth !== undefined) {
      return metrics.avgWealth;
    }
    if (s.agentStates && s.agentStates.length > 0) {
      return mean(s.agentStates.map((a) => a.balance));
    }
    return 0;
  };

  const initialGini = getGini(snapshots[0]);
  const finalGini = getGini(snapshots[snapshots.length - 1]);
  const giniChange = finalGini - initialGini;

  // Determine trend
  let concentrationTrend: 'increasing' | 'stable' | 'decreasing' = 'stable';
  if (giniChange > 0.05) concentrationTrend = 'increasing';
  else if (giniChange < -0.05) concentrationTrend = 'decreasing';

  const wealthTimeSeries = snapshots.map((s) => ({
    tick: Number(s.tick),
    avgWealth: getWealth(s),
  }));

  return {
    variantId,
    variantName,
    initialGini,
    finalGini,
    giniChange,
    concentrationTrend,
    wealthTimeSeries,
  };
}

/**
 * Analyze behavioral patterns
 */
export function analyzeBehavior(
  variantId: string,
  variantName: string,
  comparison: VariantComparisonResult
): BehavioralAnalysis {
  // Calculate behavioral entropy from action distribution
  // (placeholder - would need event data for full analysis)
  const actionDistribution: Record<string, number> = {
    move: 0.4,
    gather: 0.2,
    consume: 0.15,
    work: 0.1,
    sleep: 0.1,
    trade: 0.05,
  };

  const probabilities = Object.values(actionDistribution);
  const behavioralEntropy = entropy(probabilities);

  // Find dominant action
  let dominantAction = 'move';
  let maxCount = 0;
  for (const [action, count] of Object.entries(actionDistribution)) {
    if (count > maxCount) {
      maxCount = count;
      dominantAction = action;
    }
  }

  return {
    variantId,
    variantName,
    actionDistribution,
    dominantAction,
    cooperationIndex: comparison.metrics.avgCooperationIndex,
    conflictCount: comparison.metrics.conflictCount,
    tradeCount: comparison.metrics.tradeCount,
    behavioralEntropy,
  };
}

/**
 * Generate a comprehensive experiment report
 */
export function generateExperimentReport(
  experimentId: string,
  experimentName: string,
  hypothesis: string | null,
  variants: Array<{
    id: string;
    name: string;
    status: string;
    startTick?: number | null;
    endTick?: number | null;
  }>,
  comparisons: VariantComparisonResult[]
): ExperimentReport {
  const significantFindings: string[] = [];

  // Assume first variant is control
  const controlComparison = comparisons[0];
  const treatmentComparisons = comparisons.slice(1);

  // Generate metric comparisons
  const metricComparisons: MetricComparison[] = [];
  for (const treatment of treatmentComparisons) {
    if (controlComparison) {
      const compared = compareMetrics(controlComparison, treatment);
      metricComparisons.push(...compared);

      // Check for significant differences
      for (const comp of compared) {
        if (Math.abs(comp.percentChange) > 20) {
          significantFindings.push(
            `${comp.metric}: ${comp.percentChange > 0 ? '+' : ''}${comp.percentChange.toFixed(1)}% (${controlComparison.variantName} vs ${treatment.variantName})`
          );
        }
      }
    }
  }

  // Calculate total ticks across all variants
  const totalTicks = variants.reduce((sum, v) => {
    const ticks = v.endTick && v.startTick ? Number(v.endTick) - Number(v.startTick) : 0;
    return sum + ticks;
  }, 0);

  // Generate conclusion based on findings
  let conclusion = 'Experiment completed. ';
  if (significantFindings.length === 0) {
    conclusion += 'No statistically significant differences were observed between variants.';
  } else if (significantFindings.length <= 3) {
    conclusion += `Found ${significantFindings.length} significant finding(s).`;
  } else {
    conclusion += `Found ${significantFindings.length} significant differences between variants.`;
  }

  // Survival and economic analysis would need snapshot data
  // Placeholder empty arrays - caller should populate from snapshots
  const survivalAnalysis: SurvivalAnalysis[] = [];
  const economicAnalysis: EconomicAnalysis[] = [];
  const behavioralAnalysis: BehavioralAnalysis[] = [];

  for (const comp of comparisons) {
    behavioralAnalysis.push(analyzeBehavior(comp.variantId, comp.variantName, comp));
  }

  return {
    experimentId,
    experimentName,
    hypothesis,
    totalTicks,
    variants: variants.map((v) => ({
      id: v.id,
      name: v.name,
      ticksRun: v.endTick && v.startTick ? Number(v.endTick) - Number(v.startTick) : 0,
      status: v.status,
    })),
    metricComparisons,
    survivalAnalysis,
    economicAnalysis,
    behavioralAnalysis,
    conclusion,
    significantFindings,
  };
}

// =============================================================================
// Export Helpers
// =============================================================================

/**
 * Convert experiment report to CSV format
 */
export function reportToCSV(report: ExperimentReport): string {
  const lines: string[] = [];

  // Header section
  lines.push('# Experiment Report');
  lines.push(`Experiment ID,${report.experimentId}`);
  lines.push(`Experiment Name,${report.experimentName}`);
  lines.push(`Hypothesis,${report.hypothesis || 'N/A'}`);
  lines.push(`Total Ticks,${report.totalTicks}`);
  lines.push('');

  // Variants section
  lines.push('# Variants');
  lines.push('Variant ID,Variant Name,Ticks Run,Status');
  for (const v of report.variants) {
    lines.push(`${v.id},${v.name},${v.ticksRun},${v.status}`);
  }
  lines.push('');

  // Metric comparisons section
  lines.push('# Metric Comparisons');
  lines.push('Metric,Control Value,Treatment Value,Difference,Percent Change');
  for (const mc of report.metricComparisons) {
    lines.push(
      `${mc.metric},${mc.controlValue.toFixed(4)},${mc.treatmentValue.toFixed(4)},${mc.difference.toFixed(4)},${mc.percentChange.toFixed(2)}%`
    );
  }
  lines.push('');

  // Behavioral analysis section
  lines.push('# Behavioral Analysis');
  lines.push('Variant,Dominant Action,Cooperation Index,Trade Count,Conflict Count,Behavioral Entropy');
  for (const ba of report.behavioralAnalysis) {
    lines.push(
      `${ba.variantName},${ba.dominantAction},${ba.cooperationIndex.toFixed(4)},${ba.tradeCount},${ba.conflictCount},${ba.behavioralEntropy.toFixed(4)}`
    );
  }
  lines.push('');

  // Significant findings
  lines.push('# Significant Findings');
  for (const finding of report.significantFindings) {
    lines.push(finding);
  }
  lines.push('');

  // Conclusion
  lines.push('# Conclusion');
  lines.push(report.conclusion);

  return lines.join('\n');
}

/**
 * Convert experiment report to JSON format (pretty-printed)
 */
export function reportToJSON(report: ExperimentReport): string {
  return JSON.stringify(report, null, 2);
}
