import { bookOrder, fallbackSceneIdOf, formatRef, getBook, josa, sceneIdOf, verseAudioName, type BookId } from 'reader-core'
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
  type SourceChapter,
  type Thing,
  type Verse,
} from '../schema.ts'
import { firstAppearanceOf } from '../canon/citations.ts'
import { sceneImageIndex } from '../images/versions.ts'
import { posLabel } from '../original/morph.ts'
import { findCoverageProblems } from '../scenes/coverage.ts'
import { canonForBook, type BookCanon } from './canonForBook.ts'

// files: 버전 id → 그 버전 폴더에 있는 그림 파일 이름들
// 한 번 읽어 두고 읽기만 하는 값이다. 버전마다 그림 찾는 표(sceneImageIndex)를 이 객체에 매어 쌓아 두므로, 만든 뒤에는 고치지 않는다.
export type ImageCatalog = Readonly<{ versions: readonly ImageVersion[]; files: Readonly<Record<string, readonly string[]>> }>

// 묶음에 넣을 설정집(모든 책). 승인 여부는 bookCanonOf가, 그 책까지 나왔는지와 인용 모양은 canonForBook이 맡는다.
// 읽기 전용 목록도 받는다(꾸러미를 만드는 입력의 설정집이 그렇다).
export type BundleCanon = {
  readonly characters: readonly Character[]
  readonly places: readonly Place[]
  readonly eras: readonly Era[]
  readonly things?: readonly Thing[]
}

// 책 하나의 묶음에 들어가는 설정집. approvedPlaces는 책에 맞추기 전의 승인된 장소 전체다.
export type BookBundleCanon = BookCanon & { approvedPlaces: readonly Place[] }

// 음성 파일 이름 → 재생 길이(ms, 모르면 null). 이름만 아는 Set도 받는다.
export type AudioCatalog = ReadonlyMap<string, number | null> | ReadonlySet<string>

// 원어, 사전, 퀴즈, 자료 출처. 없으면 묶음에서 비운다.
export type BundleExtras = {
  original?: OriginalFile | null
  lexicon?: LexiconFile | null
  quizzes?: readonly QuizFile[]
  sources?: BundleSource[]
}

// 묶음의 장. 책 묶음(buildBundle)과 장 꾸러미가 함께 쓰는 모양이다.
export type BundleChapter = Bundle['chapters'][number]

// buildChapter가 장 하나를 만드는 데 쓰는 것이다. 직접 채우지 말고 chapterContextOf로 만든다.
export type ChapterContext = {
  catalog: ImageCatalog
  // 음성 파일 이름 → 재생 길이(ms, 모르면 null)
  durations: ReadonlyMap<string, number | null>
  // 이 책 묶음에 들어가는 장소와 인물의 id. 승인된 전체가 아니라 canonForBook이 책에 맞춰 거른 것이다.
  placeIds: ReadonlySet<string>
  characterIds: ReadonlySet<string>
  // 승인된 장소 전체. 장면이 가리키는 장소가 묶음에 없을 때 오류 글이 까닭을 밝히는 데만 쓴다.
  approvedPlaces: readonly Place[]
  // 원어 파일(없으면 null)과 퀴즈 파일들. 이 장의 것만 쓴다.
  original: OriginalFile | null
  quizzes: readonly QuizFile[]
}

function audioDurations(audio: AudioCatalog): ReadonlyMap<string, number | null> {
  return audio instanceof Map ? audio : new Map([...(audio as ReadonlySet<string>)].map((name) => [name, null] as const))
}

// 책 하나의 묶음에 넣을 설정집을 만든다. source는 그 책의 본문 전체다(뒤 책에서 끝나는 시대의 끝을 이 본문의 마지막 절로 맞춘다).
// 사람이 승인한 항목만 앱에 나간다. 검수 전 초안은 지도와 인물 카드에 올리지 않는다.
// 그 가운데 이 책을 다 읽은 독자가 아는 항목만, 인용을 묶음 모양으로 바꿔 넣는다(canonForBook). 책마다 한 번만 돌린다.
export function bookCanonOf(book: BookId, source: Source, canon: BundleCanon): BookBundleCanon {
  const approved = <T extends { status: string }>(items: readonly T[]) => items.filter((item) => item.status === 'approved')
  const approvedPlaces = approved(canon.places)
  const bookCanon = canonForBook(
    {
      places: approvedPlaces,
      characters: approved(canon.characters),
      eras: approved(canon.eras),
      things: approved(canon.things ?? []),
    },
    book,
    lastVerseOf(source),
  )
  return { ...bookCanon, approvedPlaces }
}

