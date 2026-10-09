import { Platform } from 'react-native'

// 개발 기본값은 infra/docker-compose.yml의 로컬 키클락과 동기화 서버다.
// 안드로이드 에뮬레이터는 이 컴퓨터를 10.0.2.2로 부른다. 실제 폰은 EXPO_PUBLIC_AUTH_ISSUER, EXPO_PUBLIC_API_URL로 내부망 주소를 준다.
const host = Platform.OS === 'android' ? '10.0.2.2' : 'localhost'

export const authConfig = {
  issuer: process.env.EXPO_PUBLIC_AUTH_ISSUER ?? `http://${host}:8080/realms/chansu-bible`,
  clientId: 'chansu-bible-app',
  // offline_access: 오래 가는 갱신 토큰(앱을 한동안 안 열어도 다시 로그인하지 않게)
  scopes: ['openid', 'profile', 'email', 'offline_access'],
}

export const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? `http://${host}:8790`
