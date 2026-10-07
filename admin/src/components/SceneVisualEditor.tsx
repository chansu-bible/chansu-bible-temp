import { useMemo, useState } from 'react'
import { api, imageUrl } from '../api.ts'
import { splitIds } from '../ids.ts'
import { routeHref } from '../route.ts'
import type { ImageVersion, PromptResponse, Scene } from '../types.ts'
import { errorMessage } from '../useLoad.ts'
import { TextAreaField, TextField } from './Fields.tsx'

type VisualForm = { description: string; shot: string; characters: string }

function toForm(scene: Scene): VisualForm {
  return {
    description: scene.visual.description,
    shot: scene.visual.shot ?? '',
    characters: scene.visual.characters.join(', '),
  }
}

// 장면 카드의 "그림 지시" 구역. 묘사·구도·인물을 고쳐 저장하고, 최종 프롬프트를 보고, 이 장면만 다시 그린다.
export default function SceneVisualEditor({
  scene,
  chapter,
  images,
  imageVersions,
  onSaved,
}: {
  scene: Scene
  chapter: number
  images: Record<string, string>
  imageVersions: ImageVersion[]
  onSaved: (scene: Scene) => void
}) {
  const initial = useMemo(() => toForm(scene), [scene])
  const [form, setForm] = useState<VisualForm>(initial)
  const [busy, setBusy] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [savedNote, setSavedNote] = useState(false)

  // 저장으로 장면이 바뀌면 폼을 새 값으로 맞춘다.
  const [prevScene, setPrevScene] = useState(scene)
  if (scene !== prevScene) {
    setPrevScene(scene)
    setForm(toForm(scene))
  }

  const dirty = JSON.stringify(form) !== JSON.stringify(initial)

  function change(key: keyof VisualForm, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
    setSavedNote(false)
  }

  async function save() {
    setBusy(true)
    setSaveError(null)
    try {
      const { description, shot } = form
      const visual: Scene['visual'] = {
        description,
        characters: splitIds(form.characters),
        ...(shot.trim() ? { shot } : {}),
      }
      const saved = await api.sceneSave(chapter, { ...scene, visual })
      setSavedNote(true)
      onSaved(saved)
    } catch (err) {
      setSaveError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="span-all">
      <h3>그림 지시</h3>
      <form
        className="visual-form"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <TextAreaField label="묘사" value={form.description} onChange={(v) => change('description', v)} disabled={busy} />
        <div className="form-grid">
          <TextField label="구도" value={form.shot} onChange={(v) => change('shot', v)} disabled={busy} hint="비우면 빼요" />
          <TextField
            label="인물 id"
            value={form.characters}
            onChange={(v) => change('characters', v)}
            disabled={busy}
            hint="쉼표나 공백으로 나눠요"
          />
        </div>
        <div className="button-row">
          <button type="submit" className="btn btn-primary btn-small" disabled={busy || !dirty}>
            그림 지시 저장
          </button>
          {dirty && <span className="dirty-note">저장하지 않은 변경</span>}
          {savedNote && !dirty && (
            <span className="saved-note" role="status">
              저장했어요
            </span>
          )}
        </div>
        {saveError && (
          <p className="form-error" role="alert">
            저장하지 못했어요: {saveError}
          </p>
        )}
      </form>

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
        {scene.placeId ? <a href={routeHref({ page: 'canon', kind: 'places', id: scene.placeId })}>{scene.placeId}</a> : '없음'}
      </p>
      {scene.image && (
        <p className="muted">
          그림 파일: <code>{scene.image}</code>
        </p>
      )}

      <Thumbnails images={images} imageVersions={imageVersions} />
      <PromptView chapter={chapter} sceneId={scene.id} dirty={dirty} />
      <RedrawButton chapter={chapter} sceneId={scene.id} />
    </section>
  )
}

// 버전마다 그림 썸네일 한 줄. 없는 버전은 "없음".
function Thumbnails({ images, imageVersions }: { images: Record<string, string>; imageVersions: ImageVersion[] }) {
  if (imageVersions.length === 0) return <p className="empty">그림 버전이 아직 없어요</p>
  return (
    <div className="thumb-row">
      {imageVersions.map((v) => {
        const file = images[v.id]
        return (
          <figure key={v.id} className="thumb">
            {file ? (
              <a href={imageUrl(v.id, file)} target="_blank" rel="noreferrer">
                <img src={imageUrl(v.id, file)} alt={`${v.label} 그림`} loading="lazy" />
              </a>
            ) : (
              <span className="thumb-empty">없음</span>
            )}
            <figcaption>{v.label || v.id}</figcaption>
          </figure>
        )
      })}
    </div>
  )
}

// "최종 프롬프트 보기": 서버가 조립한 글을 그대로 보여 준다.
function PromptView({ chapter, sceneId, dirty }: { chapter: number; sceneId: string; dirty: boolean }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<PromptResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function toggle() {
    if (open) {
      setOpen(false)
      return
    }
    setOpen(true)
    setLoading(true)
    setError(null)
    try {
      setResult(await api.scenePrompt(chapter, sceneId))
    } catch (err) {
      setResult(null)
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="prompt-view">
      <button type="button" className="btn btn-small" aria-expanded={open} onClick={() => void toggle()}>
        {open ? '최종 프롬프트 닫기' : '최종 프롬프트 보기'}
      </button>
      {open && (
        <>
          {dirty && <p className="dirty-note">저장한 내용 기준이에요. 고친 내용은 저장해야 반영돼요.</p>}
          {loading && <p className="muted">불러오는 중이에요</p>}
          {error && <p className="form-error">{error}</p>}
          {result && !loading && (
            <>
              <pre className="prompt">{result.prompt}</pre>
              <p className="muted">
                참고 이미지:{' '}
                {result.references.length
                  ? result.references.map((r, i) => (
                      <span key={r}>
                        {i > 0 && ', '}
                        <code>{r}</code>
                      </span>
                    ))
                  : '없음'}
              </p>
            </>
          )}
        </>
      )}
    </div>
  )
}

// "이 장면만 다시 그리기": images 작업을 이 장면 하나로 시작한다.
function RedrawButton({ chapter, sceneId }: { chapter: number; sceneId: string }) {
  const [busy, setBusy] = useState(false)
  const [started, setStarted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function start() {
    setBusy(true)
    setError(null)
    setStarted(false)
    try {
      await api.startJob('images', { chapter, scenes: [sceneId], allowDraft: true })
      setStarted(true)
    } catch (err) {
      // 작업이 이미 돌고 있으면(409) 서버 문장을 그대로 보여 준다.
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="button-row">
      <button type="button" className="btn btn-small" onClick={() => void start()} disabled={busy}>
        이 장면만 다시 그리기
      </button>
      {started && (
        <span className="saved-note" role="status">
          작업을 시작했어요 → <a href={routeHref({ page: 'jobs' })}>작업 로그 보기</a>
        </span>
      )}
      {error && (
        <span className="form-error" role="alert">
          {error}
        </span>
      )}
    </div>
  )
}
