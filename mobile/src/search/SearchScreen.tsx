import { Image } from 'expo-image'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useMemo, useState, type ReactNode } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { searchBundle, type Bundle, type CanonHit, type Entity, type Era, type Thing } from 'reader-core'
import { imageSource } from '../content/bundle'
import { goBack, goToReader } from '../navigation'
import EntityCard from '../reader/EntityCard'
import { useSettings } from '../settings/SettingsContext'
import { kv } from '../storage/kv'
import { fonts } from '../theme/palette'
import Icon from '../ui/Icon'
import CanonCard from './CanonCard'
import { Highlighted } from './Highlighted'

type Kind = 'all' | 'verses' | 'glosses' | 'canon' | 'scenes'
const recentKey = 'recent-searches'
const canonLabel: Record<CanonHit['kind'], string> = { character: '인물', place: '장소', era: '시대', thing: '물건' }

function loadRecent(): string[] {
  try {
    const value: unknown = JSON.parse(kv.getItem(recentKey) ?? '[]')
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

// 본문·낱말 풀이·설정집·장면 검색. 기기에서 묶음을 바로 훑는다(띄어쓰기 무시, 초성 검색).
export default function SearchScreen({ bundle }: { bundle: Bundle }) {
  const router = useRouter()
  const { from } = useLocalSearchParams<{ from?: string }>()
  const { palette } = useSettings()
  const insets = useSafeAreaInsets()
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<Kind>('all')
  const [recent, setRecent] = useState(loadRecent)
  const [entity, setEntity] = useState<Entity | null>(null)
  const [card, setCard] = useState<{ kind: 'era'; era: Era } | { kind: 'thing'; thing: Thing } | null>(null)
  const results = useMemo(() => searchBundle(bundle, query), [bundle, query])
  const highlight = { backgroundColor: palette.warnSoft, color: palette.accent }

  function remember() {
    const word = query.trim()
    if (!word) return
    const next = [word, ...recent.filter((item) => item !== word)].slice(0, 8)
    setRecent(next)
    try {
      kv.setItem(recentKey, JSON.stringify(next))
    } catch {
      // 최근 검색어는 저장하지 못해도 괜찮다.
    }
  }

  function openVerse(chapter: number, verse: number) {
    remember()
    goToReader(router, from, { position: { chapter, verse } })
  }

  function openCanon(hit: CanonHit) {
    remember()
    if (hit.kind === 'character' || hit.kind === 'place') setEntity({ kind: hit.kind, id: hit.id })
    else if (hit.kind === 'era') {
      const era = bundle.eras.find((item) => item.id === hit.id)
      if (era) setCard({ kind: 'era', era })
    } else {
      const thing = bundle.things.find((item) => item.id === hit.id)
      if (thing) setCard({ kind: 'thing', thing })
    }
  }

  const tabs: { id: Kind; label: string; count: number }[] = [
    { id: 'all', label: '전체', count: results.total },
    { id: 'verses', label: '본문', count: results.verses.length },
    { id: 'glosses', label: '낱말', count: results.glosses.length },
    { id: 'canon', label: '설정집', count: results.canon.length },
    { id: 'scenes', label: '장면', count: results.scenes.length },
  ]
  const show = (section: Kind) => kind === 'all' || kind === section

  return (
    <View style={[styles.root, { backgroundColor: palette.paper, paddingTop: insets.top + 12 }]}>
      <View style={styles.bar}>
        <View style={[styles.field, { backgroundColor: palette.surface, borderColor: palette.line }]}>
          <Icon name="search" size={18} color={palette.inkFaint} />
          <TextInput
            accessibilityLabel="검색어"
            autoFocus
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={remember}
            placeholder="본문, 낱말, 인물, 장면"
            placeholderTextColor={palette.inkFaint}
            returnKeyType="search"
            style={[styles.input, { color: palette.ink }]}
          />
        </View>
        <Pressable accessibilityRole="button" onPress={() => goBack(router)} style={styles.cancel}>
          <Text style={[styles.cancelText, { color: palette.inkSoft }]}>취소</Text>
        </Pressable>
      </View>

      {query.trim() ? (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs} style={styles.tabsBar}>
            {tabs.map((tab) => {
              const selected = tab.id === kind
              return (
                <Pressable
                  key={tab.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => setKind(tab.id)}
                  style={[styles.tab, selected ? { backgroundColor: palette.accent } : { backgroundColor: palette.surface, borderColor: palette.line, borderWidth: 1 }]}
                >
                  <Text style={[styles.tabText, { color: selected ? palette.paper : palette.inkSoft, fontWeight: selected ? '700' : '400' }]}>
                    {tab.label} {tab.count}
                  </Text>
                </Pressable>
              )
            })}
          </ScrollView>

          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.results, { paddingBottom: insets.bottom + 24 }]}>
            {results.total === 0 && <Text style={[styles.empty, { color: palette.inkFaint }]}>찾는 말이 없어요. 띄어쓰기 없이, 또는 초성(ㄱㅇ)으로도 찾아보세요.</Text>}

            {show('verses') && results.verses.length > 0 && (
              <Section title="본문" palette={palette}>
                {results.verses.map((hit) => (
                  <Pressable key={`${hit.chapter}:${hit.verse}`} accessibilityRole="button" onPress={() => openVerse(hit.chapter, hit.verse)} style={[styles.item, { backgroundColor: palette.surface }]}>
                    <Text style={[styles.meta, { color: palette.inkSoft }]}>
                      {bundle.book} {hit.chapter}:{hit.verse} · {hit.sceneTitle}
                    </Text>
                    <Highlighted text={hit.text} range={hit.match} style={[styles.verse, { color: palette.ink }]} highlight={highlight} />
                  </Pressable>
                ))}
              </Section>
            )}

            {show('glosses') && results.glosses.length > 0 && (
              <Section title="낱말 풀이" palette={palette}>
                {results.glosses.map((hit, index) => (
                  <Pressable key={`${hit.chapter}:${hit.verse}:${index}`} accessibilityRole="button" onPress={() => openVerse(hit.chapter, hit.verse)} style={[styles.item, styles.itemRow, { backgroundColor: palette.surface }]}>
                    <View style={styles.itemText}>
                      <Highlighted text={hit.word} range={hit.wordMatch} style={[styles.name, { color: palette.ink }]} highlight={highlight} />
                      <Highlighted text={hit.meaning} range={hit.meaningMatch} style={[styles.summary, { color: palette.inkSoft }]} highlight={highlight} />
                    </View>
                    <Text style={[styles.side, { color: palette.inkFaint }]}>
                      {hit.chapter}:{hit.verse}
                    </Text>
                  </Pressable>
                ))}
              </Section>
            )}

            {show('canon') && results.canon.length > 0 && (
              <Section title="설정집" palette={palette}>
                {results.canon.map((hit) => (
                  <Pressable key={`${hit.kind}:${hit.id}`} accessibilityRole="button" onPress={() => openCanon(hit)} style={[styles.item, styles.itemRow, { backgroundColor: palette.surface }]}>
                    <View style={styles.itemText}>
                      <Text style={[styles.name, { color: palette.ink }]}>
                        <Highlighted text={hit.name} range={hit.nameMatch} highlight={highlight} />
                        <Text style={[styles.reviewed, { color: palette.ok }]}> 검수됨</Text>
                      </Text>
                      <Highlighted text={hit.summary} range={hit.summaryMatch} style={[styles.summary, { color: palette.inkSoft }]} highlight={highlight} numberOfLines={2} />
                    </View>
                    <Text style={[styles.side, { color: palette.inkFaint }]}>{canonLabel[hit.kind]}</Text>
                  </Pressable>
                ))}
              </Section>
            )}

            {show('scenes') && results.scenes.length > 0 && (
              <Section title="장면" palette={palette}>
                {results.scenes.map((hit) => {
                  const scene = bundle.chapters.find((c) => c.chapter === hit.chapter)?.scenes.find((s) => s.id === hit.sceneId)
                  const image = imageSource(scene && bundle.defaultImageVersion ? scene.images[bundle.defaultImageVersion] : undefined)
                  return (
                    <Pressable key={hit.sceneId} accessibilityRole="button" onPress={() => openVerse(hit.chapter, hit.verseStart)} style={[styles.item, styles.itemRow, { backgroundColor: palette.surface }]}>
                      <View style={[styles.thumb, { backgroundColor: palette.accentSoft }]}>
                        {image !== null && <Image source={image} style={StyleSheet.absoluteFill} contentFit="cover" />}
                      </View>
                      <View style={styles.itemText}>
                        <Highlighted text={hit.title} range={hit.titleMatch} style={[styles.sceneTitle, { color: palette.ink }]} highlight={highlight} />
                        <Text style={[styles.summary, { color: palette.inkSoft }]} numberOfLines={2}>
                          {hit.chapter}:{hit.verseStart}~{hit.verseEnd}절 · <Highlighted text={hit.summary} range={hit.summaryMatch} highlight={highlight} />
                        </Text>
                      </View>
                    </Pressable>
                  )
                })}
              </Section>
            )}
          </ScrollView>
        </>
      ) : (
        <View style={styles.recent}>
          {recent.length > 0 ? (
            <>
              <Text style={[styles.sectionTitle, { color: palette.inkFaint }]}>최근 검색</Text>
              <View style={styles.recentList}>
                {recent.map((word) => (
                  <Pressable key={word} accessibilityRole="button" onPress={() => setQuery(word)} style={[styles.tab, { backgroundColor: palette.surface, borderColor: palette.line, borderWidth: 1 }]}>
                    <Text style={[styles.tabText, { color: palette.inkSoft }]}>{word}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : (
            <Text style={[styles.empty, { color: palette.inkFaint }]}>띄어쓰기는 무시하고 찾아요. 초성만 써도 돼요(예: ㄱㅇ → 가인).</Text>
          )}
        </View>
      )}

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
            goToReader(router, from, { overlay: 'map' })
          }}
          onClose={() => setEntity(null)}
        />
      )}
      {card && <CanonCard item={card} onClose={() => setCard(null)} />}
    </View>
  )
}

