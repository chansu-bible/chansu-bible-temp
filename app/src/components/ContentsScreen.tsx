import { useState } from 'react'
import type { CSSProperties } from 'react'
import type { Bundle, Scene } from '../content/types.ts'
import { hueOf } from '../reader/hue.ts'
import type { Entity } from '../reader/names.ts'
import type { Position } from '../reader/position.ts'
import { chapterProgress, sceneStatus } from '../reader/progress.ts'
import Icon from './Icon.tsx'
import TimelineView from './TimelineView.tsx'

export type ContentsTab = 'scenes' | 'timeline'

type Props = {
  bundle: Bundle
  currentChapter: number
  currentSceneId: string
  // 지금 장면에 나오는 인물 id. 연표에서 진하게 그린다.
  sceneCharacters: string[]
  readScenes: Set<string>
  imageVersionId: string | null
  tab: ContentsTab
  onTabChange: (tab: ContentsTab) => void
  // 장면을 누르면 그 장면의 첫 절로 옮기고 목차를 닫는다.
  onJump: (position: Position) => void
  onOpenEntity: (entity: Entity) => void
  onClose: () => void
}

const statusText = { reading: '읽는 중', read: '읽음', unread: '' } as const

// 목차: 장마다 장면 목록과 읽은 진도, 그리고 인물 연표
export default function ContentsScreen({
  bundle,
  currentChapter,
  currentSceneId,
  sceneCharacters,
  readScenes,
  imageVersionId,
  tab,
  onTabChange,
  onJump,
  onOpenEntity,
  onClose,
}: Props) {
  // 목록을 보여 줄 장. 장 칩을 누르면 바뀌기만 하고 읽는 곳은 옮기지 않는다.
  const [shownChapter, setShownChapter] = useState(currentChapter)
  const chapter = bundle.chapters.find((c) => c.chapter === shownChapter) ?? bundle.chapters[0]
  const progress = chapterProgress(chapter.scenes, readScenes)

  return (
    <div className="overlay contents-screen" role="dialog" aria-modal="true" aria-labelledby="contents-title">
      <header className="overlay-header">
        <button type="button" className="icon-button" aria-label="목차 닫기" autoFocus onClick={onClose}>
          <Icon name="back" />
        </button>
        <h2 id="contents-title" className="overlay-title">
          목차
        </h2>
      </header>

      <div className="tabs" role="tablist" aria-label="목차 보기">
        <TabButton id="scenes" label="장면" tab={tab} onTabChange={onTabChange} />
        <TabButton id="timeline" label="연표" tab={tab} onTabChange={onTabChange} />
      </div>

      {tab === 'scenes' ? (
        <div className="contents-body" role="tabpanel" id="contents-panel-scenes" aria-labelledby="contents-tab-scenes">
          <div className="chapter-chips" role="group" aria-label="장 고르기">
            {bundle.chapters.map((c) => {
              const done = chapterProgress(c.scenes, readScenes).done
              const className = [
                'chapter-chip',
                c.chapter === currentChapter ? 'current' : '',
                c.chapter === chapter.chapter ? 'selected' : '',
                done ? 'done' : '',
              ]
                .filter(Boolean)
                .join(' ')
              return (
                <button
                  key={c.chapter}
                  type="button"
                  className={className}
                  aria-pressed={c.chapter === chapter.chapter}
                  aria-label={`${c.chapter}장${c.chapter === currentChapter ? ', 읽는 중' : ''}${done ? ', 다 읽음' : ''}`}
                  onClick={() => setShownChapter(c.chapter)}
                >
                  {c.chapter}
                </button>
              )
            })}
          </div>

          <div className="chapter-summary">
            <p className="chapter-summary-title">
              {chapter.chapter}장 · 장면 {chapter.scenes.length}개 · {chapter.verses.length}절
            </p>
            <p className="chapter-progress-text">
              읽은 장면 {progress.read} / {progress.total}
            </p>
            <div
              className="progress-bar"
              role="progressbar"
              aria-label={`${chapter.chapter}장 읽은 장면`}
              aria-valuemin={0}
              aria-valuemax={progress.total}
              aria-valuenow={progress.read}
            >
              <span style={{ width: progress.total ? `${(progress.read / progress.total) * 100}%` : 0 }} />
            </div>
          </div>

          <ol className="scene-list">
            {chapter.scenes.map((scene, index) => (
              <li key={scene.id}>
                <SceneRow
                  scene={scene}
                  number={index + 1}
                  placeName={bundle.places.find((place) => place.id === scene.placeId)?.name ?? null}
                  image={imageVersionId ? (scene.images[imageVersionId] ?? null) : null}
                  status={sceneStatus(scene.id, currentSceneId, readScenes)}
                  onClick={() => onJump({ chapter: chapter.chapter, verse: scene.verseStart })}
                />
              </li>
            ))}
          </ol>
        </div>
      ) : (
        <div className="contents-body" role="tabpanel" id="contents-panel-timeline" aria-labelledby="contents-tab-timeline">
          <TimelineView
            characters={bundle.characters}
            eras={bundle.eras}
            sceneCharacters={sceneCharacters}
            onOpenEntity={onOpenEntity}
          />
        </div>
      )}
    </div>
  )
}

function TabButton({
  id,
  label,
  tab,
  onTabChange,
}: {
  id: ContentsTab
  label: string
  tab: ContentsTab
  onTabChange: (tab: ContentsTab) => void
}) {
  const selected = tab === id
  return (
    <button
      type="button"
      role="tab"
      id={`contents-tab-${id}`}
      aria-selected={selected}
      aria-controls={`contents-panel-${id}`}
      tabIndex={selected ? 0 : -1}
      className="tab"
      onClick={() => onTabChange(id)}
      onKeyDown={(event) => {
        // 탭 사이는 좌우 화살표로 옮긴다.
        if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
          const next = id === 'scenes' ? 'timeline' : 'scenes'
          onTabChange(next)
          document.getElementById(`contents-tab-${next}`)?.focus()
        }
      }}
    >
      {label}
    </button>
  )
}

function SceneRow({
  scene,
  number,
  placeName,
  image,
  status,
  onClick,
}: {
  scene: Scene
  number: number
  placeName: string | null
  image: string | null
  status: keyof typeof statusText
  onClick: () => void
}) {
  const verses = scene.verseStart === scene.verseEnd ? `${scene.verseStart}절` : `${scene.verseStart}–${scene.verseEnd}절`
  return (
    <button type="button" className={`scene-row ${status}`} onClick={onClick}>
      <span className="scene-thumb" style={{ '--hue': hueOf(scene.id) } as CSSProperties} aria-hidden="true">
        {image ? <img src={import.meta.env.BASE_URL + image} alt="" loading="lazy" /> : number}
      </span>
      <span className="scene-row-text">
        <span className="scene-row-title">{scene.title}</span>
        <span className="scene-row-meta">
          {verses}
          {placeName && (
            <span className="place-chip">
              <Icon name="pin" size={12} />
              {placeName}
            </span>
          )}
        </span>
      </span>
      <span className="scene-row-status">{statusText[status]}</span>
    </button>
  )
}
