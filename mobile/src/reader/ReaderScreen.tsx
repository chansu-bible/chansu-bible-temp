import { useRouter } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useEffect, useMemo, useRef, useState } from 'react'
import { BackHandler, Platform, StyleSheet, View } from 'react-native'
import {
  adjacentScenePosition,
  buildRoute,
  findSceneIndex,
  initialPosition,
  localDay,
  placeChange,
  startOfChapter,
  verseAt,
  type Bundle,
  type Entity,
  type PlaceChange,
  type Position,
} from 'reader-core'
import { bookId } from '../content/bundle'
import { markSceneRead, savedPosition, savePositionRecord, useMarks, useReadScenes } from '../data/reading'
import MapScreen from '../map/MapScreen'
import { useNarration } from '../narration/NarrationContext'
import { goHome, onReaderRequest, takeReaderRequest, type ReaderRequest } from '../navigation'
import { useSettings } from '../settings/SettingsContext'
import ShareCardSheet from '../share/ShareCardSheet'
import BackgroundSheet from './BackgroundSheet'
import ChapterPicker from './ChapterPicker'
import ContentsScreen, { type ContentsTab } from './ContentsScreen'
import EntityCard from './EntityCard'
import MarkSheet from './MarkSheet'
import ScenePane from './ScenePane'
import SettingsSheet from './SettingsSheet'
import VersePane from './VersePane'

// entity의 back: 목차(연표)에서 연 카드면 닫을 때 목차로 돌아간다.
type Overlay =
  | 'none'
  | 'map'
  | 'sheet'
  | 'contents'
  | 'settings'
  | 'chapters'
  | { kind: 'entity'; entity: Entity; back: 'contents' | null }
  // 절을 길게 눌러 연 밑줄·메모 시트와, 거기서 연 장면 카드 공유
  | { kind: 'mark'; verse: number }
  | { kind: 'share'; verse: number }

