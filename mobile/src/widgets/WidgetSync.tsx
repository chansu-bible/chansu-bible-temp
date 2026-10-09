import { useEffect } from 'react'
import { AppState, Platform } from 'react-native'
import { store } from '../data/store'
import { updateWidgets } from './updateWidgets'

// 읽기 기록(위치, 읽은 장면)이 바뀌면 2초 모았다가 위젯을 다시 그린다. 앱이 뒤로 갈 때도 한 번 그린다.
export function WidgetSync() {
  useEffect(() => {
    if (Platform.OS === 'web') return
    let timer: ReturnType<typeof setTimeout> | null = null
    updateWidgets()
    const unsubscribe = store.subscribe(() => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(updateWidgets, 2000)
    })
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background') updateWidgets()
    })
    return () => {
      unsubscribe()
      subscription.remove()
      if (timer) clearTimeout(timer)
    }
  }, [])
  return null
}
