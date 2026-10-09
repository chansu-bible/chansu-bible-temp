import type { ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useSettings } from '../settings/SettingsContext'
import { IconButton } from './IconButton'

// 덮는 화면의 머리: 뒤로 가기 단추와 제목
export function OverlayHeader({ title, backLabel, onBack }: { title: string; backLabel: string; onBack: () => void }) {
  const { palette } = useSettings()
  return (
    <View style={styles.header}>
      <IconButton name="back" label={backLabel} color={palette.ink} onPress={onBack} />
      <Text style={[styles.title, { color: palette.ink }]} accessibilityRole="header">
        {title}
      </Text>
    </View>
  )
}

// 읽기 화면 전체를 덮는 화면(목차)
export function OverlayScreen({
  title,
  backLabel,
  onBack,
  children,
}: {
  title: string
  backLabel: string
  onBack: () => void
  children: ReactNode
}) {
  const { palette } = useSettings()
  const insets = useSafeAreaInsets()
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: palette.paper, paddingTop: insets.top }]} accessibilityViewIsModal>
      <OverlayHeader title={title} backLabel={backLabel} onBack={onBack} />
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 4, padding: 8 },
  title: { fontSize: 16, fontWeight: '600' },
})
