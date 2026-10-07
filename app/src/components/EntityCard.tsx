import type { Character, Place } from '../content/types.ts'
import { firstSentence, groupRelations, paragraphs, yearsLabel } from '../reader/entity.ts'
import type { Entity } from '../reader/names.ts'
import Icon from './Icon.tsx'

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

// 본문에서 누른 인물·장소의 카드. 아래에서 올라오는 시트다. Esc 닫기는 ReaderScreen이 한다.
export default function EntityCard({ entity, characters, places, sceneCharacters, onOpenEntity, onOpenMap, onClose }: Props) {
  const character = entity.kind === 'character' ? characters.find((item) => item.id === entity.id) : undefined
  const place = entity.kind === 'place' ? places.find((item) => item.id === entity.id) : undefined
  const kindText = entity.kind === 'character' ? '인물' : '장소'
  const title = character?.name ?? place?.name ?? kindText

  return (
    <div className="overlay sheet-backdrop" onClick={onClose}>
      <div
        className="sheet entity-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="entity-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sheet-head">
          <div className="entity-head">
            <span className="entity-kind">
              <Icon name={entity.kind === 'character' ? 'person' : 'pin'} size={14} />
              {kindText} · 설정집 검수됨
            </span>
            <h2 id="entity-title" className="sheet-title">
              {title}
            </h2>
          </div>
          <button type="button" className="icon-button" aria-label={`${kindText} 카드 닫기`} autoFocus onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>

        {character && (
          <CharacterBody
            character={character}
            characters={characters}
            inScene={sceneCharacters.includes(character.id)}
            onOpenEntity={onOpenEntity}
          />
        )}
        {place && <PlaceBody place={place} onOpenMap={onOpenMap} />}
        {!character && !place && <p className="empty">설정집에 아직 없어요.</p>}
      </div>
    </div>
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
      {summary && <p className="entity-summary">{summary}</p>}

      <div className="chips">
        {inScene && <span className="chip strong">이 장면에 나와요</span>}
        {character.firstAppearance && <span className="chip">처음 등장 {character.firstAppearance}</span>}
        {gender && <span className="chip">{gender}</span>}
        {years && <span className="chip">{years}</span>}
      </div>

      {relations.length > 0 && (
        <>
          <h3>관계</h3>
          <dl className="relations">
            {relations.map((group) => (
              <div key={group.type} className="relation">
                <dt>{group.type}</dt>
                <dd>
                  {group.people.map((person) => (
                    <button
                      key={person.id}
                      type="button"
                      className="relation-name"
                      aria-label={`${person.name} 인물 카드 보기`}
                      onClick={() => onOpenEntity({ kind: 'character', id: person.id })}
                    >
                      {person.name}
                    </button>
                  ))}
                </dd>
              </div>
            ))}
          </dl>
        </>
      )}

      {character.attire.length > 0 && (
        <>
          <h3>옷차림</h3>
          {character.attire.map((item, index) => (
            <div key={index} className="term">
              <span className="term-verse">{item.from}</span>
              {item.description}
            </div>
          ))}
        </>
      )}

      {notes.length > 0 && (
        <>
          <h3>본문이 말하는 것</h3>
          <div className="explanation">
            {notes.map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
          </div>
        </>
      )}

      {character.sources.length > 0 && <p className="entity-sources">본문 근거: {character.sources.join(', ')}</p>}
    </>
  )
}

function PlaceBody({ place, onOpenMap }: { place: Place; onOpenMap: () => void }) {
  const mapped = place.lat !== null && place.lng !== null
  return (
    <>
      {place.estimated && (
        <div className="chips">
          <span className="chip">추정 위치</span>
        </div>
      )}
      {place.description ? (
        <p className="entity-description">{place.description}</p>
      ) : (
        <p className="empty">이 장소의 설명은 아직 준비 중이에요.</p>
      )}
      {mapped && (
        <button type="button" className="wide-button" onClick={onOpenMap}>
          <Icon name="map" size={18} />
          지도에서 보기
        </button>
      )}
    </>
  )
}
