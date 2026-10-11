import type { RefObject } from 'react'
import type { View } from 'react-native'

// 웹 미리 보기에서는 그림 대신 구절 글을 공유한다. 공유창을 쓸 수 없으면(지원하지 않거나 막힘) 복사한다.
export async function shareCard(_card: RefObject<View | null>, text: string): Promise<string | null> {
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ text })
      return null
    } catch (error) {
      // 사용자가 공유창을 닫은 것은 실패가 아니다.
      if (error instanceof DOMException && error.name === 'AbortError') return null
    }
  }
  try {
    await navigator.clipboard.writeText(text)
    return '구절을 복사했어요. 웹에서는 그림 대신 글로 공유해요.'
  } catch {
    return '이 브라우저에서는 공유하거나 복사할 수 없어요.'
  }
}
