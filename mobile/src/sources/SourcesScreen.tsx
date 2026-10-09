import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { Bundle } from 'reader-core'
import { useSettings } from '../settings/SettingsContext'
import { fonts } from '../theme/palette'
import Icon from '../ui/Icon'
import { ScreenHeader } from '../ui/ScreenHeader'

// 자료 출처와 이용 조건. 묶음의 sources를 그대로 보인다(설정 시트, 원어 시트, 서재에서 연다).
export default function SourcesScreen({ bundle }: { bundle: Bundle }) {
  const { palette } = useSettings()
  const insets = useSafeAreaInsets()
  return (
    <View style={[styles.root, { backgroundColor: palette.paper }]}>
      <ScreenHeader title="자료 출처" />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        <Text style={[styles.intro, { color: palette.inkSoft }]}>이 앱이 쓰는 본문과 자료, 그리고 그 이용 조건이에요.</Text>
        {bundle.sources.map((source) => (
          <View key={source.id} style={[styles.card, { backgroundColor: palette.surface }]}>
            <Text style={[styles.title, { color: palette.ink }]} accessibilityRole="header">
              {source.title}
            </Text>
            <Text style={[styles.detail, { color: palette.inkSoft }]}>{source.detail}</Text>
            <Text style={[styles.license, { backgroundColor: palette.accentSoft, color: palette.accent }]}>{source.license}</Text>
            {source.url !== null && (
              <Pressable
                accessibilityRole="link"
                accessibilityLabel={`${source.title} 누리집 열기`}
                onPress={() => void Linking.openURL(encodeURI(safeDecode(source.url!))).catch(() => undefined)}
                hitSlop={6}
                style={styles.link}
              >
                <Icon name="link" size={14} color={palette.accent} />
                <Text style={[styles.linkText, { color: palette.accent }]} numberOfLines={1}>
                  {source.url.replace(/^https?:\/\//, '')}
                </Text>
              </Pressable>
            )}
          </View>
        ))}
      </ScrollView>
    </View>
  )
}

// 이미 %로 바꾼 주소를 두 번 바꾸지 않게 먼저 푼다.
function safeDecode(url: string): string {
  try {
    return decodeURI(url)
  } catch {
    return url
  }
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingTop: 16, paddingHorizontal: 20, gap: 12 },
  intro: { fontSize: 13, lineHeight: 20 },
  card: { gap: 8, padding: 16, borderRadius: 16 },
  title: { fontFamily: fonts.serifBold, fontSize: 16 },
  detail: { fontSize: 13, lineHeight: 20 },
  license: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, overflow: 'hidden', fontSize: 12 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', maxWidth: '100%' },
  linkText: { flexShrink: 1, fontSize: 12 },
})
