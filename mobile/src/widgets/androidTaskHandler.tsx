import type { WidgetTaskHandlerProps } from 'react-native-android-widget'
import { currentWidgetSnapshot } from './snapshot'
import { TodaySceneWidget } from './TodaySceneWidget'

// 안드로이드가 위젯을 그려 달라고 할 때(놓을 때, 주기 갱신, 크기 바꿈) 부른다. 누르는 것은 OPEN_URI라 앱이 직접 연다.
export async function widgetTaskHandler(props: WidgetTaskHandlerProps): Promise<void> {
  if (props.widgetAction === 'WIDGET_ADDED' || props.widgetAction === 'WIDGET_UPDATE' || props.widgetAction === 'WIDGET_RESIZED') {
    props.renderWidget(<TodaySceneWidget snapshot={currentWidgetSnapshot()} />)
  }
}
