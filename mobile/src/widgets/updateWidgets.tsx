import { ExtensionStorage } from '@bacons/apple-targets'
import { Platform } from 'react-native'
import { androidWidgetsAvailable } from './register'
import { currentWidgetSnapshot } from './snapshot'

// 앱과 iOS 위젯이 함께 보는 App Group. app.json의 ios.entitlements와 같은 값이다.
export const APP_GROUP = 'group.com.chansubible.app'
// ExtensionStorage는 네이티브 모듈이 없으면(Expo Go) 아무것도 하지 않는다.
const iosStorage = Platform.OS === 'ios' ? new ExtensionStorage(APP_GROUP) : null

let last = ''

// 위젯에 보일 것이 바뀌었으면 위젯을 다시 그리게 한다.
export function updateWidgets(): void {
  const snapshot = currentWidgetSnapshot()
  if (!snapshot) return
  const json = JSON.stringify(snapshot)
  if (json === last) return
  last = json
  if (iosStorage) {
    iosStorage.set('todayScene', json)
    ExtensionStorage.reloadWidget('TodayScene')
  }
  if (androidWidgetsAvailable) {
    const { requestWidgetUpdate } = require('react-native-android-widget') as typeof import('react-native-android-widget')
    const { TodaySceneWidget } = require('./TodaySceneWidget') as typeof import('./TodaySceneWidget')
    requestWidgetUpdate({ widgetName: 'TodayScene', renderWidget: () => <TodaySceneWidget snapshot={snapshot} /> }).catch(() => undefined)
  }
}
