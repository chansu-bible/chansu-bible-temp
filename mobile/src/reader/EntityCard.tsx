import { Pressable, StyleSheet, Text, View } from 'react-native'
import {
  firstSentence,
  groupRelations,
  paragraphs,
  yearsLabel,
  type Character,
  type Entity,
  type Place,
} from 'reader-core'
import { useSettings } from '../settings/SettingsContext'
import { fonts } from '../theme/palette'
import Icon from '../ui/Icon'
import { Sheet } from '../ui/Sheet'
import { sheetStyles } from '../ui/sheetStyles'

type Props = {
  entity: Entity
  characters: Character[]
  places: Place[]
  // 지금 장면에 나오는 인물 id
  sceneCharacters: string[]
  // 관계에서 다른 인물을 누르면 카드가 그 인물로 바뀐다.
  onOpenEntity: (entity: Entity) => void
  onOpenMap: () => void
  onClose: () => void
}

const genderText: Record<Character['gender'], string | null> = { 남: '남자', 여: '여자', 불명: null }

// 본문에서 누른 인물·장소의 카드
export default function EntityCard({ entity, characters, places, sceneCharacters, onOpenEntity, onOpenMap, onClose }: Props) {
  const { palette } = useSettings()
  const character = entity.kind === 'character' ? characters.find((item) => item.id === entity.id) : undefined
  const place = entity.kind === 'place' ? places.find((item) => item.id === entity.id) : undefined
  const kindText = entity.kind === 'character' ? '인물' : '장소'
  const title = character?.name ?? place?.name ?? kindText

  return (
    <Sheet
      closeLabel={`${kindText} 카드 닫기`}
      onClose={onClose}
      header={
        <View style={styles.head}>
          <View style={styles.kind}>
            <Icon name={entity.kind === 'character' ? 'person' : 'pin'} size={14} color={palette.accent} />
            <Text style={[styles.kindText, { color: palette.accent }]}>{kindText} · 설정집 검수됨</Text>
          </View>
          <Text style={[styles.title, { color: palette.ink }]} accessibilityRole="header">
            {title}
          </Text>
        </View>
      }
    >
      {character ? (
        <CharacterBody
          character={character}
          characters={characters}
          inScene={sceneCharacters.includes(character.id)}
          onOpenEntity={onOpenEntity}
        />
      ) : null}
      {place ? <PlaceBody place={place} onOpenMap={onOpenMap} /> : null}
      {!character && !place ? (
        <Text style={[sheetStyles.empty, { color: palette.inkFaint }]}>설정집에 아직 없어요.</Text>
      ) : null}
    </Sheet>
  )
}

function Chip({ text, strong = false }: { text: string; strong?: boolean }) {
  const { palette } = useSettings()
  return (
    <Text
      style={[
        sheetStyles.chip,
        strong
          ? { backgroundColor: palette.accentSoft, borderColor: 'transparent', color: palette.accent, fontWeight: '600' }
          : { backgroundColor: palette.paper, borderColor: palette.line, color: palette.inkSoft },
      ]}
    >
      {text}
    </Text>
  )
}

