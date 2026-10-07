import { api } from '../api.ts'
import { Empty, ErrorBox, Loading } from '../components/Notice.tsx'
import StatusBadge from '../components/StatusBadge.tsx'
import { formatTime, KIND_LABEL } from '../labels.ts'
import { routeHref } from '../route.ts'
import { CANON_KINDS, type CanonKind, type Proposal } from '../types.ts'
import { useLoad } from '../useLoad.ts'

type FlaggedScene = { chapter: number; id: string; title: string; issues: string[] }
type DraftEntry = { kind: CanonKind; id: string; name: string }

// 확인 필요 장면: 대시보드 상태에서 flagged가 있는 장만 장면 파일을 읽는다.
async function loadFlagged(): Promise<FlaggedScene[]> {
  const status = await api.status()
  const chapters = status.chapters.filter((c) => c.scenes.flagged > 0).map((c) => c.chapter)
  const files = await Promise.all(chapters.map((n) => api.scenes(n)))
  return files.flatMap((f) =>
    (f.scenes ?? [])
      .filter((s) => s.review.status === 'flagged')
      .map((s) => ({
        chapter: f.chapter,
        id: s.id,
        title: s.title,
        issues: [s.review.text, s.review.facts, s.review.image].flatMap((v) => v?.issues ?? []),
      })),
  )
}

async function loadDrafts(): Promise<DraftEntry[]> {
  const lists = await Promise.all(CANON_KINDS.map((kind) => api.canonList(kind)))
  return lists.flatMap((list, i) =>
    list.filter((e) => e.status === 'draft').map((e) => ({ kind: CANON_KINDS[i], id: e.id, name: e.name })),
  )
}

async function loadOpenProposals(): Promise<Proposal[]> {
  return (await api.proposals()).filter((p) => p.status === 'open')
}

export default function Queue() {
  const flagged = useLoad(loadFlagged, 'flagged')
  const drafts = useLoad(loadDrafts, 'drafts')
  const proposals = useLoad(loadOpenProposals, 'proposals')

  function reloadAll() {
    flagged.reload()
    drafts.reload()
    proposals.reload()
  }

  return (
    <div className="page">
      <header className="page-head">
        <h1>검수 대기열</h1>
        <button type="button" className="btn" onClick={reloadAll}>
          새로 고침
        </button>
      </header>

      <section className="card">
        <h2>확인 필요 장면 {flagged.data && <span className="count">{flagged.data.length}</span>}</h2>
        {flagged.error && <ErrorBox message={flagged.error} onRetry={flagged.reload} />}
        {!flagged.data && !flagged.error && <Loading />}
        {flagged.data &&
          (flagged.data.length ? (
            <ul className="queue-list">
              {flagged.data.map((s) => (
                <li key={`${s.chapter}/${s.id}`}>
                  <a href={routeHref({ page: 'scenes', chapter: s.chapter, sceneId: s.id })}>
                    {s.chapter}장 · {s.title || s.id}
                  </a>{' '}
                  <StatusBadge status="flagged" />
                  {s.issues.length > 0 && <p className="muted">{s.issues.join(' / ')}</p>}
                </li>
              ))}
            </ul>
          ) : (
            <Empty>확인이 필요한 장면이 없어요</Empty>
          ))}
      </section>

      <section className="card">
        <h2>초안 설정집 항목 {drafts.data && <span className="count">{drafts.data.length}</span>}</h2>
        {drafts.error && <ErrorBox message={drafts.error} onRetry={drafts.reload} />}
        {!drafts.data && !drafts.error && <Loading />}
        {drafts.data &&
          (drafts.data.length ? (
            <ul className="queue-list">
              {drafts.data.map((e) => (
                <li key={`${e.kind}/${e.id}`}>
                  <span className="tag">{KIND_LABEL[e.kind]}</span>{' '}
                  <a href={routeHref({ page: 'canon', kind: e.kind, id: e.id })}>{e.name || e.id}</a>{' '}
                  <code className="muted">{e.id}</code>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>검수할 초안이 없어요</Empty>
          ))}
      </section>

      <section className="card">
        <h2>열린 변경 제안 {proposals.data && <span className="count">{proposals.data.length}</span>}</h2>
        {proposals.error && <ErrorBox message={proposals.error} onRetry={proposals.reload} />}
        {!proposals.data && !proposals.error && <Loading />}
        {proposals.data &&
          (proposals.data.length ? (
            <ul className="queue-list">
              {proposals.data.map((p) => {
                const [kind, id] = p.target.split('/') as [CanonKind, string]
                return (
                  <li key={p.id}>
                    <span className="tag">{KIND_LABEL[kind] ?? kind}</span>{' '}
                    <a href={routeHref({ page: 'canon', kind, id })}>{id}</a> <code>{p.field}</code>{' '}
                    <span className="muted">{formatTime(p.createdAt)}</span>
                    {p.reason && <p className="muted">{p.reason}</p>}
                  </li>
                )
              })}
            </ul>
          ) : (
            <Empty>열린 제안이 없어요</Empty>
          ))}
      </section>
    </div>
  )
}
