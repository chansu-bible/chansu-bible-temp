import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  findActiveIndex,
  findSceneIndex,
  splitVerse,
  type Chapter,
  type Character,
  type Entity,
  type Gloss,
  type Mark,
  type Place,
} from 'reader-core'
import { useSettings } from '../settings/SettingsContext'
import { fonts, markColor } from '../theme/palette'
import Icon from '../ui/Icon'
import { IconButton } from '../ui/IconButton'

// 스크롤 영역의 위에서 이만큼 내려온 곳이 기준선이다. 기준선에 걸린 절이 지금 절이다.
const lineOffset = 24

type Props = {
  // 책 이름. 머리의 장 이름과 다음 장 단추에 쓴다.
  bookName: string
  chapter: Chapter
  // 다음 장 번호. 마지막 장이면 undefined
  nextChapter: number | undefined
  verse: number
  // 낭독 중에는 스크롤이 지금 절을 따라가고, 스크롤로 지금 절을 바꾸지 않는다.
  following: boolean
  onVerseChange: (verse: number) => void
  onChapterChange: (chapter: number) => void
  // 본문의 인물·장소 이름을 이을 때 쓴다.
  characters: Character[]
  places: Place[]
  onOpenEntity: (entity: Entity) => void
  onOpenContents: () => void
  onOpenSettings: () => void
  onOpenChapters: () => void
  // 절 → 밑줄·메모 기록(이 장의 것만)
  marks: ReadonlyMap<number, Mark>
  // 절을 길게 누르면 밑줄·메모 시트를 연다.
  onLongPressVerse: (verse: number) => void
  onGoHome: () => void
  onOpenSearch: () => void
  onOpenAsk: () => void
  // 이 장의 퀴즈(승인된 문제가 셋 이상일 때). done은 끝까지 푼 적이 있는지
  quiz: { count: number; done: boolean } | null
  onOpenQuiz: () => void
}