function CharacterBody({
  character,
  characters,
  inScene,
  onOpenEntity,
}: {
  character: Character
  characters: Character[]
  inScene: boolean
  onOpenEntity: (entity: Entity) => void
}) {
  const { palette } = useSettings()
  const summary = firstSentence(character.notes)
  const years = yearsLabel(character.years)
  const gender = genderText[character.gender]
  const relations = groupRelations(character.relations)
    .map((group) => ({
      type: group.type,
      people: group.ids.flatMap((id) => characters.filter((item) => item.id === id)),
    }))
    .filter((group) => group.people.length > 0)
  const notes = paragraphs(character.notes)

  return (
    <>
      {summary ? <Text style={[sheetStyles.serifParagraph, { color: palette.ink }]}>{summary}</Text> : null}

      <View style={sheetStyles.chips}>
        {inScene ? <Chip text="이 장면에 나와요" strong /> : null}
        {character.firstAppearance ? <Chip text={`처음 등장 ${character.firstAppearance}`} /> : null}
        {gender ? <Chip text={gender} /> : null}
        {years ? <Chip text={years} /> : null}
      </View>

      {relations.length > 0 && (
        <>
          <Text style={[sheetStyles.h3, { color: palette.ink }]} accessibilityRole="header">
            관계
          </Text>
          <View style={styles.relations}>
            {relations.map((group) => (
              <View key={group.type} style={styles.relation}>
                <Text style={[styles.relationType, { color: palette.inkSoft }]}>{group.type}</Text>
                <View style={styles.relationPeople}>
                  {group.people.map((person) => (
                    <Pressable
                      key={person.id}
                      accessibilityRole="button"
                      accessibilityLabel={`${person.name} 인물 카드 보기`}
                      onPress={() => onOpenEntity({ kind: 'character', id: person.id })}
                      style={[styles.relationName, { borderColor: palette.line, backgroundColor: palette.surface }]}
                    >
                      <Text style={[styles.relationNameText, { color: palette.ink }]}>{person.name}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ))}
          </View>
        </>
      )}

      {character.attire.length > 0 && (
        <>
          <Text style={[sheetStyles.h3, { color: palette.ink }]} accessibilityRole="header">
            옷차림
          </Text>
          {character.attire.map((item, index) => (
            <Text key={index} style={[sheetStyles.term, { backgroundColor: palette.paper, color: palette.ink }]}>
              <Text style={[sheetStyles.termVerse, { color: palette.inkFaint }]}>{item.from} </Text>
              {item.description}
            </Text>
          ))}
        </>
      )}

      {notes.length > 0 && (
        <>
          <Text style={[sheetStyles.h3, { color: palette.ink }]} accessibilityRole="header">
            본문이 말하는 것
          </Text>
          <View style={sheetStyles.explanation}>
            {notes.map((paragraph, index) => (
              <Text key={index} style={[sheetStyles.paragraph, { color: palette.ink }]}>
                {paragraph}
              </Text>
            ))}
          </View>
        </>
      )}

      {character.sources.length > 0 && (
        <Text style={[sheetStyles.note, { color: palette.inkFaint }]}>본문 근거: {character.sources.join(', ')}</Text>
      )}
    </>
  )
}

function PlaceBody({ place, onOpenMap }: { place: Place; onOpenMap: () => void }) {
  const { palette } = useSettings()
  const mapped = place.lat !== null && place.lng !== null
  return (
    <>
      {place.estimated && (
        <View style={sheetStyles.chips}>
          <Chip text="추정 위치" />
        </View>
      )}
      {place.description ? (
        <Text style={[sheetStyles.paragraph, { color: palette.ink }]}>{place.description}</Text>
      ) : (
        <Text style={[sheetStyles.empty, { color: palette.inkFaint }]}>이 장소의 설명은 아직 준비 중이에요.</Text>
      )}
      {mapped && (
        <Pressable
          accessibilityRole="button"
          onPress={onOpenMap}
          style={[styles.wide, { borderColor: palette.line, backgroundColor: palette.paper }]}
        >
          <Icon name="map" size={18} color={palette.ink} />
          <Text style={[styles.wideText, { color: palette.ink }]}>지도에서 보기</Text>
        </Pressable>
      )}
    </>
  )
}

const styles = StyleSheet.create({
  head: { gap: 2 },
  kind: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  kindText: { fontSize: 12 },
  title: { fontFamily: fonts.serifBold, fontSize: 22 },
  relations: { gap: 8 },
  relation: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  relationType: { minWidth: 44, fontSize: 13 },
  relationPeople: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  relationName: { paddingHorizontal: 12, paddingVertical: 4, borderWidth: 1, borderRadius: 999 },
  relationNameText: { fontFamily: fonts.serif, fontSize: 14 },
  wide: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 12, borderWidth: 1, borderRadius: 12 },
  wideText: { fontSize: 15, fontWeight: '600' },
})
