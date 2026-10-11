import { Platform, TurboModuleRegistry } from 'react-native'

// 안드로이드 위젯 모듈은 개발 빌드·출시 빌드에만 있다(Expo Go와 웹에는 없다).
// react-native-android-widget은 불러오는 순간 네이티브 모듈을 찾아, 없으면 앱이 죽는다. 그래서 있는지 먼저 보고 그때만 불러온다.
export const androidWidgetsAvailable = Platform.OS === 'android' && TurboModuleRegistry.get('AndroidWidget') != null

export function registerWidgets(): void {
  if (!androidWidgetsAvailable) return
  const { registerWidgetTaskHandler } = require('react-native-android-widget') as typeof import('react-native-android-widget')
  const { widgetTaskHandler } = require('./androidTaskHandler') as typeof import('./androidTaskHandler')
  registerWidgetTaskHandler(widgetTaskHandler)
}
