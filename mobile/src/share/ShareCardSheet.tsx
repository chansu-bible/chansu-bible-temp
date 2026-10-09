import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import type { Scene, Verse } from 'reader-core'
import { imageSource } from '../content/bundle'
import { useSettings } from '../settings/SettingsContext'
import { fonts } from '../theme/palette'
import Icon from '../ui/Icon'
import { Sheet } from '../ui/Sheet'
import { sheetStyles } from '../ui/sheetStyles'
import { shareCard } from './shareCard'

type Props = {
  scene: Scene
  imageVersionId: string | null
  chapter: number
  verse: Verse
  translation: string
  onClose: () => void
}

// 장면 그림 위에 한 절을 얹은 정사각 카드. 기기에서 그려 공유하고 서버는 거치지 않는다.
export default function ShareCardSheet({ scene, imageVersionId, chapter, verse, translation, onClose }: Props) {
  const { palette } = useSettings()
  const card = useRef<View>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const image = imageSource(imageVersionId ? scene.images[imageVersionId] : undefined)
  const reference = `창세기 ${chapter}장 ${verse.verse}절 · ${translation}`

  async function share() {
    setBusy(true)
    setMessage(null)
    try {
      setMessage(await shareCard(card, `${verse.text}\n— ${reference}`))
    } catch {
      setMessage('공유하지 못했어요. 다시 해 주세요.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet title="장면 카드 공유" closeLabel="공유 닫기" onClose={onClose}>
      <View ref={card} collapsable={false} style={[styles.card, { backgroundColor: palette.ink }]}>
        {image !== null && <Image source={image} style={StyleSheet.absoluteFill} contentFit="cover" />}
        <LinearGradient colors={['rgba(20, 16, 12, 0)', 'rgba(20, 16, 12, 0.78)']} style={styles.shade} />
        <Text style={styles.title}>{scene.title}</Text>
        <View style={styles.bottom}>
          <Text style={styles.verse}>{verse.text}</Text>
          <View style={styles.footer}>
            <Text style={styles.reference}>{reference}</Text>
            <View style={styles.brand}>
              <View style={[styles.logo, { backgroundColor: palette.accent }]}>
                <Icon name="book" size={12} color="#ffffff" />
              </View>
              <Text style={styles.brandText}>장면으로 읽는 성경</Text>
            </View>
          </View>
        </View>
      </View>

      <Pressable
        accessibilityRole="button"
        disabled={busy}
        onPress={() => void share()}
        style={[styles.button, { backgroundColor: palette.accent, opacity: busy ? 0.6 : 1 }]}
      >
        <Icon name="share" size={18} color={palette.paper} />
        <Text style={[styles.buttonText, { color: palette.paper }]}>{busy ? '만드는 중' : '공유하기'}</Text>
      </Pressable>
      {message ? <Text style={[sheetStyles.note, { color: palette.inkSoft }]}>{message}</Text> : null}
    </Sheet>
  )
}

const styles = StyleSheet.create({
  card: { width: '100%', aspectRatio: 1, borderRadius: 12, overflow: 'hidden' },
  shade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '70%' },
  title: {
    position: 'absolute',
    top: 10,
    left: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: 'rgba(20, 16, 12, 0.55)',
    color: '#ffffff',
    fontSize: 11,
  },
  bottom: { position: 'absolute', left: 18, right: 18, bottom: 16, gap: 10 },
  verse: {
    color: '#ffffff',
    fontFamily: fonts.serifBold,
    fontSize: 15,
    lineHeight: 24,
    textShadowColor: 'rgba(0, 0, 0, 0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  footer: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8 },
  reference: { flexShrink: 1, color: 'rgba(255, 255, 255, 0.9)', fontSize: 11 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  logo: { width: 18, height: 18, borderRadius: 5, alignItems: 'center', justifyContent: 'center' },
  brandText: { color: 'rgba(255, 255, 255, 0.9)', fontSize: 10 },
  button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 46, borderRadius: 12 },
  buttonText: { fontSize: 15, fontWeight: '600' },
})
