import type { Row, TableColumn } from '../canonForm.ts'

// 객체 배열을 행 추가/삭제 표로 편집한다(관계, 옷차림 등).
export default function ArrayEditor({
  label,
  columns,
  rows,
  onChange,
  disabled,
}: {
  label: string
  columns: TableColumn[]
  rows: Row[]
  onChange: (rows: Row[]) => void
  disabled?: boolean
}) {
  function update(i: number, key: string, value: string) {
    onChange(rows.map((r, j) => (j === i ? { ...r, [key]: value } : r)))
  }

  function add() {
    onChange([...rows, Object.fromEntries(columns.map((c) => [c.key, '']))])
  }

  function remove(i: number) {
    onChange(rows.filter((_, j) => j !== i))
  }

  return (
    <fieldset className="array-editor">
      <legend>{label}</legend>
      {rows.length > 0 ? (
        <table>
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key} scope="col">
                  {c.label}
                </th>
              ))}
              <th scope="col">
                <span className="sr-only">삭제</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                {columns.map((c) => (
                  <td key={c.key}>
                    <input
                      type="text"
                      aria-label={`${label} ${i + 1}행 ${c.label}`}
                      value={row[c.key] ?? ''}
                      disabled={disabled}
                      onChange={(e) => update(i, c.key, e.target.value)}
                    />
                  </td>
                ))}
                <td className="row-actions">
                  <button
                    type="button"
                    className="btn btn-small btn-quiet"
                    aria-label={`${label} ${i + 1}행 삭제`}
                    disabled={disabled}
                    onClick={() => remove(i)}
                  >
                    삭제
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="empty">비어 있어요</p>
      )}
      <button type="button" className="btn btn-small" disabled={disabled} onClick={add}>
        행 추가
      </button>
    </fieldset>
  )
}
