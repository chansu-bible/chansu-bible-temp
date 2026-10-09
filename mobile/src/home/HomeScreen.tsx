import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { useRouter } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  buildRoute,
  countMarks,
  findSceneIndex,
  hueOf,
  initialPosition,
  koreanDateLabel,
  koreanDayLabel,
  localDay,
  metCharacters,
  planSummary,
  readingStreak,
  readUpToChapter,
  timelineLayout,
  type Bundle,
  type PlanChapterStatus,
  type PlanSummary,
  type ReadingPlan,
} from 'reader-core'
import { useAuth } from '../auth/AuthContext'
import { imageSource } from '../content/bundle'
import { savePlan, useMarks, usePlan, useReadScenes, useSavedPosition } from '../data/reading'
import { useNarration } from '../narration/NarrationContext'
import { goToReader } from '../navigation'
import { MiniPlayer } from '../player/MiniPlayer'
import { useSettings } from '../settings/SettingsContext'
import { fonts, placeholderColors, type Palette } from '../theme/palette'
import Icon, { type IconName } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import PlanSheet from './PlanSheet'

// 앱 첫 화면: 오늘의 읽기, 이어 읽기, 계획 진도, 바로 가기
export default function HomeScreen({ bundle }: { bundle: Bundle }) {
  const router = useRouter()
  const { palette } = useSettings()
  const insets = useSafeAreaInsets()
  const [planOpen, setPlanOpen] = useState(false)
  const signedIn = useAuth().state.status === 'signedIn'
  const narration = useNarration()
  const now = new Date()
  const today = localDay(now)
  const { ids: readIds, days } = useReadScenes()
  const plan = usePlan()
  const marks = useMarks()
  const position = initialPosition(bundle.chapters, useSavedPosition())
  const chapter = bundle.chapters.find((c) => c.chapter === position.chapter) ?? bundle.chapters[0]!
  const sceneIndex = findSceneIndex(chapter.scenes, position.verse)
  const scene = chapter.scenes[sceneIndex]!
  const summary = planSummary(plan, bundle.chapters, days, today)
  const streak = readingStreak(new Set([...days.values()].filter((day): day is string => day !== null)), today)
  const met = metCharacters(bundle.characters, readUpToChapter(bundle.chapters, readIds, position.chapter))
  const visited = buildRoute(bundle.chapters, bundle.places, scene.id).visited
  const counts = countMarks(marks)
  const bars = timelineLayout(bundle.characters, bundle.eras, { height: 1 }).bars
  const image = imageSource(bundle.defaultImageVersion ? scene.images[bundle.defaultImageVersion] : undefined)
  const placeholder = placeholderColors(hueOf(scene.id), palette)
  const first = bundle.chapters[0]!.chapter
  const last = bundle.chapters.at(-1)!.chapter

  // 오늘 읽을 첫 장면부터 듣는다.
  function listenToday() {
    const first = summary.today[0]
    if (!first) return
    narration.start({ chapter: first.chapter, verse: first.scene.verseStart })
    router.push('/player')
  }

  const shortcuts: { icon: IconName; title: string; detail: string; onPress: () => void }[] = [
    {
      icon: 'timeline',
      title: '연표',
      detail: bars.length > 1 ? `${bars[0]!.name}부터 ${bars.at(-1)!.name}까지` : '인물이 늘면 보여요',
      onPress: () => goToReader(router, undefined, { overlay: 'timeline' }),
    },
    {
      icon: 'map',
      title: '여정 지도',
      detail: visited.length > 0 ? `${visited.slice(-2).map((place) => place.name).join(' → ')} · 지나온 곳 ${visited.length}` : '아직 지나온 곳이 없어요',
      onPress: () => goToReader(router, undefined, { overlay: 'map' }),
    },
    { icon: 'person', title: '인물 사전', detail: `만난 인물 ${met.length}명`, onPress: () => router.push('/people') },
    { icon: 'tree', title: '가계도', detail: met.length > 0 ? `${met[0]!.name}의 후손` : '2장부터 시작돼요', onPress: () => router.push('/genealogy') },
    {
      icon: 'note',
      title: '내 메모',
      detail: `밑줄 ${counts.highlights} · 메모 ${counts.notes}${counts.bookmarks ? ` · 즐겨찾기 ${counts.bookmarks}` : ''}`,
      onPress: () => router.push('/notes'),
    },
    { icon: 'search', title: '검색', detail: '본문·낱말·설정집·장면', onPress: () => router.push('/search') },
    {
      icon: 'chat',
      title: '질문하기',
      detail: signedIn ? '검수된 자료 안에서 답해요' : '로그인하면 쓸 수 있어요',
      onPress: () => router.push({ pathname: '/ask', params: { chapter: String(position.chapter) } }),
    },
    { icon: 'book', title: '서재', detail: `${bundle.book} ${first}~${last}장 · 다음 책 준비 중`, onPress: () => router.push('/library') },
  ]

  return (
    <View style={[styles.root, { backgroundColor: palette.paper }]}>
      <StatusBar style={palette.dark ? 'light' : 'dark'} />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          // 낭독 중이면 아래의 작은 재생 막대에 가리지 않게 여백을 더 둔다.
          { paddingTop: insets.top + 18, paddingBottom: insets.bottom + 24 + (narration.track !== null ? 72 : 0) },
        ]}
      >
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={[styles.date, { color: palette.inkSoft }]}>{koreanDateLabel(now)}</Text>
            <Text style={[styles.heading, { color: palette.ink }]} accessibilityRole="header">
              오늘의 읽기
            </Text>
          </View>
          <View style={styles.headerSide}>
            {streak > 0 && (
              <View style={[styles.streak, { backgroundColor: palette.warnSoft }]} accessibilityLabel={`연속 ${streak}일째 읽는 중`}>
                <Icon name="flame" size={14} color={palette.warn} filled />
                <Text style={[styles.streakText, { color: palette.warn }]}>{streak}일째</Text>
              </View>
            )}
            <IconButton
              name="account"
              label={signedIn ? '계정과 동기화' : '로그인'}
              color={signedIn ? palette.accent : palette.inkSoft}
              onPress={() => router.push('/account')}
            />
          </View>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`이어 읽기. 창세기 ${position.chapter}장 ${position.verse}절, ${scene.title}`}
          onPress={() => router.push('/read')}
          style={[styles.continue, { backgroundColor: placeholder.background }]}
        >
          {image !== null && <Image source={image} style={StyleSheet.absoluteFill} contentFit="cover" />}
          <LinearGradient colors={['rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0.6)']} style={styles.continueShade}>
            <Text style={styles.continueLabel}>
              이어 읽기 · 창세기 {position.chapter}장 {position.verse}절부터
            </Text>
            <Text style={styles.continueTitle} numberOfLines={1}>
              {scene.title}
            </Text>
          </LinearGradient>
          <Text style={styles.continueBadge}>
            {chapter.chapter}장 · 장면 {sceneIndex + 1}/{chapter.scenes.length}
          </Text>
        </Pressable>

        <View style={[styles.card, { backgroundColor: palette.surface }]}>
          <View style={styles.planHead}>
            <Text style={[styles.planTitle, { color: palette.ink }]}>{planTitle(plan)}</Text>
            <Pressable accessibilityRole="button" onPress={() => setPlanOpen(true)} hitSlop={8}>
              <Text style={[styles.planEdit, { color: palette.accent }]}>계획 바꾸기</Text>
            </Pressable>
          </View>
          <Text style={[styles.planDetail, { color: palette.inkSoft }]}>{planDetail(bundle.book, first, last, summary)}</Text>
          <View style={styles.squares} accessibilityLabel="장별 진도">
            {summary.chapters.map((item) => (
              <ChapterSquare key={item.chapter} chapter={item.chapter} status={item.status} palette={palette} />
            ))}
          </View>
          <Text style={[styles.planNote, { color: palette.inkSoft }]}>{todayNote(plan, summary)}</Text>
          {summary.today.length > 0 && summary.todayAudioMs > 0 && (
            <Pressable
              accessibilityRole="button"
              onPress={listenToday}
              style={({ pressed }) => [styles.listen, { backgroundColor: palette.accentSoft, opacity: pressed ? 0.7 : 1 }]}
            >
              <Icon name="headphones" size={16} color={palette.accent} />
              <Text style={[styles.listenText, { color: palette.accent }]}>오늘 분량 듣기</Text>
            </Pressable>
          )}
        </View>

        <View style={styles.grid}>
          {shortcuts.map((item) => (
            <Pressable
              key={item.title}
              accessibilityRole="button"
              accessibilityLabel={`${item.title}. ${item.detail}`}
              onPress={item.onPress}
              style={({ pressed }) => [styles.tile, { backgroundColor: palette.surface, opacity: pressed ? 0.7 : 1 }]}
            >
              <Icon name={item.icon} size={22} color={palette.accent} />
              <Text style={[styles.tileTitle, { color: palette.ink }]}>{item.title}</Text>
              <Text style={[styles.tileDetail, { color: palette.inkSoft }]} numberOfLines={1}>
                {item.detail}
              </Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      <MiniPlayer bundle={bundle} bottom={insets.bottom + 12} />
      {planOpen && <PlanSheet plan={plan} onChange={savePlan} onClose={() => setPlanOpen(false)} />}
    </View>
  )
}

function planTitle(plan: ReadingPlan): string {
  if (plan.kind === 'chapter') return '하루 한 장 계획'
  if (plan.kind === 'scenes') return `하루 장면 ${plan.perDay}개 계획`
  return '자유롭게 읽기'
}

function planDetail(book: string, first: number, last: number, summary: PlanSummary): string {
  const range = `${book} ${first}~${last}장`
  if (summary.allDone) return `${range} · 다 읽었어요`
  if (summary.remainingDays === null) return range
  const finish = summary.finishDay ? ` · ${koreanDayLabel(summary.finishDay)} 완독` : ''
  return `${range} · ${summary.remainingDays}일 남음${finish}`
}

function todayNote(plan: ReadingPlan, summary: PlanSummary): string {
  if (summary.allDone) return '끝까지 다 읽었어요. 목차에서 다시 읽고 싶은 장면을 골라 보세요.'
  if (summary.todayDone) return '오늘 분량을 다 읽었어요. 내일 이어서 읽어요.'
  const minutes = summary.todayAudioMs > 0 ? Math.max(1, Math.round(summary.todayAudioMs / 60000)) : 0
  const listen = minutes > 0 ? ` 낭독으로 들으면 ${minutes}분쯤 걸려요.` : ''
  const first = summary.today[0]
  if (!first) return ''
  if (plan.kind === 'chapter') return `오늘은 ${first.chapter}장이에요. 장면 ${summary.today.length}개.${listen}`
  if (plan.kind === 'scenes') return `오늘은 '${first.scene.title}'부터 장면 ${summary.today.length}개예요.${listen}`
  return `다음 장면은 '${first.scene.title}'이에요.${listen}`
}

function ChapterSquare({ chapter, status, palette }: { chapter: number; status: PlanChapterStatus; palette: Palette }) {
  const style =
    status === 'done'
      ? { backgroundColor: palette.accent, borderColor: palette.accent, color: palette.paper }
      : status === 'today'
        ? { backgroundColor: palette.accentSoft, borderColor: palette.accent, color: palette.accent }
        : { backgroundColor: palette.line, borderColor: palette.line, color: palette.inkFaint }
  const label = status === 'done' ? '다 읽음' : status === 'today' ? '오늘' : '아직'
  return (
    <View style={[styles.square, { backgroundColor: style.backgroundColor, borderColor: style.borderColor }]} accessibilityLabel={`${chapter}장 ${label}`}>
      <Text style={[styles.squareText, { color: style.color, fontWeight: status === 'todo' ? '400' : '700' }]}>{chapter}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 20, gap: 16 },
  header: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 },
  headerText: { gap: 2 },
  headerSide: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  date: { fontSize: 13 },
  heading: { fontFamily: fonts.serifBold, fontSize: 24 },
  streak: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  streakText: { fontSize: 12, fontWeight: '700' },
  continue: { height: 220, borderRadius: 18, overflow: 'hidden' },
  continueShade: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: 40, paddingHorizontal: 16, paddingBottom: 14, gap: 4 },
  continueLabel: { color: '#ffffff', fontSize: 12, opacity: 0.9 },
  continueTitle: { color: '#ffffff', fontFamily: fonts.serifBold, fontSize: 20 },
  continueBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    color: '#ffffff',
    fontSize: 11,
  },
  card: { padding: 16, borderRadius: 16, gap: 10 },
  planHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  planTitle: { fontSize: 14, fontWeight: '700' },
  planEdit: { fontSize: 13 },
  planDetail: { fontSize: 12 },
  squares: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  square: { width: 28, height: 28, borderRadius: 8, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  squareText: { fontSize: 11 },
  planNote: { fontSize: 12, lineHeight: 18 },
  listen: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6, height: 34, paddingHorizontal: 14, borderRadius: 17 },
  listenText: { fontSize: 13, fontWeight: '600' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { width: '48%', flexGrow: 1, padding: 14, borderRadius: 16, gap: 6 },
  tileTitle: { fontSize: 14, fontWeight: '700' },
  tileDetail: { fontSize: 12 },
})
