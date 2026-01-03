/**
 * Ensemble Results Comparison Tool
 *
 * Compares multiple ensemble experiment results with statistical rigor.
 * Useful for comparing different configurations, LLM types, or experimental conditions.
 *
 * Usage:
 *   bun run src/scripts/compare-ensembles.ts \
 *     --files results/run1.json results/run2.json \
 *     --output comparison.json \
 *     --format table|json|csv|latex
 *
 * Arguments:
 *   --files FILE...     Ensemble result files to compare (at least 2)
 *   --output FILE       Output file path (optional, prints to stdout if not specified)
 *   --format FORMAT     Output format: table, json, csv, or latex (default: table)
 *   --alpha N           Significance level (default: 0.05)
 *   --correction TYPE   Multiple comparison correction: none, bonferroni, holm, fdr (default: holm)
 *   -h, --help          Show this help message
 */

import { parseArgs } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import {
  mean,
  stdDev,
  tTest,
  mannWhitneyU,
  cohensD,
  interpretEffectSize,
  confidenceInterval,
  statisticalPower,
} from '../analysis/experiment-analysis';
import {
  bonferroniCorrection,
  holmBonferroniCorrection,
  benjaminiHochbergCorrection,
} from '../analysis/metric-validator';
import type { EnsembleResult, RunMetrics, AggregatedMetric } from './run-ensemble';

// =============================================================================
// Types
// =============================================================================

export interface ComparisonMetric {
  metricName: string;
  experiment1: {
    name: string;
    mean: number;
    std: number;
    ci95: [number, number];
    n: number;
  };
  experiment2: {
    name: string;
    mean: number;
    std: number;
    ci95: [number, number];
    n: number;
  };
  difference: {
    absolute: number;
    percent: number;
    direction: 'higher' | 'lower' | 'same';
  };
  statistics: {
    tTest: { statistic: number; pValue: number; significant: boolean };
    mannWhitney: { statistic: number; pValue: number; significant: boolean };
    effectSize: { cohensD: number; interpretation: string };
    power: number;
  };
  adjustedPValue?: number;
  significantAfterCorrection?: boolean;
}

export interface PairwiseComparison {
  experiment1: string;
  experiment2: string;
  metrics: ComparisonMetric[];
  overallConclusion: string;
  significantDifferences: string[];
}

export interface ComparisonReport {
  timestamp: string;
  files: string[];
  experimentNames: string[];
  alpha: number;
  correctionMethod: string;
  pairwiseComparisons: PairwiseComparison[];
  summary: {
    totalComparisons: number;
    significantBeforeCorrection: number;
    significantAfterCorrection: number;
    largestEffects: Array<{
      metric: string;
      effectSize: number;
      interpretation: string;
      between: [string, string];
    }>;
  };
  recommendations: string[];
}

// =============================================================================
// Argument Parsing
// =============================================================================

function printHelp(): void {
  console.log(`
Ensemble Results Comparison Tool

Usage:
  bun run src/scripts/compare-ensembles.ts [options]

Options:
  -f, --files FILE...     Ensemble result files to compare (at least 2, space-separated)
  -o, --output FILE       Output file path (optional, prints to stdout if not specified)
      --format FORMAT     Output format: table, json, csv, or latex (default: table)
  -a, --alpha N           Significance level (default: 0.05)
  -c, --correction TYPE   Multiple comparison correction: none, bonferroni, holm, fdr (default: holm)
  -h, --help              Show this help message

Examples:
  bun run src/scripts/compare-ensembles.ts -f results/baseline.json results/experimental.json
  bun run src/scripts/compare-ensembles.ts -f a.json b.json c.json --format latex -o comparison.tex
  bun run src/scripts/compare-ensembles.ts -f *.json --correction bonferroni --alpha 0.01
`);
}

