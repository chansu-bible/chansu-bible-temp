import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { StyleSheet, Text, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { hueOf, type ReviewStatus, type Scene, type Verse } from 'reader-core'
import { imageSource } from '../content/bundle'
import { useSettings } from '../settings/SettingsContext'
import { fonts, placeholderColors } from '../theme/palette'
import { RoundButton } from '../ui/IconButton'

const badgeText: Partial<Record<ReviewStatus, string>> = { draft: '검수 전', flagged: '확인 필요' }

// 이 글자 수보다 긴 절은 자막 글자를 줄여 그림 위에 다 들어가게 한다.
const longVerse = 60
// 그림을 이만큼(px) 옆으로 밀면 다음·이전 장면으로 넘어간다.
const swipeDistance = 60

type Props = {
  scene: Scene
  imageVersionId: string | null
  sceneNumber: number
  sceneCount: number
  verse: Verse | undefined
  playing: boolean
  canPlay: boolean
  onTogglePlay: () => void
  onOpenMap: () => void
  onOpenSheet: () => void
  // 1이면 다음 장면, -1이면 이전 장면
  onSwipe: (direction: 1 | -1) => void
  // 낭독 중일 때만 준다. 낭독 플레이어를 연다.
  onOpenPlayer?: () => void
}

// 화면 위쪽 절반: 장면 그림, 지도·해설·낭독·자막 단추, 그림 위 자막과 장면 제목
export default function ScenePane({
  scene,
  imageVersionId,
  sceneNumber,
  sceneCount,
  verse,
  playing,
  canPlay,
  onTogglePlay,
  onOpenMap,
  onOpenSheet,
  onSwipe,
  onOpenPlayer,
}: Props) {
  const { palette, verseScale, subtitles, setSubtitles } = useSettings()
  const insets = useSafeAreaInsets()
  const image = imageSource(imageVersionId ? scene.images[imageVersionId] : undefined)
  const placeholder = placeholderColors(hueOf(scene.id), palette)
  const badge = badgeText[scene.reviewStatus]
  // 소리가 없는 절에서는 재생 단추를 흐리게 둔다.
  const playDisabled = !playing && !canPlay
  const long = (verse?.text.length ?? 0) > longVerse
  const subtitleSize = (long ? 14 : 16) * verseScale

  const swipe = Gesture.Pan()
    .runOnJS(true)
    .activeOffsetX([-20, 20])
    .failOffsetY([-15, 15])
    .onEnd((event) => {
      if (event.translationX <= -swipeDistance) onSwipe(1)
      else if (event.translationX >= swipeDistance) onSwipe(-1)
    })

  return (
    <GestureDetector gesture={swipe}>
      <View style={[styles.pane, { backgroundColor: palette.accentSoft }]}>
        {image !== null ? (
          <Image
            source={image}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={{ duration: 450, effect: 'cross-dissolve' }}
            accessibilityLabel={`${scene.title}. 옆으로 밀면 다른 장면으로 넘어가요`}
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.placeholder, { backgroundColor: placeholder.background }]}>
            <Text style={[styles.placeholderText, { color: placeholder.text }]}>그림 준비 중</Text>
          </View>
        )}

        {/* 상태 표시줄 글자가 밝은 그림 위에서도 보이게 위쪽을 살짝 어둡게 한다. */}
        <LinearGradient
          colors={['rgba(0, 0, 0, 0.28)', 'rgba(0, 0, 0, 0)']}
          style={[styles.topShade, { height: insets.top + 28 }]}
          pointerEvents="none"
        />

        <View style={[styles.leftButtons, { top: insets.top + 12 }]}>
          <RoundButton name="map" label="여정 지도 보기" onPress={onOpenMap} />
          <RoundButton name="question" label="이 장면 해설 보기" onPress={onOpenSheet} />
        </View>

        <View style={[styles.rightButtons, { top: insets.top + 12 }]}>
          {playing && <Text style={styles.aiVoice}>AI 음성</Text>}
          <RoundButton
            name={playing ? 'pause' : 'play'}
            label={playing ? 'AI 음성 읽기 멈춤' : 'AI 음성으로 듣기'}
            disabled={playDisabled}
            onPress={onTogglePlay}
          />
          {onOpenPlayer && <RoundButton name="headphones" label="낭독 플레이어 열기" onPress={onOpenPlayer} />}
          <RoundButton name="subtitles" label="그림 위 자막" toggled={subtitles} onPress={() => setSubtitles(!subtitles)} />
        </View>

        <LinearGradient colors={['rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0.45)']} style={styles.bottom} pointerEvents="none">
          {subtitles && verse ? (
            <View style={styles.subtitle}>
              <Text style={[styles.subtitleText, { fontSize: subtitleSize, lineHeight: subtitleSize * (long ? 1.5 : 1.55) }]}>
                <Text style={styles.subtitleNumber}>{verse.verse} </Text>
                {verse.text}
              </Text>
            </View>
          ) : null}
          <View style={styles.caption}>
            <Text style={styles.title} numberOfLines={1}>
              {scene.title}
            </Text>
            <View style={styles.meta}>
              {badge ? <Text style={[styles.badge, { backgroundColor: palette.warnSoft, color: palette.warn }]}>{badge}</Text> : null}
              <Text style={styles.count}>
                {sceneNumber} / {sceneCount}
              </Text>
            </View>
          </View>
        </LinearGradient>
      </View>
    </GestureDetector>
  )
}

const styles = StyleSheet.create({
  pane: { flex: 1, overflow: 'hidden' },
  placeholder: { alignItems: 'center', justifyContent: 'center' },
  placeholderText: { fontSize: 13 },
  topShade: { position: 'absolute', top: 0, left: 0, right: 0 },
  leftButtons: { position: 'absolute', left: 12, gap: 8 },
  rightButtons: { position: 'absolute', right: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  aiVoice: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    color: '#ffffff',
    fontSize: 11,
  },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: 20 },
  subtitle: { marginHorizontal: 12, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: 'rgba(0, 0, 0, 0.6)' },
  subtitleText: {
    color: '#ffffff',
    fontFamily: fonts.serif,
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  subtitleNumber: { fontFamily: fonts.sans, fontSize: 11, opacity: 0.8 },
  caption: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8, paddingHorizontal: 14, paddingTop: 8, paddingBottom: 10 },
  title: { flex: 1, color: '#ffffff', fontFamily: fonts.serif, fontSize: 17 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, overflow: 'hidden', fontSize: 12 },
  count: { color: '#ffffff', fontSize: 12 },
})
