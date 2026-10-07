import { useId, useRef, useState } from 'react'
import { api, refUrl } from '../api.ts'
import type { Style, StyleReference } from '../types.ts'
import { errorMessage } from '../useLoad.ts'
import { TextField } from './Fields.tsx'

const DIRTY_REASON = '저장하지 않은 변경이 있어요. 먼저 화풍을 저장하세요.'

// 화풍 참고 이미지 격자와 올리기·주소로 가져오기·삭제.
// 이름표·출처 입력은 화풍 폼의 일부라 저장 버튼을 같이 쓴다.
// 올리기·가져오기·삭제는 서버가 바로 화풍을 고치므로 저장하지 않은 변경이 있으면 막는다.
export default function ReferenceGrid({
  references,
  onChange,
  dirty,
  disabled,
  onReplaced,
}: {
  references: StyleReference[]
  onChange: (index: number, key: 'label' | 'source', value: string) => void
  dirty: boolean
  disabled: boolean
  onReplaced: (style: Style) => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const blocked = dirty ? DIRTY_REASON : null
  const locked = busy || disabled

  // 서버를 고치는 동작 하나. 성공하면 돌려받은 화풍으로 폼을 갈아끼운다.
  async function run(action: () => Promise<Style>, done: string): Promise<boolean> {
    setBusy(true)
    setError(null)
    setNote(null)
    try {
      onReplaced(await action())
      setNote(done)
      return true
    } catch (err) {
      setError(errorMessage(err))
      return false
    } finally {
      setBusy(false)
    }
  }

  function remove(ref: StyleReference) {
    if (!window.confirm(`${ref.label || ref.file}을 지울까요? 파일도 지워져요.`)) return
    void run(() => api.styleDeleteRef(ref.file), '지웠어요')
  }

  return (
    <div className="stack">
      <p className="notice">퍼블릭 도메인이나 사용 허가가 있는 그림만 올리세요. 출처를 적어 두세요.</p>

      {references.length === 0 ? (
        <p className="empty">참고 이미지가 없어요. 없으면 참고 지시문 없이 글로만 그려요.</p>
      ) : (
        <ul className="ref-grid">
          {references.map((ref, i) => (
            <li key={ref.file} className="ref-card">
              <a href={refUrl(ref.file)} target="_blank" rel="noreferrer">
                <img src={refUrl(ref.file)} alt={ref.label || ref.file} loading="lazy" />
              </a>
              <code>{ref.file}</code>
              <TextField label="이름표" value={ref.label} onChange={(v) => onChange(i, 'label', v)} disabled={locked} />
              <TextField label="출처" value={ref.source} onChange={(v) => onChange(i, 'source', v)} disabled={locked} />
              <button
                type="button"
                className="btn btn-small btn-reject"
                onClick={() => remove(ref)}
                disabled={locked || dirty}
                title={blocked ?? undefined}
              >
                삭제
              </button>
            </li>
          ))}
        </ul>
      )}

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
      {blocked && <p className="dirty-note">{blocked} 저장한 뒤에 올리기·가져오기·삭제를 할 수 있어요.</p>}

      <Uploader disabled={locked || dirty} title={blocked} run={run} />
      <Importer disabled={locked || dirty} title={blocked} run={run} />
    </div>
  )
}

type Run = (action: () => Promise<Style>, done: string) => Promise<boolean>

// 파일 올리기(jpg·png·webp)
function Uploader({ disabled, title, run }: { disabled: boolean; title: string | null; run: Run }) {
  const [file, setFile] = useState<File | null>(null)
  const [label, setLabel] = useState('')
  const [source, setSource] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const fileId = useId()

  async function submit() {
    if (!file) return
    const ok = await run(async () => (await api.styleUpload(file, label.trim(), source.trim())).style, '올렸어요')
    if (!ok) return
    setFile(null)
    setLabel('')
    setSource('')
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <form
      className="uploader"
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <h3>파일 올리기</h3>
      <div className="field">
        <label htmlFor={fileId}>그림 파일</label>
        <input
          ref={inputRef}
          id={fileId}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={disabled}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <small className="hint">jpg·png·webp, 15MB까지</small>
      </div>
      <TextField label="이름표" value={label} onChange={setLabel} disabled={disabled} />
      <TextField label="출처" value={source} onChange={setSource} disabled={disabled} />
      <button type="submit" className="btn btn-primary" disabled={disabled || !file} title={title ?? undefined}>
        올리기
      </button>
    </form>
  )
}

// 주소로 가져오기. 서버가 그 주소에서 그림을 받아 온다.
function Importer({ disabled, title, run }: { disabled: boolean; title: string | null; run: Run }) {
  const [url, setUrl] = useState('')
  const [label, setLabel] = useState('')
  const [source, setSource] = useState('')

  async function submit() {
    const trimmed = url.trim()
    if (!trimmed) return
    const body = {
      url: trimmed,
      ...(label.trim() ? { label: label.trim() } : {}),
      ...(source.trim() ? { source: source.trim() } : {}),
    }
    const ok = await run(async () => (await api.styleImport(body)).style, '가져왔어요')
    if (!ok) return
    setUrl('')
    setLabel('')
    setSource('')
  }

  return (
    <form
      className="uploader"
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <h3>주소로 가져오기</h3>
      <TextField
        label="그림 주소"
        value={url}
        onChange={setUrl}
        disabled={disabled}
        placeholder="https://"
        hint="http(s) 주소만 돼요"
      />
      <TextField label="이름표" value={label} onChange={setLabel} disabled={disabled} />
      <TextField label="출처" value={source} onChange={setSource} disabled={disabled} hint="비우면 주소를 출처로 적어요" />
      <button type="submit" className="btn btn-primary" disabled={disabled || !url.trim()} title={title ?? undefined}>
        가져오기
      </button>
    </form>
  )
}
