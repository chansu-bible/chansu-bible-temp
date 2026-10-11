import { useLocalSearchParams } from 'expo-router'
import { initialPosition } from 'reader-core'
import AskScreen from '../ask/AskScreen'
import { BundleGate } from '../content/BundleGate'
import { savedPosition } from '../data/reading'

export default function AskRoute() {
  const { chapter, from } = useLocalSearchParams<{ chapter?: string; from?: string }>()
  return (
    <BundleGate
      render={(bundle) => {
        // 장을 주지 않고 열면(홈) 읽던 장이다.
        const asked = Number(chapter)
        const known = bundle.chapters.some((item) => item.chapter === asked)
        const chapterNumber = known ? asked : initialPosition(bundle.chapters, savedPosition()).chapter
        return <AskScreen bundle={bundle} chapterNumber={chapterNumber} from={from} />
      }}
    />
  )
}
