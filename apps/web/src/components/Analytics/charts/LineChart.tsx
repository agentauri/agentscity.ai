/**
 * LineChart - Simple SVG line chart for temporal data
 */

interface DataPoint {
  x: number;
  y: number;
  label?: string;
}

interface LineData {
  id: string;
  color: string;
  points: DataPoint[];
}

interface LineChartProps {
  data: LineData[];
  height?: number;
  showDots?: boolean;
  showGrid?: boolean;
  xLabel?: string;
  yLabel?: string;
}

export function LineChart({
  data,
  height = 150,
  showDots = true,
  showGrid = true,
}: LineChartProps) {
  if (data.length === 0 || data.every((d) => d.points.length === 0)) {
    return (
      <div className="flex items-center justify-center h-20 text-city-text-muted text-sm">
        No data
      </div>
    );
  }

  // Calculate bounds
  const allPoints = data.flatMap((d) => d.points);
  const minX = Math.min(...allPoints.map((p) => p.x));
  const maxX = Math.max(...allPoints.map((p) => p.x));
  const minY = 0; // Always start from 0
  const maxY = Math.max(...allPoints.map((p) => p.y), 1);

  const padding = { top: 10, right: 10, bottom: 25, left: 40 };
  const width = 300; // Will be responsive via viewBox

  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  // Scale functions
  const scaleX = (x: number) => {
    if (maxX === minX) return padding.left + chartWidth / 2;
    return padding.left + ((x - minX) / (maxX - minX)) * chartWidth;
  };

  const scaleY = (y: number) => {
    if (maxY === minY) return padding.top + chartHeight / 2;
    return padding.top + chartHeight - ((y - minY) / (maxY - minY)) * chartHeight;
  };

  // Generate path for each line
  const generatePath = (points: DataPoint[]) => {
    if (points.length === 0) return '';
    const sortedPoints = [...points].sort((a, b) => a.x - b.x);
    return sortedPoints
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${scaleX(p.x)} ${scaleY(p.y)}`)
      .join(' ');
  };

  // Grid lines
  const yGridLines = 4;
  const xGridLines = Math.min(5, maxX - minX + 1);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full"
      preserveAspectRatio="xMidYMid meet"
    >
      {/* Grid */}
      {showGrid && (
        <g className="text-city-surface-hover">
          {/* Horizontal grid lines */}
          {Array.from({ length: yGridLines + 1 }).map((_, i) => {
            const y = padding.top + (chartHeight * i) / yGridLines;
            return (
              <line
                key={`h-${i}`}
                x1={padding.left}
                y1={y}
                x2={width - padding.right}
                y2={y}
                stroke="currentColor"
                strokeOpacity={0.3}
                strokeDasharray="2,2"
              />
            );
          })}
          {/* Vertical grid lines */}
          {Array.from({ length: xGridLines }).map((_, i) => {
            const x = padding.left + (chartWidth * i) / (xGridLines - 1 || 1);
            return (
              <line
                key={`v-${i}`}
                x1={x}
                y1={padding.top}
                x2={x}
                y2={height - padding.bottom}
                stroke="currentColor"
                strokeOpacity={0.2}
                strokeDasharray="2,2"
              />
            );
          })}
        </g>
      )}

      {/* Y-axis labels */}
      <g className="text-city-text-muted text-[8px]">
        {Array.from({ length: yGridLines + 1 }).map((_, i) => {
          const value = maxY - (maxY * i) / yGridLines;
          const y = padding.top + (chartHeight * i) / yGridLines;
          return (
            <text
              key={`y-${i}`}
              x={padding.left - 5}
              y={y + 3}
              textAnchor="end"
              fill="currentColor"
            >
              {value >= 1000 ? `${(value / 1000).toFixed(0)}k` : value.toFixed(0)}
            </text>
          );
        })}
      </g>

      {/* X-axis labels */}
      <g className="text-city-text-muted text-[8px]">
        {Array.from({ length: Math.min(5, maxX - minX + 1) }).map((_, i) => {
          const value = minX + Math.round(((maxX - minX) * i) / (Math.min(5, maxX - minX + 1) - 1 || 1));
          const x = scaleX(value);
          return (
            <text
              key={`x-${i}`}
              x={x}
              y={height - 5}
              textAnchor="middle"
              fill="currentColor"
            >
              {value}
            </text>
          );
        })}
      </g>

      {/* Lines */}
      {data.map((line) => (
        <g key={line.id}>
          <path
            d={generatePath(line.points)}
            fill="none"
            stroke={line.color}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Dots */}
          {showDots &&
            line.points.map((point, i) => (
              <circle
                key={`${line.id}-${i}`}
                cx={scaleX(point.x)}
                cy={scaleY(point.y)}
                r={3}
                fill={line.color}
              />
            ))}
        </g>
      ))}

      {/* Legend */}
      {data.length > 1 && (
        <g transform={`translate(${padding.left}, ${height - 8})`}>
          {data.slice(0, 4).map((line, i) => (
            <g key={line.id} transform={`translate(${i * 60}, 0)`}>
              <rect x={0} y={-4} width={8} height={8} fill={line.color} rx={1} />
              <text x={12} y={3} className="text-[7px]" fill="#888">
                {line.id.slice(0, 6)}
              </text>
            </g>
          ))}
        </g>
      )}
    </svg>
  );
}
