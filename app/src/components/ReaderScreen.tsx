import { useEffect, useState } from 'react'
import type { Bundle } from '../content/types.ts'
import { loadPosition, savePosition, type Position } from '../reader/position.ts'
import { buildRoute } from '../reader/route.ts'
import BackgroundSheet from './BackgroundSheet.tsx'
import MapScreen from './MapScreen.tsx'
import ScenePane from './ScenePane.tsx'
import VersePane from './VersePane.tsx'

type Overlay = 'none' | 'map' | 'sheet'

function initialChapterNumber(bundle: Bundle, saved: Position | null): number {
  return bundle.chapters.find((chapter) => chapter.chapter === saved?.chapter)?.chapter ?? bundle.chapters[0].chapter
}

export default function ReaderScreen({ bundle }: { bundle: Bundle }) {
  const [saved] = useState(loadPosition)
  const [chapterNumber, setChapterNumber] = useState(() => initialChapterNumber(bundle, saved))
  const [restoreSceneId, setRestoreSceneId] = useState(saved?.sceneId ?? null)
  const chapter = bundle.chapters.find((c) => c.chapter === chapterNumber) ?? bundle.chapters[0]
  const [activeIndex, setActiveIndex] = useState(() =>
    Math.max(
      0,
      chapter.scenes.findIndex((scene) => scene.id === saved?.sceneId),
    ),
  )
  const [overlay, setOverlay] = useState<Overlay>('none')

  const sceneIndex = Math.min(activeIndex, chapter.scenes.length - 1)
  const scene = chapter.scenes[sceneIndex]

  useEffect(() => {
    savePosition({ chapter: chapter.chapter, sceneId: scene.id })
  }, [chapter.chapter, scene.id])

  function goToChapter(next: number) {
    setChapterNumber(next)
    setActiveIndex(0)
    setRestoreSceneId(null)
  }

  return (
    <div className="reader">
      <ScenePane
        scene={scene}
        sceneNumber={sceneIndex + 1}
        sceneCount={chapter.scenes.length}
        onOpenMap={() => setOverlay('map')}
        onOpenSheet={() => setOverlay('sheet')}
      />
      <VersePane
        key={chapter.chapter}
        chapter={chapter}
        chapterNumbers={bundle.chapters.map((c) => c.chapter)}
        restoreSceneId={restoreSceneId}
        activeIndex={sceneIndex}
        onActiveIndexChange={setActiveIndex}
        onChapterChange={goToChapter}
      />
      {overlay === 'map' && (
        <MapScreen route={buildRoute(bundle.chapters, bundle.places, scene.id)} onClose={() => setOverlay('none')} />
      )}
      {overlay === 'sheet' && <BackgroundSheet scene={scene} onClose={() => setOverlay('none')} />}
    </div>
  )
}
