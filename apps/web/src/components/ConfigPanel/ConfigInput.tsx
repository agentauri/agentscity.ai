/**
 * ConfigInput Component
 *
 * Reusable input component for configuration values.
 * Supports number, boolean (toggle), and select inputs.
 */

import React from 'react';

interface BaseInputProps {
  label: string;
  description?: string;
  isRuntimeModifiable?: boolean;
  disabled?: boolean;
}

interface NumberInputProps extends BaseInputProps {
  type: 'number';
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
}

interface BooleanInputProps extends BaseInputProps {
  type: 'boolean';
  value: boolean;
  onChange: (value: boolean) => void;
}

interface SelectInputProps extends BaseInputProps {
  type: 'select';
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}

type ConfigInputProps = NumberInputProps | BooleanInputProps | SelectInputProps;

export function ConfigInput(props: ConfigInputProps) {
  const { label, description, isRuntimeModifiable, disabled } = props;

  return (
    <div className="flex items-start justify-between py-2 border-b border-gray-700 last:border-0">
      <div className="flex-1 min-w-0 pr-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-200">{label}</span>
          {isRuntimeModifiable && (
            <span className="text-xs text-yellow-400" title="Applied immediately without restart">
              ⚡
            </span>
          )}
        </div>
        {description && (
          <p className="text-xs text-gray-500 mt-0.5">{description}</p>
        )}
      </div>
      <div className="flex-shrink-0">
        {props.type === 'number' && (
          <NumberInput {...props} disabled={disabled} label={label} />
        )}
        {props.type === 'boolean' && (
          <BooleanInput {...props} disabled={disabled} label={label} />
        )}
        {props.type === 'select' && (
          <SelectInput {...props} disabled={disabled} label={label} />
        )}
      </div>
    </div>
  );
}

function NumberInput({
  value,
  onChange,
  min,
  max,
  step = 1,
  unit,
  disabled,
  label,
}: NumberInputProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value;
    if (rawValue === '' || rawValue === '-') return;

    const parsed = parseFloat(rawValue);
    if (isNaN(parsed)) return;

    // Clamp to min/max if specified
    let clamped = parsed;
    if (min !== undefined) clamped = Math.max(min, clamped);
    if (max !== undefined) clamped = Math.min(max, clamped);

    onChange(clamped);
  };

  const isAtMin = min !== undefined && value <= min;
  const isAtMax = max !== undefined && value >= max;

  return (
    <div className="flex items-center gap-1">
      <input
        type="number"
        value={value}
        onChange={handleChange}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        aria-label={label}
        className={`
          w-20 px-2 py-1 text-sm text-right bg-gray-700 border rounded
          focus:outline-none focus:border-blue-500 disabled:opacity-50
          ${isAtMin || isAtMax ? 'border-yellow-500/50' : 'border-gray-600'}
        `}
      />
      {unit && <span className="text-xs text-gray-400">{unit}</span>}
    </div>
  );
}

function BooleanInput({ value, onChange, disabled, label }: BooleanInputProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      aria-label={label}
      onClick={() => onChange(!value)}
      disabled={disabled}
      className={`
        w-11 h-6 rounded-full relative transition-colors duration-200
        ${value ? 'bg-blue-500' : 'bg-gray-600'}
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 focus:ring-offset-gray-900
      `}
    >
      <span
        className={`
          absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full transition-transform duration-200 shadow-sm
          ${value ? 'translate-x-5' : 'translate-x-0'}
        `}
      />
    </button>
  );
}

function SelectInput({
  value,
  onChange,
  options,
  disabled,
  label,
}: SelectInputProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      aria-label={label}
      className="px-2 py-1 text-sm bg-gray-700 border border-gray-600 rounded focus:outline-none focus:border-blue-500 disabled:opacity-50"
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

export default ConfigInput;
