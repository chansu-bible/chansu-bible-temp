import { useRouter } from 'expo-router'
import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { chapterOfReference, initialPosition, metCharacters, readUpToChapter, yearsLabel, type Bundle, type Entity } from 'reader-core'
import { useReadScenes, useSavedPosition } from '../data/reading'
import { goToReader } from '../navigation'
import EntityCard from '../reader/EntityCard'
import { useSettings } from '../settings/SettingsContext'
import { fonts } from '../theme/palette'
import { ScreenHeader } from '../ui/ScreenHeader'

// 읽은 장까지 만난 인물. 처음 나온 장으로 묶고, 누르면 인물 카드가 열린다.
export default function PeopleScreen({ bundle }: { bundle: Bundle }) {
  const router = useRouter()
  const { palette } = useSettings()
  const insets = useSafeAreaInsets()
  const { ids } = useReadScenes()
  const position = initialPosition(bundle.chapters, useSavedPosition())
  const upTo = readUpToChapter(bundle.chapters, ids, position.chapter)
  const people = metCharacters(bundle.characters, upTo)
  const [entity, setEntity] = useState<Entity | null>(null)
  // 0장은 이 책을 읽기 전에 앞 책에서 이미 만난 인물이다(뒤 책 묶음이 앞 책 인용을 "창세기 2:7"로 쓴다).
  const groups = new Map<number, typeof people>()
  for (const person of people) {
    const chapter = chapterOfReference(person.firstAppearance)
    groups.set(chapter, [...(groups.get(chapter) ?? []), person])
  }

  return (
    <View style={[styles.root, { backgroundColor: palette.paper }]}>
      <ScreenHeader title="인물 사전" />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        <Text style={[styles.intro, { color: palette.inkSoft }]}>
          {upTo}장까지 만난 인물 {people.length}명. 아직 읽지 않은 장의 인물은 그 장을 읽으면 나타나요.
        </Text>
        {[...groups.entries()].map(([chapter, list]) => (
          <View key={chapter} style={styles.group}>
            <Text style={[styles.groupTitle, { color: palette.accent }]} accessibilityRole="header">
              {chapter === 0 ? '앞 책에서 만남' : `${chapter}장에서 만남`}
            </Text>
            {list.map((person) => (
              <Pressable
                key={person.id}
                accessibilityRole="button"
                accessibilityLabel={`${person.name} 인물 카드 보기`}
                onPress={() => setEntity({ kind: 'character', id: person.id })}
                style={({ pressed }) => [styles.row, { backgroundColor: palette.surface, opacity: pressed ? 0.7 : 1 }]}
              >
                <Text style={[styles.name, { color: palette.ink }]}>{person.name}</Text>
                <Text style={[styles.detail, { color: palette.inkSoft }]} numberOfLines={1}>
                  {yearsLabel(person.years) ?? `처음 나옴 ${person.firstAppearance}`}
                </Text>
              </Pressable>
            ))}
          </View>
        ))}
      </ScrollView>
      {entity && (
        <EntityCard
          key={`${entity.kind}-${entity.id}`}
          entity={entity}
          characters={bundle.characters}
          places={bundle.places}
          sceneCharacters={[]}
          onOpenEntity={setEntity}
          onOpenMap={() => {
            setEntity(null)
            goToReader(router, undefined, { overlay: 'map' })
          }}
          onClose={() => setEntity(null)}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, gap: 14 },
  intro: { fontSize: 13, lineHeight: 20 },
  group: { gap: 6 },
  groupTitle: { fontSize: 12, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12 },
  name: { fontFamily: fonts.serifBold, fontSize: 16 },
  detail: { flexShrink: 1, fontSize: 12 },
})