// 화면 아래쪽 절반: 장의 본문. 장이나 이동(목차, 장면 넘기기)이 바뀌면 ReaderScreen이 key로 새로 그린다.
export default function VersePane({
  bookName,
  chapter,
  nextChapter,
  verse,
  following,
  onVerseChange,
  onChapterChange,
  characters,
  places,
  onOpenEntity,
  onOpenContents,
  onOpenSettings,
  onOpenChapters,
  marks,
  onLongPressVerse,
  onGoHome,
  onOpenSearch,
  onOpenAsk,
  quiz,
  onOpenQuiz,
}: Props) {
  const { palette, verseScale } = useSettings()
  const insets = useSafeAreaInsets()
  const scrollRef = useRef<ScrollView>(null)
  // 장면 블록의 위치(스크롤 내용 기준)와 절의 위치(블록 기준)
  const blockTops = useRef(new Map<string, number>())
  const verseTops = useRef(new Map<number, number>())
  const [viewport, setViewport] = useState(0)
  // 본문에서 누른 낱말의 풀이. 다른 낱말을 누르면 바뀌고, 닫기를 누르면 사라진다.
  const [openGloss, setOpenGloss] = useState<Gloss | null>(null)
  // 처음 그릴 때 지금 절로 한 번 옮겼는지
  const placed = useRef(false)
  const initialVerse = useRef(verse)

  const blocks = useMemo(
    () =>
      chapter.scenes.map((scene) => ({
        scene,
        verses: chapter.verses.filter((v) => v.verse >= scene.verseStart && v.verse <= scene.verseEnd),
      })),
    [chapter],
  )
  // 화면에 놓인 순서대로의 절 번호
  const order = useMemo(() => blocks.flatMap((block) => block.verses.map((v) => v.verse)), [blocks])
  const activeScene = findSceneIndex(chapter.scenes, verse)

  const topOf = useCallback(
    (number: number): number | null => {
      const scene = chapter.scenes.find((item) => number >= item.verseStart && number <= item.verseEnd)
      const block = scene ? blockTops.current.get(scene.id) : undefined
      const inner = verseTops.current.get(number)
      return block === undefined || inner === undefined ? null : block + inner
    },
    [chapter.scenes],
  )

  // 절을 기준선에 맞추는 스크롤 위치. 첫 절이면 맨 위다.
  const scrollYFor = useCallback(
    (number: number): number | null => {
      if (number === order[0]) return 0
      const top = topOf(number)
      return top === null ? null : Math.max(0, top - lineOffset + 1)
    },
    [order, topOf],
  )

  // 모든 블록과 절의 자리를 잰 뒤 한 번만 지금 절로 옮긴다.
  function placeInitially() {
    if (placed.current || blockTops.current.size < blocks.length || verseTops.current.size < order.length) return
    placed.current = true
    const y = scrollYFor(initialVerse.current)
    if (y !== null && y > 0) scrollRef.current?.scrollTo({ y, animated: false })
  }

  // 낭독 중에는 지금 절이 바뀔 때마다 기준선까지 부드럽게 따라간다.
  useEffect(() => {
    if (!following || !placed.current) return
    const y = scrollYFor(verse)
    if (y !== null) scrollRef.current?.scrollTo({ y, animated: true })
  }, [following, verse, scrollYFor])

  function handleScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    if (following || !placed.current) return
    const { contentOffset, layoutMeasurement, contentSize } = event.nativeEvent
    const offsets = order.map((number) => topOf(number) ?? 0)
    const atBottom = contentOffset.y + layoutMeasurement.height >= contentSize.height - 1
    const next = order[findActiveIndex(offsets, contentOffset.y, lineOffset, atBottom)]
    if (next !== undefined && next !== verse) onVerseChange(next)
  }

  const size = 17 * verseScale

  return (
    <View style={[styles.pane, { backgroundColor: palette.paper }]}>
      <View style={[styles.header, { borderBottomColor: palette.line }]}>
        <View style={styles.headerStart}>
          <IconButton name="home" label="홈으로" color={palette.ink} onPress={onGoHome} />
          <Pressable
          accessibilityRole="button"
          accessibilityLabel={`장 고르기. 지금 ${bookName} ${chapter.chapter}장`}
          onPress={onOpenChapters}
          style={styles.chapterButton}
        >
          <Text style={[styles.chapterText, { color: palette.ink }]}>{bookName} {chapter.chapter}장</Text>
          <Icon name="chevronDown" size={16} color={palette.inkSoft} />
          </Pressable>
        </View>
        <View style={styles.headerButtons}>
          <IconButton name="search" label="검색" color={palette.ink} onPress={onOpenSearch} />
          <IconButton name="chat" label="질문하기" color={palette.ink} onPress={onOpenAsk} />
          <IconButton name="list" label="목차" color={palette.ink} onPress={onOpenContents} />
          <IconButton name="gear" label="읽기 설정" color={palette.ink} onPress={onOpenSettings} />
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.content}
        onScroll={handleScroll}
        scrollEventThrottle={32}
        onLayout={(event) => setViewport(event.nativeEvent.layout.height)}
      >
        {blocks.map(({ scene, verses }, index) => {
          const active = index === activeScene
          return (
            <View
              key={scene.id}
              onLayout={(event) => {
                blockTops.current.set(scene.id, event.nativeEvent.layout.y)
                placeInitially()
              }}
              style={[styles.block, { borderLeftColor: active ? palette.accent : 'transparent' }]}
            >
              {verses.map((v) => {
                const parts = splitVerse(
                  v.text,
                  scene.glossary.filter((gloss) => gloss.verse === v.verse),
                  chapter.chapter,
                  characters,
                  places,
                )
                const mark = marks.get(v.verse)
                const badgeStyle = { color: palette.accent, fontFamily: fonts.sans, fontSize: 13 * verseScale }
                const content = parts.map((part, partIndex) => {
                  const { gloss, entity } = part
                  if (gloss) {
                    return (
                      <Text
                        key={partIndex}
                        accessibilityRole="button"
                        accessibilityLabel={`${part.text} 뜻 보기`}
                        onPress={() => setOpenGloss(gloss)}
                        style={[styles.gloss, { textDecorationColor: palette.accent }]}
                      >
                        {part.text}
                      </Text>
                    )
                  }
                  if (entity) {
                    return (
                      <Text
                        key={partIndex}
                        accessibilityRole="button"
                        accessibilityLabel={`${part.text} ${entity.kind === 'place' ? '장소' : '인물'} 카드 보기`}
                        onPress={() => onOpenEntity(entity)}
                        style={[styles.name, { textDecorationColor: palette.accent }]}
                      >
                        {part.text}
                      </Text>
                    )
                  }
                  return <Text key={partIndex}>{part.text}</Text>
                })
                return (
                  <Pressable
                    key={v.verse}
                    onLayout={(event) => {
                      verseTops.current.set(v.verse, event.nativeEvent.layout.y)
                      placeInitially()
                    }}
                    onLongPress={() => onLongPressVerse(v.verse)}
                    delayLongPress={400}
                    accessibilityHint="길게 누르면 밑줄과 메모를 남겨요"
                    style={[styles.verseBox, v.verse === verse && { backgroundColor: palette.accentSoft }]}
                  >
                    <Text
                      style={[styles.verse, { fontSize: size, lineHeight: size * 1.75, color: active ? palette.ink : palette.inkSoft }]}
                    >
                      <Text style={[styles.verseNumber, { color: palette.accent }]}>{v.verse} </Text>
                      {mark?.color ? <Text style={{ backgroundColor: markColor(mark.color, palette) }}>{content}</Text> : content}
                      {mark && mark.note.trim() ? (
                        <Text accessibilityLabel="메모 있음. 눌러서 보기" onPress={() => onLongPressVerse(v.verse)} style={badgeStyle}>
                          {' ✎'}
                        </Text>
                      ) : null}
                      {mark?.bookmark ? (
                        <Text accessibilityLabel="즐겨찾기" style={badgeStyle}>
                          {' ★'}
                        </Text>
                      ) : null}
                    </Text>
                  </Pressable>
                )
              })}
            </View>
          )
        })}

        {quiz && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`이해 확인 퀴즈. 문제 ${quiz.count}개${quiz.done ? ', 다 풀었음' : ''}`}
            onPress={onOpenQuiz}
            style={({ pressed }) => [styles.quiz, { backgroundColor: palette.accentSoft, opacity: pressed ? 0.8 : 1 }]}
          >
            <Icon name="check" size={18} color={palette.accent} />
            <View style={styles.quizText}>
              <Text style={[styles.quizTitle, { color: palette.accent }]}>이해 확인 퀴즈</Text>
              <Text style={[styles.quizDetail, { color: palette.inkSoft }]}>
                {quiz.done ? '다 풀었어요 · 다시 풀기' : `${chapter.chapter}장 문제 ${quiz.count}개 · 점수는 남지 않아요`}
              </Text>
            </View>
          </Pressable>
        )}

        {nextChapter !== undefined && (
          <Pressable
            accessibilityRole="button"
            onPress={() => onChapterChange(nextChapter)}
            style={[styles.nextChapter, { borderColor: palette.line, backgroundColor: palette.surface }]}
          >
            <Text style={[styles.nextChapterText, { color: palette.ink }]}>{bookName} {nextChapter}장으로</Text>
          </Pressable>
        )}

        {/* 마지막 절도 기준선까지 올라올 수 있도록 끝에 빈 공간을 둔다. */}
        <View style={{ height: Math.max(0, viewport - lineOffset) }} />
      </ScrollView>

      {openGloss && (
        <View
          style={[styles.glossCard, { backgroundColor: palette.surface, bottom: 12 + insets.bottom }]}
          accessibilityLiveRegion="polite"
        >
          <Text style={[styles.glossBody, { color: palette.ink }]}>
            <Text style={[styles.glossWord, { color: palette.accent }]}>{openGloss.word} </Text>
            {openGloss.meaning}
          </Text>
          <IconButton name="close" label="낱말 풀이 닫기" color={palette.ink} onPress={() => setOpenGloss(null)} />
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  pane: { flex: 1 },
  headerStart: { flexDirection: 'row', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 4, paddingRight: 6, borderBottomWidth: StyleSheet.hairlineWidth },
  chapterButton: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 10 },
  chapterText: { fontSize: 15, fontWeight: '600' },
  headerButtons: { flexDirection: 'row' },
  scroll: { flex: 1 },
  content: { paddingTop: 8, paddingHorizontal: 14 },
  block: { paddingVertical: 10, paddingLeft: 12, borderLeftWidth: 2 },
  verseBox: { marginBottom: 8, marginHorizontal: -8, paddingHorizontal: 8, borderRadius: 8 },
  verse: { fontFamily: fonts.serif },
  verseNumber: { fontFamily: fonts.sans, fontSize: 11 },
  gloss: { textDecorationLine: 'underline', textDecorationStyle: 'dotted' },
  name: { textDecorationLine: 'underline', textDecorationStyle: 'solid' },
  nextChapter: { marginTop: 16, padding: 14, borderWidth: 1, borderRadius: 12, alignItems: 'center' },
  nextChapterText: { fontSize: 15, fontWeight: '600' },
  quiz: { marginTop: 16, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 12 },
  quizText: { flex: 1, gap: 2 },
  quizTitle: { fontSize: 15, fontWeight: '600' },
  quizDetail: { fontSize: 12 },
  glossCard: {
    position: 'absolute',
    left: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingVertical: 12,
    paddingLeft: 14,
    paddingRight: 6,
    borderRadius: 12,
    shadowColor: '#000000',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  glossBody: { flex: 1, paddingTop: 8, fontSize: 14, lineHeight: 21.7 },
  glossWord: { fontWeight: '700' },
})
