import { useState } from 'react'
import { api } from '../api.ts'
import type { ImageVersion } from '../types.ts'
import { errorMessage } from '../useLoad.ts'
import DataTable from './DataTable.tsx'
import { TextField } from './Fields.tsx'

const ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/
const EMPTY = { id: '', label: '', note: '' }

// 그림 버전 표와 새 버전 폼. images 단계는 목록의 마지막 버전에 그린다.
export default function VersionList({
  versions,
  counts,
  onCreated,
}: {
  versions: ImageVersion[]
  counts: Record<string, number> // 버전 id → 그림 있는 장면 수
  onCreated: (versions: ImageVersion[]) => void
}) {
  const [form, setForm] = useState<ImageVersion>(EMPTY)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const current = versions.at(-1)?.id ?? null

  function change(key: keyof ImageVersion, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
    setNote(null)
  }

  async function create() {
    const version = { id: form.id.trim(), label: form.label.trim(), note: form.note.trim() }
    if (!ID_PATTERN.test(version.id)) {
      setError('id는 영문 소문자·숫자·하이픈만 쓰고, 소문자나 숫자로 시작해야 해요')
      return
    }
    if (!version.label) {
      setError('이름을 넣으세요')
      return
    }
    setBusy(true)
    setError(null)
    try {
      onCreated(await api.imageVersionCreate(version))
      setForm(EMPTY)
      setNote(`${version.id} 버전을 만들었어요`)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card">
      <h2>그림 버전</h2>
      <p className="muted">images 단계는 마지막 버전에 그려요. 화풍을 크게 바꿀 때 새 버전을 만들면 이전 그림이 남아요.</p>

      <DataTable
        caption="그림 버전"
        rows={versions}
        rowKey={(v) => v.id}
        empty="그림 버전이 아직 없어요"
        columns={[
          {
            key: 'id',
            header: 'id',
            cell: (v) => (
              <>
                <code>{v.id}</code>
                {v.id === current && <span className="tag tag-current">지금 그리는 버전</span>}
              </>
            ),
          },
          { key: 'label', header: '이름', cell: (v) => v.label },
          { key: 'note', header: '메모', cell: (v) => v.note || <span className="muted">—</span> },
          { key: 'count', header: '그림 수', numeric: true, cell: (v) => counts[v.id] ?? 0 },
        ]}
      />

      <form
        className="uploader"
        onSubmit={(e) => {
          e.preventDefault()
          void create()
        }}
      >
        <h3>새 버전</h3>
        <TextField
          label="id"
          value={form.id}
          onChange={(v) => change('id', v)}
          disabled={busy}
          placeholder="v2"
          hint="영문 소문자·숫자·하이픈"
        />
        <TextField label="이름" value={form.label} onChange={(v) => change('label', v)} disabled={busy} />
        <TextField label="메모" value={form.note} onChange={(v) => change('note', v)} disabled={busy} />
        <button type="submit" className="btn btn-primary" disabled={busy || !form.id.trim() || !form.label.trim()}>
          버전 만들기
        </button>
      </form>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {note && (
        <p className="saved-note" role="status">
          {note}
        </p>
      )}
    </section>
  )
}
