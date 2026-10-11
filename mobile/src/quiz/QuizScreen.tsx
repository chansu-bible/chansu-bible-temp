import { useRouter } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { findSceneIndex, localDay, particle, quizReady, type Bundle, type Chapter, type QuizQuestion } from 'reader-core'
import { markQuizDone, useReadScenes } from '../data/reading'
import { goBack, goToReader } from '../navigation'
import { useSettings } from '../settings/SettingsContext'
import { fonts, type Palette } from '../theme/palette'
import Icon from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { ScreenHeader } from '../ui/ScreenHeader'

type Props = {
  bundle: Bundle
  chapterNumber: number
  // 읽기 화면에서 열었으면 'read'. 근거 절로 갈 때 뒤로 돌아가 읽기 화면에 요청을 건넨다.
  from: string | undefined
}

const FOOTNOTE = '문제는 본문과 검수된 해설에서만 내요. 틀려도 점수는 남지 않아요.'

// 이해 확인 퀴즈(목업 12). 한 문제씩 풀고, 보기를 고르면 잠그고 정답과 해설을 보인다.
// 점수는 남기지 않고, 끝까지 풀었다는 표시(quizDone)만 남긴다.
export default function QuizScreen({ bundle, chapterNumber, from }: Props) {
  const chapter = bundle.chapters.find((item) => item.chapter === chapterNumber)
  if (!chapter || !quizReady(chapter)) return <NotReady />
  return <Quiz bundle={bundle} chapter={chapter} from={from} />
}

function NotReady() {
  const { palette } = useSettings()
  return (
    <View style={[styles.root, { backgroundColor: palette.paper }]}>
      <ScreenHeader title="이해 확인" />
      <Text style={[styles.notReady, { color: palette.inkSoft }]}>
        이 장의 문제는 아직 검수 중이에요. 사람이 승인한 문제가 셋 이상 모이면 열려요.
      </Text>
    </View>
  )
}

function Quiz({ bundle, chapter, from }: { bundle: Bundle; chapter: Chapter; from: string | undefined }) {
  const router = useRouter()
  const { palette } = useSettings()
  const insets = useSafeAreaInsets()
  const { ids: readIds } = useReadScenes()
  const questions = chapter.quiz
  const [index, setIndex] = useState(0)
  // 문제마다 고른 보기 번호. 아직 안 고른 문제는 비어 있다.
  const [picks, setPicks] = useState<(number | undefined)[]>([])
  const [finished, setFinished] = useState(false)

  const question = questions[index]!
  const picked = picks[index]
  const answered = picked !== undefined
  const allRead = chapter.scenes.length > 0 && chapter.scenes.every((scene) => readIds.has(scene.id))
  const kicker = allRead ? `${chapter.chapter}장을 다 읽었어요` : `${bundle.book} ${chapter.chapter}장`
  const last = index === questions.length - 1

  function choose(option: number) {
    if (answered) return
    const next = [...picks]
    next[index] = option
    setPicks(next)
    // 마지막 문제까지 다 고르면 끝까지 푼 것이다(결과 화면을 보지 않고 나가도).
    if (questions.every((_, number) => next[number] !== undefined)) markQuizDone(bundle.bookId, chapter.chapter, localDay(new Date()))
  }

  function restart() {
    setPicks([])
    setIndex(0)
    setFinished(false)
  }

  function goToVerse(verse: number) {
    goToReader(router, from, { position: { chapter: chapter.chapter, verse } })
  }

  function backToReading() {
    if (from === 'read') goBack(router)
    else goToReader(router, from, {})
  }

  return (
    <View style={[styles.root, { backgroundColor: palette.paper }]}>
      <StatusBar style={palette.dark ? 'light' : 'dark'} />
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View style={styles.headerText}>
          <Text style={[styles.kicker, { color: palette.inkSoft }]}>{kicker}</Text>
          <Text style={[styles.heading, { color: palette.ink }]} accessibilityRole="header">
            {finished ? '다 풀었어요' : '이해 확인'}
          </Text>
        </View>
        {!finished && (
          <Text style={[styles.count, { color: palette.inkSoft }]} accessibilityLabel={`${questions.length}문제 중 ${index + 1}번째`}>
            {index + 1} / {questions.length}
          </Text>
        )}
        <IconButton name="close" label="퀴즈 닫기" color={palette.ink} onPress={() => goBack(router)} />
      </View>

      <View style={styles.segments} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {questions.map((item, number) => (
          <View key={item.id} style={[styles.segment, { backgroundColor: segmentColor(item, picks[number], number === index && !finished, palette) }]} />
        ))}
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 20 }]}>
        {finished ? (
          <Summary
            questions={questions}
            picks={picks}
            onVerse={goToVerse}
            onRestart={restart}
            onBack={backToReading}
          />
        ) : (
          <>
            <View style={[styles.card, { backgroundColor: palette.surface }]}>
              <Text style={[styles.question, { color: palette.ink }]}>{question.question}</Text>
              <View style={styles.options} accessibilityRole="radiogroup" accessibilityLabel="보기">
                {question.options.map((option, number) => (
                  <Option
                    key={number}
                    label={option}
                    state={optionState(question, picked, number)}
                    onPress={() => choose(number)}
                  />
                ))}
              </View>
            </View>

            {answered && (
              <Feedback
                bundle={bundle}
                chapter={chapter}
                question={question}
                correct={picked === question.answer}
                onVerse={() => goToVerse(question.verse)}
              />
            )}

            <View style={styles.footer}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: !answered }}
                disabled={!answered}
                onPress={() => (last ? setFinished(true) : setIndex(index + 1))}
                style={({ pressed }) => [styles.primary, { backgroundColor: palette.accent, opacity: !answered ? 0.4 : pressed ? 0.8 : 1 }]}
              >
                <Text style={[styles.primaryText, { color: palette.paper }]}>{last ? '결과 보기' : '다음 문제'}</Text>
              </Pressable>
              <Text style={[styles.footnote, { color: palette.inkFaint }]}>{FOOTNOTE}</Text>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  )
}

