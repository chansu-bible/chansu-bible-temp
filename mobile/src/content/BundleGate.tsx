import type { ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import type { Bundle } from 'reader-core'
import { useSettings } from '../settings/SettingsContext'
import { content } from './bundle'

// 경로 화면이 묶음을 쓰기 전에 거친다. 묶음을 읽지 못했으면 오류를 보인다.
export function BundleGate({ render }: { render: (bundle: Bundle) => ReactNode }) {
  const { palette } = useSettings()
  if (content.error !== null) {
    return (
      <View style={[styles.status, { backgroundColor: palette.paper }]}>
        <Text style={{ color: palette.inkSoft }}>콘텐츠를 불러오지 못했어요</Text>
        <Text style={{ color: palette.inkFaint, fontSize: 12 }}>{content.error}</Text>
      </View>
    )
  }
  return <>{render(content.bundle)}</>
}

const styles = StyleSheet.create({
  status: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
})
