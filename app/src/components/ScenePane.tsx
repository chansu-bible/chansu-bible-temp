import { useState } from 'react'
import type { CSSProperties } from 'react'
import type { ImageVersion, ReviewStatus, Scene, Verse } from '../content/types.ts'
import type { PlaceChange } from '../reader/placeChange.ts'
import { loadSubtitles, saveSubtitles } from '../reader/subtitles.ts'
import Icon from './Icon.tsx'
import PlaceFlash from './PlaceFlash.tsx'

const badgeText: Partial<Record<ReviewStatus, string>> = { draft: '검수 전', flagged: '확인 필요' }

// 이 글자 수보다 긴 절은 자막 글자를 줄여 그림 위에 다 들어가게 한다.
const longVerse = 60

type Props = {
  scene: Scene
  sceneNumber: number
  sceneCount: number
  verse: Verse | undefined
  // 보여 줄 그림 버전. 버전이 둘 이상이면 버튼으로 바꿔 볼 수 있다.
  imageVersion: ImageVersion | null
  onCycleImageVersion?: () => void
  playing: boolean
  canPlay: boolean
  onTogglePlay: () => void
  onOpenMap: () => void
  onOpenSheet: () => void
  // 장면이 바뀌면서 장소가 달라졌을 때 그림 위에 잠깐 띄우는 지도. 다 보여 주면 onPlaceChangeDone을 부른다.
  placeChange: PlaceChange | null
  onPlaceChangeDone: () => void
}

export default function ScenePane({
  scene,
  sceneNumber,
  sceneCount,
  verse,
  imageVersion,
  onCycleImageVersion,
  playing,
  canPlay,
  onTogglePlay,
  onOpenMap,
  onOpenSheet,
  placeChange,
  onPlaceChangeDone,
}: Props) {
  const [shown, setShown] = useState(scene)
  const [previous, setPrevious] = useState<Scene | null>(null)
  const [subtitles, setSubtitles] = useState(loadSubtitles)

  // 장면이 바뀌면 이전 그림을 아래에 깔아 두고 새 그림을 위에서 서서히 나타나게 한다.
  if (scene.id !== shown.id) {
    setPrevious(shown)
    setShown(scene)
  }

  function toggleSubtitles() {
    setSubtitles(!subtitles)
    saveSubtitles(!subtitles)
  }

  const badge = badgeText[shown.reviewStatus]
  // 소리가 없는 절에서는 재생 버튼을 흐리게 두되, 포커스는 받을 수 있게 한다.
  const playDisabled = !playing && !canPlay

  return (
    <section className="scene-pane" aria-label="장면 그림">
      {previous && <SceneLayer key={previous.id} scene={previous} version={imageVersion} />}
      <SceneLayer key={shown.id} scene={shown} version={imageVersion} entering={previous !== null} />

      {placeChange && <PlaceFlash key={placeChange.to.id} change={placeChange} onDone={onPlaceChangeDone} />}

      <div className="scene-buttons">
        <button type="button" className="round-button" aria-label="여정 지도 보기" onClick={onOpenMap}>
          <Icon name="map" />
        </button>
        <button type="button" className="round-button" aria-label="이 장면 해설 보기" onClick={onOpenSheet}>
          <Icon name="question" />
        </button>
      </div>

      <div className="scene-controls">
        {playing && <span className="ai-voice">AI 음성</span>}
        <button
          type="button"
          className="round-button"
          aria-label={playing ? 'AI 음성 읽기 멈춤' : 'AI 음성으로 듣기'}
          aria-disabled={playDisabled || undefined}
          onClick={playDisabled ? undefined : onTogglePlay}
        >
          <Icon name={playing ? 'pause' : 'play'} />
        </button>
        <button
          type="button"
          className="round-button toggle"
          aria-label="자막 켜기/끄기"
          aria-pressed={subtitles}
          onClick={toggleSubtitles}
        >
          <Icon name="subtitles" />
        </button>
      </div>

      {imageVersion && onCycleImageVersion && (
        <button
          type="button"
          className="version-pill"
          aria-label={`그림 버전 바꾸기. 지금은 ${imageVersion.label}`}
          title={imageVersion.note}
          onClick={onCycleImageVersion}
        >
          그림 {imageVersion.label}
        </button>
      )}

      <div className="scene-bottom">
        {subtitles && verse && (
          <p className={verse.text.length > longVerse ? 'subtitle long' : 'subtitle'}>
            <span className="subtitle-number">{verse.verse}</span>
            {verse.text}
          </p>
        )}
        <div className="scene-caption">
          <span className="scene-title">{shown.title}</span>
          <span className="scene-meta">
            {badge && <span className="review-badge">{badge}</span>}
            <span className="scene-count">
              {sceneNumber} / {sceneCount}
            </span>
          </span>
        </div>
      </div>
    </section>
  )
}

function SceneLayer({
  scene,
  version,
  entering = false,
}: {
  scene: Scene
  version: ImageVersion | null
  entering?: boolean
}) {
  const image = version ? scene.images[version.id] : undefined
  return (
    <div className={entering ? 'scene-layer entering' : 'scene-layer'}>
      {image ? (
        <img src={import.meta.env.BASE_URL + image} alt={scene.title} />
      ) : (
        <div className="scene-placeholder" style={{ '--hue': hueOf(scene.id) } as CSSProperties}>
          그림 준비 중
        </div>
      )}
    </div>
  )
}

// 그림이 없는 동안에도 장면이 바뀌는 것이 보이도록 장면마다 다른 바탕색을 쓴다.
function hueOf(id: string): number {
  let sum = 0
  for (const char of id) sum += char.charCodeAt(0)
  return (sum * 47) % 360
}
