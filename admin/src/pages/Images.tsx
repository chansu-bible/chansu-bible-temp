import { useMemo } from 'react'
import { api } from '../api.ts'
import { ErrorBox, Loading } from '../components/Notice.tsx'
import StyleForm from '../components/StyleForm.tsx'
import VersionList from '../components/VersionList.tsx'
import type { BookSummary } from '../types.ts'
import { useLoad } from '../useLoad.ts'

// 그림 화면. 화풍 프롬프트, 화풍 참고 이미지, 그림 버전을 한 곳에서 다룬다. 그림 버전은 모든 책이 함께 쓴다.
export default function Images({ books }: { books: BookSummary[] }) {
  const style = useLoad(api.style, 'style')
  const versions = useLoad(api.imageVersions, 'image-versions')
  const ids = books.map((b) => b.id)
  const status = useLoad(() => Promise.all(ids.map((book) => api.status(book))), `status/${ids.join(',')}`)

  // 버전별 그림 수 = 본문이 있는 모든 책의 장마다 센 수의 합
  const counts = useMemo(() => {
    const out: Record<string, number> = {}
    for (const one of status.data ?? []) {
      for (const ch of one.chapters) {
        for (const [id, n] of Object.entries(ch.images)) out[id] = (out[id] ?? 0) + n
      }
    }
    return out
  }, [status.data])

  return (
    <div className="page">
      <header className="page-head">
        <h1>그림</h1>
        <div className="page-actions">
          <button
            type="button"
            className="btn"
            onClick={() => {
              style.reload()
              versions.reload()
              status.reload()
            }}
            disabled={style.loading || versions.loading}
          >
            새로 고침
          </button>
        </div>
      </header>

      {style.error && <ErrorBox message={style.error} onRetry={style.reload} />}
      {!style.data && !style.error && <Loading />}
      {style.data && <StyleForm style={style.data} onSaved={style.setData} />}

      {versions.error && <ErrorBox message={versions.error} onRetry={versions.reload} />}
      {!versions.data && !versions.error && <Loading />}
      {versions.data && (
        <VersionList
          versions={versions.data}
          counts={counts}
          onCreated={(next) => {
            versions.setData(next)
            status.reload()
          }}
        />
      )}
      {status.error && <p className="muted">그림 수를 세지 못했어요: {status.error}</p>}
    </div>
  )
}
