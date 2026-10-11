import * as Sharing from 'expo-sharing'
import type { RefObject } from 'react'
import type { View } from 'react-native'
import { captureRef } from 'react-native-view-shot'

// 카드 화면을 1080×1080 PNG로 찍어 시스템 공유창에 넘긴다. 돌려준 글은 화면에 보일 안내다.
export async function shareCard(card: RefObject<View | null>, _text: string): Promise<string | null> {
  if (!(await Sharing.isAvailableAsync())) return '이 기기에서는 공유할 수 없어요'
  const uri = await captureRef(card, { format: 'png', quality: 1, width: 1080, height: 1080 })
  await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle: '장면 카드 공유' })
  return null
}
