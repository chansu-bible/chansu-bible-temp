import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { hueOf, type Bundle } from 'reader-core'
import { imageSource } from '../content/bundle'
import { useNarration } from '../narration/NarrationContext'
import { useSettings } from '../settings/SettingsContext'
import { placeholderColors } from '../theme/palette'
import { IconButton } from '../ui/IconButton'

// 낭독 중일 때 홈 아래에 뜨는 작은 재생 막대. 누르면 낭독 플레이어가 열린다.
export function MiniPlayer({ bundle, bottom }: { bundle: Bundle; bottom: number }) {
  const router = useRouter()
  const { palette } = useSettings()
  const narration = useNarration()
  const track = narration.track
  if (track === null) return null
  const scene = bundle.chapters.find((item) => item.chapter === track.chapter)?.scenes[track.sceneIndex]
  if (!scene) return null
  const image = imageSource(bundle.defaultImageVersion ? scene.images[bundle.defaultImageVersion] : undefined)
  // 단추 안에 단추를 두지 않는다(웹에서 button 안의 button은 잘못된 HTML이다). 여는 곳과 재생·닫기 단추를 나란히 둔다.
  return (
    <View style={[styles.bar, { bottom, backgroundColor: palette.surface, borderColor: palette.line }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`낭독 플레이어 열기. ${scene.title}`}
        onPress={() => router.push('/player')}
        style={({ pressed }) => [styles.open, { opacity: pressed ? 0.7 : 1 }]}
      >
        <View style={[styles.thumb, { backgroundColor: placeholderColors(hueOf(scene.id), palette).background }]}>
          {image !== null && <Image source={image} style={StyleSheet.absoluteFill} contentFit="cover" accessible={false} />}
        </View>
        <View style={styles.text}>
          <Text style={[styles.title, { color: palette.ink }]} numberOfLines={1}>
            {scene.title}
          </Text>
          <Text style={[styles.meta, { color: palette.inkSoft }]}>{`${bundle.book} ${track.chapter}장 ${narration.verse ?? scene.verseStart}절`}</Text>
        </View>
      </Pressable>
      <IconButton
        name={narration.playing ? 'pause' : 'play'}
        label={narration.playing ? '낭독 일시정지' : '낭독 이어 듣기'}
        color={palette.ink}
        onPress={narration.toggle}
      />
      <IconButton name="close" label="낭독 닫기" color={palette.inkSoft} onPress={narration.close} />
    </View>
  )
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 8,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  open: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  thumb: { width: 44, height: 44, borderRadius: 10, overflow: 'hidden' },
  text: { flex: 1, gap: 2 },
  title: { fontSize: 14, fontWeight: '600' },
  meta: { fontSize: 12 },
})