type OptionState = 'open' | 'correct' | 'wrong' | 'dim'

function optionState(question: QuizQuestion, picked: number | undefined, option: number): OptionState {
  if (picked === undefined) return 'open'
  if (option === question.answer) return 'correct'
  return option === picked ? 'wrong' : 'dim'
}

function segmentColor(question: QuizQuestion, picked: number | undefined, current: boolean, palette: Palette): string {
  if (current) return palette.accent
  if (picked === undefined) return palette.line
  // 틀린 문제는 강조색과 헷갈리지 않게 흐린 회색이다(어두운 화면에서 warn과 accent가 비슷하다).
  return picked === question.answer ? palette.ok : palette.inkFaint
}

function Option({ label, state, onPress }: { label: string; state: OptionState; onPress: () => void }) {
  const { palette } = useSettings()
  const marked = state === 'correct' || state === 'wrong'
  const tone = state === 'correct' ? palette.ok : palette.warn
  const stateLabel = state === 'correct' ? ', 정답' : state === 'wrong' ? ', 고른 답, 틀림' : ''
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: state === 'correct' || state === 'wrong', disabled: state !== 'open' }}
      accessibilityLabel={`${label}${stateLabel}`}
      disabled={state !== 'open'}
      onPress={onPress}
      style={({ pressed }) => [
        styles.option,
        marked
          ? { borderWidth: 2, borderColor: tone, backgroundColor: state === 'correct' ? palette.okSoft : palette.warnSoft }
          : { borderWidth: 1, borderColor: palette.line, backgroundColor: palette.paper },
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.mark, marked ? { backgroundColor: tone, borderColor: tone } : { borderColor: palette.inkFaint }]}>
        {marked && <Icon name={state === 'correct' ? 'check' : 'close'} size={13} color={palette.paper} />}
      </View>
      <Text style={[styles.optionText, { color: state === 'dim' ? palette.inkSoft : palette.ink }]}>{label}</Text>
    </Pressable>
  )
}

function Feedback({
  bundle,
  chapter,
  question,
  correct,
  onVerse,
}: {
  bundle: Bundle
  chapter: Chapter
  question: QuizQuestion
  correct: boolean
  onVerse: () => void
}) {
  const { palette } = useSettings()
  const verse = chapter.verses.find((item) => item.verse === question.verse)
  const scene = chapter.scenes[findSceneIndex(chapter.scenes, question.verse)]
  const tone = correct ? palette.ok : palette.warn
  const answer = question.options[question.answer] ?? ''
  return (
    <View style={[styles.feedback, { backgroundColor: correct ? palette.okSoft : palette.warnSoft }]} accessibilityLiveRegion="polite">
      <Text style={[styles.feedbackTitle, { color: tone }]}>{correct ? '맞았어요' : '아쉬워요'}</Text>
      {!correct && (
        <Text style={[styles.feedbackBody, { color: palette.ink }]}>정답: {answer}</Text>
      )}
      <Text style={[styles.feedbackBody, { color: palette.ink }]}>{question.explanation}</Text>
      {verse && (
        <Text style={[styles.verse, { color: palette.inkSoft }]}>
          {verse.text}
          <Text style={{ color: palette.inkFaint }}>
            {' '}· {bundle.book} {chapter.chapter}:{question.verse}
          </Text>
        </Text>
      )}
      {scene && (
        <Pressable accessibilityRole="link" onPress={onVerse} hitSlop={6}>
          <Text style={[styles.sceneLink, { color: palette.accent }]}>
            장면 '{scene.title}'{particle(scene.title, '으로로')} 돌아가기 →
          </Text>
        </Pressable>
      )}
    </View>
  )
}

