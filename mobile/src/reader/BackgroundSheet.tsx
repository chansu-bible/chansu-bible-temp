import { Linking, Pressable, StyleSheet, Text, View } from 'react-native'
import type { Scene } from 'reader-core'
import { useSettings } from '../settings/SettingsContext'
import { Sheet } from '../ui/Sheet'
import { sheetStyles } from '../ui/sheetStyles'

// 그림의 ? 단추로 여는 장면 해설: 해설 문단, 낱말 풀이, 역사 배경
export default function BackgroundSheet({ scene, onClose }: { scene: Scene; onClose: () => void }) {
  const { palette } = useSettings()
  const { explanation, history } = scene

  return (
    <Sheet title={scene.title} closeLabel="해설 닫기" onClose={onClose}>
      {explanation.length > 0 ? (
        <View style={sheetStyles.explanation}>
          {explanation.map((paragraph, index) => (
            <Text key={index} style={[sheetStyles.paragraph, { color: palette.ink }]}>
              {paragraph}
            </Text>
          ))}
        </View>
      ) : (
        <Text style={[sheetStyles.empty, { color: palette.inkFaint }]}>이 장면의 해설은 아직 준비 중이에요.</Text>
      )}

      {scene.glossary.length > 0 && (
        <>
          <Text style={[sheetStyles.h3, { color: palette.ink }]} accessibilityRole="header">
            낱말 풀이
          </Text>
          {scene.glossary.map((gloss, index) => (
            <Text key={index} style={[sheetStyles.term, { backgroundColor: palette.paper, color: palette.ink }]}>
              <Text style={[sheetStyles.termVerse, { color: palette.inkFaint }]}>{gloss.verse}절 </Text>
              <Text style={styles.word}>{gloss.word} </Text>
              {gloss.meaning}
            </Text>
          ))}
        </>
      )}

      {history.length > 0 && (
        <>
          <Text style={[sheetStyles.h3, { color: palette.ink }]} accessibilityRole="header">
            역사 배경
          </Text>
          {history.map((note, index) => (
            <View key={index} style={[styles.history, { borderColor: palette.line }]}>
              <Text style={[styles.certainty, { backgroundColor: palette.accentSoft, color: palette.accent }]}>
                {note.certainty}
              </Text>
              <Text style={[styles.historyText, { color: palette.ink }]}>{note.text}</Text>
              <Text style={[styles.basis, { color: palette.inkSoft }]}>근거: {note.basis}</Text>
              {note.sources.length > 0 && (
                <View style={styles.sources}>
                  {note.sources.map((url, sourceIndex) => (
                    <Pressable
                      key={`${sourceIndex}-${url}`}
                      accessibilityRole="link"
                      accessibilityLabel={`출처 ${sourceIndex + 1} 열기`}
                      onPress={() => void Linking.openURL(url)}
                    >
                      <Text style={[styles.source, { color: palette.accent }]}>출처 {sourceIndex + 1}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          ))}
        </>
      )}
    </Sheet>
  )
}

const styles = StyleSheet.create({
  word: { fontWeight: '700' },
  history: { gap: 6, paddingVertical: 10, paddingHorizontal: 12, borderWidth: 1, borderRadius: 12 },
  certainty: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, fontSize: 11, overflow: 'hidden' },
  historyText: { fontSize: 14, lineHeight: 22.4 },
  basis: { fontSize: 13, lineHeight: 20 },
  sources: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  source: { fontSize: 13, textDecorationLine: 'underline' },
})
