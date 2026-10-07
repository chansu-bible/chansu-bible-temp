import { useState } from 'react'
import { api } from '../api.ts'
import { getPath } from '../canonForm.ts'
import { formatTime } from '../labels.ts'
import type { Proposal } from '../types.ts'
import { errorMessage } from '../useLoad.ts'
import JsonView from './JsonView.tsx'

// 한 항목에 걸린 열린 제안. 지금 값과 제안 값을 나란히 보여 주고 적용/버리기.
export default function ProposalList({
  proposals,
  entry,
  disabledReason,
  onChanged,
}: {
  proposals: Proposal[]
  entry: object
  disabledReason: string | null
  onChanged: () => void
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function act(p: Proposal, action: 'apply' | 'dismiss') {
    setBusy(p.id)
    setError(null)
    try {
      await api.proposalAction(p.id, action)
      onChanged()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  if (proposals.length === 0) return null

  return (
    <section className="proposals" aria-label="열린 변경 제안">
      <h3>열린 변경 제안 {proposals.length}개</h3>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {disabledReason && <p className="muted">{disabledReason}</p>}
      {proposals.map((p) => (
        <article key={p.id} className="proposal">
          <header>
            <code>{p.field}</code>
            <span className="muted">{formatTime(p.createdAt)}</span>
          </header>
          <div className="proposal-compare">
            <div>
              <h4>지금 값</h4>
              <JsonView value={getPath(entry, p.field)} label="지금 값" />
            </div>
            <div>
              <h4>제안 값</h4>
              <JsonView value={p.value} label="제안 값" />
            </div>
          </div>
          {p.reason && <p>{p.reason}</p>}
          {p.sources.length > 0 && <p className="muted">근거: {p.sources.join(', ')}</p>}
          <div className="button-row">
            <button
              type="button"
              className="btn btn-primary btn-small"
              disabled={busy !== null || disabledReason !== null}
              onClick={() => act(p, 'apply')}
            >
              {busy === p.id ? '처리 중…' : '적용'}
            </button>
            <button
              type="button"
              className="btn btn-small"
              disabled={busy !== null || disabledReason !== null}
              onClick={() => act(p, 'dismiss')}
            >
              버리기
            </button>
          </div>
        </article>
      ))}
    </section>
  )
}
