import { fallbackSceneIdOf, getBook, josa, sceneIdOf, verseAudioName, type BookId } from 'reader-core'
import {
  BUNDLE_SCHEMA_VERSION,
  type Bundle,
  type BundleCharacter,
  type BundleEra,
  type BundleLexiconEntry,
  type BundleOriginalVerse,
  type BundlePlace,
  type BundleQuizQuestion,
  type BundleSource,
  type BundleScene,
  type BundleThing,
  type Character,
  type Era,
  type ImageVersion,
  type LexiconFile,
  type OriginalFile,
  type Place,
  type QuizFile,
  type Scene,
  type SceneFile,
  type Source,
  type Thing,
  type Verse,
} from '../schema.ts'
import { posLabel } from '../original/morph.ts'
import { findCoverageProblems } from '../scenes/coverage.ts'
import { canonForBook } from './canonForBook.ts'

// files: 버전 id → 그 버전 폴더에 있는 그림 파일 이름들
export type ImageCatalog = { versions: ImageVersion[]; files: Record<string, string[]> }

// 묶음에 넣을 설정집(모든 책). 승인 여부는 buildBundle이, 그 책까지 나왔는지와 인용 모양은 canonForBook이 맡는다.
export type BundleCanon = { characters: Character[]; places: Place[]; eras: Era[]; things?: Thing[] }

// 음성 파일 이름 → 재생 길이(ms, 모르면 null). 이름만 아는 Set도 받는다.
export type AudioCatalog = ReadonlyMap<string, number | null> | ReadonlySet<string>

// 원어, 사전, 퀴즈, 자료 출처. 없으면 묶음에서 비운다.
export type BundleExtras = {
  original?: OriginalFile | null
  lexicon?: LexiconFile | null
  quizzes?: QuizFile[]
  sources?: BundleSource[]
}

function audioDurations(audio: AudioCatalog): ReadonlyMap<string, number | null> {
  return audio instanceof Map ? audio : new Map([...(audio as ReadonlySet<string>)].map((name) => [name, null] as const))
}