function Section({ title, palette, children }: { title: string; palette: { inkFaint: string }; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: palette.inkFaint }]} accessibilityRole="header">
        {title}
      </Text>
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16 },
  field: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, height: 44, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1 },
  input: { flex: 1, fontSize: 16, paddingVertical: 0 },
  cancel: { height: 44, justifyContent: 'center', paddingHorizontal: 4 },
  cancelText: { fontSize: 14 },
  tabsBar: { flexGrow: 0, marginTop: 12 },
  tabs: { gap: 6, paddingHorizontal: 16 },
  tab: { height: 32, paddingHorizontal: 12, borderRadius: 999, justifyContent: 'center' },
  tabText: { fontSize: 13 },
  results: { padding: 16, gap: 16 },
  empty: { marginTop: 16, fontSize: 14, lineHeight: 22, textAlign: 'center' },
  section: { gap: 8 },
  sectionTitle: { fontSize: 12, fontWeight: '500' },
  item: { paddingVertical: 12, paddingHorizontal: 14, borderRadius: 14, gap: 4 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  itemText: { flex: 1, minWidth: 0, gap: 2 },
  meta: { fontSize: 12 },
  verse: { fontFamily: fonts.serif, fontSize: 15, lineHeight: 24 },
  name: { fontSize: 15, fontWeight: '700' },
  reviewed: { fontSize: 11, fontWeight: '500' },
  summary: { fontSize: 13, lineHeight: 19 },
  side: { fontSize: 12 },
  thumb: { width: 56, height: 56, borderRadius: 10, overflow: 'hidden' },
  sceneTitle: { fontFamily: fonts.serifBold, fontSize: 15 },
  recent: { padding: 16, gap: 8 },
  recentList: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
})
