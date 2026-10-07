import {
  BUNDLE_SCHEMA_VERSION,
  type Bundle,
  type BundleCharacter,
  type BundleEra,
  type BundlePlace,
  type BundleScene,
  type Character,
  type Era,
  type ImageVersion,
  type Place,
  type Scene,
  type SceneFile,
  type Source,
  type Verse,
} from '../schema.ts'
import { findCoverageProblems } from '../scenes/coverage.ts'
import { audioName } from '../tts/select.ts'

// files: 버전 id → 그 버전 폴더에 있는 그림 파일 이름들
export type ImageCatalog = { versions: ImageVersion[]; files: Record<string, string[]> }

// 묶음에 넣을 설정집. 승인 여부는 buildBundle이 거른다.
export type BundleCanon = { characters: Character[]; places: Place[]; eras: Era[] }

export function buildBundle(
  source: Source,
  sceneFiles: SceneFile[],
  canon: BundleCanon,
  audioNames: ReadonlySet<string> = new Set(),
  catalog: ImageCatalog = { versions: [], files: {} },
): Bundle {
  // 사람이 승인한 장소만 앱에 나간다. 검수 전 초안은 지도에 올리지 않는다.
  const places = canon.places.filter((place) => place.status === 'approved')
  const placeIds = new Set(places.map((place) => place.id))
  // 인물과 시대도 승인된 것만 나간다.
  const characters = canon.characters.filter((character) => character.status === 'approved')
  const characterIds = new Set(characters.map((character) => character.id))
  const eras = canon.eras.filter((era) => era.status === 'approved')

  const seenChapters = new Set<number>()
  for (const file of sceneFiles) {
    if (seenChapters.has(file.chapter)) throw new Error(`${file.chapter}장의 장면 파일이 둘 이상입니다`)
    seenChapters.add(file.chapter)
    if (!source.chapters.some((sourceChapter) => sourceChapter.chapter === file.chapter)) {
      throw new Error(`${file.chapter}장은 본문에 없습니다`)
    }
  }

  const chapters = source.chapters.map((sourceChapter) => {
    const { chapter } = sourceChapter
    // 본문은 원본 그대로 두고, 음성 파일이 있는 절에만 경로를 붙인다.
    const verses = sourceChapter.verses.map((verse) => {
      const name = audioName(chapter, verse.verse)
      return { ...verse, audio: audioNames.has(name) ? `content/audio/${name}` : null }
    })
    const sceneFile = sceneFiles.find((file) => file.chapter === chapter)
    if (!sceneFile) return { chapter, verses, scenes: [fallbackScene(chapter, verses.length, catalog)] }

    checkSceneIds(sceneFile)

    const problems = findCoverageProblems(sceneFile.scenes, verses.length)
    if (problems.length > 0) {
      throw new Error(`${chapter}장 장면의 절 범위가 맞지 않습니다:\n${problems.join('\n')}`)
    }
    for (const scene of sceneFile.scenes) {
      if (scene.placeId && !placeIds.has(scene.placeId)) {
        throw new Error(`${scene.id}: 장소 ${scene.placeId}가 places.json의 승인된 항목에 없습니다`)
      }
      checkGlossary(scene, chapter, sourceChapter.verses)
    }
    return { chapter, verses, scenes: sceneFile.scenes.map((scene) => toBundleScene(scene, catalog, characterIds)) }
  })

  return {
    schemaVersion: BUNDLE_SCHEMA_VERSION,
    book: source.book,
    translation: source.translation,
    places: places.map(toBundlePlace),
    characters: characters.map((character) => toBundleCharacter(character, characterIds)),
    eras: eras.map(toBundleEra),
    imageVersions: catalog.versions,
    // 가장 나중에 추가한 버전을 기본으로 보여 준다.
    defaultImageVersion: catalog.versions.at(-1)?.id ?? null,
    chapters,
  }
}

// 앱은 지도에 쓸 것만 받는다. '확실'이 아닌 위치는 추정으로 표시한다.
function toBundlePlace(place: Place): BundlePlace {
  return {
    id: place.id,
    name: place.name,
    description: place.facts.description,
    estimated: place.location.certainty !== '확실',
    lat: place.location.lat,
    lng: place.location.lng,
  }
}

