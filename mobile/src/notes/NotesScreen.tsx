import { useLocalSearchParams, useRouter } from 'expo-router'
import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { countMarks, findBook, markId, type Bundle, type Mark } from 'reader-core'
import { useMarks } from '../data/reading'
import { goToReader } from '../navigation'
import { useSettings } from '../settings/SettingsContext'
import { fonts, markColor } from '../theme/palette'
import Icon from '../ui/Icon'
import { ScreenHeader } from '../ui/ScreenHeader'

type Filter = 'all' | 'highlight' | 'note' | 'bookmark'

const matches: Record<Filter, (mark: Mark) => boolean> = {
  all: () => true,
  highlight: (mark) => mark.color !== null,
  note: (mark) => mark.note.trim() !== '',
  bookmark: (mark) => mark.bookmark,
}

// 내 밑줄·메모·즐겨찾기 목록. 누르면 그 절로 간다.
export default function NotesScreen({ bundle }: { bundle: Bundle }) {
  const router = useRouter()
  const { from } = useLocalSearchParams<{ from?: string }>()
  const { palette } = useSettings()
  const insets = useSafeAreaInsets()
  const marks = useMarks()
  const [filter, setFilter] = useState<Filter>('all')
  const counts = countMarks(marks)
  const shown = marks.filter(matches[filter])
  const chips: { id: Filter; label: string }[] = [
    { id: 'all', label: `전체 ${marks.length}` },
    { id: 'highlight', label: `밑줄 ${counts.highlights}` },
    { id: 'note', label: `메모 ${counts.notes}` },
    { id: 'bookmark', label: `즐겨찾기 ${counts.bookmarks}` },
  ]

  return (
    <View style={[styles.root, { backgroundColor: palette.paper }]}>
      <ScreenHeader title="밑줄과 메모" />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        <View style={styles.chips}>
          {chips.map((chip) => {
            const selected = chip.id === filter
            return (
              <Pressable
                key={chip.id}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => setFilter(chip.id)}
                style={[styles.chip, selected ? { backgroundColor: palette.accent } : { backgroundColor: palette.surface, borderColor: palette.line, borderWidth: 1 }]}
              >
                <Text style={[styles.chipText, { color: selected ? palette.paper : palette.inkSoft, fontWeight: selected ? '700' : '400' }]}>{chip.label}</Text>
              </Pressable>
            )
          })}
        </View>

        {shown.length === 0 ? (
          <Text style={[styles.empty, { color: palette.inkFaint }]}>
            {marks.length === 0 ? '본문의 절을 길게 누르면 밑줄과 메모를 남길 수 있어요.' : '이 갈래에는 아직 없어요.'}
          </Text>
        ) : (
          shown.map((mark) => {
            // 기록은 자기 책 id를 달고 있다. 이름을 모르는 id는 id 그대로 보인다.
            const bookName = findBook(mark.book)?.name ?? mark.book
            // 다른 책의 기록은 이 묶음에서 본문을 찾지 못하고, 읽기 화면도 지금 책만 연다(다른 책은 3단계에서 연다).
            const here = mark.book === bundle.bookId
            const text = here
              ? (bundle.chapters.find((c) => c.chapter === mark.chapter)?.verses.find((v) => v.verse === mark.verse)?.text ?? '')
              : ''
            return (
              <Pressable
                key={markId(mark.book, mark.chapter, mark.verse)}
                accessibilityRole="button"
                accessibilityLabel={`${bookName} ${mark.chapter}장 ${mark.verse}절로 가기`}
                disabled={!here}
                onPress={() => goToReader(router, from, { position: { chapter: mark.chapter, verse: mark.verse } })}
                style={({ pressed }) => [styles.row, { backgroundColor: palette.surface, opacity: pressed ? 0.7 : 1 }]}
              >
                <View style={styles.rowHead}>
                  <Text style={[styles.reference, { color: palette.inkSoft }]}>
                    {bookName} {mark.chapter}장 {mark.verse}절
                  </Text>
                  {mark.bookmark && <Icon name="bookmark" size={14} color={palette.accent} filled />}
                </View>
                <Text style={[styles.verse, { color: palette.ink }]}>
                  <Text style={mark.color ? { backgroundColor: markColor(mark.color, palette) } : undefined}>{text}</Text>
                </Text>
                {mark.note.trim() ? (
                  <View style={[styles.note, { borderLeftColor: palette.accent }]}>
                    <Text style={[styles.noteText, { color: palette.ink }]}>{mark.note}</Text>
                  </View>
                ) : null}
              </Pressable>
            )
          })
        )}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, gap: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 4 },
  chip: { height: 32, paddingHorizontal: 12, borderRadius: 999, justifyContent: 'center' },
  chipText: { fontSize: 13 },
  empty: { marginTop: 24, fontSize: 14, lineHeight: 22, textAlign: 'center' },
  row: { padding: 14, borderRadius: 14, gap: 6 },
  rowHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  reference: { fontSize: 12 },
  verse: { fontFamily: fonts.serif, fontSize: 15, lineHeight: 24 },
  note: { paddingLeft: 10, borderLeftWidth: 2 },
  noteText: { fontSize: 14, lineHeight: 21 },
})
