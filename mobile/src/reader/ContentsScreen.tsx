import { Image } from 'expo-image'
import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  chapterProgress,
  hueOf,
  sceneStatus,
  type Bundle,
  type Entity,
  type Position,
  type Scene,
  type SceneStatus,
} from 'reader-core'
import { imageSource } from '../content/bundle'
import { useSettings } from '../settings/SettingsContext'
import { fonts, placeholderColors } from '../theme/palette'
import Icon from '../ui/Icon'
import { OverlayScreen } from '../ui/OverlayScreen'
import TimelineView from './TimelineView'

export type ContentsTab = 'scenes' | 'timeline'

type Props = {
  bundle: Bundle
  currentChapter: number
  currentSceneId: string
  // 지금 장면에 나오는 인물 id. 연표에서 진하게 그린다.
  sceneCharacters: string[]
  readScenes: Set<string>
  tab: ContentsTab
  onTabChange: (tab: ContentsTab) => void
  // 장면을 누르면 그 장면의 첫 절로 옮기고 목차를 닫는다.
  onJump: (position: Position) => void
  onOpenEntity: (entity: Entity) => void
  onClose: () => void
}

const statusText: Record<SceneStatus, string> = { reading: '읽는 중', read: '읽음', unread: '' }

// 목차: 장마다 장면 목록과 읽은 진도, 그리고 인물 연표
export default function ContentsScreen({
  bundle,
  currentChapter,
  currentSceneId,
  sceneCharacters,
  readScenes,
  tab,
  onTabChange,
  onJump,
  onOpenEntity,
  onClose,
}: Props) {
  const { palette } = useSettings()
  const insets = useSafeAreaInsets()
  // 목록을 보여 줄 장. 장 칩을 누르면 바뀌기만 하고 읽는 곳은 옮기지 않는다.
  const [shownChapter, setShownChapter] = useState(currentChapter)
  const chapter = bundle.chapters.find((c) => c.chapter === shownChapter) ?? bundle.chapters[0]!
  const progress = chapterProgress(chapter.scenes, readScenes)
  const percent = progress.total ? (progress.read / progress.total) * 100 : 0

  return (
    <OverlayScreen title="목차" backLabel="목차 닫기" onBack={onClose}>
      <View style={[styles.tabs, { borderBottomColor: palette.line }]} accessibilityRole="tablist">
        <TabButton label="장면" selected={tab === 'scenes'} onPress={() => onTabChange('scenes')} />
        <TabButton label="연표" selected={tab === 'timeline'} onPress={() => onTabChange('timeline')} />
      </View>

      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: 24 + insets.bottom }]}>
        {tab === 'scenes' ? (
          <>
            <View style={styles.chips} accessibilityLabel="장 고르기">
              {bundle.chapters.map((c) => {
                const done = chapterProgress(c.scenes, readScenes).done
                const selected = c.chapter === chapter.chapter
                const current = c.chapter === currentChapter
                return (
                  <Pressable
                    key={c.chapter}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`${c.chapter}장${current ? ', 읽는 중' : ''}${done ? ', 다 읽음' : ''}`}
                    onPress={() => setShownChapter(c.chapter)}
                    style={[
                      styles.chip,
                      {
                        borderColor: selected || current ? palette.accent : done ? 'transparent' : palette.line,
                        backgroundColor: selected ? palette.accent : done ? palette.okSoft : palette.surface,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        fontSize: 14,
                        color: selected ? palette.paper : current ? palette.accent : done ? palette.ok : palette.ink,
                        fontWeight: current ? '700' : '400',
                      }}
                    >
                      {c.chapter}
                    </Text>
                  </Pressable>
                )
              })}
            </View>

            <View style={styles.summary}>
              <Text style={[styles.summaryTitle, { color: palette.ink }]}>
                {chapter.chapter}장 · 장면 {chapter.scenes.length}개 · {chapter.verses.length}절
              </Text>
              <Text style={[styles.summaryText, { color: palette.inkSoft }]}>
                읽은 장면 {progress.read} / {progress.total}
              </Text>
              <View
                style={[styles.progress, { backgroundColor: palette.line }]}
                accessibilityRole="progressbar"
                accessibilityLabel={`${chapter.chapter}장 읽은 장면`}
                accessibilityValue={{ min: 0, max: progress.total, now: progress.read }}
              >
                <View style={{ width: `${percent}%`, height: '100%', backgroundColor: palette.ok }} />
              </View>
            </View>

            {chapter.scenes.map((scene, index) => (
              <SceneRow
                key={scene.id}
                scene={scene}
                number={index + 1}
                imageVersionId={bundle.defaultImageVersion}
                placeName={bundle.places.find((place) => place.id === scene.placeId)?.name ?? null}
                status={sceneStatus(scene.id, currentSceneId, readScenes)}
                onPress={() => onJump({ chapter: chapter.chapter, verse: scene.verseStart })}
              />
            ))}
          </>
        ) : (
          <TimelineView
            characters={bundle.characters}
            eras={bundle.eras}
            sceneCharacters={sceneCharacters}
            onOpenEntity={onOpenEntity}
          />
        )}
      </ScrollView>
    </OverlayScreen>
  )
}

