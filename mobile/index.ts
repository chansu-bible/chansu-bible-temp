// 앱 진입점. expo-router를 띄우고, 안드로이드 위젯이 그려 달라고 할 때 부를 작업을 등록한다.
// 위젯 작업은 앱이 꺼져 있을 때도 이 파일부터 불러 따로 돈다.
import 'expo-router/entry'
import { registerWidgets } from './src/widgets/register'

registerWidgets()