function Summary({
  questions,
  picks,
  onVerse,
  onRestart,
  onBack,
}: {
  questions: QuizQuestion[]
  picks: (number | undefined)[]
  onVerse: (verse: number) => void
  onRestart: () => void
  onBack: () => void
}) {
  const { palette } = useSettings()
  const missed = questions.filter((question, number) => picks[number] !== question.answer)
  const verses = [...new Set(missed.map((question) => question.verse))].sort((a, b) => a - b)
  return (
    <View style={styles.summary}>
      <View style={[styles.card, { backgroundColor: palette.surface }]}>
        <Text style={[styles.summaryText, { color: palette.ink }]}>
          {missed.length === questions.length
            ? '이번에는 맞힌 문제가 없어요.'
            : `${questions.length}문제 중 ${questions.length - missed.length}문제를 맞혔어요.`}
        </Text>
        {verses.length > 0 ? (
          <>
            <Text style={[styles.summaryNote, { color: palette.inkSoft }]}>틀린 문제의 근거 절을 다시 읽어 보세요.</Text>
            <View style={styles.verseChips}>
              {verses.map((verse) => (
                <Pressable
                  key={verse}
                  accessibilityRole="link"
                  accessibilityLabel={`${verse}절로`}
                  onPress={() => onVerse(verse)}
                  style={[styles.verseChip, { backgroundColor: palette.accentSoft }]}
                >
                  <Text style={[styles.verseChipText, { color: palette.accent }]}>{verse}절</Text>
                </Pressable>
              ))}
            </View>
          </>
        ) : (
          <Text style={[styles.summaryNote, { color: palette.inkSoft }]}>모두 맞혔어요. 이 장을 잘 읽었어요.</Text>
        )}
      </View>
      <View style={styles.footer}>
        <Pressable
          accessibilityRole="button"
          onPress={onBack}
          style={({ pressed }) => [styles.primary, { backgroundColor: palette.accent, opacity: pressed ? 0.8 : 1 }]}
        >
          <Text style={[styles.primaryText, { color: palette.paper }]}>읽기로 돌아가기</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={onRestart}
          style={({ pressed }) => [styles.secondary, { borderColor: palette.line, opacity: pressed ? 0.7 : 1 }]}
        >
          <Text style={[styles.secondaryText, { color: palette.ink }]}>다시 풀기</Text>
        </Pressable>
        <Text style={[styles.footnote, { color: palette.inkFaint }]}>{FOOTNOTE}</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  notReady: { padding: 20, fontSize: 14, lineHeight: 22 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 20, paddingRight: 8 },
  headerText: { flex: 1, gap: 2 },
  kicker: { fontSize: 12 },
  heading: { fontFamily: fonts.serifBold, fontSize: 22 },
  count: { fontSize: 12 },
  segments: { flexDirection: 'row', gap: 6, paddingHorizontal: 20, paddingTop: 14, paddingBottom: 4 },
  segment: { flex: 1, height: 5, borderRadius: 3 },
  content: { paddingTop: 12, paddingHorizontal: 20, gap: 14 },
  card: { gap: 14, padding: 18, borderRadius: 18 },
  question: { fontFamily: fonts.serifBold, fontSize: 18, lineHeight: 29 },
  options: { gap: 8 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 12 },
  pressed: { opacity: 0.7 },
  mark: { width: 22, height: 22, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  optionText: { flex: 1, fontSize: 15, lineHeight: 22 },
  feedback: { gap: 8, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 16 },
  feedbackTitle: { fontSize: 13, fontWeight: '700' },
  feedbackBody: { fontSize: 14, lineHeight: 22 },
  verse: { fontFamily: fonts.serif, fontSize: 13, lineHeight: 21 },
  sceneLink: { fontSize: 13, fontWeight: '600' },
  footer: { gap: 10, paddingTop: 4 },
  primary: { height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontSize: 15, fontWeight: '600' },
  secondary: { height: 48, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontSize: 15 },
  footnote: { fontSize: 11, lineHeight: 17, textAlign: 'center' },
  summary: { gap: 14 },
  summaryText: { fontFamily: fonts.serifBold, fontSize: 17, lineHeight: 26 },
  summaryNote: { fontSize: 13, lineHeight: 20 },
  verseChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  verseChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  verseChipText: { fontSize: 13 },
})
