import { ExtensionStorage } from '@bacons/apple-targets'
import { Asset } from 'expo-asset'
import { File } from 'expo-file-system'
import { Platform } from 'react-native'
import { widgetImageAssets } from '../content/assets.generated'
import { androidWidgetsAvailable } from './register'
import { currentWidgetSnapshot } from './snapshot'

// 앱과 iOS 위젯이 함께 보는 App Group. app.json의 ios.entitlements와 같은 값이다.
export const APP_GROUP = 'group.com.chansubible.app'
// ExtensionStorage는 네이티브 모듈이 없으면(Expo Go) 아무것도 하지 않는다.
const iosStorage = Platform.OS === 'ios' ? new ExtensionStorage(APP_GROUP) : null

let last = ''
let lastImage = ''

// iOS 위젯 그림: 지금 장면의 작은 JPEG(npm run content가 만든 위젯 그림)를 base64로 App Group에 적는다.
// 위젯은 그림 id가 장면 id와 같을 때만 그린다(그림을 못 적었으면 그림 없이 그린다).
async function writeIosImage(storage: ExtensionStorage, sceneId: string): Promise<void> {
  if (sceneId === lastImage) return
  const image = widgetImageAssets[sceneId]
  if (image === undefined) return
  const asset = Asset.fromModule(image)
  await asset.downloadAsync()
  if (!asset.localUri) return
  storage.set('todaySceneImage', await new File(asset.localUri).base64())
  storage.set('todaySceneImageId', sceneId)
  lastImage = sceneId
}

// 위젯에 보일 것이 바뀌었으면 위젯을 다시 그리게 한다.
export function updateWidgets(): void {
  const snapshot = currentWidgetSnapshot()
  if (!snapshot) return
  const json = JSON.stringify(snapshot)
  if (json === last) return
  last = json
  if (iosStorage) {
    const storage = iosStorage
    storage.set('todayScene', json)
    writeIosImage(storage, snapshot.sceneId)
      .catch(() => undefined)
      .finally(() => ExtensionStorage.reloadWidget('TodayScene'))
  }
  if (androidWidgetsAvailable) {
    const { requestWidgetUpdate } = require('react-native-android-widget') as typeof import('react-native-android-widget')
    const { TodaySceneWidget } = require('./TodaySceneWidget') as typeof import('./TodaySceneWidget')
    requestWidgetUpdate({ widgetName: 'TodayScene', renderWidget: () => <TodaySceneWidget snapshot={snapshot} /> }).catch(() => undefined)
  }
}
