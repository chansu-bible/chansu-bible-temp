import { useRouter } from 'expo-router'
import { StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { goBack } from '../navigation'
import { useSettings } from '../settings/SettingsContext'
import { OverlayHeader } from './OverlayScreen'

// 홈에서 연 화면(메모, 인물 사전, 가계도)의 머리. 뒤로 가기는 앞 화면으로, 없으면 홈으로 간다.
export function ScreenHeader({ title }: { title: string }) {
  const router = useRouter()
  const { palette } = useSettings()
  const insets = useSafeAreaInsets()
  return (
    <View style={[styles.header, { paddingTop: insets.top, backgroundColor: palette.paper, borderBottomColor: palette.line }]}>
      <OverlayHeader title={title} backLabel="뒤로" onBack={() => goBack(router)} />
    </View>
  )
}

const styles = StyleSheet.create({
  header: { borderBottomWidth: StyleSheet.hairlineWidth },
})
