import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { Bundle } from '../content/types.ts'
import { loadImageVersion, nextImageVersion, pickImageVersion, saveImageVersion } from '../reader/imageVersion.ts'
import type { Entity } from '../reader/names.ts'
import { placeChange, type PlaceChange } from '../reader/placeChange.ts'
import { loadPosition, savePosition, type Position } from '../reader/position.ts'
import { loadReadScenes, markRead, saveReadScenes } from '../reader/progress.ts'
import { findSceneIndex, initialPosition, nextPosition, startOfChapter, verseAt } from '../reader/readingPosition.ts'
import { buildRoute } from '../reader/route.ts'
import { useSettings } from '../reader/settings.ts'
import { loadSubtitles, saveSubtitles } from '../reader/subtitles.ts'
import { useNarration, verseAudioUrl } from '../reader/useNarration.ts'
import BackgroundSheet from './BackgroundSheet.tsx'
import ContentsScreen, { type ContentsTab } from './ContentsScreen.tsx'
import EntityCard from './EntityCard.tsx'
import MapScreen from './MapScreen.tsx'
import ScenePane from './ScenePane.tsx'
import SettingsSheet from './SettingsSheet.tsx'
import VersePane from './VersePane.tsx'

// entity의 back: 목차(연표)에서 연 카드면 닫을 때 목차로 돌아간다.
type Overlay =
  | 'none'
  | 'map'
  | 'sheet'
  | 'contents'
  | 'settings'
  | { kind: 'entity'; entity: Entity; back: 'contents' | null }

