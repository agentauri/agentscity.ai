#!/usr/bin/env bun
/**
 * Metric Validation Script
 *
 * Runs the metric validation test suite to verify that all simulation metrics
 * are calculating correctly.
 *
 * Usage:
 *   bun run src/scripts/validate-metrics.ts [options]
 *
 * Options:
 *   --ci          Run in CI mode (exit code 1 on failure)
 *   --verbose     Show detailed test output
 *   --filter=X    Only run tests matching X
 *   --category=X  Only run tests in category (economy|survival|social|behavior)
 *   --list        List all available tests
 *   --help        Show this help message
 *
 * Examples:
 *   bun run src/scripts/validate-metrics.ts
 *   bun run src/scripts/validate-metrics.ts --ci
 *   bun run src/scripts/validate-metrics.ts --filter=gini
 *   bun run src/scripts/validate-metrics.ts --category=economy --verbose
 */

import {
  runMetricValidation,
  runMetricValidationCI,
  listMetricTests,
} from '../analysis/metric-validator';

// =============================================================================
// CLI Argument Parsing
// =============================================================================

function parseArgs(): {
  ci: boolean;
  verbose: boolean;
  filter?: string;
  category?: 'economy' | 'survival' | 'social' | 'behavior';
  list: boolean;
  help: boolean;
} {
  const args = process.argv.slice(2);
  const result = {
    ci: false,
    verbose: false,
    filter: undefined as string | undefined,
    category: undefined as 'economy' | 'survival' | 'social' | 'behavior' | undefined,
    list: false,
    help: false,
  };

  for (const arg of args) {
    if (arg === '--ci') {
      result.ci = true;
    } else if (arg === '--verbose' || arg === '-v') {
      result.verbose = true;
    } else if (arg.startsWith('--filter=')) {
      result.filter = arg.split('=')[1];
    } else if (arg.startsWith('--category=')) {
      const category = arg.split('=')[1] as typeof result.category;
      if (['economy', 'survival', 'social', 'behavior'].includes(category!)) {
        result.category = category;
      } else {
        console.error(`Invalid category: ${category}`);
        console.error('Valid categories: economy, survival, social, behavior');
        process.exit(1);
      }
    } else if (arg === '--list' || arg === '-l') {
      result.list = true;
    } else if (arg === '--help' || arg === '-h') {
      result.help = true;
    } else {
      console.error(`Unknown argument: ${arg}`);
      result.help = true;
    }
  }

  return result;
}

function showHelp(): void {
  console.log(`
Metric Validation Script - AgentsCity Scientific Framework

Usage:
  bun run src/scripts/validate-metrics.ts [options]

Options:
  --ci          Run in CI mode (exit code 1 on failure)
  --verbose     Show detailed test output
  --filter=X    Only run tests matching X (case-insensitive)
  --category=X  Only run tests in category
                Categories: economy, survival, social, behavior
  --list        List all available tests
  --help        Show this help message

Examples:
  # Run all tests
  bun run src/scripts/validate-metrics.ts

  # Run in CI mode (for automated testing)
  bun run src/scripts/validate-metrics.ts --ci

  # Run only Gini-related tests
  bun run src/scripts/validate-metrics.ts --filter=gini

  # Run economy tests with verbose output
  bun run src/scripts/validate-metrics.ts --category=economy --verbose

  # List all available tests
  bun run src/scripts/validate-metrics.ts --list

Test Categories:
  economy   - Tests for economic metrics (Gini, wealth distribution)
  survival  - Tests for survival metrics (death rates, health)
  social    - Tests for social metrics (cooperation, trust)
  behavior  - Tests for behavioral metrics (action frequencies)
`);
}

function showTestList(): void {
  const tests = listMetricTests();

  console.log('\nAvailable Metric Validation Tests:\n');

  // Group by category
  const byCategory: Record<string, typeof tests> = {};
  for (const test of tests) {
    if (!byCategory[test.category]) {
      byCategory[test.category] = [];
    }
    byCategory[test.category].push(test);
  }

  for (const [category, categoryTests] of Object.entries(byCategory)) {
    console.log(`\x1b[1m${category.toUpperCase()}\x1b[0m`);
    for (const test of categoryTests) {
      console.log(`  ${test.name}`);
      console.log(`    ${test.description}`);
    }
    console.log('');
  }

  console.log(`Total: ${tests.length} tests\n`);
}

// =============================================================================
// Main Entry Point
// =============================================================================

async function main(): Promise<void> {
  const args = parseArgs();

  // Show help
  if (args.help) {
    showHelp();
    process.exit(0);
  }

  // List tests
  if (args.list) {
    showTestList();
    process.exit(0);
  }

  console.log('========================================');
  console.log('  AgentsCity Metric Validation');
  console.log('========================================');

  // CI mode
  if (args.ci) {
    await runMetricValidationCI();
    return; // Won't reach here due to process.exit
  }

  // Regular mode
  try {
    const report = await runMetricValidation({
      filter: args.filter,
      category: args.category,
      verbose: args.verbose,
    });

    // Print detailed results if verbose
    if (args.verbose) {
      console.log('\nDetailed Results:');
      console.log('----------------------------------------');
      for (const result of report.results) {
        const status = result.passed ? 'PASS' : 'FAIL';
        console.log(`\n[${status}] ${result.name}`);
        console.log(`  Category: ${result.category}`);
        console.log(`  Duration: ${result.duration}ms`);
        if (result.expectedValue) {
          console.log(`  Expected: ${result.expectedValue}`);
        }
        if (result.actualValue) {
          console.log(`  Actual: ${result.actualValue}`);
        }
        if (result.error) {
          console.log(`  Error: ${result.error}`);
        }
      }
    }

    // Summary
    console.log('\n========================================');
    console.log('  Summary');
    console.log('========================================');
    console.log(`  Total:   ${report.totalTests}`);
    console.log(`  Passed:  \x1b[32m${report.passed}\x1b[0m`);
    console.log(`  Failed:  \x1b[31m${report.failed}\x1b[0m`);
    if (report.skipped > 0) {
      console.log(`  Skipped: ${report.skipped}`);
    }
    console.log(`  Time:    ${report.duration}ms`);
    console.log('');

    // Exit code based on results
    process.exit(report.failed > 0 ? 1 : 0);
  } catch (error) {
    console.error('\n[Error] Metric validation failed:', error);
    process.exit(1);
  }
}

// Run main
main();