// 장을 만드는 문맥을 책의 설정집으로 만든다. 책 묶음(buildBundle)과 장 꾸러미가 함께 써서 설정집 거르기를 한 곳에서만 한다.
// 장소·인물 id는 승인된 전체가 아니라 bookCanonOf가 이 책에 맞춰 거른 것이다. 손으로 만들면 뒤 책의 인물과 장소가 샌다.
export function chapterContextOf(
  bookCanon: BookBundleCanon,
  audio: AudioCatalog,
  catalog: ImageCatalog,
  extras: BundleExtras,
): ChapterContext {
  return {
    catalog,
    durations: audioDurations(audio),
    placeIds: new Set(bookCanon.places.map((place) => place.id)),
    characterIds: new Set(bookCanon.characters.map((character) => character.id)),
    approvedPlaces: bookCanon.approvedPlaces,
    original: extras.original ?? null,
    quizzes: extras.quizzes ?? [],
  }
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
  const bookCanon = bookCanonOf(book, source, canon)
  const { places, characters, eras, things } = bookCanon

  // 장 단위 오류에는 책 이름을 붙인다. 책이 여럿이라 장 번호만으로는 어느 책인지 모른다.
  const seenChapters = new Set<number>()
  for (const file of sceneFiles) {
    if (seenChapters.has(file.chapter)) throw new Error(`${bookName} ${file.chapter}장의 장면 파일이 둘 이상입니다`)
    seenChapters.add(file.chapter)
    if (!source.chapters.some((sourceChapter) => sourceChapter.chapter === file.chapter)) {
      throw new Error(`${bookName} ${file.chapter}장은 본문에 없습니다`)
    }
  }

  // 장 문맥도 위에서 거른 설정집으로 만든다(canonForBook은 책마다 한 번이다).
  const ctx = chapterContextOf(bookCanon, audio, catalog, extras)
  const chapters = source.chapters.map((sourceChapter) =>
    buildChapter(book, sourceChapter, sceneFiles.find((file) => file.chapter === sourceChapter.chapter) ?? null, ctx),
  )

  // 사전은 묶음의 장에 나오는 번호만, 한국어 뜻은 승인된 것만 넣는다.
  // 횟수는 이 묶음의 원어에서 센다(lexicon.json의 count는 모든 책의 합이다).
  const counts = new Map<string, number>()
  for (const item of chapters) {
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
    // 카탈로그는 읽기 전용이라 묶음에는 복사해 넣는다.
    imageVersions: [...catalog.versions],
    // 가장 나중에 추가한 버전을 기본으로 보여 준다.
    defaultImageVersion: catalog.versions.at(-1)?.id ?? null,
    lexicon,
    sources: extras.sources ?? [],
    chapters,
  }
}

// 묶음의 장 하나를 만든다. 책 묶음(buildBundle)과 장 꾸러미가 함께 쓴다.
// 절과 절 낭독, 장면과 장면 낭독, 원어, 승인된 퀴즈를 넣는다. sceneFile이 null이면 장 전체를 덮는 대체 장면 하나를 둔다.
// sceneFile은 이 장의 장면 파일이어야 한다. 장 번호, 장면 id, 절 범위, 장소, 낱말 풀이가 맞지 않으면 던진다.
export function buildChapter(
  book: BookId,
  sourceChapter: SourceChapter,
  sceneFile: SceneFile | null,
  ctx: ChapterContext,
): BundleChapter {
  const { chapter } = sourceChapter
  if (sceneFile && sceneFile.chapter !== chapter) {
    throw new Error(`${getBook(book).name} ${chapter}장에 ${sceneFile.chapter}장 장면 파일을 받았습니다`)
  }
  // 본문은 원본 그대로 두고, 음성 파일이 있는 절에만 경로를 붙인다.
  const verses = sourceChapter.verses.map((verse) => {
    const name = verseAudioName(book, chapter, verse.verse)
    const has = ctx.durations.has(name)
    return { ...verse, audio: has ? `content/audio/${name}` : null, audioMs: has ? (ctx.durations.get(name) ?? null) : null }
  })
  const scenes = sceneFile
    ? scenesFromFile(book, sourceChapter, sceneFile, verses, ctx)
    : [withSceneAudio(fallbackScene(book, chapter, verses.length, ctx.catalog), verses)]
  return { chapter, verses, scenes, original: originalOf(ctx.original, chapter), quiz: quizOf(ctx.quizzes, chapter) }
}

