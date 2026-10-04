import { useEffect, useMemo, useRef, useState } from 'react'
import type { Bundle } from '../content/types.ts'
import { loadImageVersion, nextImageVersion, pickImageVersion, saveImageVersion } from '../reader/imageVersion.ts'
import { loadPosition, savePosition } from '../reader/position.ts'
import { findSceneIndex, initialPosition, nextPosition, startOfChapter, verseAt } from '../reader/readingPosition.ts'
import { buildRoute } from '../reader/route.ts'
import { useNarration, verseAudioUrl } from '../reader/useNarration.ts'
import BackgroundSheet from './BackgroundSheet.tsx'
import MapScreen from './MapScreen.tsx'
import ScenePane from './ScenePane.tsx'
import VersePane from './VersePane.tsx'

type Overlay = 'none' | 'map' | 'sheet'

export default function ReaderScreen({ bundle }: { bundle: Bundle }) {
  // 지금 읽는 곳은 절 단위로 들고, 장면은 절에서 정한다.
  const [position, setPosition] = useState(() => initialPosition(bundle.chapters, loadPosition()))
  const [overlay, setOverlay] = useState<Overlay>('none')
  const [imageVersionId, setImageVersionId] = useState(() => pickImageVersion(bundle, loadImageVersion()))
  const openerRef = useRef<HTMLElement | null>(null)

  const chapter = bundle.chapters.find((c) => c.chapter === position.chapter) ?? bundle.chapters[0]
  const sceneIndex = findSceneIndex(chapter.scenes, position.verse)
  const scene = chapter.scenes[sceneIndex]
  const verse = verseAt(bundle.chapters, position)
  const audioUrl = verseAudioUrl(verse)
  const route = useMemo(() => buildRoute(bundle.chapters, bundle.places, scene.id), [bundle, scene.id])

  // 한 절을 다 읽으면 다음 절(장의 끝이면 다음 장의 첫 절)로 넘어가 이어 읽는다.
  const narration = useNarration(() => {
    const next = nextPosition(bundle.chapters, position.chapter, position.verse)
    if (!next) return null
    setPosition(next)
    return verseAudioUrl(verseAt(bundle.chapters, next))
  })

  useEffect(() => {
    savePosition(position)
  }, [position])

  function openOverlay(next: Exclude<Overlay, 'none'>) {
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setOverlay(next)
  }

  // 오버레이가 열려 있는 동안 Esc로 닫고, 닫히면 열었던 버튼으로 포커스를 돌려준다.
  useEffect(() => {
    if (overlay === 'none') {
      openerRef.current?.focus()
      openerRef.current = null
      return
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOverlay('none')
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [overlay])

  function goToChapter(next: number) {
    narration.stop()
    const target = bundle.chapters.find((c) => c.chapter === next)
    if (target) setPosition(startOfChapter(target))
  }

  function cycleImageVersion() {
    const next = nextImageVersion(bundle.imageVersions, imageVersionId)
    if (!next) return
    setImageVersionId(next)
    saveImageVersion(next)
  }

  function togglePlay() {
    if (narration.playing) narration.stop()
    else if (audioUrl) narration.play(audioUrl)
  }

  return (
    <div className="reader">
      <div className="reader-panes" inert={overlay !== 'none'}>
        <ScenePane
          scene={scene}
          sceneNumber={sceneIndex + 1}
          sceneCount={chapter.scenes.length}
          verse={verse}
          imageVersion={bundle.imageVersions.find((version) => version.id === imageVersionId) ?? null}
          onCycleImageVersion={bundle.imageVersions.length > 1 ? cycleImageVersion : undefined}
          playing={narration.playing}
          canPlay={audioUrl !== null}
          onTogglePlay={togglePlay}
          onOpenMap={() => openOverlay('map')}
          onOpenSheet={() => openOverlay('sheet')}
        />
        <VersePane
          key={chapter.chapter}
          chapter={chapter}
          chapterNumbers={bundle.chapters.map((c) => c.chapter)}
          verse={position.verse}
          following={narration.playing}
          onVerseChange={(next) => setPosition({ chapter: chapter.chapter, verse: next })}
          onChapterChange={goToChapter}
        />
      </div>
      {overlay === 'map' && <MapScreen route={route} onClose={() => setOverlay('none')} />}
      {overlay === 'sheet' && <BackgroundSheet scene={scene} onClose={() => setOverlay('none')} />}
    </div>
  )
}
