import { useRouter } from 'expo-router'
import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  buildFamilyTree,
  findSceneIndex,
  initialPosition,
  metCharacters,
  readUpToChapter,
  type Bundle,
  type Character,
  type Entity,
  type FamilyNode,
} from 'reader-core'
import { useReadScenes, useSavedPosition } from '../data/reading'
import { goToReader } from '../navigation'
import EntityCard from '../reader/EntityCard'
import { useSettings } from '../settings/SettingsContext'
import { fonts, type Palette } from '../theme/palette'
import { ScreenHeader } from '../ui/ScreenHeader'

// 가지 한 줄의 폭과 가지 사이
const COLUMN = 116
const GAP = 10

type Context = {
  byId: Map<string, Character>
  // 지금 장면에 나오는 인물. 진하게 칠한다.
  strong: Set<string>
  palette: Palette
  open: (id: string) => void
}

// 자손이 있는 자식이 둘 이상이면 옆으로 나란히, 하나면 아래로 이어 쓴다.
function branchesOf(node: FamilyNode): FamilyNode[] {
  return node.children.filter((child) => child.children.length > 0)
}

function widthOf(node: FamilyNode): number {
  const branches = branchesOf(node)
  if (branches.length >= 2) return node.children.reduce((sum, child) => sum + widthOf(child), 0) + GAP * (node.children.length - 1)
  if (branches.length === 1) return Math.max(COLUMN, widthOf(branches[0]!))
  return COLUMN
}

function yearsShort(person: Character): string {
  const { born, died } = person.years
  if (born === null) return `처음 ${person.firstAppearance}`
  return died === null ? `${born} ~` : `${born} ~ ${died}`
}

