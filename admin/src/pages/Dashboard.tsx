import { useEffect } from 'react'
import { api } from '../api.ts'
import DataTable, { type Column } from '../components/DataTable.tsx'
import { Empty, ErrorBox, Loading } from '../components/Notice.tsx'
import { KIND_LABEL } from '../labels.ts'
import { CANON_KINDS, type CanonKind, type ChapterStatus, type StatusResponse } from '../types.ts'
import { useLoad } from '../useLoad.ts'

const REFRESH_MS = 30_000

async function loadStatus(): Promise<{ status: StatusResponse; at: Date }> {
  return { status: await api.status(), at: new Date() }
}

export default function Dashboard() {
  const status = useLoad(loadStatus, 'status')
  const { reload } = status
  const updatedAt = status.data?.at ?? null

  // 30초마다, 그리고 창으로 돌아올 때 새로 고친다.
  useEffect(() => {
    const timer = window.setInterval(reload, REFRESH_MS)
    window.addEventListener('focus', reload)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', reload)
    }
  }, [reload])

  return (
    <div className="page">
      <header className="page-head">
        <h1>대시보드</h1>
        <div className="page-actions">
          {updatedAt && (
            <span className="muted">
              {updatedAt.toLocaleTimeString('ko-KR')} 기준 · 30초마다 새로 고침
            </span>
          )}
          <button type="button" className="btn" onClick={reload} disabled={status.loading}>
            새로 고침
          </button>
        </div>
      </header>

      {status.error && <ErrorBox message={status.error} onRetry={reload} />}
      {!status.data && !status.error && <Loading />}
      {status.data && <StatusView data={status.data.status} />}
    </div>
  )
}

function StatusView({ data }: { data: StatusResponse }) {
  // 그림 버전 열: 버전 목록 순서대로, 목록에 없지만 장에 있는 버전은 뒤에 붙인다.
  const versionIds = [
    ...data.imageVersions.map((v) => v.id),
    ...new Set(data.chapters.flatMap((c) => Object.keys(c.images))),
  ].filter((id, i, all) => all.indexOf(id) === i)
  const versionLabel = (id: string) => data.imageVersions.find((v) => v.id === id)?.label || id

  const columns: Column<ChapterStatus>[] = [
    { key: 'chapter', header: '장', cell: (c) => <a href={`#/scenes/${c.chapter}`}>{c.chapter}장</a> },
    { key: 'verses', header: '절', numeric: true, cell: (c) => c.verses },
    {
      key: 'total',
      header: '장면',
      numeric: true,
      cell: (c) => (c.hasSceneFile ? c.scenes.total : <span className="muted">파일 없음</span>),
    },
    { key: 'draft', header: '초안', numeric: true, cell: (c) => count(c.scenes.draft) },
    { key: 'reviewed', header: '검수 통과', numeric: true, cell: (c) => count(c.scenes.reviewed) },
    {
      key: 'flagged',
      header: '확인 필요',
      numeric: true,
      cell: (c) => (c.scenes.flagged ? <span className="text-flagged">{c.scenes.flagged}</span> : count(0)),
    },
    { key: 'approved', header: '승인', numeric: true, cell: (c) => count(c.scenes.approved) },
    ...versionIds.map<Column<ChapterStatus>>((id) => ({
      key: `img-${id}`,
      header: <>그림 · {versionLabel(id)}</>,
      numeric: true,
      cell: (c) => ratio(c.images[id] ?? 0, c.scenes.total),
    })),
    { key: 'audio', header: '음성', numeric: true, cell: (c) => ratio(c.audio.have, c.audio.total) },
  ]

  return (
    <>
      <section className="card">
        <h2>장별 진행</h2>
        <DataTable
          caption="장별 진행 상황"
          columns={columns}
          rows={data.chapters}
          rowKey={(c) => String(c.chapter)}
          empty="본문이 없어요. 작업 화면에서 source를 먼저 실행하세요."
        />
      </section>

      <div className="grid-2">
        <section className="card">
          <h2>설정집</h2>
          <CanonSummary canon={data.canon} />
        </section>
        <section className="card">
          <h2>변경 제안</h2>
          {data.proposalsOpen > 0 ? (
            <p>
              열린 제안 <strong>{data.proposalsOpen}</strong>개 · <a href="#/queue">검수 대기열에서 보기</a>
            </p>
          ) : (
            <Empty>열린 제안이 없어요</Empty>
          )}
          <h2>그림 버전</h2>
          {data.imageVersions.length ? (
            <ul className="plain-list">
              {data.imageVersions.map((v) => (
                <li key={v.id}>
                  <strong>{v.label || v.id}</strong> <code>{v.id}</code>
                  {v.note && <span className="muted"> · {v.note}</span>}
                </li>
              ))}
            </ul>
          ) : (
            <Empty>그림 버전이 없어요</Empty>
          )}
        </section>
      </div>
    </>
  )
}

function CanonSummary({ canon }: { canon: StatusResponse['canon'] }) {
  const rows = CANON_KINDS.map((kind) => ({ kind, counts: canon[kind] ?? { draft: 0, approved: 0, rejected: 0 } }))
  const columns: Column<{ kind: CanonKind; counts: StatusResponse['canon'][CanonKind] }>[] = [
    { key: 'kind', header: '종류', cell: (r) => <a href={`#/canon/${r.kind}`}>{KIND_LABEL[r.kind]}</a> },
    { key: 'draft', header: '초안', numeric: true, cell: (r) => count(r.counts.draft) },
    { key: 'approved', header: '승인', numeric: true, cell: (r) => count(r.counts.approved) },
    { key: 'rejected', header: '반려', numeric: true, cell: (r) => count(r.counts.rejected) },
  ]
  return <DataTable caption="설정집 상태 수" columns={columns} rows={rows} rowKey={(r) => r.kind} />
}

function count(n: number) {
  return n ? n : <span className="muted">0</span>
}

function ratio(have: number, total: number) {
  if (!total) return <span className="muted">—</span>
  return (
    <span className={have >= total ? 'text-approved' : undefined}>
      {have}/{total}
    </span>
  )
}
