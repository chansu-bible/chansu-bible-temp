import type { RefObject } from 'react'
import type { View } from 'react-native'

// 웹 미리 보기에서는 그림 대신 구절 글을 공유하거나 복사한다.
export async function shareCard(_card: RefObject<View | null>, text: string): Promise<string | null> {
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    await navigator.share({ text })
    return null
  }
  await navigator.clipboard.writeText(text)
  return '구절을 복사했어요. 웹에서는 그림 대신 글로 공유해요.'
}
