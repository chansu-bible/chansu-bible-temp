import { SECTIONS, type FieldDesc, type FormState, type FormValue, type Row } from '../canonForm.ts'
import type { CanonKind } from '../types.ts'
import ArrayEditor from './ArrayEditor.tsx'
import { NumberField, SelectField, TextAreaField, TextField } from './Fields.tsx'

// 필드 설명대로 설정집 편집 폼을 그린다. 사실(facts)과 설계(design)를 다른 상자에 둔다.
export default function CanonFormView({
  kind,
  form,
  onChange,
  idLocked,
  disabled,
}: {
  kind: CanonKind
  form: FormState
  onChange: (path: string, value: FormValue) => void
  idLocked: boolean
  disabled?: boolean
}) {
  return (
    <div className="canon-form">
      {SECTIONS[kind].map((section) => (
        <section key={section.title} className={`form-section tone-${section.tone}`} aria-label={section.title}>
          <header className="form-section-head">
            <h3>{section.title}</h3>
            {section.tone === 'facts' && <span className="tone-note">본문 근거 · 절 인용</span>}
            {section.tone === 'design' && <span className="tone-note">본문 근거 없음 · 제작 결정</span>}
          </header>
          <div className="form-grid">
            {section.fields.map((f) => (
              <FieldView
                key={f.path}
                field={f}
                value={form[f.path]}
                onChange={(v) => onChange(f.path, v)}
                disabled={disabled || (f.path === 'id' && idLocked)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

function FieldView({
  field,
  value,
  onChange,
  disabled,
}: {
  field: FieldDesc
  value: FormValue | undefined
  onChange: (value: FormValue) => void
  disabled?: boolean
}) {
  const text = typeof value === 'string' ? value : ''
  switch (field.type) {
    case 'text':
      return (
        <TextField
          label={field.required ? `${field.label} *` : field.label}
          value={text}
          onChange={onChange}
          hint={field.hint}
          disabled={disabled}
        />
      )
    case 'textarea':
      return (
        <div className="span-2">
          <TextAreaField label={field.label} value={text} onChange={onChange} hint={field.hint} disabled={disabled} />
        </div>
      )
    case 'lines':
      return (
        <div className="span-2">
          <TextAreaField
            label={field.min ? `${field.label} *` : field.label}
            value={text}
            onChange={onChange}
            hint={field.hint}
            disabled={disabled}
          />
        </div>
      )
    case 'number':
      return (
        <NumberField
          label={field.label}
          value={text}
          onChange={onChange}
          hint={field.hint}
          step={field.integer ? '1' : 'any'}
          min={field.min}
          max={field.max}
          disabled={disabled}
        />
      )
    case 'select':
      return (
        <SelectField
          label={field.label}
          value={text}
          onChange={onChange}
          options={field.options.map((o) => ({ value: o, label: o }))}
          disabled={disabled}
        />
      )
    case 'table':
      return (
        <div className="span-2">
          <ArrayEditor
            label={field.label}
            columns={field.columns}
            rows={Array.isArray(value) ? (value as Row[]) : []}
            onChange={onChange}
            disabled={disabled}
          />
        </div>
      )
  }
}
