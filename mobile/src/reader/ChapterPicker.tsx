import { Pressable, StyleSheet, Text, View } from 'react-native'
import { chapterProgress, type Chapter } from 'reader-core'
import { useSettings } from '../settings/SettingsContext'
import { Sheet } from '../ui/Sheet'

type Props = {
  chapters: Chapter[]
  current: number
  readScenes: Set<string>
  onPick: (chapter: number) => void
  onClose: () => void
}

// 본문 머리의 "창세기 N장"을 눌러 여는 장 고르기. 다 읽은 장은 초록으로 표시한다.
export default function ChapterPicker({ chapters, current, readScenes, onPick, onClose }: Props) {
  const { palette } = useSettings()
  return (
    <Sheet title="장 고르기" closeLabel="장 고르기 닫기" onClose={onClose}>
      <View style={styles.grid}>
        {chapters.map((chapter) => {
          const done = chapterProgress(chapter.scenes, readScenes).done
          const selected = chapter.chapter === current
          return (
            <Pressable
              key={chapter.chapter}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`${chapter.chapter}장${selected ? ', 읽는 중' : ''}${done ? ', 다 읽음' : ''}`}
              onPress={() => onPick(chapter.chapter)}
              style={[
                styles.chip,
                {
                  borderColor: selected ? palette.accent : palette.line,
                  backgroundColor: selected ? palette.accent : done ? palette.okSoft : palette.surface,
                },
              ]}
            >
              <Text
                style={[
                  styles.chipText,
                  { color: selected ? palette.paper : done ? palette.ok : palette.ink, fontWeight: selected ? '700' : '400' },
                ]}
              >
                {chapter.chapter}
              </Text>
            </Pressable>
          )
        })}
      </View>
    </Sheet>
  )
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { width: 52, height: 44, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontSize: 15 },
})
