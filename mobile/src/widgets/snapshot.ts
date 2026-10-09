import { localDay, widgetSnapshot, type WidgetSnapshot } from 'reader-core'
import { content } from '../content/bundle'
import { savedPosition } from '../data/reading'
import { store } from '../data/store'

// 저장된 읽기 위치와 읽은 날로 위젯에 그릴 것을 만든다. 앱과 안드로이드 위젯 작업(앱이 꺼져 있을 때도)이 함께 쓴다.
export function currentWidgetSnapshot(): WidgetSnapshot | null {
  if (!content.bundle) return null
  const days = store
    .list<{ day?: unknown }>('readScenes')
    .flatMap((item) => (typeof item.data?.day === 'string' ? [item.data.day] : []))
  return widgetSnapshot(content.bundle, savedPosition(), days, localDay(new Date()))
}
