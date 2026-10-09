import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { bookProgress, chapterRangeLabel, hueOf, type Bundle } from 'reader-core'
import { imageSource } from '../content/bundle'
import { useReadScenes } from '../data/reading'
import { useSettings } from '../settings/SettingsContext'
import { fonts, placeholderColors, withAlpha } from '../theme/palette'
import { ScreenHeader } from '../ui/ScreenHeader'
import HowWeMakeSheet from './HowWeMakeSheet'

// 창세기 전체 장 수. 묶음에는 만든 장(1~10장)만 있다.
const GENESIS_CHAPTERS = 50

// 아직 앱에 없는 책은 소개만 둔다.
const OTHER_BOOKS: { title: string; status: '만드는 중' | '예정'; about: string }[] = [
  { title: '출애굽기', status: '만드는 중', about: '설정집에 모세·애굽·시내 산이 더해져요. 여정 지도가 길어져요.' },
  { title: '룻기', status: '예정', about: '네 장의 짧은 이야기라 장면이 또렷해요.' },
  { title: '요나', status: '예정', about: '네 장, 바다와 니느웨 두 장소.' },
  { title: '마가복음', status: '예정', about: '첫 신약. 인물 설정집을 새로 시작해요.' },
]

// 서재(목업 14): 읽을 수 있는 책과 만들고 있는 책
export default function LibraryScreen({ bundle }: { bundle: Bundle }) {
  const router = useRouter()
  const { palette } = useSettings()
  const insets = useSafeAreaInsets()
  const [howOpen, setHowOpen] = useState(false)
  const { ids: readIds } = useReadScenes()
  const progress = bookProgress(bundle.chapters, readIds)
  const cover = bundle.chapters[0]?.scenes[0]
  const image = imageSource(cover && bundle.defaultImageVersion ? cover.images[bundle.defaultImageVersion] : undefined)
  const placeholder = placeholderColors(hueOf(cover?.id ?? bundle.book), palette)
  const readShare = progress.readChapters.length / GENESIS_CHAPTERS
  const readyShare = Math.max(0, progress.chapterCount - progress.readChapters.length) / GENESIS_CHAPTERS
  const readLabel = progress.readChapters.length > 0 ? `읽음 ${chapterRangeLabel(progress.readChapters)}` : '아직 다 읽은 장이 없어요'
  const madeLabel =
    progress.lastChapter < GENESIS_CHAPTERS
      ? `준비됨 ${progress.firstChapter}~${progress.lastChapter}장 · 만드는 중 ${progress.lastChapter + 1}~${GENESIS_CHAPTERS}장`
      : `준비됨 ${progress.firstChapter}~${progress.lastChapter}장`

  return (
    <View style={[styles.root, { backgroundColor: palette.paper }]}>
      <ScreenHeader title="서재" />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        <Text style={[styles.intro, { color: palette.inkSoft }]}>장면으로 읽을 수 있는 책과 만들고 있는 책이에요.</Text>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${bundle.book} 읽기. ${progress.firstChapter}~${progress.lastChapter}장, 장면 ${progress.sceneCount}개. ${readLabel}`}
          onPress={() => router.push('/read')}
          style={({ pressed }) => [styles.book, { backgroundColor: palette.surface, opacity: pressed ? 0.85 : 1 }]}
        >
          <View style={[styles.cover, { backgroundColor: placeholder.background }]}>
            {image !== null && <Image source={image} style={StyleSheet.absoluteFill} contentFit="cover" />}
            <Text style={styles.coverBadge}>읽을 수 있음</Text>
          </View>
          <View style={styles.bookBody}>
            <View style={styles.bookHead}>
              <Text style={[styles.bookTitle, { color: palette.ink }]}>{bundle.book}</Text>
              <Text style={[styles.bookMeta, { color: palette.inkSoft }]}>
                {progress.firstChapter}~{progress.lastChapter}장 · 장면 {progress.sceneCount}개
              </Text>
            </View>
            <View style={[styles.bar, { backgroundColor: palette.line }]}>
              <View style={{ width: `${readShare * 100}%`, backgroundColor: palette.accent }} />
              <View style={{ width: `${readyShare * 100}%`, backgroundColor: withAlpha(palette.accent, 0.35) }} />
            </View>
            <View style={styles.legend}>
              <Text style={[styles.legendText, { color: palette.inkSoft }]}>{readLabel}</Text>
              <Text style={[styles.legendText, { color: palette.inkSoft }]}>{madeLabel}</Text>
            </View>
          </View>
        </Pressable>

        <View style={styles.grid}>
          {OTHER_BOOKS.map((book) => (
            <View
              key={book.title}
              style={[styles.other, { backgroundColor: palette.surface, borderColor: withAlpha(palette.accent, 0.35) }]}
              accessibilityLabel={`${book.title}, ${book.status}. ${book.about}`}
            >
              <Text
                style={[
                  styles.status,
                  book.status === '만드는 중'
                    ? { backgroundColor: palette.warnSoft, color: palette.warn }
                    : { backgroundColor: palette.line, color: palette.inkSoft },
                ]}
              >
                {book.status}
              </Text>
              <Text style={[styles.otherTitle, { color: palette.ink }]}>{book.title}</Text>
              <Text style={[styles.otherAbout, { color: palette.inkSoft }]}>{book.about}</Text>
            </View>
          ))}
        </View>

        <View style={[styles.how, { backgroundColor: palette.accentSoft }]}>
          <Text style={[styles.howTitle, { color: palette.accent }]}>어떻게 만드나요</Text>
          <Text style={[styles.howBody, { color: palette.accent }]}>
            본문에서 인물·장소 설정집을 뽑아 사람이 검수하고, 그 설정집으로 장면 글을 쓰고 검수한 뒤 그림을 그려요. 모든 책이 같은 길을
            거쳐요.
          </Text>
          <Pressable accessibilityRole="button" onPress={() => setHowOpen(true)} hitSlop={8}>
            <Text style={[styles.howLink, { color: palette.accent }]}>제작 과정 보기 →</Text>
          </Pressable>
        </View>
      </ScrollView>

      {howOpen && (
        <HowWeMakeSheet
          onOpenSources={() => {
            setHowOpen(false)
            router.push('/sources')
          }}
          onClose={() => setHowOpen(false)}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingTop: 14, paddingHorizontal: 20, gap: 16 },
  intro: { fontSize: 13, lineHeight: 20 },
  book: { borderRadius: 18, overflow: 'hidden' },
  cover: { height: 150 },
  coverBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: 'rgba(20, 16, 12, 0.6)',
    color: '#ffffff',
    fontSize: 11,
  },
  bookBody: { gap: 8, paddingVertical: 14, paddingHorizontal: 16 },
  bookHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  bookTitle: { fontFamily: fonts.serifBold, fontSize: 20 },
  bookMeta: { fontSize: 12 },
  bar: { flexDirection: 'row', height: 6, borderRadius: 3, overflow: 'hidden' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 4 },
  legendText: { fontSize: 11 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  other: { width: '48%', flexGrow: 1, gap: 8, padding: 14, borderRadius: 16, borderWidth: 1, borderStyle: 'dashed' },
  status: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, overflow: 'hidden', fontSize: 11 },
  otherTitle: { fontFamily: fonts.serifBold, fontSize: 18 },
  otherAbout: { fontSize: 12, lineHeight: 18 },
  how: { gap: 6, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 16 },
  howTitle: { fontSize: 13, fontWeight: '700' },
  howBody: { fontSize: 12, lineHeight: 19 },
  howLink: { fontSize: 12, fontWeight: '600' },
})
