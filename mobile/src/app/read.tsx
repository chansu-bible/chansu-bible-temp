import { StyleSheet, Text, View } from 'react-native'
import { content } from '../content/bundle'
import ReaderScreen from '../reader/ReaderScreen'
import { useSettings } from '../settings/SettingsContext'

export default function ReadRoute() {
  const { palette } = useSettings()
  if (content.error !== null) {
    return (
      <View style={[styles.status, { backgroundColor: palette.paper }]}>
        <Text style={{ color: palette.inkSoft }}>콘텐츠를 불러오지 못했어요</Text>
        <Text style={{ color: palette.inkFaint, fontSize: 12 }}>{content.error}</Text>
      </View>
    )
  }
  return <ReaderScreen bundle={content.bundle} />
}

const styles = StyleSheet.create({
  status: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
})
