import { useState } from 'react'
import type { CSSProperties } from 'react'
import type { ReviewStatus, Scene } from '../content/types.ts'
import Icon from './Icon.tsx'

const badgeText: Partial<Record<ReviewStatus, string>> = { draft: '검수 전', flagged: '확인 필요' }

type Props = {
  scene: Scene
  sceneNumber: number
  sceneCount: number
  onOpenMap: () => void
  onOpenSheet: () => void
}

export default function ScenePane({ scene, sceneNumber, sceneCount, onOpenMap, onOpenSheet }: Props) {
  const [shown, setShown] = useState(scene)
  const [previous, setPrevious] = useState<Scene | null>(null)

  // 장면이 바뀌면 이전 그림을 아래에 깔아 두고 새 그림을 위에서 서서히 나타나게 한다.
  if (scene.id !== shown.id) {
    setPrevious(shown)
    setShown(scene)
  }

  const badge = badgeText[shown.reviewStatus]

  return (
    <section className="scene-pane" aria-label="장면 그림">
      {previous && <SceneLayer key={previous.id} scene={previous} />}
      <SceneLayer key={shown.id} scene={shown} entering={previous !== null} />

      <div className="scene-buttons">
        <button type="button" className="round-button" aria-label="여정 지도 보기" onClick={onOpenMap}>
          <Icon name="map" />
        </button>
        <button type="button" className="round-button" aria-label="이 장면 해설 보기" onClick={onOpenSheet}>
          <Icon name="question" />
        </button>
      </div>

      {badge && <div className="review-badge">{badge}</div>}

      <div className="scene-caption">
        <span className="scene-title">{shown.title}</span>
        <span className="scene-count">
          {sceneNumber} / {sceneCount}
        </span>
      </div>
    </section>
  )
}

function SceneLayer({ scene, entering = false }: { scene: Scene; entering?: boolean }) {
  return (
    <div className={entering ? 'scene-layer entering' : 'scene-layer'}>
      {scene.image ? (
        <img src={import.meta.env.BASE_URL + scene.image} alt={scene.title} />
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