function parseArguments(): {
  files: string[];
  output: string | null;
  format: 'table' | 'json' | 'csv' | 'latex';
  alpha: number;
  correction: 'none' | 'bonferroni' | 'holm' | 'fdr';
  help: boolean;
} {
  const { values, positionals } = parseArgs({
    options: {
      files: { type: 'string', short: 'f', multiple: true },
      output: { type: 'string', short: 'o' },
      format: { type: 'string', default: 'table' },
      alpha: { type: 'string', short: 'a', default: '0.05' },
      correction: { type: 'string', short: 'c', default: 'holm' },
      help: { type: 'boolean', short: 'h', default: false },
    },
    allowPositionals: true,
  });

  // Combine files from --files and positionals
  const allFiles = [...(values.files || []), ...positionals];

  const format = (values.format || 'table') as string;
  if (!['table', 'json', 'csv', 'latex'].includes(format)) {
    throw new Error(`Invalid format: ${format}. Must be table, json, csv, or latex`);
  }

  const correction = (values.correction || 'holm') as string;
  if (!['none', 'bonferroni', 'holm', 'fdr'].includes(correction)) {
    throw new Error(`Invalid correction: ${correction}. Must be none, bonferroni, holm, or fdr`);
  }

  return {
    files: allFiles,
    output: values.output || null,
    format: format as 'table' | 'json' | 'csv' | 'latex',
    alpha: parseFloat(values.alpha || '0.05'),
    correction: correction as 'none' | 'bonferroni' | 'holm' | 'fdr',
    help: values.help || false,
  };
}

// =============================================================================
// File Loading
// =============================================================================

