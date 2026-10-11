import { useLocalSearchParams } from 'expo-router'
import { BundleGate } from '../../content/BundleGate'
import QuizScreen from '../../quiz/QuizScreen'

export default function QuizRoute() {
  const { chapter, from } = useLocalSearchParams<{ chapter: string; from?: string }>()
  return (
    <BundleGate render={(bundle) => <QuizScreen key={chapter} bundle={bundle} chapterNumber={Number(chapter)} from={from} />} />
  )
}
