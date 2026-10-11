import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useEffect, useState } from 'react'
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { clockLabel, hueOf, initialPosition, sleepLabel, SPEEDS, upcomingTracks, type Bundle } from 'reader-core'
import { imageSource } from '../content/bundle'
import { savedPosition } from '../data/reading'
import { useNarration, useNarrationClock } from '../narration/NarrationContext'
import { goBack } from '../navigation'
import { useSettings } from '../settings/SettingsContext'
import { dark, fonts, placeholderColors } from '../theme/palette'
import Icon, { type IconName } from '../ui/Icon'
import SleepSheet from './SleepSheet'

// 낭독 플레이어(목업 10). 바탕은 테마와 상관없이 어둡다(음악 재생기처럼 그림이 돋보이게).
const colors = {
  background: dark.surface,
  ink: dark.ink,
  soft: dark.inkSoft,
  faint: dark.inkFaint,
  accent: dark.accent,
  chip: 'rgba(255, 255, 255, 0.08)',
  chipOn: 'rgba(255, 255, 255, 0.16)',
  line: 'rgba(255, 255, 255, 0.2)',
  rail: 'rgba(255, 255, 255, 0.18)',
}

function CircleButton({ name, label, onPress, active = false }: { name: IconName; label: string; onPress: () => void; active?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.circle, { backgroundColor: active ? colors.chipOn : colors.chip, opacity: pressed ? 0.7 : 1 }]}
    >
      <Icon name={name} size={20} color={colors.ink} />
    </Pressable>
  )
}

function Chip({ label, onPress, on = false, hint }: { label: string; onPress: () => void; on?: boolean; hint?: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint={hint}
      accessibilityState={{ selected: on }}
      onPress={onPress}
      style={({ pressed }) => [styles.chip, { backgroundColor: on ? colors.chipOn : 'transparent', opacity: pressed ? 0.7 : 1 }]}
    >
      <Text style={styles.chipText}>{label}</Text>
    </Pressable>
  )
}

