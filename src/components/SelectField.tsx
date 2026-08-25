import { selectFieldCls } from "@/components/formStyles";

export interface SelectFieldOption {
  value: string;
  label: string;
}

export function SelectField({
  value,
  options,
  onChange,
  id,
  "aria-label": ariaLabel,
  disabled = false,
  className = "",
}: {
  value: string | number;
  options: readonly SelectFieldOption[];
  onChange: (value: string) => void;
  id?: string;
  "aria-label"?: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <select
      id={id}
      aria-label={ariaLabel}
      value={String(value)}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className={`${selectFieldCls} ${className}`}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
