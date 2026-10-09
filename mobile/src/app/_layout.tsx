import { NanumMyeongjo_400Regular, NanumMyeongjo_700Bold, useFonts } from '@expo-google-fonts/nanum-myeongjo'
import { Stack } from 'expo-router'
import { Platform, StyleSheet, View } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { AuthProvider } from '../auth/AuthContext'
import { content } from '../content/bundle'
import { NarrationProvider } from '../narration/NarrationContext'
import { WidgetSync } from '../widgets/WidgetSync'
import { SettingsProvider, useSettings } from '../settings/SettingsContext'
import { SyncProvider } from '../sync/SyncContext'

export default function RootLayout() {
  const [loaded, error] = useFonts({ NanumMyeongjo_400Regular, NanumMyeongjo_700Bold })

  // 글꼴을 못 불러와도 기기 글꼴로 연다.
  if (!loaded && !error) return null

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <SettingsProvider>
          <AuthProvider>
            <SyncProvider>
              <NarrationProvider bundle={content.bundle}>
                <Frame />
                <WidgetSync />
              </NarrationProvider>
            </SyncProvider>
          </AuthProvider>
        </SettingsProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}

// 넓은 화면(웹 미리 보기)에서는 폰 너비로 가운데에 둔다.
function Frame() {
  const { palette } = useSettings()
  return (
    <View style={[styles.root, { backgroundColor: palette.backdrop }]}>
      <View style={[styles.frame, { backgroundColor: palette.paper }]}>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: palette.paper } }}>
          {/* 낭독 플레이어는 아래에서 올라오는 화면이다(목업의 접기 단추). */}
          <Stack.Screen name="player" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        </Stack>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  frame: { flex: 1, width: '100%', maxWidth: Platform.OS === 'web' ? 480 : undefined, alignSelf: 'center', overflow: 'hidden' },
})
