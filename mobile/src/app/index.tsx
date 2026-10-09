import { Redirect } from 'expo-router'

// 1단계에서는 앱을 열면 바로 읽기 화면이다. 2단계에서 홈(읽기 계획과 진도)으로 바뀐다.
export default function Index() {
  return <Redirect href="/read" />
}
