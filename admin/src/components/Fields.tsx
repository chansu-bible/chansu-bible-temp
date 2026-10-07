import { useId, type ReactNode } from 'react'

// 라벨이 붙은 입력 칸들. 모두 문자열로 값을 주고받는다.

function FieldShell({ id, label, hint, children }: { id: string; label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children}
      {hint && (
        <small id={`${id}-hint`} className="hint">
          {hint}
        </small>
      )}
    </div>
  )
}

type TextProps = {
  label: string
  value: string
  onChange: (value: string) => void
  hint?: string
  disabled?: boolean
  required?: boolean
  placeholder?: string
}

export function TextField({ label, value, onChange, hint, disabled, required, placeholder }: TextProps) {
  const id = useId()
  return (
    <FieldShell id={id} label={label} hint={hint}>
      <input
        id={id}
        type="text"
        value={value}
        disabled={disabled}
        required={required}
        placeholder={placeholder}
        aria-describedby={hint ? `${id}-hint` : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
    </FieldShell>
  )
}

export function TextAreaField({ label, value, onChange, hint, disabled, rows }: TextProps & { rows?: number }) {
  const id = useId()
  return (
    <FieldShell id={id} label={label} hint={hint}>
      <textarea
        id={id}
        value={value}
        disabled={disabled}
        rows={rows ?? Math.min(8, Math.max(2, value.split('\n').length + 1))}
        aria-describedby={hint ? `${id}-hint` : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
    </FieldShell>
  )
}

export function NumberField({
  label,
  value,
  onChange,
  hint,
  disabled,
  step,
  min,
  max,
}: TextProps & { step?: string; min?: number; max?: number }) {
  const id = useId()
  return (
    <FieldShell id={id} label={label} hint={hint}>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        value={value}
        step={step ?? 'any'}
        min={min}
        max={max}
        disabled={disabled}
        aria-describedby={hint ? `${id}-hint` : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
    </FieldShell>
  )
}

export function SelectField({
  label,
  value,
  onChange,
  options,
  disabled,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
  disabled?: boolean
}) {
  const id = useId()
  return (
    <FieldShell id={id} label={label}>
      <select id={id} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldShell>
  )
}

export function CheckboxField({
  label,
  checked,
  onChange,
  hint,
  disabled,
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  hint?: string
  disabled?: boolean
}) {
  const id = useId()
  return (
    <div className="field field-check">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-describedby={hint ? `${id}-hint` : undefined}
        onChange={(e) => onChange(e.target.checked)}
      />
      <label htmlFor={id}>{label}</label>
      {hint && (
        <small id={`${id}-hint`} className="hint">
          {hint}
        </small>
      )}
    </div>
  )
}
