import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api.ts'
import { emptyEntry, firstCitation } from '../canonForm.ts'
import CanonEditor from '../components/CanonEditor.tsx'
import DataTable, { type Column } from '../components/DataTable.tsx'
import { Empty, ErrorBox, Loading } from '../components/Notice.tsx'
import StatusBadge from '../components/StatusBadge.tsx'
import { KIND_LABEL } from '../labels.ts'
import { navigate } from '../route.ts'
import { CANON_KINDS, type CanonEntry, type CanonKind, type Proposal } from '../types.ts'
import { useLoad } from '../useLoad.ts'

type UsageCount = number | 'error'

export default function Canon({ kind, selectedId }: { kind: CanonKind; selectedId: string | null }) {
  const entries = useLoad<CanonEntry[]>(() => api.canonList(kind), kind)
  const proposals = useLoad(api.proposals, 'proposals')
  const [creating, setCreating] = useState<CanonEntry | null>(null)
  const [query, setQuery] = useState('')
  const usage = useUsageCounts(kind, entries.data)
  const dirtyRef = useRef(false)
  const onDirtyChange = useCallback((dirty: boolean) => {
    dirtyRef.current = dirty
  }, [])

  // 고치던 내용이 있으면 다른 항목으로 가기 전에 묻는다.
  function confirmLeave(): boolean {
    return !dirtyRef.current || window.confirm('저장하지 않은 변경이 있어요. 버리고 넘어갈까요?')
  }

  function go(id: string | null) {
    navigate({ page: 'canon', kind, id })
  }

  function select(id: string) {
    if (id === selectedId && !creating) return
    if (!confirmLeave()) return
    setCreating(null)
    go(id)
  }

  function switchKind(next: CanonKind) {
    if (next === kind || !confirmLeave()) return
    navigate({ page: 'canon', kind: next, id: null })
  }

  function startNew() {
    if (!confirmLeave()) return
    setCreating(emptyEntry(kind))
  }

  function onSaved(saved: CanonEntry) {
    const list = entries.data ?? []
    const exists = list.some((e) => e.id === saved.id)
    entries.setData(exists ? list.map((e) => (e.id === saved.id ? saved : e)) : [...list, saved])
    if (creating) {
      setCreating(null)
      go(saved.id)
    }
  }

  function onProposalsChanged() {
    proposals.reload()
    entries.reload()
  }

  const openProposals = useMemo(() => (proposals.data ?? []).filter((p) => p.status === 'open'), [proposals.data])
  const proposalsFor = (id: string): Proposal[] => openProposals.filter((p) => p.target === `${kind}/${id}`)

  const q = query.trim().toLowerCase()
  const rows = (entries.data ?? []).filter(
    (e) =>
      !q ||
      e.id.includes(q) ||
      e.name.toLowerCase().includes(q) ||
      ('aliases' in e && e.aliases.some((a) => a.toLowerCase().includes(q))),
  )
  const selected = creating ?? (entries.data ?? []).find((e) => e.id === selectedId) ?? null

  const columns: Column<CanonEntry>[] = [
    {
      key: 'name',
      header: '이름',
      cell: (e) => (
        <>
          {e.name}
          {'aliases' in e && e.aliases.length > 0 && <span className="muted"> · {e.aliases.join(', ')}</span>}
        </>
      ),
    },
    { key: 'id', header: 'id', cell: (e) => <code>{e.id}</code> },
    { key: 'status', header: '상태', cell: (e) => <StatusBadge status={e.status} /> },
    { key: 'first', header: '첫 등장', cell: (e) => firstCitation(kind, e) || <span className="muted">—</span> },
    {
      key: 'usage',
      header: '장면',
      numeric: true,
      cell: (e) => {
        const n = usage[e.id]
        if (n === undefined) return <span className="muted">…</span>
        if (n === 'error') return <span className="muted" title="쓰는 장면을 읽지 못했어요">?</span>
        return n
      },
    },
    {
      key: 'proposals',
      header: '제안',
      numeric: true,
      cell: (e) => {
        const n = proposalsFor(e.id).length
        return n ? <span className="text-flagged">{n}</span> : <span className="muted">0</span>
      },
    },
  ]

  return (
    <div className="page">
      <header className="page-head">
        <h1>설정집</h1>
        <div className="tabs" role="group" aria-label="설정집 종류">
          {CANON_KINDS.map((k) => (
            <button
              key={k}
              type="button"
              className="tab"
              aria-pressed={k === kind}
              onClick={() => switchKind(k)}
            >
              {KIND_LABEL[k]}
            </button>
          ))}
        </div>
      </header>

      {proposals.error && <ErrorBox message={`제안을 읽지 못했어요: ${proposals.error}`} onRetry={proposals.reload} />}

      <div className="split">
        <section className="card list-pane" aria-label={`${KIND_LABEL[kind]} 목록`}>
          <div className="list-tools">
            <label className="sr-only" htmlFor="canon-search">
              찾기
            </label>
            <input
              id="canon-search"
              type="search"
              placeholder="이름·id로 찾기"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button type="button" className="btn btn-primary" onClick={startNew} disabled={!entries.data}>
              새 {KIND_LABEL[kind]}
            </button>
          </div>
          {entries.error && <ErrorBox message={entries.error} onRetry={entries.reload} />}
          {!entries.data && !entries.error && <Loading />}
          {entries.data && (
            <DataTable
              caption={`${KIND_LABEL[kind]} 목록`}
              columns={columns}
              rows={rows}
              rowKey={(e) => e.id}
              selectedKey={creating ? null : selectedId}
              onSelect={(e) => select(e.id)}
              empty={
                entries.data.length
                  ? '찾는 항목이 없어요'
                  : `${KIND_LABEL[kind]} 항목이 아직 없어요. 작업 화면에서 canon을 실행하거나 새로 추가하세요.`
              }
            />
          )}
        </section>

        <section className="card detail-pane" aria-label="상세">
          {selected ? (
            <CanonEditor
              key={creating ? 'new' : `${kind}/${selected.id}`}
              kind={kind}
              entry={selected}
              isNew={creating !== null}
              proposals={creating ? [] : proposalsFor(selected.id)}
              onSaved={onSaved}
              onCancelNew={() => setCreating(null)}
              onProposalsChanged={onProposalsChanged}
              onDirtyChange={onDirtyChange}
            />
          ) : selectedId && entries.data ? (
            <Empty>
              <code>{selectedId}</code> 항목이 없어요.
            </Empty>
          ) : (
            <Empty>왼쪽 목록에서 항목을 고르세요.</Empty>
          )}
        </section>
      </div>
    </div>
  )
}

// 항목마다 쓰는 장면 수를 읽는다. 목록이 바뀌면 다시 센다.
function useUsageCounts(kind: CanonKind, entries: CanonEntry[] | null): Record<string, UsageCount> {
  const [counts, setCounts] = useState<Record<string, UsageCount>>({})
  const ids = (entries ?? []).map((e) => e.id).join('\n')

  useEffect(() => {
    if (!ids) return
    let cancelled = false
    for (const id of ids.split('\n')) {
      api.canonUsage(kind, id).then(
        (res) => {
          if (!cancelled) setCounts((c) => ({ ...c, [id]: res.scenes.length }))
        },
        () => {
          if (!cancelled) setCounts((c) => ({ ...c, [id]: 'error' }))
        },
      )
    }
    return () => {
      cancelled = true
    }
  }, [kind, ids])

  return counts
}