// 책 하나의 묶음을 만든다. book은 그 책 id이고, 장면 id·음성 파일 이름·대체 장면에 쓴다. 본문은 그 책의 것이어야 한다.
export function buildBundle(
  book: BookId,
  source: Source,
  sceneFiles: SceneFile[],
  canon: BundleCanon,
  audio: AudioCatalog = new Map(),
  catalog: ImageCatalog = { versions: [], files: {} },
  extras: BundleExtras = {},
): Bundle {
  const bookName = getBook(book).name
  if (source.book !== bookName) throw new Error(`본문의 책 이름(${source.book})이 ${josa(bookName, '이가')} 아닙니다`)
  const durations = audioDurations(audio)
  // 사람이 승인한 항목만 앱에 나간다. 검수 전 초안은 지도와 인물 카드에 올리지 않는다.
  // 그 가운데 이 책을 다 읽은 독자가 아는 항목만, 인용을 묶음 모양으로 바꿔 넣는다(canonForBook).
  const approved = <T extends { status: string }>(items: T[]) => items.filter((item) => item.status === 'approved')
  const { places, characters, eras, things } = canonForBook(
    {
      places: approved(canon.places),
      characters: approved(canon.characters),
      eras: approved(canon.eras),
      things: approved(canon.things ?? []),
    },
    book,
    lastVerseOf(source),
  )
  const placeIds = new Set(places.map((place) => place.id))
  const characterIds = new Set(characters.map((character) => character.id))

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
      const name = verseAudioName(book, chapter, verse.verse)
      const has = durations.has(name)
      return { ...verse, audio: has ? `content/audio/${name}` : null, audioMs: has ? (durations.get(name) ?? null) : null }
    })
    const sceneFile = sceneFiles.find((file) => file.chapter === chapter)
    if (!sceneFile) return { chapter, verses, scenes: [withSceneAudio(fallbackScene(book, chapter, verses.length, catalog), verses)] }

    checkSceneIds(book, sceneFile)

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
    return {
      chapter,
      verses,
      scenes: sceneFile.scenes.map((scene) => withSceneAudio(toBundleScene(scene, catalog, characterIds), verses)),
    }
  })

  // 원어 낱말에 한국어 품사 이름을 붙인다.
  const originalOf = (chapter: number): BundleOriginalVerse[] | null => {
    const found = extras.original?.chapters.find((item) => item.chapter === chapter)
    return found
      ? found.verses.map((verse) => ({ verse: verse.verse, words: verse.words.map((word) => ({ ...word, pos: posLabel(word.morph) })) }))
      : null
  }
  // 사람이 승인한 문제만 앱에 나간다.
  const quizOf = (chapter: number): BundleQuizQuestion[] =>
    (extras.quizzes?.find((item) => item.chapter === chapter)?.questions ?? [])
      .filter((question) => question.status === 'approved')
      .map(({ id, question, options, answer, explanation, verse }) => ({ id, question, options, answer, explanation, verse }))
  const withExtras = chapters.map((item) => ({ ...item, original: originalOf(item.chapter), quiz: quizOf(item.chapter) }))

  // 사전은 묶음의 장에 나오는 번호만, 한국어 뜻은 승인된 것만 넣는다.
  // 횟수는 이 묶음의 원어에서 센다(lexicon.json의 count는 모든 책의 합이다).
  const counts = new Map<string, number>()
  for (const item of withExtras) {
    for (const verse of item.original ?? []) {
      for (const word of verse.words) if (word.strong) counts.set(word.strong, (counts.get(word.strong) ?? 0) + 1)
    }
  }
  const lexicon: Record<string, BundleLexiconEntry> = {}
  for (const entry of extras.lexicon?.entries ?? []) {
    const count = counts.get(entry.strong)
    if (count === undefined) continue
    const approved = entry.korean?.status === 'approved' ? entry.korean : null
    lexicon[entry.strong] = {
      lemma: entry.lemma,
      xlit: entry.xlit,
      english: entry.definition,
      korean: approved?.meaning ?? null,
      note: approved && approved.note !== '' ? approved.note : null,
      count,
    }
  }

  return {
    schemaVersion: BUNDLE_SCHEMA_VERSION,
    bookId: book,
    book: source.book,
    translation: source.translation,
    places: places.map(toBundlePlace),
    characters: characters.map(toBundleCharacter),
    eras: eras.map(toBundleEra),
    things: things.map(toBundleThing),
    imageVersions: catalog.versions,
    // 가장 나중에 추가한 버전을 기본으로 보여 준다.
    defaultImageVersion: catalog.versions.at(-1)?.id ?? null,
    lexicon,
    sources: extras.sources ?? [],
    chapters: withExtras,
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

// 본문의 마지막 절("50:26"). 본문에 장이 없으면 null이다.
function lastVerseOf(source: Source): string | null {
  const chapter = source.chapters.at(-1)
  const verse = chapter?.verses.at(-1)
  return chapter && verse ? `${chapter.chapter}:${verse.verse}` : null
}

// 인물 카드와 연표에 쓸 사실만 옮긴다. 관계와 인용은 canonForBook이 이 책 묶음에 맞게 거르고 바꿔 둔 것이다.
function toBundleCharacter(character: Character): BundleCharacter {
  const { facts } = character
  return {
    id: character.id,
    name: character.name,
    aliases: character.aliases,
    gender: facts.gender,
    firstAppearance: facts.firstAppearance,
    years: facts.years,
    relations: facts.relations,
    attire: facts.attire,
    notes: facts.notes,
    sources: facts.sources,
  }
}

function toBundleEra(era: Era): BundleEra {
  return {
    id: era.id,
    name: era.name,
    range: { from: era.range.from, to: era.range.to },
    years: era.years,
    description: era.facts.description,
    present: era.facts.present,
    absent: era.facts.absent,
  }
}

function toBundleThing(thing: Thing): BundleThing {
  return {
    id: thing.id,
    name: thing.name,
    aliases: thing.aliases,
    description: thing.facts.description,
    details: thing.facts.details,
    sources: thing.facts.sources,
  }
}

type SceneWithoutAudio = Omit<BundleScene, 'audio' | 'audioMs'>
type VerseAudio = { verse: number; audio: string | null; audioMs: number | null }

// 장면 낭독에 들어가는 절 낭독 파일(묶음 안 경로)을 차례대로. writeBundle이 이 파일들을 이어 붙인다.
// 앱은 장면마다 이 파일 하나를 재생한다. 화면을 꺼도 절마다 파일을 바꾸지 않아 끊기지 않고, 잠금 화면에는 장면 단위로 보인다.
export function sceneAudioParts(scene: { verseStart: number; verseEnd: number }, verses: VerseAudio[]): string[] {
  return verses.flatMap((verse) =>
    verse.verse >= scene.verseStart && verse.verse <= scene.verseEnd && verse.audio !== null ? [verse.audio] : [],
  )
}

function withSceneAudio(scene: SceneWithoutAudio, verses: VerseAudio[]): BundleScene {
  const parts = verses.filter((verse) => verse.verse >= scene.verseStart && verse.verse <= scene.verseEnd && verse.audio !== null)
  if (parts.length === 0) return { ...scene, audio: null, audioMs: null }
  const known = parts.every((verse) => verse.audioMs !== null)
  return {
    ...scene,
    audio: `content/audio/scenes/${scene.id}.mp3`,
    audioMs: known ? parts.reduce((sum, verse) => sum + (verse.audioMs ?? 0), 0) : null,
  }
}

function fallbackScene(book: BookId, chapter: number, verseCount: number, catalog: ImageCatalog): SceneWithoutAudio {
  const id = fallbackSceneIdOf(book, chapter)
  return {
    id,
    verseStart: 1,
    verseEnd: verseCount,
    title: `${getBook(book).name} ${chapter}장`,
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
function toBundleScene(scene: Scene, catalog: ImageCatalog, characterIds: ReadonlySet<string>): SceneWithoutAudio {
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

function checkSceneIds(book: BookId, file: SceneFile): void {
  file.scenes.forEach((scene, index) => {
    if (scene.chapter !== file.chapter) {
      throw new Error(`${scene.id}: chapter가 ${scene.chapter}인데 ${file.chapter}장 파일에 들어 있습니다`)
    }
    const expectedId = sceneIdOf(book, file.chapter, index + 1)
    if (scene.id !== expectedId) throw new Error(`${scene.id}: id가 ${expectedId}여야 합니다`)
  })
}
