import type { ReactNode } from 'react'

export type Column<T> = {
  key: string
  header: ReactNode
  cell: (row: T) => ReactNode
  numeric?: boolean
}

type Props<T> = {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string
  caption?: string
  empty?: string
  // 행을 고를 수 있으면 클릭과 Enter로 고른다.
  onSelect?: (row: T) => void
  selectedKey?: string | null
}

export default function DataTable<T>({ columns, rows, rowKey, caption, empty, onSelect, selectedKey }: Props<T>) {
  if (rows.length === 0) return <p className="empty">{empty ?? '항목이 없어요'}</p>

  return (
    <div className="table-wrap">
      <table className="data-table">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" className={c.numeric ? 'num' : undefined}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const key = rowKey(row)
            const selected = selectedKey === key
            return (
              <tr
                key={key}
                className={[onSelect ? 'selectable' : '', selected ? 'selected' : ''].join(' ').trim() || undefined}
                onClick={onSelect ? () => onSelect(row) : undefined}
                onKeyDown={
                  onSelect
                    ? (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          onSelect(row)
                        }
                      }
                    : undefined
                }
                tabIndex={onSelect ? 0 : undefined}
                aria-selected={onSelect ? selected : undefined}
              >
                {columns.map((c) => (
                  <td key={c.key} className={c.numeric ? 'num' : undefined}>
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
