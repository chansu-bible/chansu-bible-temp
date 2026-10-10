import { useRouter } from 'expo-router'
import { useEffect } from 'react'
import { ActivityIndicator, StyleSheet, View } from 'react-native'
import { useAuth } from '../auth/AuthContext'
import { useSettings } from '../settings/SettingsContext'

// 로그인 창(키클락)이 돌아오는 주소(앱 chansubible://auth, 웹 /auth).
// 웹은 이 창으로 돌아오므로 AuthContext가 코드를 토큰으로 바꿀 때까지 기다렸다가 계정 화면으로 간다.
// 로그인 서버를 못 받으면 기다리지 않고 계정 화면으로 가도 된다(돌아온 코드는 redirect.web이 잡아 두어서, 나중에 받으면 이어 간다).
// 앱은 결과를 promptAsync가 받으므로, 이 주소로 열리면 앞 화면으로 돌아가기만 한다.
export default function AuthRoute() {
  const router = useRouter()
  const { palette } = useSettings()
  const { state } = useAuth()
  useEffect(() => {
    if (state.status === 'loading') return
    if (router.canGoBack()) router.back()
    else router.replace('/account')
  }, [router, state.status])
  return (
    <View style={[styles.root, { backgroundColor: palette.paper }]}>
      <ActivityIndicator color={palette.accent} />
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center' },
})
