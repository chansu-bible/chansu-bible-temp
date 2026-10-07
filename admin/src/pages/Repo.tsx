import { api } from '../api.ts'
import DataTable from '../components/DataTable.tsx'
import { ErrorBox, Loading } from '../components/Notice.tsx'
import { useLoad } from '../useLoad.ts'

// git status --porcelain의 두 글자 상태를 읽기 쉽게
function describeChange(status: string): string {
  const s = status.trim()
  if (s === '??') return '새 파일'
  if (s.includes('D')) return '삭제'
  if (s.includes('R')) return '이름 바뀜'
  if (s.includes('A')) return '추가'
  if (s.includes('M')) return '수정'
  if (s.includes('U')) return '충돌'
  return s
}

export default function Repo() {
  const git = useLoad(api.git, 'git')

  return (
    <div className="page">
      <header className="page-head">
        <h1>저장소</h1>
        <button type="button" className="btn" onClick={git.reload} disabled={git.loading}>
          새로 고침
        </button>
      </header>

      <p className="notice">커밋과 푸시는 터미널에서 하세요. 이 화면은 바뀐 파일만 보여 줘요.</p>

      {git.error && <ErrorBox message={git.error} onRetry={git.reload} />}
      {!git.data && !git.error && <Loading />}
      {git.data && (
        <section className="card">
          <h2>
            브랜치 <code>{git.data.branch || '(알 수 없음)'}</code>
          </h2>
          <DataTable
            caption="바뀐 파일"
            columns={[
              { key: 'status', header: '상태', cell: (c) => <span title={c.status}>{describeChange(c.status)}</span> },
              { key: 'path', header: '경로', cell: (c) => <code>{c.path}</code> },
            ]}
            rows={git.data.changes}
            rowKey={(c) => `${c.status}:${c.path}`}
            empty="바뀐 파일이 없어요"
          />
        </section>
      )}
    </div>
  )
}
