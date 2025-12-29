/**
 * BarChart - Simple horizontal SVG bar chart
 */

interface BarData {
  label: string;
  value: number;
  color?: string;
}

interface BarChartProps {
  data: BarData[];
  height?: number;
  showValues?: boolean;
  formatValue?: (value: number) => string;
}

// LLM colors matching the agent colors
const llmColors: Record<string, string> = {
  claude: '#e07a5f',
  codex: '#6a8caf',
  gemini: '#81b29a',
  deepseek: '#f2cc8f',
  qwen: '#9a8bc2',
  glm: '#d4a5a5',
};

export function BarChart({
  data,
  height = 120,
  showValues = true,
  formatValue = (v) => v.toLocaleString(),
}: BarChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-20 text-city-text-muted text-sm">
        No data
      </div>
    );
  }

  const maxValue = Math.max(...data.map((d) => d.value), 1);
  const barHeight = Math.min(24, (height - 20) / data.length);
  const gap = 4;

  return (
    <div className="w-full" style={{ height }}>
      {data.map((d, i) => {
        const barWidth = (d.value / maxValue) * 100;
        const color = d.color || llmColors[d.label.toLowerCase()] || '#888888';

        return (
          <div
            key={d.label}
            className="flex items-center gap-2"
            style={{ height: barHeight + gap, marginBottom: gap }}
          >
            <div className="w-16 text-xs text-city-text-muted truncate text-right">
              {d.label}
            </div>
            <div className="flex-1 h-full bg-city-surface-hover/30 rounded overflow-hidden">
              <div
                className="h-full rounded transition-all duration-300"
                style={{
                  width: `${barWidth}%`,
                  backgroundColor: color,
                }}
              />
            </div>
            {showValues && (
              <div className="w-16 text-xs text-city-text tabular-nums text-right">
                {formatValue(d.value)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
