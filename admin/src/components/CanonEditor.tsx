import { useEffect, useMemo, useState } from 'react'
import { api } from '../api.ts'
import { checkForm, entryToForm, formToEntry, type FormState, type FormValue } from '../canonForm.ts'
import { KIND_LABEL } from '../labels.ts'
import type { CanonEntry, CanonKind, Proposal } from '../types.ts'
import { errorMessage, useLoad } from '../useLoad.ts'
import CanonFormView from './CanonFormView.tsx'
import ProposalList from './ProposalList.tsx'
import StatusBadge from './StatusBadge.tsx'

// 설정집 항목 하나의 상세·편집 패널. 새 항목이면 POST, 아니면 PUT.
export default function CanonEditor({
  kind,
  entry,
  isNew,
  proposals,
  onSaved,
  onCancelNew,
  onProposalsChanged,
  onDirtyChange,
}: {
  kind: CanonKind
  entry: CanonEntry
  isNew: boolean
  proposals: Proposal[]
  onSaved: (entry: CanonEntry) => void
  onCancelNew: () => void
  onProposalsChanged: () => void
  onDirtyChange: (dirty: boolean) => void
}) {
  const initial = useMemo(() => entryToForm(kind, entry), [kind, entry])
  const [form, setForm] = useState<FormState>(initial)
  const [problems, setProblems] = useState<string[]>([])
  const [serverError, setServerError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [savedNote, setSavedNote] = useState<string | null>(null)

  // 저장·승인·제안 적용으로 항목이 바뀌면 폼을 새 값으로 맞춘다.
  const [prevEntry, setPrevEntry] = useState(entry)
  if (entry !== prevEntry) {
    setPrevEntry(entry)
    setForm(entryToForm(kind, entry))
  }

  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(initial), [form, initial])
  useEffect(() => {
    onDirtyChange(dirty)
  }, [dirty, onDirtyChange])
  useEffect(() => () => onDirtyChange(false), [onDirtyChange])

  function change(path: string, value: FormValue) {
    setForm((f) => ({ ...f, [path]: value }))
    setSavedNote(null)
  }

  async function run(action: () => Promise<CanonEntry>, note: string) {
    setBusy(true)
    setServerError(null)
    try {
      const result = await action()
      setSavedNote(note)
      onSaved(result)
    } catch (err) {
      setServerError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  function save() {
    const found = checkForm(kind, form)
    setProblems(found)
    if (found.length) return
    const next = formToEntry(kind, form, entry)
    void run(() => (isNew ? api.canonCreate(kind, next) : api.canonUpdate(kind, next)), '저장했어요')
  }

  function review(action: 'approve' | 'reject') {
    void run(() => api.canonReview(kind, entry.id, action), action === 'approve' ? '승인했어요' : '반려했어요')
  }

  const reviewBlocked = dirty ? '저장하지 않은 변경이 있어요. 먼저 저장하세요.' : null

  return (
    <div className="editor">
      <header className="editor-head">
        <div>
          <h2>{isNew ? `새 ${KIND_LABEL[kind]}` : entry.name || entry.id}</h2>
          {!isNew && (
            <p className="muted">
              <code>{kind}/{entry.id}</code> <StatusBadge status={entry.status} />
            </p>
          )}
        </div>
        <div className="button-row">
          {dirty && <span className="dirty-note">저장하지 않은 변경</span>}
          {savedNote && !dirty && (
            <span className="saved-note" role="status">
              {savedNote}
            </span>
          )}
          {isNew && (
            <button type="button" className="btn" onClick={onCancelNew} disabled={busy}>
              취소
            </button>
          )}
          <button type="button" className="btn btn-primary" onClick={save} disabled={busy || (!dirty && !isNew)}>
            {isNew ? '추가' : '저장'}
          </button>
          {!isNew && (
            <>
              <button
                type="button"
                className="btn btn-approve"
                onClick={() => review('approve')}
                disabled={busy || dirty || entry.status === 'approved'}
                title={reviewBlocked ?? undefined}
              >
                승인
              </button>
              <button
                type="button"
                className="btn btn-reject"
                onClick={() => review('reject')}
                disabled={busy || dirty || entry.status === 'rejected'}
                title={reviewBlocked ?? undefined}
              >
                반려
              </button>
            </>
          )}
        </div>
      </header>

      {serverError && (
        <p className="form-error" role="alert">
          저장하지 못했어요: {serverError}
        </p>
      )}
      {problems.length > 0 && (
        <div className="form-error" role="alert">
          <p>고칠 곳이 있어요</p>
          <ul>
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}

      {!isNew && (
        <ProposalList
          proposals={proposals}
          entry={entry}
          disabledReason={reviewBlocked}
          onChanged={onProposalsChanged}
        />
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <CanonFormView kind={kind} form={form} onChange={change} idLocked={!isNew} disabled={busy} />
      </form>

      {!isNew && <UsageList kind={kind} id={entry.id} />}
    </div>
  )
}

function UsageList({ kind, id }: { kind: CanonKind; id: string }) {
  const usage = useLoad(() => api.canonUsage(kind, id), `${kind}/${id}`)
  return (
    <section className="usage" aria-label="이 항목을 쓰는 장면">
      <h3>이 항목을 쓰는 장면</h3>
      {usage.error && <p className="form-error">{usage.error}</p>}
      {!usage.data && !usage.error && <p className="muted">불러오는 중이에요</p>}
      {usage.data &&
        (usage.data.scenes.length ? (
          <ul className="plain-list">
            {usage.data.scenes.map((s) => (
              <li key={`${s.chapter}/${s.id}`}>
                <a href={`#/scenes/${s.chapter}/${encodeURIComponent(s.id)}`}>
                  {s.chapter}장 · {s.title || s.id}
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty">아직 쓰는 장면이 없어요</p>
        ))}
    </section>
  )
}
