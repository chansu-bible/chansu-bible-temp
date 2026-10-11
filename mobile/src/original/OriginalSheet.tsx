import { useMemo, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View, type ScrollView } from 'react-native'
import { shortGloss, wordOccurrences, type Bundle, type Chapter, type Position } from 'reader-core'
import { useSettings } from '../settings/SettingsContext'
import { fonts } from '../theme/palette'
import { Sheet } from '../ui/Sheet'
import { sheetStyles } from '../ui/sheetStyles'

type Props = {
  bundle: Bundle
  chapter: Chapter
  verse: number
  // 나오는 곳의 절을 누르면 읽기 화면을 그 절로 옮기고 시트를 닫는다.
  onJump: (position: Position) => void
  onOpenSources: () => void
  onClose: () => void
}

// 원어 보기: 절의 히브리어 낱말을 오른쪽에서 왼쪽으로 늘어놓고, 누른 낱말의 사전 항목을 아래에 보인다.
// 한국어 절 낱말과 히브리어 낱말은 짝짓지 않는다(자동 정렬은 틀리기 쉽다).
export default function OriginalSheet({ bundle, chapter, verse, onJump, onOpenSources, onClose }: Props) {
  const { palette } = useSettings()
  const scrollRef = useRef<ScrollView>(null)
  // 사전 항목의 위치(시트 내용 기준). 낱말을 바꿔 눌러도 항목의 윗변은 그대로다.
  const entryTop = useRef<number | null>(null)
  const pendingScroll = useRef(false)
  const [selected, setSelected] = useState<number | null>(null)
  const [showPlaces, setShowPlaces] = useState(false)

  const korean = chapter.verses.find((item) => item.verse === verse)
  const words = chapter.original?.find((item) => item.verse === verse)?.words ?? []
  const word = selected === null ? undefined : words[selected]
  const strong = word?.strong ?? null
  const entry = strong ? bundle.lexicon[strong] : undefined
  const places = useMemo(() => (strong ? wordOccurrences(bundle.chapters, strong) : []), [bundle.chapters, strong])
  const range = `${bundle.book} ${bundle.chapters[0]?.chapter ?? ''}~${bundle.chapters.at(-1)?.chapter ?? ''}장`
  const credits = ['wlc', 'oshb', 'strongs']
    .map((id) => bundle.sources.find((source) => source.id === id))
    .filter((source) => source !== undefined)

  function scrollToEntry(top: number) {
    scrollRef.current?.scrollTo({ y: Math.max(0, top - 8), animated: true })
  }

  function pick(index: number) {
    setSelected(index)
    setShowPlaces(false)
    if (entryTop.current !== null) scrollToEntry(entryTop.current)
    else pendingScroll.current = true
  }

  return (
    <Sheet title={`원어 · ${bundle.book} ${chapter.chapter}장 ${verse}절`} closeLabel="원어 보기 닫기" onClose={onClose} scrollRef={scrollRef}>
      {korean && <Text style={[styles.korean, { color: palette.inkSoft }]}>{korean.text}</Text>}

      <View style={styles.words}>
        {words.map((item, index) => {
          const gloss = shortGloss(item.strong ? bundle.lexicon[item.strong] : undefined)
          const on = index === selected
          return (
            <Pressable
              key={index}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${index + 1}번째 낱말 ${item.text}. ${item.pos}${gloss ? `. ${gloss}` : ''}`}
              onPress={() => pick(index)}
              style={({ pressed }) => [
                styles.word,
                { backgroundColor: on ? palette.accentSoft : palette.paper, borderColor: on ? palette.accent : palette.line },
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.hebrew, { color: palette.ink }]}>{item.text}</Text>
              <Text style={[styles.wordGloss, { color: gloss ? palette.inkSoft : palette.inkFaint }]} numberOfLines={1}>
                {gloss ?? item.pos}
              </Text>
            </Pressable>
          )
        })}
      </View>
      {selected === null && (
        <Text style={[sheetStyles.note, { color: palette.inkFaint }]}>
          히브리어는 오른쪽에서 왼쪽으로 읽어요. 낱말을 누르면 사전 항목을 보여 줘요.
        </Text>
      )}

      {word && (
        <View
          onLayout={(event) => {
            entryTop.current = event.nativeEvent.layout.y
            if (pendingScroll.current) {
              pendingScroll.current = false
              scrollToEntry(event.nativeEvent.layout.y)
            }
          }}
          style={[styles.entry, { backgroundColor: palette.paper }]}
          accessibilityLiveRegion="polite"
        >
          <View style={styles.entryHead}>
            <Text style={[styles.lemma, { color: palette.ink }]}>{entry?.lemma ?? word.text}</Text>
            <View style={styles.entryNames}>
              {entry ? <Text style={[styles.xlit, { color: palette.ink }]}>{entry.xlit}</Text> : null}
              <Text style={[styles.pos, { color: palette.inkSoft }]}>{word.pos}</Text>
            </View>
          </View>

          {entry ? (
            entry.korean !== null ? (
              <View style={styles.meaning}>
                <Text style={[styles.koreanMeaning, { color: palette.ink }]}>{entry.korean}</Text>
                {entry.note ? <Text style={[styles.body, { color: palette.inkSoft }]}>{entry.note}</Text> : null}
                <Text style={[styles.english, { color: palette.inkFaint }]}>{entry.english}</Text>
              </View>
            ) : (
              <View style={styles.meaning}>
                <Text style={[styles.badge, { backgroundColor: palette.warnSoft, color: palette.warn }]}>뜻 검수 중</Text>
                <Text style={[styles.body, { color: palette.ink }]}>{entry.english}</Text>
                <Text style={[sheetStyles.note, { color: palette.inkFaint }]}>
                  한국어 뜻은 사람이 검수한 뒤에 보여요. 지금은 사전의 영어 정의예요.
                </Text>
              </View>
            )
          ) : (
            <Text style={[styles.body, { color: palette.inkSoft }]}>이 낱말에는 사전 번호가 없어요.</Text>
          )}

          {entry && strong && (
            <View style={sheetStyles.chips}>
              <Text style={[styles.chip, { backgroundColor: palette.accentSoft, color: palette.accent }]}>스트롱 {strong}</Text>
              <Text style={[styles.chip, { backgroundColor: palette.accentSoft, color: palette.accent }]}>
                {range}에서 {entry.count}번
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: showPlaces }}
                onPress={() => setShowPlaces((open) => !open)}
                style={[styles.chipButton, { borderColor: palette.line, backgroundColor: palette.surface }]}
              >
                <Text style={[styles.chipButtonText, { color: palette.accent }]}>
                  나오는 곳 {places.length}절 {showPlaces ? '접기' : '보기'}
                </Text>
              </Pressable>
            </View>
          )}
          {showPlaces && (
            <View style={sheetStyles.chips} accessibilityLabel="나오는 곳">
              {places.map((place) => {
                const here = place.chapter === chapter.chapter && place.verse === verse
                return (
                  <Pressable
                    key={`${place.chapter}:${place.verse}`}
                    accessibilityRole="button"
                    accessibilityLabel={`${bundle.book} ${place.chapter}장 ${place.verse}절로${here ? ', 지금 절' : ''}`}
                    onPress={() => onJump({ chapter: place.chapter, verse: place.verse })}
                    style={[styles.place, { backgroundColor: here ? palette.accent : palette.surface, borderColor: palette.line }]}
                  >
                    <Text style={[styles.placeText, { color: here ? palette.paper : palette.ink }]}>
                      {place.chapter}:{place.verse}
                    </Text>
                  </Pressable>
                )
              })}
            </View>
          )}
        </View>
      )}

      <View style={styles.credits}>
        <Text style={[sheetStyles.note, { color: palette.inkFaint }]}>
          {credits.map((source) => `${source.title}(${source.license})`).join(' · ')}
        </Text>
        <Pressable accessibilityRole="link" onPress={onOpenSources} hitSlop={8}>
          <Text style={[styles.sourcesLink, { color: palette.accent }]}>자료 출처와 이용 조건</Text>
        </Pressable>
      </View>
    </Sheet>
  )
}

const styles = StyleSheet.create({
  korean: { fontFamily: fonts.serif, fontSize: 15, lineHeight: 25 },
  // 오른쪽에서 왼쪽으로 놓고, 줄이 넘치면 다음 줄의 오른쪽부터 잇는다.
  words: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 6 },
  word: { minWidth: 52, maxWidth: 128, alignItems: 'center', gap: 2, paddingHorizontal: 8, paddingVertical: 6, borderWidth: 1, borderRadius: 10 },
  pressed: { opacity: 0.7 },
  hebrew: { fontFamily: fonts.hebrew, fontSize: 22, lineHeight: 34, writingDirection: 'rtl' },
  wordGloss: { fontSize: 11, maxWidth: 110 },
  entry: { gap: 10, padding: 14, borderRadius: 14 },
  entryHead: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  lemma: { fontFamily: fonts.hebrew, fontSize: 32, lineHeight: 44, writingDirection: 'rtl' },
  entryNames: { flex: 1, gap: 2 },
  xlit: { fontSize: 15, fontWeight: '700' },
  pos: { fontSize: 12 },
  meaning: { gap: 6 },
  koreanMeaning: { fontSize: 16, fontWeight: '600', lineHeight: 24 },
  body: { fontSize: 14, lineHeight: 22 },
  english: { fontSize: 12, lineHeight: 18 },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, overflow: 'hidden', fontSize: 11, fontWeight: '700' },
  chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, overflow: 'hidden', fontSize: 12 },
  chipButton: { paddingHorizontal: 10, paddingVertical: 3, borderWidth: 1, borderRadius: 999 },
  chipButtonText: { fontSize: 12 },
  place: { minWidth: 44, alignItems: 'center', paddingHorizontal: 8, paddingVertical: 5, borderWidth: 1, borderRadius: 8 },
  placeText: { fontSize: 12 },
  credits: { gap: 4 },
  sourcesLink: { fontSize: 12, fontWeight: '600' },
})
