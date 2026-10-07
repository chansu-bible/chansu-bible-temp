import { useEffect, useRef, useState } from 'react'
import { api } from '../api.ts'
import { SelectField } from '../components/Fields.tsx'
import { Empty, ErrorBox, Loading } from '../components/Notice.tsx'
import StatusBadge from '../components/StatusBadge.tsx'
import { navigate, routeHref } from '../route.ts'
import type { Scene, Verdict, Verse } from '../types.ts'
import { useLoad } from '../useLoad.ts'

const FALLBACK_CHAPTERS = Array.from({ length: 10 }, (_, i) => i + 1)

// 장면 화면(읽기 전용). 편집은 2단계에서 한다.
export default function Scenes({ chapter, sceneId }: { chapter: number; sceneId: string | null }) {
  const status = useLoad(api.status, 'status')
  const data = useLoad(() => api.scenes(chapter), String(chapter))
  const chapters = status.data?.chapters.map((c) => c.chapter) ?? FALLBACK_CHAPTERS
  const options = chapters.includes(chapter) ? chapters : [...chapters, chapter].sort((a, b) => a - b)

  return (
    <div className="page">
      <header className="page-head">
        <h1>장면</h1>
        <div className="page-actions">
          <SelectField
            label="장"
            value={String(chapter)}
            onChange={(v) => navigate({ page: 'scenes', chapter: Number(v), sceneId: null })}
            options={options.map((n) => ({ value: String(n), label: `${n}장` }))}
          />
          <button type="button" className="btn" onClick={data.reload} disabled={data.loading}>
            새로 고침
          </button>
        </div>
      </header>

      <p className="muted">읽기 전용이에요. 장면 편집과 다시 쓰기·다시 그리기는 2단계에서 붙여요.</p>

      {data.error && <ErrorBox message={data.error} onRetry={data.reload} />}
      {!data.data && !data.error && <Loading />}
      {data.data &&
        (data.data.scenes === null ? (
          <Empty>{chapter}장에는 아직 장면 파일이 없어요. ({data.data.verses.length}절)</Empty>
        ) : data.data.scenes.length === 0 ? (
          <Empty>{chapter}장 장면 파일에 장면이 없어요.</Empty>
        ) : (
          <div className="scene-list">
            {data.data.scenes.map((s) => (
              <SceneCard key={s.id} scene={s} verses={data.data?.verses ?? []} focused={s.id === sceneId} />
            ))}
          </div>
        ))}
    </div>
  )
}

function SceneCard({ scene, verses, focused }: { scene: Scene; verses: Verse[]; focused: boolean }) {
  const [open, setOpen] = useState(focused)
  const ref = useRef<HTMLElement>(null)
  const bodyId = `scene-body-${scene.id}`

  // 링크로 이 장면을 가리키면 펼친다.
  const [prevFocused, setPrevFocused] = useState(focused)
  if (focused !== prevFocused) {
    setPrevFocused(focused)
    if (focused) setOpen(true)
  }

  useEffect(() => {
    if (focused) ref.current?.scrollIntoView({ block: 'start' })
  }, [focused])

  const range = scene.verseStart === scene.verseEnd ? `${scene.verseStart}절` : `${scene.verseStart}~${scene.verseEnd}절`
  const inRange = verses.filter((v) => v.verse >= scene.verseStart && v.verse <= scene.verseEnd)

  return (
    <article ref={ref} className={`card scene-card${focused ? ' focused' : ''}`}>
      <button type="button" className="scene-toggle" aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen(!open)}>
        <span className="scene-title">
          <strong>{scene.title || scene.id}</strong>
          <span className="muted">
            {scene.chapter}:{range} · <code>{scene.id}</code>
          </span>
        </span>
        <span className="scene-meta">
          <StatusBadge status={scene.review.status} />
          <span className={scene.image ? 'text-approved' : 'muted'}>그림 {scene.image ? '있음' : '없음'}</span>
          <span>해설 {scene.explanation.length}문단</span>
          <span>낱말 {scene.glossary.length}</span>
        </span>
      </button>

      {open && (
        <div id={bodyId} className="scene-body">
          <section>
            <h3>본문</h3>
            {inRange.length ? (
              <ol className="verses">
                {inRange.map((v) => (
                  <li key={v.verse} value={v.verse}>
                    {v.text}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="empty">본문을 찾지 못했어요</p>
            )}
          </section>

          {scene.commentary && (
            <section>
              <h3>한 줄 설명</h3>
              <p>{scene.commentary}</p>
            </section>
          )}

          <section>
            <h3>해설</h3>
            {scene.explanation.length ? scene.explanation.map((p, i) => <p key={i}>{p}</p>) : <p className="empty">없음</p>}
          </section>

          <section>
            <h3>낱말 풀이</h3>
            {scene.glossary.length ? (
              <dl className="glossary">
                {scene.glossary.map((g, i) => (
                  <div key={i}>
                    <dt>
                      {g.word} <span className="muted">({g.verse}절)</span>
                    </dt>
                    <dd>{g.meaning}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="empty">없음</p>
            )}
          </section>

          <section>
            <h3>역사 배경</h3>
            {scene.history.length ? (
              scene.history.map((h, i) => (
                <div key={i} className="history-note">
                  <p>
                    <span className="tag">{h.certainty}</span> {h.text}
                  </p>
                  <p className="muted">
                    근거: {h.basis}
                    {h.sources.length > 0 && ` · ${h.sources.join(', ')}`}
                  </p>
                </div>
              ))
            ) : (
              <p className="empty">없음</p>
            )}
          </section>

          <section>
            <h3>그림 지시</h3>
            <p>{scene.visual.description || <span className="muted">없음</span>}</p>
            {scene.visual.shot && <p className="muted">구도: {scene.visual.shot}</p>}
            <p className="muted">
              인물:{' '}
              {scene.visual.characters.length
                ? scene.visual.characters.map((c, i) => (
                    <span key={c}>
                      {i > 0 && ', '}
                      <a href={routeHref({ page: 'canon', kind: 'characters', id: c })}>{c}</a>
                    </span>
                  ))
                : '없음'}
              {' · '}장소:{' '}
              {scene.placeId ? (
                <a href={routeHref({ page: 'canon', kind: 'places', id: scene.placeId })}>{scene.placeId}</a>
              ) : (
                '없음'
              )}
            </p>
            {scene.image && (
              <p className="muted">
                그림 파일: <code>{scene.image}</code>
              </p>
            )}
          </section>

          <section>
            <h3>검수</h3>
            <p className="muted">시도 {scene.review.attempts}회</p>
            <VerdictView label="글" verdict={scene.review.text} />
            <VerdictView label="사실" verdict={scene.review.facts} />
            <VerdictView label="그림" verdict={scene.review.image} />
          </section>
        </div>
      )}
    </article>
  )
}

function VerdictView({ label, verdict }: { label: string; verdict: Verdict | null }) {
  if (!verdict)
    return (
      <p>
        {label}: <span className="muted">아직 안 함</span>
      </p>
    )
  return (
    <div>
      <p>
        {label}:{' '}
        <span className={verdict.verdict === 'pass' ? 'text-approved' : 'text-rejected'}>
          {verdict.verdict === 'pass' ? '통과' : '지적 있음'}
        </span>
      </p>
      {verdict.issues.length > 0 && (
        <ul>
          {verdict.issues.map((issue, i) => (
            <li key={i}>{issue}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