function loadEnsembleResult(filePath: string): EnsembleResult {
  const fullPath = path.isAbsolute(filePath)
    ? filePath
    : path.join(process.cwd(), filePath);

  if (!fs.existsSync(fullPath)) {
    throw new Error(`File not found: ${fullPath}`);
  }

  let content: string;
  try {
    content = fs.readFileSync(fullPath, 'utf-8');
  } catch (readError) {
    throw new Error(`Failed to read file ${fullPath}: ${readError instanceof Error ? readError.message : readError}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (parseError) {
    throw new Error(`File ${fullPath} contains invalid JSON: ${parseError instanceof Error ? parseError.message : parseError}`);
  }

  // Basic schema validation
  if (!parsed || typeof parsed !== 'object') {
    throw new Error(`File ${fullPath} is not a valid ensemble result: expected object`);
  }
  const result = parsed as Record<string, unknown>;
  if (!result.experiment || !result.perRun || !Array.isArray(result.perRun)) {
    throw new Error(`File ${fullPath} is missing required fields (experiment, perRun)`);
  }

  return result as unknown as EnsembleResult;
}

// =============================================================================
// Statistical Comparison
// =============================================================================

function extractMetricValues(result: EnsembleResult, metricKey: keyof RunMetrics): number[] {
  return result.perRun.map((run) => {
    const value = run[metricKey];
    return typeof value === 'number' ? value : 0;
  });
}

function compareMetric(
  metricName: string,
  result1: EnsembleResult,
  result2: EnsembleResult,
  metricKey: keyof RunMetrics,
  alpha: number
): ComparisonMetric {
  const values1 = extractMetricValues(result1, metricKey);
  const values2 = extractMetricValues(result2, metricKey);

  const mean1 = mean(values1);
  const mean2 = mean(values2);
  const std1 = stdDev(values1);
  const std2 = stdDev(values2);
  const ci1 = confidenceInterval(values1);
  const ci2 = confidenceInterval(values2);

  const tTestResult = tTest(values1, values2);
  const mannWhitneyResult = mannWhitneyU(values1, values2);
  const effectSize = cohensD(values1, values2);
  const power = statisticalPower(values1, values2, alpha);

  const diff = mean2 - mean1;
  const pctChange = mean1 !== 0 ? (diff / Math.abs(mean1)) * 100 : (mean2 > 0 ? 100 : 0);

  return {
    metricName,
    experiment1: {
      name: result1.experiment.name,
      mean: mean1,
      std: std1,
      ci95: [ci1.lower, ci1.upper],
      n: values1.length,
    },
    experiment2: {
      name: result2.experiment.name,
      mean: mean2,
      std: std2,
      ci95: [ci2.lower, ci2.upper],
      n: values2.length,
    },
    difference: {
      absolute: diff,
      percent: pctChange,
      direction: Math.abs(diff) < 0.001 ? 'same' : diff > 0 ? 'higher' : 'lower',
    },
    statistics: {
      tTest: {
        statistic: tTestResult.statistic,
        pValue: tTestResult.pValue,
        significant: tTestResult.pValue < alpha,
      },
      mannWhitney: {
        statistic: mannWhitneyResult.statistic,
        pValue: mannWhitneyResult.pValue,
        significant: mannWhitneyResult.pValue < alpha,
      },
      effectSize: {
        cohensD: effectSize,
        interpretation: interpretEffectSize(effectSize),
      },
      power,
    },
  };
}

function compareExperiments(
  result1: EnsembleResult,
  result2: EnsembleResult,
  alpha: number,
  correctionMethod: 'none' | 'bonferroni' | 'holm' | 'fdr'
): PairwiseComparison {
  // Define metrics to compare
  const metricsToCompare: Array<{ name: string; key: keyof RunMetrics }> = [
    { name: 'Gini Coefficient', key: 'gini' },
    { name: 'Cooperation Index', key: 'cooperationIndex' },
    { name: 'Survival Rate', key: 'survivalRate' },
    { name: 'Average Wealth', key: 'avgWealth' },
    { name: 'Average Health', key: 'avgHealth' },
    { name: 'Trade Count', key: 'tradeCount' },
    { name: 'Harm Count', key: 'harmCount' },
    { name: 'Steal Count', key: 'stealCount' },
    { name: 'Death Count', key: 'deathCount' },
    { name: 'LLM Call Count', key: 'llmCallCount' },
    { name: 'Lizard Brain Usage', key: 'lizardBrainUsageRate' },
  ];

  // Compare all metrics
  const metrics: ComparisonMetric[] = metricsToCompare.map(({ name, key }) =>
    compareMetric(name, result1, result2, key, alpha)
  );

  // Collect p-values for correction
  const pValues = metrics.map((m) => Math.min(m.statistics.tTest.pValue, m.statistics.mannWhitney.pValue));

  // Apply correction
  let adjustedPValues: number[];
  switch (correctionMethod) {
    case 'bonferroni':
      adjustedPValues = bonferroniCorrection(pValues);
      break;
    case 'holm':
      adjustedPValues = holmBonferroniCorrection(pValues);
      break;
    case 'fdr':
      adjustedPValues = benjaminiHochbergCorrection(pValues);
      break;
    default:
      adjustedPValues = pValues;
  }

  // Apply adjusted p-values
  metrics.forEach((m, i) => {
    m.adjustedPValue = adjustedPValues[i];
    m.significantAfterCorrection = adjustedPValues[i] < alpha;
  });

  // Identify significant differences
  const significantDifferences = metrics
    .filter((m) => m.significantAfterCorrection)
    .map((m) => {
      const dir = m.difference.direction === 'higher' ? 'higher' : 'lower';
      return `${m.metricName}: ${result2.experiment.name} has ${Math.abs(m.difference.percent).toFixed(1)}% ${dir} (p=${m.adjustedPValue?.toFixed(4)}, d=${m.statistics.effectSize.cohensD.toFixed(2)})`;
    });

  // Generate conclusion
  let conclusion: string;
  if (significantDifferences.length === 0) {
    conclusion = `No statistically significant differences between ${result1.experiment.name} and ${result2.experiment.name} after ${correctionMethod} correction.`;
  } else if (significantDifferences.length <= 3) {
    conclusion = `Found ${significantDifferences.length} significant difference(s) between experiments.`;
  } else {
    conclusion = `Found ${significantDifferences.length} significant differences - experiments show substantially different behavior.`;
  }

  return {
    experiment1: result1.experiment.name,
    experiment2: result2.experiment.name,
    metrics,
    overallConclusion: conclusion,
    significantDifferences,
  };
}

// =============================================================================
// Report Generation
// =============================================================================

function generateReport(
  files: string[],
  results: EnsembleResult[],
  alpha: number,
  correctionMethod: 'none' | 'bonferroni' | 'holm' | 'fdr'
): ComparisonReport {
  const pairwiseComparisons: PairwiseComparison[] = [];

  // Compare all pairs
  for (let i = 0; i < results.length; i++) {
    for (let j = i + 1; j < results.length; j++) {
      const comparison = compareExperiments(results[i], results[j], alpha, correctionMethod);
      pairwiseComparisons.push(comparison);
    }
  }

  // Calculate summary statistics
  let totalComparisons = 0;
  let significantBeforeCorrection = 0;
  let significantAfterCorrection = 0;
  const allEffects: Array<{
    metric: string;
    effectSize: number;
    interpretation: string;
    between: [string, string];
  }> = [];

  for (const comparison of pairwiseComparisons) {
    for (const metric of comparison.metrics) {
      totalComparisons++;
      if (metric.statistics.tTest.significant || metric.statistics.mannWhitney.significant) {
        significantBeforeCorrection++;
      }
      if (metric.significantAfterCorrection) {
        significantAfterCorrection++;
      }
      allEffects.push({
        metric: metric.metricName,
        effectSize: Math.abs(metric.statistics.effectSize.cohensD),
        interpretation: metric.statistics.effectSize.interpretation,
        between: [comparison.experiment1, comparison.experiment2],
      });
    }
  }

  // Get top 5 largest effects
  const largestEffects = allEffects
    .sort((a, b) => b.effectSize - a.effectSize)
    .slice(0, 5);

  // Generate recommendations
  const recommendations: string[] = [];

  if (significantAfterCorrection === 0) {
    recommendations.push('No significant differences found. Experiments may be equivalent or sample size may be too small.');
  }

  if (significantBeforeCorrection > significantAfterCorrection * 2) {
    recommendations.push(`Many findings (${significantBeforeCorrection - significantAfterCorrection}) did not survive correction. Consider increasing sample size.`);
  }

  const lowPowerMetrics = pairwiseComparisons
    .flatMap((c) => c.metrics)
    .filter((m) => m.statistics.power < 0.8);

  if (lowPowerMetrics.length > 0) {
    recommendations.push(`${lowPowerMetrics.length} comparisons have low power (<80%). Consider running more seeds.`);
  }

  if (largestEffects.some((e) => e.interpretation === 'large')) {
    recommendations.push('Large effect sizes detected - results may have practical significance.');
  }

  return {
    timestamp: new Date().toISOString(),
    files,
    experimentNames: results.map((r) => r.experiment.name),
    alpha,
    correctionMethod,
    pairwiseComparisons,
    summary: {
      totalComparisons,
      significantBeforeCorrection,
      significantAfterCorrection,
      largestEffects,
    },
    recommendations,
  };
}

// =============================================================================
// Output Formatters
// =============================================================================

function formatTable(report: ComparisonReport): string {
  const lines: string[] = [];

  lines.push('╔══════════════════════════════════════════════════════════════════════════════════╗');
  lines.push('║                    ENSEMBLE COMPARISON REPORT                                   ║');
  lines.push('╠══════════════════════════════════════════════════════════════════════════════════╣');
  lines.push(`║  Generated: ${report.timestamp.padEnd(68)}║`);
  lines.push(`║  Alpha: ${report.alpha.toString().padEnd(72)}║`);
  lines.push(`║  Correction: ${report.correctionMethod.padEnd(67)}║`);
  lines.push('╠══════════════════════════════════════════════════════════════════════════════════╣');

  for (const comparison of report.pairwiseComparisons) {
    lines.push(`║  ${comparison.experiment1} vs ${comparison.experiment2}`.padEnd(83) + '║');
    lines.push('╟──────────────────────────────────────────────────────────────────────────────────╢');

    lines.push('║  Metric                     │ Exp1 Mean ± Std     │ Exp2 Mean ± Std     │ p-adj ║');
    lines.push('╟─────────────────────────────┼─────────────────────┼─────────────────────┼───────╢');

    for (const m of comparison.metrics) {
      const exp1 = `${m.experiment1.mean.toFixed(2)} ± ${m.experiment1.std.toFixed(2)}`;
      const exp2 = `${m.experiment2.mean.toFixed(2)} ± ${m.experiment2.std.toFixed(2)}`;
      const pAdj = m.adjustedPValue !== undefined ? m.adjustedPValue.toFixed(3) : 'N/A';
      const sig = m.significantAfterCorrection ? '*' : ' ';

      lines.push(
        `║  ${m.metricName.substring(0, 26).padEnd(26)} │ ${exp1.padEnd(19)} │ ${exp2.padEnd(19)} │ ${pAdj}${sig}║`
      );
    }

    lines.push('╟──────────────────────────────────────────────────────────────────────────────────╢');

    if (comparison.significantDifferences.length > 0) {
      lines.push('║  Significant differences:'.padEnd(83) + '║');
      for (const diff of comparison.significantDifferences) {
        const truncated = diff.length > 78 ? diff.substring(0, 75) + '...' : diff;
        lines.push(`║    ${truncated}`.padEnd(83) + '║');
      }
    } else {
      lines.push('║  No significant differences after correction'.padEnd(83) + '║');
    }

    lines.push('╟──────────────────────────────────────────────────────────────────────────────────╢');
  }

  lines.push('║  SUMMARY'.padEnd(83) + '║');
  lines.push('╟──────────────────────────────────────────────────────────────────────────────────╢');
  lines.push(`║    Total comparisons: ${report.summary.totalComparisons}`.padEnd(83) + '║');
  lines.push(`║    Significant (before correction): ${report.summary.significantBeforeCorrection}`.padEnd(83) + '║');
  lines.push(`║    Significant (after correction): ${report.summary.significantAfterCorrection}`.padEnd(83) + '║');
  lines.push('║'.padEnd(83) + '║');
  lines.push('║  Largest Effect Sizes:'.padEnd(83) + '║');
  for (const effect of report.summary.largestEffects) {
    lines.push(`║    ${effect.metric}: d=${effect.effectSize.toFixed(2)} (${effect.interpretation})`.padEnd(83) + '║');
  }
  lines.push('╟──────────────────────────────────────────────────────────────────────────────────╢');
  lines.push('║  RECOMMENDATIONS'.padEnd(83) + '║');
  for (const rec of report.recommendations) {
    const truncated = rec.length > 78 ? rec.substring(0, 75) + '...' : rec;
    lines.push(`║    ${truncated}`.padEnd(83) + '║');
  }
  lines.push('╚══════════════════════════════════════════════════════════════════════════════════╝');

  return lines.join('\n');
}

function formatCSV(report: ComparisonReport): string {
  const lines: string[] = [];

  // Header
  lines.push('Experiment1,Experiment2,Metric,Exp1_Mean,Exp1_Std,Exp2_Mean,Exp2_Std,Diff_Abs,Diff_Pct,t_pValue,MW_pValue,Adjusted_pValue,Significant,Cohens_d,Effect_Interpretation,Power');

  // Data rows
  for (const comparison of report.pairwiseComparisons) {
    for (const m of comparison.metrics) {
      lines.push([
        comparison.experiment1,
        comparison.experiment2,
        m.metricName,
        m.experiment1.mean.toFixed(4),
        m.experiment1.std.toFixed(4),
        m.experiment2.mean.toFixed(4),
        m.experiment2.std.toFixed(4),
        m.difference.absolute.toFixed(4),
        m.difference.percent.toFixed(2),
        m.statistics.tTest.pValue.toFixed(4),
        m.statistics.mannWhitney.pValue.toFixed(4),
        m.adjustedPValue?.toFixed(4) ?? 'N/A',
        m.significantAfterCorrection ? 'Yes' : 'No',
        m.statistics.effectSize.cohensD.toFixed(4),
        m.statistics.effectSize.interpretation,
        m.statistics.power.toFixed(4),
      ].join(','));
    }
  }

  return lines.join('\n');
}

function formatLaTeX(report: ComparisonReport): string {
  const lines: string[] = [];

  lines.push('% Auto-generated by AgentsCity Ensemble Comparison Tool');
  lines.push(`% Generated: ${report.timestamp}`);
  lines.push('');

  for (const comparison of report.pairwiseComparisons) {
    lines.push('\\begin{table}[htbp]');
    lines.push('\\centering');
    lines.push(`\\caption{Comparison: ${comparison.experiment1} vs ${comparison.experiment2}}`);
    lines.push('\\label{tab:comparison}');
    lines.push('\\begin{tabular}{lrrrrrl}');
    lines.push('\\toprule');
    lines.push('Metric & \\multicolumn{2}{c}{' + comparison.experiment1 + '} & \\multicolumn{2}{c}{' + comparison.experiment2 + '} & $p$-adj & Sig. \\\\');
    lines.push(' & Mean & Std & Mean & Std & & \\\\');
    lines.push('\\midrule');

    for (const m of comparison.metrics) {
      const sig = m.significantAfterCorrection ? '$\\checkmark$' : '';
      lines.push(
        `${m.metricName} & ${m.experiment1.mean.toFixed(2)} & ${m.experiment1.std.toFixed(2)} & ${m.experiment2.mean.toFixed(2)} & ${m.experiment2.std.toFixed(2)} & ${m.adjustedPValue?.toFixed(3) ?? 'N/A'} & ${sig} \\\\`
      );
    }

    lines.push('\\bottomrule');
    lines.push('\\end{tabular}');
    lines.push('\\end{table}');
    lines.push('');
  }

  // Summary table
  lines.push('\\begin{table}[htbp]');
  lines.push('\\centering');
  lines.push('\\caption{Largest Effect Sizes}');
  lines.push('\\label{tab:effects}');
  lines.push('\\begin{tabular}{lrl}');
  lines.push('\\toprule');
  lines.push('Metric & Cohen\'s $d$ & Interpretation \\\\');
  lines.push('\\midrule');

  for (const effect of report.summary.largestEffects) {
    lines.push(`${effect.metric} & ${effect.effectSize.toFixed(2)} & ${effect.interpretation} \\\\`);
  }

  lines.push('\\bottomrule');
  lines.push('\\end{tabular}');
  lines.push('\\end{table}');

  return lines.join('\n');
}

// =============================================================================
// Main
// =============================================================================

async function main(): Promise<void> {
  const args = parseArguments();

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  if (args.files.length < 2) {
    console.error('Error: At least 2 files are required for comparison');
    console.error('Use -h or --help for usage information');
    process.exit(1);
  }

  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║        AgentsCity Ensemble Comparison Tool                   ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log();
  console.log(`  Files: ${args.files.length}`);
  console.log(`  Alpha: ${args.alpha}`);
  console.log(`  Correction: ${args.correction}`);
  console.log(`  Output format: ${args.format}`);
  console.log();

  // Load all files
  console.log('Loading ensemble results...');
  const results: EnsembleResult[] = [];
  for (const file of args.files) {
    try {
      const result = loadEnsembleResult(file);
      results.push(result);
      console.log(`  ✓ Loaded: ${file} (${result.experiment.name}, ${result.perRun.length} runs)`);
    } catch (error) {
      console.error(`  ✗ Failed to load: ${file}`);
      console.error(`    ${error instanceof Error ? error.message : error}`);
      process.exit(1);
    }
  }

  console.log();
  console.log('Generating comparison report...');

  // Generate report
  const report = generateReport(args.files, results, args.alpha, args.correction);

  // Format output
  let output: string;
  switch (args.format) {
    case 'json':
      output = JSON.stringify(report, null, 2);
      break;
    case 'csv':
      output = formatCSV(report);
      break;
    case 'latex':
      output = formatLaTeX(report);
      break;
    default:
      output = formatTable(report);
  }

  // Write output
  if (args.output) {
    const outputPath = path.isAbsolute(args.output)
      ? args.output
      : path.join(process.cwd(), args.output);

    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    fs.writeFileSync(outputPath, output);
    console.log(`  ✓ Results written to: ${outputPath}`);
  } else {
    console.log();
    console.log(output);
  }

  // Print quick summary
  console.log();
  console.log('Summary:');
  console.log(`  Total comparisons: ${report.summary.totalComparisons}`);
  console.log(`  Significant (after ${args.correction} correction): ${report.summary.significantAfterCorrection}`);

  if (report.recommendations.length > 0) {
    console.log();
    console.log('Recommendations:');
    for (const rec of report.recommendations) {
      console.log(`  • ${rec}`);
    }
  }

  process.exit(0);
}

// Run if this is the entry point
if (import.meta.main) {
  main().catch((error) => {
    console.error('[Error]', error);
    process.exit(1);
  });
}

// Export for programmatic use
export { loadEnsembleResult, compareExperiments, generateReport, formatTable, formatCSV, formatLaTeX };