// 읽기 화면: 위에 장면 그림, 아래에 본문. 웹 목업 ReaderScreen과 같은 흐름이다.
export default function ReaderScreen({ bundle }: { bundle: Bundle }) {
  const { settings, palette } = useSettings()
  const router = useRouter()
  // 홈·검색·메모에서 열 때 보낸 요청(옮길 절, 열 덮개). 처음 한 번만 꺼낸다.
  const [initialRequest] = useState(() => takeReaderRequest())
  // 지금 읽는 곳은 절 단위로 들고, 장면은 절에서 정한다.
  const [position, setPosition] = useState(() =>
    initialPosition(bundle.chapters, initialRequest?.position ?? savedPosition()),
  )
  const [overlay, setOverlay] = useState<Overlay>(() =>
    initialRequest?.overlay === 'map' ? 'map' : initialRequest?.overlay ? 'contents' : 'none',
  )
  const [contentsTab, setContentsTab] = useState<ContentsTab>(
    initialRequest?.overlay === 'timeline' ? 'timeline' : 'scenes',
  )
  const { ids: readScenes } = useReadScenes()
  const marks = useMarks()
  const chapterMarks = useMemo(
    () =>
      new Map(
        marks.filter((mark) => mark.book === bookId && mark.chapter === position.chapter).map((mark) => [mark.verse, mark]),
      ),
    [marks, position.chapter],
  )
  // 목차·장면 넘기기로 옮길 때마다 늘려 본문을 새로 그린다. 그래야 같은 장 안에서도 그 절로 스크롤한다.
  const [jumpCount, setJumpCount] = useState(0)
  // 장면이 바뀌면서 장소가 달라지면 여정 지도를 저절로 열어 새 장소로 옮긴 뒤 닫는다. 그때의 변화를 든다.
  const [autoMap, setAutoMap] = useState<PlaceChange | null>(null)
  // 마지막으로 장소가 있던 장면의 장소 id. undefined는 아직 첫 장면도 보지 않은 상태라 처음 열 때는 지도를 열지 않는다.
  const previousPlaceRef = useRef<string | null | undefined>(undefined)

  const chapter = bundle.chapters.find((c) => c.chapter === position.chapter) ?? bundle.chapters[0]!
  const sceneIndex = findSceneIndex(chapter.scenes, position.verse)
  const scene = chapter.scenes[sceneIndex]!
  const verse = verseAt(bundle.chapters, position)
  const route = useMemo(() => buildRoute(bundle.chapters, bundle.places, scene.id), [bundle, scene.id])
  const nextChapter = bundle.chapters.find((c) => c.chapter > chapter.chapter && c.verses.length > 0)?.chapter

  const narration = useNarration()
  // 낭독 중에는 읽는 절을 따라 본문과 장면을 옮긴다(장이 바뀌어도 따라간다).
  useEffect(() => {
    if (!narration.playing || narration.track === null || narration.verse === null) return
    const next = { chapter: narration.track.chapter, verse: narration.verse }
    setPosition((current) => (current.chapter === next.chapter && current.verse === next.verse ? current : next))
  }, [narration.playing, narration.track, narration.verse])

  useEffect(() => {
    savePositionRecord(position)
  }, [position])

  // 장면의 마지막 절까지 오면 그 장면을 오늘 읽은 것으로 적는다(연속 읽기와 계획이 쓴다).
  useEffect(() => {
    if (position.verse >= scene.verseEnd && !readScenes.has(scene.id)) markSceneRead(scene.id, localDay(new Date()))
  }, [position, scene.id, scene.verseEnd, readScenes])

  // 다른 덮개(해설 시트 등)를 보고 있을 때는 끼어들지 않는다. 설정에서 껐으면 열지 않는다.
  useEffect(() => {
    const previous = previousPlaceRef.current
    if (scene.placeId !== null || previous === undefined) previousPlaceRef.current = scene.placeId
    if (previous === undefined || !settings.placeFlash) return
    const change = placeChange(bundle.places, previous, scene.placeId)
    if (!change || (overlay !== 'none' && overlay !== 'map')) return
    // 출발 장소는 여정에서 바로 앞의 장소다. 장을 건너뛰어 왔거나 장소 없는 장면에서 열어도 여정을 따라 날아간다.
    const from = route.visited.length >= 2 ? route.visited[route.visited.length - 2]! : change.from
    setAutoMap({ ...change, from })
    setOverlay('map')
  }, [scene.id, scene.placeId, bundle.places, overlay, route, settings.placeFlash])

  function openOverlay(next: Exclude<Overlay, 'none'>) {
    setAutoMap(null)
    setOverlay(next)
  }

  // 목차에서 연 인물 카드는 닫으면 목차로 돌아가고, 나머지는 모두 닫힌다.
  function closeOverlay() {
    setAutoMap(null)
    if (typeof overlay === 'object' && overlay.kind === 'entity' && overlay.back === 'contents') setOverlay('contents')
    else setOverlay('none')
  }

  // 안드로이드 뒤로 가기는 열린 덮개를 닫는다(뒤로 가기 단추는 안드로이드에만 있다).
  useEffect(() => {
    if (overlay === 'none' || Platform.OS !== 'android') return
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      closeOverlay()
      return true
    })
    return () => subscription.remove()
    // closeOverlay는 overlay에만 기대므로 overlay가 바뀔 때 다시 단다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlay])

  function goToChapter(next: number) {
    narration.pause()
    const target = bundle.chapters.find((c) => c.chapter === next)
    if (target) setPosition(startOfChapter(target))
  }

  function jumpTo(next: Position) {
    narration.pause()
    setPosition(next)
    setJumpCount((count) => count + 1)
    closeOverlay()
  }

  function swipeScene(direction: 1 | -1) {
    const target = adjacentScenePosition(bundle.chapters, position, direction)
    if (target) jumpTo(target)
  }

  // 본문의 이름에서 열면 처음 여는 카드, 카드 안의 관계에서 열면 지금 카드를 바꾼다.
  function openEntity(entity: Entity) {
    const back =
      typeof overlay === 'object' && overlay.kind === 'entity' ? overlay.back : overlay === 'contents' ? 'contents' : null
    openOverlay({ kind: 'entity', entity, back })
  }

  // 검색·메모에서 뒤로 돌아오며 보낸 요청. 지금 그려진 읽기 화면에 바로 적용한다.
  const applyRequest = useRef<(request: ReaderRequest) => void>(() => undefined)
  applyRequest.current = (request) => {
    if (request.position) jumpTo(request.position)
    if (request.overlay === 'map') openOverlay('map')
    else if (request.overlay) {
      setContentsTab(request.overlay === 'timeline' ? 'timeline' : 'scenes')
      openOverlay('contents')
    }
  }
  useEffect(
    () =>
      onReaderRequest(() => {
        const request = takeReaderRequest()
        if (request) applyRequest.current(request)
      }),
    [],
  )

  function togglePlay() {
    if (narration.playing) narration.pause()
    else narration.start(position)
  }

  const covered = overlay !== 'none'
  // 목차와 지도는 바탕이 밝은(어두운 화면이면 어두운) 전체 화면이고, 나머지는 그림이 위에 있다.
  const fullScreen = overlay === 'map' || overlay === 'contents'

  return (
    <View style={[styles.reader, { backgroundColor: palette.paper }]}>
      <StatusBar style={fullScreen ? (palette.dark ? 'light' : 'dark') : 'light'} />
      <View
        style={styles.panes}
        importantForAccessibility={covered ? 'no-hide-descendants' : 'auto'}
        accessibilityElementsHidden={covered}
      >
        <ScenePane
          scene={scene}
          imageVersionId={bundle.defaultImageVersion}
          sceneNumber={sceneIndex + 1}
          sceneCount={chapter.scenes.length}
          verse={verse}
          playing={narration.playing}
          canPlay={scene.audio !== null}
          onOpenPlayer={narration.track !== null ? () => router.push('/player') : undefined}
          onTogglePlay={togglePlay}
          onOpenMap={() => openOverlay('map')}
          onOpenSheet={() => openOverlay('sheet')}
          onSwipe={swipeScene}
        />
        <VersePane
          // 글자 크기가 바뀌면 줄 위치가 달라지므로 새로 그려 지금 절을 다시 기준선에 맞춘다.
          key={`${chapter.chapter}-${jumpCount}-${settings.fontScale}`}
          chapter={chapter}
          nextChapter={nextChapter}
          verse={position.verse}
          following={narration.playing}
          onVerseChange={(next) => setPosition({ chapter: chapter.chapter, verse: next })}
          onChapterChange={goToChapter}
          characters={bundle.characters}
          places={bundle.places}
          onOpenEntity={openEntity}
          onOpenContents={() => openOverlay('contents')}
          onOpenSettings={() => openOverlay('settings')}
          onOpenChapters={() => openOverlay('chapters')}
          marks={chapterMarks}
          onLongPressVerse={(target) => openOverlay({ kind: 'mark', verse: target })}
          onGoHome={() => goHome(router)}
          onOpenSearch={() => router.push({ pathname: '/search', params: { from: 'read' } })}
        />
      </View>

      {overlay === 'map' && <MapScreen route={route} auto={autoMap} onClose={closeOverlay} />}
      {overlay === 'sheet' && <BackgroundSheet scene={scene} onClose={closeOverlay} />}
      {overlay === 'contents' && (
        <ContentsScreen
          bundle={bundle}
          currentChapter={chapter.chapter}
          currentSceneId={scene.id}
          sceneCharacters={scene.characters}
          readScenes={readScenes}
          tab={contentsTab}
          onTabChange={setContentsTab}
          onJump={jumpTo}
          onOpenEntity={openEntity}
          onClose={closeOverlay}
        />
      )}
      {overlay === 'settings' && <SettingsSheet verse={verse} onClose={closeOverlay} />}
      {overlay === 'chapters' && (
        <ChapterPicker
          chapters={bundle.chapters}
          current={chapter.chapter}
          readScenes={readScenes}
          onPick={(next) => {
            closeOverlay()
            goToChapter(next)
          }}
          onClose={closeOverlay}
        />
      )}
      {typeof overlay === 'object' && overlay.kind === 'entity' && (
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
      {typeof overlay === 'object' && overlay.kind === 'mark' && (
        <MarkSheet
          book={bookId}
          chapter={chapter.chapter}
          verse={chapter.verses.find((v) => v.verse === overlay.verse)!}
          onShare={() => setOverlay({ kind: 'share', verse: overlay.verse })}
          onClose={closeOverlay}
        />
      )}
      {typeof overlay === 'object' && overlay.kind === 'share' && (
        <ShareCardSheet
          scene={chapter.scenes[findSceneIndex(chapter.scenes, overlay.verse)]!}
          imageVersionId={bundle.defaultImageVersion}
          chapter={chapter.chapter}
          verse={chapter.verses.find((v) => v.verse === overlay.verse)!}
          translation={bundle.translation}
          onClose={closeOverlay}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  reader: { flex: 1 },
  panes: { flex: 1 },
})