// 인물 카드와 연표에 쓸 사실만 옮긴다. 묶음에 없는 인물을 가리키는 관계는 뺀다.
function toBundleCharacter(character: Character, characterIds: ReadonlySet<string>): BundleCharacter {
  const { facts } = character
  return {
    id: character.id,
    name: character.name,
    aliases: character.aliases,
    gender: facts.gender,
    firstAppearance: facts.firstAppearance,
    years: facts.years,
    relations: facts.relations.filter((relation) => characterIds.has(relation.to)),
    attire: facts.attire,
    notes: facts.notes,
    sources: facts.sources,
  }
}

function toBundleEra(era: Era): BundleEra {
  return {
    id: era.id,
    name: era.name,
    range: era.range,
    years: era.years,
    description: era.facts.description,
    present: era.facts.present,
    absent: era.facts.absent,
  }
}

function fallbackScene(chapter: number, verseCount: number, catalog: ImageCatalog): BundleScene {
  const id = `genesis-${String(chapter).padStart(2, '0')}-00`
  return {
    id,
    verseStart: 1,
    verseEnd: verseCount,
    title: `창세기 ${chapter}장`,
    commentary: null,
    explanation: [],
    history: [],
    glossary: [],
    placeId: null,
    characters: [],
    images: imagesFor(id, catalog),
    reviewStatus: 'none',
  }
}

// 버전마다 파일 이름(확장자 제외)이 장면 id와 같은 그림을 찾는다.
function imagesFor(sceneId: string, catalog: ImageCatalog): Record<string, string> {
  const images: Record<string, string> = {}
  for (const version of catalog.versions) {
    const file = (catalog.files[version.id] ?? []).find((name) => name.slice(0, name.lastIndexOf('.')) === sceneId)
    if (file) images[version.id] = `content/images/${version.id}/${file}`
  }
  return images
}

// 장면의 인물은 묶음에 있는 인물만 남긴다. 승인 전 인물은 오류 없이 조용히 뺀다.
function toBundleScene(scene: Scene, catalog: ImageCatalog, characterIds: ReadonlySet<string>): BundleScene {
  return {
    id: scene.id,
    verseStart: scene.verseStart,
    verseEnd: scene.verseEnd,
    title: scene.title,
    commentary: scene.commentary,
    explanation: scene.explanation,
    history: scene.history,
    glossary: scene.glossary,
    placeId: scene.placeId,
    characters: scene.visual.characters.filter((id) => characterIds.has(id)),
    images: imagesFor(scene.id, catalog),
    reviewStatus: scene.review.status,
  }
}

// 풀이한 낱말은 그 절 본문에 글자 그대로 있어야 한다. 앱이 본문에서 그 낱말을 찾아 표시하기 때문이다.
function checkGlossary(scene: Scene, chapter: number, verses: Verse[]): void {
  for (const gloss of scene.glossary) {
    if (gloss.verse < scene.verseStart || gloss.verse > scene.verseEnd) {
      throw new Error(`${scene.id}: 낱말 '${gloss.word}'의 절(${gloss.verse})이 장면 범위 밖입니다`)
    }
    const text = verses.find((verse) => verse.verse === gloss.verse)?.text ?? ''
    if (!text.includes(gloss.word)) {
      throw new Error(`${scene.id}: 낱말 '${gloss.word}'이 ${chapter}:${gloss.verse} 본문에 없습니다`)
    }
  }
}

function checkSceneIds(file: SceneFile): void {
  file.scenes.forEach((scene, index) => {
    if (scene.chapter !== file.chapter) {
      throw new Error(`${scene.id}: chapter가 ${scene.chapter}인데 ${file.chapter}장 파일에 들어 있습니다`)
    }
    const expectedId = `genesis-${String(file.chapter).padStart(2, '0')}-${String(index + 1).padStart(2, '0')}`
    if (scene.id !== expectedId) throw new Error(`${scene.id}: id가 ${expectedId}여야 합니다`)
  })
}
