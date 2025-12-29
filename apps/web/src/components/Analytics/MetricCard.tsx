/**
 * MetricCard - Simple stat display card
 */

import type { ReactNode } from 'react';

interface MetricCardProps {
  label: string;
  value: string | number;
  icon?: ReactNode;
  color?: 'default' | 'success' | 'warning' | 'error';
  trend?: number; // Positive = up, negative = down
  subtitle?: string;
}

const colorClasses = {
  default: 'text-city-text',
  success: 'text-status-success',
  warning: 'text-status-warning',
  error: 'text-status-error',
};

export function MetricCard({ label, value, icon, color = 'default', trend, subtitle }: MetricCardProps) {
  return (
    <div className="bg-city-surface-hover/30 rounded-lg p-3 flex flex-col">
      <div className="flex items-center gap-2 mb-1">
        {icon && <span className="text-city-text-muted">{icon}</span>}
        <span className="text-xs text-city-text-muted uppercase tracking-wide">{label}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className={`text-xl font-bold ${colorClasses[color]}`}>
          {typeof value === 'number' ? value.toLocaleString() : value}
        </span>
        {trend !== undefined && trend !== 0 && (
          <span className={`text-xs ${trend > 0 ? 'text-status-success' : 'text-status-error'}`}>
            {trend > 0 ? '↑' : '↓'} {Math.abs(trend)}
          </span>
        )}
      </div>
      {subtitle && (
        <span className="text-xs text-city-text-muted mt-1">{subtitle}</span>
      )}
    </div>
  );
}