// 장면 파일의 장면을 검사하고 묶음 장면으로 옮긴다. verses는 절 낭독을 붙인 절이다.
function scenesFromFile(
  book: BookId,
  sourceChapter: SourceChapter,
  sceneFile: SceneFile,
  verses: VerseAudio[],
  ctx: ChapterContext,
): BundleScene[] {
  const { chapter } = sourceChapter
  checkSceneIds(book, sceneFile)

  const problems = findCoverageProblems(sceneFile.scenes, verses.length)
  if (problems.length > 0) {
    throw new Error(`${getBook(book).name} ${chapter}장 장면의 절 범위가 맞지 않습니다:\n${problems.join('\n')}`)
  }
  for (const scene of sceneFile.scenes) {
    if (scene.placeId && !ctx.placeIds.has(scene.placeId)) {
      throw new Error(missingPlaceMessage(book, scene.id, scene.placeId, ctx.approvedPlaces))
    }
    checkGlossary(scene, chapter, sourceChapter.verses)
  }
  return sceneFile.scenes.map((scene) => withSceneAudio(toBundleScene(scene, ctx.catalog, ctx.characterIds), verses))
}

// 원어 낱말에 한국어 품사 이름을 붙인다. 원어 자료가 없는 장은 null이다.
function originalOf(original: OriginalFile | null, chapter: number): BundleOriginalVerse[] | null {
  const found = original?.chapters.find((item) => item.chapter === chapter)
  return found
    ? found.verses.map((verse) => ({ verse: verse.verse, words: verse.words.map((word) => ({ ...word, pos: posLabel(word.morph) })) }))
    : null
}

// 사람이 승인한 문제만 앱에 나간다.
function quizOf(quizzes: readonly QuizFile[], chapter: number): BundleQuizQuestion[] {
  return (quizzes.find((item) => item.chapter === chapter)?.questions ?? [])
    .filter((question) => question.status === 'approved')
    .map(({ id, question, options, answer, explanation, verse }) => ({ id, question, options, answer, explanation, verse }))
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

// 버전마다 그 장면의 그림(sceneImageStem이 장면 id인 파일)을 찾는다.
// 한 버전에 둘 이상이면 이름순(UTF-16 코드 단위)으로 앞의 것이다. 폴더 목록 순서는 컴퓨터마다 달라서 목록에서 처음 만난 것을 고르지 않는다.
// 장 꾸러미의 해시가 이 고르기에 달려 있다. 공개 콘텐츠를 읽을 때는 assertUniqueImageStems가 둘 이상을 막는다.
// 파일 이름마다 규칙을 대 보지 않고, 카탈로그마다 한 번 만든 표(sceneImageIndex)에서 찾는다. 장면 수 x 파일 수로 늘지 않는다.
function imagesFor(sceneId: string, catalog: ImageCatalog): Record<string, string> {
  const index = sceneImageIndex(catalog)
  const images: Record<string, string> = {}
  for (const version of catalog.versions) {
    const file = index.get(version.id)?.get(sceneId)
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

// 장면이 가리키는 장소가 이 책 묶음에 없을 때의 오류 글. 까닭을 어림하지 않고 확인해서 쓴다.
// 승인된 장소의 처음 나오는 곳이 뒤 책이면 canonForBook이 뺀 것이니(canonForBook의 knownBy가 거르는 조건과 같다) 그렇게 알린다.
// 그 밖에는 설정집에 없거나 승인되지 않은 장소와 같이 승인된 항목에 없다고 알린다.
// placeIds는 늘 책의 설정집(bookCanonOf)에서 만든다. 그래야 승인된 장소가 빠지는 까닭이 뒤 책뿐이라 이 글이 맞다.
// 손으로 만든 placeIds가 승인된 장소를 다른 까닭으로 빼면 두 번째 글이 까닭을 틀리게 알린다.
// 시험에서 직접 불러 까닭마다 글을 본다.
export function missingPlaceMessage(book: BookId, sceneId: string, placeId: string, approvedPlaces: readonly Place[]): string {
  const place = approvedPlaces.find((item) => item.id === placeId)
  const first = place ? firstAppearanceOf('places', place, book) : null
  if (first?.book != null && bookOrder(first.book) > bookOrder(book)) {
    return `${sceneId}: 장소 ${josa(placeId, '은는')} ${formatRef(first, 'name')}에서 처음 나와 ${getBook(book).name} 묶음에 넣을 수 없습니다`
  }
  return `${sceneId}: 장소 ${placeId}가 places.json의 승인된 항목에 없습니다`
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