// 읽은 장까지의 인물로 그린 가계도. 이름을 누르면 인물 카드가 열린다.
export default function GenealogyScreen({ bundle }: { bundle: Bundle }) {
  const router = useRouter()
  const { palette } = useSettings()
  const insets = useSafeAreaInsets()
  const { ids } = useReadScenes()
  const position = initialPosition(bundle.chapters, useSavedPosition())
  const upTo = readUpToChapter(bundle.chapters, ids, position.chapter)
  const visible = new Set(metCharacters(bundle.characters, upTo).map((person) => person.id))
  const roots = buildFamilyTree(bundle.characters, visible).filter((root) => root.children.length > 0 || root.spouses.length > 0)
  const chapter = bundle.chapters.find((c) => c.chapter === position.chapter) ?? bundle.chapters[0]!
  const scene = chapter.scenes[findSceneIndex(chapter.scenes, position.verse)]!
  const [entity, setEntity] = useState<Entity | null>(null)
  const context: Context = {
    byId: new Map(bundle.characters.map((person) => [person.id, person])),
    strong: new Set(scene.characters),
    palette,
    open: (id) => setEntity({ kind: 'character', id }),
  }

  return (
    <View style={[styles.root, { backgroundColor: palette.paper }]}>
      <ScreenHeader title="가계도" />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        <Text style={[styles.intro, { color: palette.inkSoft }]}>
          {upTo}장까지 · 창조 원년 기준 연도. 이름을 누르면 인물 카드가 열려요. 아직 읽지 않은 장의 인물은 가려 두었어요.
        </Text>
        {roots.length === 0 ? (
          <Text style={[styles.empty, { color: palette.inkFaint }]}>사람의 족보는 2장부터 시작돼요. 읽어 나가면 가계도가 자라요.</Text>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tree}>
            <View style={styles.roots}>
              {roots.map((root) => (
                <Branch key={root.id} node={root} context={context} root />
              ))}
            </View>
          </ScrollView>
        )}
        <Text style={[styles.note, { color: palette.inkFaint }]}>
          연도는 5장의 나이를 더해 계산했고, 번역과 사본에 따라 수치가 다를 수 있어요. 같은 이름(에녹, 라멕)은 아버지가 달라 다른 가지에 있어요.
        </Text>
      </ScrollView>
      {entity && (
        <EntityCard
          key={`${entity.kind}-${entity.id}`}
          entity={entity}
          characters={bundle.characters}
          places={bundle.places}
          sceneCharacters={scene.characters}
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

function Branch({ node, context, root = false }: { node: FamilyNode; context: Context; root?: boolean }) {
  const branches = branchesOf(node)
  const leaves = node.children.filter((child) => child.children.length === 0)
  return (
    <View style={[styles.branch, { width: widthOf(node) }]}>
      <PersonRow node={node} context={context} root={root} />
      {node.children.length > 0 && <Stem context={context} />}
      {branches.length >= 2 ? (
        <Columns nodes={node.children} context={context} />
      ) : branches.length === 1 ? (
        <>
          {leaves.length > 0 && <Pills ids={leaves.map((leaf) => leaf.id)} context={context} label="다른 자녀" />}
          <Branch node={branches[0]!} context={context} />
        </>
      ) : (
        <Pills ids={leaves.map((leaf) => leaf.id)} context={context} />
      )}
    </View>
  )
}

function Columns({ nodes, context }: { nodes: FamilyNode[]; context: Context }) {
  const first = widthOf(nodes[0]!)
  const last = widthOf(nodes.at(-1)!)
  return (
    <View>
      <View style={[styles.rail, { left: first / 2, right: last / 2, backgroundColor: context.palette.line }]} />
      <View style={styles.columns}>
        {nodes.map((child) => (
          <View key={child.id} style={{ width: widthOf(child), alignItems: 'center' }}>
            <Stem context={context} />
            <Branch node={child} context={context} />
          </View>
        ))}
      </View>
    </View>
  )
}

function PersonRow({ node, context, root }: { node: FamilyNode; context: Context; root: boolean }) {
  const person = context.byId.get(node.id)
  if (!person) return null
  const mates = node.spouses.map((id) => context.byId.get(id)).filter((mate): mate is Character => mate !== undefined)
  // 뿌리 부부(아담과 하와)는 나란히, 나머지 인물의 아내·남편은 이름 아래에 적는다.
  return (
    <View style={styles.couple}>
      <PersonCard person={person} context={context} subtitle={!root && mates.length > 0 ? `${person.gender === '여' ? '남편' : '아내'} ${mates.map((mate) => mate.name).join(' · ')}` : undefined} />
      {root &&
        mates.map((mate) => (
          <View key={mate.id} style={styles.couple}>
            <View style={[styles.marriage, { backgroundColor: context.palette.line }]} />
            <PersonCard person={mate} context={context} />
          </View>
        ))}
    </View>
  )
}

function PersonCard({ person, context, subtitle }: { person: Character; context: Context; subtitle?: string }) {
  const { palette } = context
  const strong = context.strong.has(person.id)
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${person.name}${strong ? ', 이 장면에 나와요' : ''}. 인물 카드 보기`}
      onPress={() => context.open(person.id)}
      style={[styles.card, { borderColor: strong ? palette.accent : palette.line, backgroundColor: strong ? palette.accent : palette.surface }]}
    >
      <Text style={[styles.cardName, { color: strong ? palette.paper : palette.ink }]}>{person.name}</Text>
      <Text style={[styles.cardDetail, { color: strong ? palette.accentSoft : palette.inkSoft }]} numberOfLines={1}>
        {subtitle ?? yearsShort(person)}
      </Text>
    </Pressable>
  )
}

function Pills({ ids, context, label }: { ids: string[]; context: Context; label?: string }) {
  const { palette } = context
  return (
    <View style={styles.pillsBox}>
      {label ? <Text style={[styles.pillsLabel, { color: palette.inkFaint }]}>{label}</Text> : null}
      <View style={styles.pills}>
        {ids.map((id) => {
          const person = context.byId.get(id)
          if (!person) return null
          return (
            <Pressable key={id} accessibilityRole="button" accessibilityLabel={`${person.name} 인물 카드 보기`} onPress={() => context.open(id)} style={[styles.pill, { backgroundColor: palette.accentSoft }]}>
              <Text style={[styles.pillText, { color: palette.accent }]}>{person.name}</Text>
            </Pressable>
          )
        })}
      </View>
      {label ? <Stem context={context} /> : null}
    </View>
  )
}

function Stem({ context }: { context: Context }) {
  return <View style={[styles.stem, { backgroundColor: context.palette.line }]} />
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, gap: 14 },
  intro: { fontSize: 12, lineHeight: 19 },
  empty: { marginTop: 16, fontSize: 14, lineHeight: 22, textAlign: 'center' },
  tree: { paddingVertical: 8 },
  roots: { gap: 28 },
  branch: { alignItems: 'center' },
  couple: { flexDirection: 'row', alignItems: 'center' },
  marriage: { width: 14, height: 2 },
  card: { width: COLUMN - 12, paddingVertical: 6, paddingHorizontal: 8, borderWidth: 1, borderRadius: 10, alignItems: 'center' },
  cardName: { fontFamily: fonts.serifBold, fontSize: 14 },
  cardDetail: { fontSize: 10 },
  stem: { width: 2, height: 12 },
  rail: { position: 'absolute', top: 0, height: 2 },
  columns: { flexDirection: 'row', gap: GAP, alignItems: 'flex-start' },
  pillsBox: { alignItems: 'center', gap: 4 },
  pillsLabel: { fontSize: 10 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 4, maxWidth: COLUMN * 2 },
  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  pillText: { fontSize: 11 },
  note: { fontSize: 11, lineHeight: 17 },
})