function TabButton({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const { palette } = useSettings()
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      aria-selected={selected}
      onPress={onPress}
      style={[styles.tab, { borderBottomColor: selected ? palette.accent : 'transparent' }]}
    >
      <Text style={[styles.tabText, { color: selected ? palette.ink : palette.inkSoft }]}>{label}</Text>
    </Pressable>
  )
}

function SceneRow({
  scene,
  number,
  imageVersionId,
  placeName,
  status,
  onPress,
}: {
  scene: Scene
  number: number
  imageVersionId: string | null
  placeName: string | null
  status: SceneStatus
  onPress: () => void
}) {
  const { palette } = useSettings()
  const image = imageSource(imageVersionId ? scene.images[imageVersionId] : undefined)
  const thumb = placeholderColors(hueOf(scene.id), palette)
  const verses = scene.verseStart === scene.verseEnd ? `${scene.verseStart}절` : `${scene.verseStart}–${scene.verseEnd}절`
  const reading = status === 'reading'

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${number}. ${scene.title}, ${verses}${statusText[status] ? `, ${statusText[status]}` : ''}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        reading && { borderColor: palette.line, backgroundColor: palette.surface },
        pressed && { backgroundColor: palette.surface },
      ]}
    >
      <View style={[styles.thumb, { backgroundColor: thumb.background }]}>
        {image !== null ? (
          <Image source={image} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : (
          <Text style={[styles.thumbNumber, { color: thumb.text }]}>{number}</Text>
        )}
      </View>
      <View style={styles.rowText}>
        <Text style={[styles.rowTitle, { color: palette.ink }]} numberOfLines={1}>
          {scene.title}
        </Text>
        <View style={styles.rowMeta}>
          <Text style={[styles.metaText, { color: palette.inkSoft }]}>{verses}</Text>
          {placeName ? (
            <View style={[styles.placeChip, { backgroundColor: palette.accentSoft }]}>
              <Icon name="pin" size={12} color={palette.accent} />
              <Text style={[styles.metaText, { color: palette.accent }]}>{placeName}</Text>
            </View>
          ) : null}
        </View>
      </View>
      <Text
        style={[
          styles.status,
          { color: reading ? palette.accent : status === 'read' ? palette.ok : palette.inkFaint, fontWeight: reading ? '600' : '400' },
        ]}
      >
        {statusText[status]}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', marginHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderBottomWidth: 2 },
  tabText: { fontSize: 15, fontWeight: '600' },
  body: { padding: 16, gap: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { minWidth: 36, height: 36, paddingHorizontal: 8, borderWidth: 1, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  summary: { marginTop: 16, marginBottom: 10, gap: 4 },
  summaryTitle: { fontFamily: fonts.serifBold, fontSize: 17 },
  summaryText: { fontSize: 13 },
  progress: { height: 4, marginTop: 4, borderRadius: 999, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 8, borderWidth: 1, borderColor: 'transparent', borderRadius: 12 },
  thumb: { width: 56, height: 56, borderRadius: 10, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  thumbNumber: { fontWeight: '700', fontSize: 16 },
  rowText: { flex: 1, minWidth: 0, gap: 4 },
  rowTitle: { fontFamily: fonts.serif, fontSize: 15 },
  rowMeta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  metaText: { fontSize: 12 },
  placeChip: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingLeft: 6, paddingRight: 8, paddingVertical: 1, borderRadius: 999 },
  status: { fontSize: 12 },
})