export default function PlayerScreen({ bundle }: { bundle: Bundle }) {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { settings, update, subtitles, setSubtitles } = useSettings()
  const narration = useNarration()
  const clock = useNarrationClock()
  const [sleepOpen, setSleepOpen] = useState(false)
  const [railWidth, setRailWidth] = useState(0)

  // 낭독을 연 적이 없으면 읽던 곳부터 들을 준비만 한다(재생은 누르면 시작).
  useEffect(() => {
    if (narration.track === null) narration.start(initialPosition(bundle.chapters, savedPosition()), { autoplay: false })
    // 처음 열 때 한 번만 본다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const track = narration.track
  if (track === null) return <View style={[styles.root, { backgroundColor: colors.background }]} />
  const chapter = bundle.chapters.find((item) => item.chapter === track.chapter)!
  const scene = chapter.scenes[track.sceneIndex]!
  const verse = chapter.verses.find((item) => item.verse === narration.verse) ?? null
  const image = imageSource(bundle.defaultImageVersion ? scene.images[bundle.defaultImageVersion] : undefined)
  const placeholder = placeholderColors(hueOf(scene.id), dark)
  const upcoming = upcomingTracks(bundle.chapters, track, 2)
  const range = scene.verseStart === scene.verseEnd ? `${scene.verseStart}절` : `${scene.verseStart}~${scene.verseEnd}절`
  const progress = clock.durationMs > 0 ? Math.min(1, clock.positionMs / clock.durationMs) : 0
  const nextSpeed = SPEEDS[(SPEEDS.indexOf(settings.speed) + 1) % SPEEDS.length]!

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 20 }]}>
        <View style={styles.top}>
          <CircleButton name="chevronDown" label="접기" onPress={() => goBack(router)} />
          <Text style={styles.kicker}>{`AI 음성 낭독 · ${bundle.book} ${track.chapter}장`}</Text>
          <CircleButton name="moon" label="잠자기 타이머" active={narration.sleep.kind !== 'off'} onPress={() => setSleepOpen(true)} />
        </View>

        <View style={[styles.art, { backgroundColor: placeholder.background }]}>
          {image !== null && <Image source={image} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} accessible={false} />}
        </View>

        <View style={styles.titles}>
          <Text style={styles.title} accessibilityRole="header">
            {scene.title}
          </Text>
          <Text style={styles.meta}>{`${bundle.book} ${track.chapter}장 ${range}${narration.verse !== null ? ` · 지금 ${narration.verse}절` : ''}`}</Text>
          {subtitles && verse !== null && <Text style={styles.subtitle}>{verse.text}</Text>}
        </View>

        <View style={styles.progress}>
          <Pressable
            accessibilityRole="adjustable"
            accessibilityLabel={`재생 위치 ${clockLabel(clock.positionMs)}, 전체 ${clockLabel(clock.durationMs)}`}
            accessibilityActions={[
              { name: 'increment', label: '10초 앞으로' },
              { name: 'decrement', label: '10초 뒤로' },
            ]}
            onAccessibilityAction={(event) =>
              narration.seekMs(clock.positionMs + (event.nativeEvent.actionName === 'increment' ? 10_000 : -10_000))
            }
            onLayout={(event) => setRailWidth(event.nativeEvent.layout.width)}
            onPress={(event) => {
              // 좌표 없이 눌린 경우(키보드 등)는 무시한다.
              const x = event.nativeEvent.locationX
              if (railWidth > 0 && Number.isFinite(x)) narration.seekMs((x / railWidth) * clock.durationMs)
            }}
            style={styles.railHit}
          >
            <View style={[styles.rail, { backgroundColor: colors.rail }]}>
              <View style={[styles.railFill, { width: `${progress * 100}%`, backgroundColor: colors.accent }]} />
            </View>
          </Pressable>
          <View style={styles.times}>
            <Text style={styles.time}>{clockLabel(clock.positionMs)}</Text>
            <Text style={styles.time}>{clockLabel(clock.durationMs)}</Text>
          </View>
        </View>

        <View style={styles.controls}>
          <Pressable accessibilityRole="button" accessibilityLabel="이전 절" onPress={() => narration.stepVerse(-1)} style={styles.side}>
            <Icon name="previous" size={28} color={colors.ink} filled />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={narration.playing ? '일시정지' : '재생'}
            onPress={narration.toggle}
            style={({ pressed }) => [styles.main, { backgroundColor: colors.ink, opacity: pressed ? 0.85 : 1 }]}
          >
            <Icon name={narration.playing ? 'pauseBars' : 'play'} size={30} color={colors.background} filled />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="다음 절" onPress={() => narration.stepVerse(1)} style={styles.side}>
            <Icon name="next" size={28} color={colors.ink} filled />
          </Pressable>
        </View>

        <View style={styles.chips}>
          <Chip label={`속도 ${settings.speed.toFixed(1)}×`} hint={`누르면 ${nextSpeed.toFixed(1)}배로 바뀌어요`} onPress={() => update({ speed: nextSpeed })} />
          <Chip label={sleepLabel(narration.sleep, Date.now())} on={narration.sleep.kind !== 'off'} onPress={() => setSleepOpen(true)} />
          <Chip label={subtitles ? '자막 켬' : '자막 끔'} on={subtitles} onPress={() => setSubtitles(!subtitles)} />
        </View>

        {upcoming.length > 0 && (
          <View style={styles.next}>
            <Text style={styles.nextLabel}>다음에 들을 것</Text>
            {upcoming.map((item, index) => {
              const target = bundle.chapters.find((candidate) => candidate.chapter === item.chapter)!.scenes[item.sceneIndex]!
              return (
                <Pressable
                  key={item.sceneId}
                  accessibilityRole="button"
                  accessibilityLabel={`${target.title} 듣기`}
                  onPress={() => narration.playTrack(item)}
                  style={({ pressed }) => [styles.nextRow, { backgroundColor: index === 0 ? colors.chip : 'rgba(255, 255, 255, 0.05)', opacity: pressed ? 0.7 : 1 }]}
                >
                  <Text style={styles.nextTitle} numberOfLines={1}>
                    {target.title}
                  </Text>
                  <Text style={styles.nextRange}>{`${item.chapter}:${target.verseStart}~${target.verseEnd}`}</Text>
                </Pressable>
              )
            })}
          </View>
        )}

        <Text style={styles.note}>
          {Platform.OS === 'web'
            ? '웹 미리 보기에서는 이 탭이 열려 있는 동안 들려요.'
            : '화면을 꺼도 계속 들려요. 잠금 화면과 이어폰 버튼으로 조절할 수 있어요.'}
        </Text>
      </ScrollView>

      {sleepOpen && (
        <SleepSheet
          sleep={narration.sleep}
          onChoose={(choice) => {
            narration.setSleep(choice)
            setSleepOpen(false)
          }}
          onClose={() => setSleepOpen(false)}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 24, gap: 18 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  circle: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  kicker: { fontSize: 12, color: colors.soft, letterSpacing: 0.5 },
  art: { width: '100%', aspectRatio: 1, borderRadius: 20, overflow: 'hidden' },
  titles: { gap: 6 },
  title: { fontFamily: fonts.serifBold, fontSize: 22, color: colors.ink },
  meta: { fontSize: 13, color: colors.soft },
  subtitle: { marginTop: 4, fontFamily: fonts.serif, fontSize: 15, lineHeight: 24, color: colors.ink },
  progress: { gap: 6 },
  railHit: { paddingVertical: 8 },
  rail: { height: 4, borderRadius: 2, overflow: 'hidden' },
  railFill: { height: '100%' },
  times: { flexDirection: 'row', justifyContent: 'space-between' },
  time: { fontSize: 11, color: colors.soft, fontVariant: ['tabular-nums'] },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 28 },
  side: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  main: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: 10 },
  chip: { height: 34, paddingHorizontal: 14, borderRadius: 17, borderWidth: 1, borderColor: colors.line, justifyContent: 'center' },
  chipText: { fontSize: 13, color: colors.ink },
  next: { gap: 8 },
  nextLabel: { fontSize: 11, color: colors.soft, letterSpacing: 0.5 },
  nextRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12 },
  nextTitle: { flex: 1, fontSize: 13, color: colors.ink },
  nextRange: { fontSize: 13, color: colors.soft },
  note: { fontSize: 11, lineHeight: 17, color: colors.faint },
})
