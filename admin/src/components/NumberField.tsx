import type { InputHTMLAttributes, FocusEvent, ChangeEvent } from 'react';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'> & {
  /** Current value — use '' for an empty field */
  value: number | string;
  /** Called with '' when cleared, or a finite number when typed */
  onValueChange: (value: number | '') => void;
};

/**
 * Number input that clears a lone "0" on focus so users can type immediately.
 */
export function NumberField({ value, onValueChange, onFocus, onBlur, ...rest }: Props) {
  const display = value === '' || value === null || value === undefined ? '' : String(value);

  const handleFocus = (e: FocusEvent<HTMLInputElement>) => {
    if (display === '0') {
      onValueChange('');
    } else {
      e.currentTarget.select();
    }
    onFocus?.(e);
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (raw === '' || raw === '-') {
      onValueChange('');
      return;
    }
    const n = Number(raw);
    if (!Number.isNaN(n)) onValueChange(n);
  };

  return (
    <input
      type="number"
      {...rest}
      value={display}
      onFocus={handleFocus}
      onChange={handleChange}
      onBlur={onBlur}
    />
  );
}

/** String-backed variant for forms that keep number fields as strings */
export function NumberFieldString({
  value,
  onValueChange,
  onFocus,
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'> & {
  value: string;
  onValueChange: (value: string) => void;
}) {
  const handleFocus = (e: FocusEvent<HTMLInputElement>) => {
    if (value === '0') onValueChange('');
    else e.currentTarget.select();
    onFocus?.(e);
  };

  return (
    <input
      type="number"
      {...rest}
      value={value}
      onFocus={handleFocus}
      onChange={(e) => onValueChange(e.target.value)}
    />
  );
}