export default function ReaderScreen({ bundle }: { bundle: Bundle }) {
  // 지금 읽는 곳은 절 단위로 들고, 장면은 절에서 정한다.
  const [position, setPosition] = useState(() => initialPosition(bundle.chapters, loadPosition()))
  const [overlay, setOverlay] = useState<Overlay>('none')
  const [imageVersionId, setImageVersionId] = useState(() => pickImageVersion(bundle, loadImageVersion()))
  const { settings, update: updateSettings, verseScale } = useSettings()
  // 그림 위 자막. 장면 그림의 버튼과 읽기 설정이 같은 값을 쓴다.
  const [subtitles, setSubtitles] = useState(loadSubtitles)
  const [readScenes, setReadScenes] = useState(loadReadScenes)
  const [contentsTab, setContentsTab] = useState<ContentsTab>('scenes')
  // 목차에서 장면으로 옮길 때마다 늘려 본문을 새로 그린다. 그래야 같은 장 안에서도 그 절로 스크롤한다.
  const [jumpCount, setJumpCount] = useState(0)
  const openerRef = useRef<HTMLElement | null>(null)
  // 장면이 바뀌면서 장소가 달라지면 여정 지도를 저절로 열어 새 장소로 옮긴 뒤 닫는다. 그때의 변화를 든다.
  const [autoMap, setAutoMap] = useState<PlaceChange | null>(null)
  // 마지막으로 장소가 있던 장면의 장소 id. 장소가 없는 장면을 지나도 유지해서, 에덴 → (장소 없음) → 놋이면 에덴에서 놋으로 날아간다.
  // undefined는 아직 첫 장면도 보지 않은 상태라, 처음 열 때는 지도를 열지 않는다.
  const previousPlaceRef = useRef<string | null | undefined>(undefined)

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
  }, settings.speed)

  useEffect(() => {
    savePosition(position)
  }, [position])

  // 장면의 마지막 절까지 오면 그 장면을 읽은 것으로 적는다.
  useEffect(() => {
    if (position.verse >= scene.verseEnd) setReadScenes((current) => markRead(current, scene.id))
  }, [position, scene.id, scene.verseEnd])

  useEffect(() => {
    saveReadScenes(readScenes)
  }, [readScenes])

  // 다른 오버레이(해설 시트 등)를 보고 있을 때는 끼어들지 않는다. 설정에서 껐으면 열지 않는다.
  useEffect(() => {
    const previous = previousPlaceRef.current
    if (scene.placeId !== null || previous === undefined) previousPlaceRef.current = scene.placeId
    if (previous === undefined || !settings.placeFlash) return
    const change = placeChange(bundle.places, previous, scene.placeId)
    if (!change || (overlay !== 'none' && overlay !== 'map')) return
    if (overlay === 'none') {
      openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    }
    // 출발 장소는 여정에서 바로 앞의 장소다. 장을 건너뛰어 왔거나 장소 없는 장면에서 열어도 여정을 따라 날아간다.
    const from = route.visited.length >= 2 ? route.visited[route.visited.length - 2]! : change.from
    setAutoMap({ ...change, from })
    setOverlay('map')
  }, [scene.id, scene.placeId, bundle.places, overlay, route, settings.placeFlash])

  // auto가 있으면 장소가 바뀌어 저절로 연 지도다. 버튼으로 열면 null이다.
  function openOverlay(next: Exclude<Overlay, 'none'>, auto: PlaceChange | null = null) {
    if (overlay === 'none') {
      openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    }
    setAutoMap(next === 'map' ? auto : null)
    setOverlay(next)
  }

  // 목차에서 연 인물 카드는 닫으면 목차로 돌아가고, 나머지는 모두 닫힌다.
  function closeOverlay() {
    setAutoMap(null)
    if (typeof overlay === 'object' && overlay.back === 'contents') setOverlay('contents')
    else setOverlay('none')
  }

  // 오버레이가 열려 있는 동안 Esc로 닫고, 닫히면 열었던 버튼으로 포커스를 돌려준다.
  useEffect(() => {
    if (overlay === 'none') {
      openerRef.current?.focus()
      openerRef.current = null
      return
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') closeOverlay()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // closeOverlay는 overlay에만 기대므로 overlay가 바뀔 때 다시 단다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlay])

  function goToChapter(next: number) {
    narration.stop()
    const target = bundle.chapters.find((c) => c.chapter === next)
    if (target) setPosition(startOfChapter(target))
  }

  function jumpTo(next: Position) {
    narration.stop()
    setPosition(next)
    setJumpCount((count) => count + 1)
    closeOverlay()
  }

  // 본문의 이름에서 열면 처음 여는 카드, 카드 안의 관계에서 열면 지금 카드를 바꾼다.
  function openEntity(entity: Entity) {
    const back = typeof overlay === 'object' ? overlay.back : overlay === 'contents' ? 'contents' : null
    openOverlay({ kind: 'entity', entity, back })
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

  function toggleSubtitles() {
    setSubtitles(!subtitles)
    saveSubtitles(!subtitles)
  }

  return (
    <div className="reader" style={{ '--verse-scale': verseScale } as CSSProperties}>
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
          subtitles={subtitles}
          onToggleSubtitles={toggleSubtitles}
        />
        <VersePane
          key={`${chapter.chapter}-${jumpCount}`}
          chapter={chapter}
          chapterNumbers={bundle.chapters.map((c) => c.chapter)}
          verse={position.verse}
          following={narration.playing}
          onVerseChange={(next) => setPosition({ chapter: chapter.chapter, verse: next })}
          onChapterChange={goToChapter}
          characters={bundle.characters}
          places={bundle.places}
          onOpenEntity={openEntity}
          onOpenContents={() => openOverlay('contents')}
          onOpenSettings={() => openOverlay('settings')}
        />
      </div>
      {overlay === 'map' && <MapScreen route={route} auto={autoMap} onClose={closeOverlay} />}
      {overlay === 'sheet' && <BackgroundSheet scene={scene} onClose={closeOverlay} />}
      {overlay === 'contents' && (
        <ContentsScreen
          bundle={bundle}
          currentChapter={chapter.chapter}
          currentSceneId={scene.id}
          sceneCharacters={scene.characters}
          readScenes={readScenes}
          imageVersionId={imageVersionId}
          tab={contentsTab}
          onTabChange={setContentsTab}
          onJump={jumpTo}
          onOpenEntity={openEntity}
          onClose={closeOverlay}
        />
      )}
      {overlay === 'settings' && (
        <SettingsSheet
          settings={settings}
          onChange={updateSettings}
          subtitles={subtitles}
          onToggleSubtitles={toggleSubtitles}
          verse={verse}
          onClose={closeOverlay}
        />
      )}
      {typeof overlay === 'object' && (
        <EntityCard
          key={`${overlay.entity.kind}-${overlay.entity.id}`}
          entity={overlay.entity}
          characters={bundle.characters}
          places={bundle.places}
          sceneCharacters={scene.characters}
          onOpenEntity={openEntity}
          onOpenMap={() => openOverlay('map')}
          onClose={closeOverlay}
        />
      )}
    </div>
  )
}
