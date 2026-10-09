import { useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { MARK_COLORS, type MarkColor, type Verse } from 'reader-core'
import { getMark, saveMark } from '../data/reading'
import { useSettings } from '../settings/SettingsContext'
import { fonts, markColor } from '../theme/palette'
import Icon from '../ui/Icon'
import { Sheet } from '../ui/Sheet'
import { sheetStyles } from '../ui/sheetStyles'

const colorLabel: Record<MarkColor, string> = { yellow: '노란', green: '초록', blue: '파란' }

type Props = {
  book: string
  chapter: number
  verse: Verse
  onShare: () => void
  onClose: () => void
}

// 절을 길게 눌러 여는 밑줄·메모·즐겨찾기 시트. 저장을 눌러야 바뀐다.
export default function MarkSheet({ book, chapter, verse, onShare, onClose }: Props) {
  const { palette } = useSettings()
  const existing = getMark(book, chapter, verse.verse)
  const [color, setColor] = useState<MarkColor | null>(existing?.color ?? null)
  const [note, setNote] = useState(existing?.note ?? '')
  const [bookmark, setBookmark] = useState(existing?.bookmark ?? false)

  function save() {
    saveMark({ book, chapter, verse: verse.verse, color, note: note.trim(), bookmark })
    onClose()
  }

  return (
    <Sheet title={`창세기 ${chapter}장 ${verse.verse}절`} closeLabel="밑줄과 메모 닫기" onClose={onClose}>
      <Text style={[styles.verse, { color: palette.ink }]}>
        <Text style={color ? { backgroundColor: markColor(color, palette) } : undefined}>{verse.text}</Text>
      </Text>

      <View style={styles.colors} accessibilityRole="radiogroup" accessibilityLabel="밑줄 색">
        {MARK_COLORS.map((item) => {
          const selected = item === color
          return (
            <Pressable
              key={item}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              accessibilityLabel={`${colorLabel[item]} 밑줄`}
              onPress={() => setColor(item)}
              style={[styles.swatch, { backgroundColor: markColor(item, palette), borderColor: selected ? palette.accent : 'transparent' }]}
            />
          )
        })}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="밑줄 지우기"
          onPress={() => setColor(null)}
          style={[styles.swatch, styles.clear, { borderColor: palette.line, backgroundColor: palette.surface }]}
        >
          <Icon name="close" size={14} color={palette.inkSoft} />
        </Pressable>
      </View>

      <TextInput
        accessibilityLabel="메모"
        placeholder="메모"
        placeholderTextColor={palette.inkFaint}
        value={note}
        onChangeText={setNote}
        multiline
        style={[styles.input, { borderColor: palette.line, backgroundColor: palette.paper, color: palette.ink }]}
      />

      <View style={styles.row}>
        <Pressable
          accessibilityRole="switch"
          accessibilityState={{ checked: bookmark }}
          accessibilityLabel="즐겨찾기"
          onPress={() => setBookmark(!bookmark)}
          style={[styles.chip, { backgroundColor: bookmark ? palette.accentSoft : palette.paper }]}
        >
          <Icon name="bookmark" size={16} color={palette.accent} filled={bookmark} />
          <Text style={[styles.chipText, { color: bookmark ? palette.accent : palette.inkSoft }]}>즐겨찾기</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={onShare} style={[styles.chip, { backgroundColor: palette.paper }]}>
          <Icon name="share" size={16} color={palette.inkSoft} />
          <Text style={[styles.chipText, { color: palette.inkSoft }]}>카드로 공유</Text>
        </Pressable>
      </View>

      <View style={[styles.row, styles.actions]}>
        <Pressable accessibilityRole="button" onPress={onClose} style={styles.cancel}>
          <Text style={[styles.cancelText, { color: palette.inkSoft }]}>취소</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={save} style={[styles.save, { backgroundColor: palette.accent }]}>
          <Text style={[styles.saveText, { color: palette.paper }]}>저장</Text>
        </Pressable>
      </View>

      <Text style={[sheetStyles.note, { color: palette.inkFaint }]}>
        이 기기에 저장돼요. 로그인하면 다른 기기에서도 같은 메모를 볼 수 있어요.
      </Text>
    </Sheet>
  )
}

const styles = StyleSheet.create({
  verse: { fontFamily: fonts.serif, fontSize: 16, lineHeight: 27 },
  colors: { flexDirection: 'row', gap: 10 },
  swatch: { width: 32, height: 32, borderRadius: 16, borderWidth: 2 },
  clear: { borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  input: { minHeight: 84, padding: 12, borderWidth: 1, borderRadius: 12, fontSize: 14, lineHeight: 22, textAlignVertical: 'top' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingHorizontal: 12, borderRadius: 10 },
  chipText: { fontSize: 13 },
  actions: { justifyContent: 'flex-end' },
  cancel: { height: 40, paddingHorizontal: 14, justifyContent: 'center' },
  cancelText: { fontSize: 14 },
  save: { height: 40, paddingHorizontal: 18, borderRadius: 12, justifyContent: 'center' },
  saveText: { fontSize: 14, fontWeight: '600' },
})
