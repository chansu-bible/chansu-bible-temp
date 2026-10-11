import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { isBookId, isMediaExt, mediaPath, PUBLISH_SCHEMA_VERSION, type BookId, type ChapterPack, type MediaExt } from 'reader-core'
import { z } from 'zod'
import { bookCanonOf, buildChapter, chapterContextOf, type BundleChapter, type ChapterContext } from '../build/buildBundle.ts'
import { joinSceneAudio } from '../build/sceneAudio.ts'
import { sceneImageStem, versionDir } from '../images/versions.ts'
import { displayPath } from '../paths.ts'
import { BundleOriginalVerseSchema, BundleQuizQuestionSchema, BundleSceneSchema, BundleVerseSchema, type BundleScene } from '../schema.ts'
import { contentHash, jsonBytes } from './hash.ts'
import { chapterInputsOf, type BookInputs, type ReleaseInputs } from './inputs.ts'
import type { ReleaseParts } from './releases.ts'

// 꾸러미가 가리키는 미디어 파일 하나. to는 콘텐츠 뿌리 기준 media/ 경로(이름에 내용 해시가 든다)이고 size는 바이트 수다.
// 그림은 원본 파일(from)을 그대로 쓰고, 장면 낭독은 절 낭독을 이은 바이트(bytes)를 쓴다.
// from은 이 컴퓨터의 그림 폴더 안 경로라 파일을 읽는 데만 쓴다. 꾸러미 바이트나 해시에는 넣지 않는다.
export type PackMedia = { to: string; size: number } & ({ from: string } | { bytes: Buffer })

// 메모리에서 만든 장 꾸러미. bytes는 파일로 쓸 바이트(jsonBytes)이고, hash는 그 바이트의 해시다(packPath의 해시, 공개 상태 파일의 hash).
// parts는 부분 해시다. media는 꾸러미가 가리키는 미디어 파일로, 장면 차례이고 장면 안에서는 그림(버전 차례) 다음 낭독이며 같은 경로는 한 번만 든다.
export type BuiltPack = { pack: ChapterPack; bytes: Buffer; hash: string; parts: ReleaseParts; media: PackMedia[] }

// 꾸러미 모양. 장은 묶음의 장과 같은 스키마(schema.ts의 Bundle…Schema)이고 절 낭독만 null이다.
// 꾸러미를 이 스키마로 한 번 걸러 키 차례를 스키마 차례로 맞춘다. 꾸러미 해시는 JSON 바이트로 정하므로,
// 장을 만드는 코드(buildChapter)의 키 차례가 바뀌어도 바이트는 그대로다. 묶음 파일도 BundleSchema로 걸러 쓰니 장의 키 차례가 묶음과 같다.
// 거른 값은 새 객체와 배열이라, 꾸러미가 장면 파일의 배열(해설, 역사 배경, 낱말 풀이)을 함께 쓰지 않는다.
const ChapterPackSchema = z.object({
  schemaVersion: z.literal(PUBLISH_SCHEMA_VERSION),
  bookId: z.string().refine(isBookId, '알 수 없는 책 id입니다'),
  chapter: z.number().int().positive(),
  verses: z.array(BundleVerseSchema.extend({ audio: z.null() })),
  scenes: z.array(BundleSceneSchema),
  original: z.array(BundleOriginalVerseSchema).nullable(),
  quiz: z.array(BundleQuizQuestionSchema),
})

// 쌓아 둔 장 문맥과, 그 문맥을 만들 때 읽은 입력의 객체들
type CachedContext = {
  context: ChapterContext
  content: BookInputs
  canon: ReleaseInputs['canon']
  catalog: ReleaseInputs['catalog']
  audio: ReleaseInputs['audio']
}

// 같은 콘텐츠(inputs)로 장을 여럿 만들 때 책마다 장 문맥을 한 번만 만든다(설정집을 책에 맞춰 거르는 bookCanonOf가 책마다 한 번이다).
// inputs는 한 번 읽어 두고 읽기만 하는 값(ReleaseInputs)이라, 만든 문맥을 그대로 다시 쓴다.
// 그래도 형 변환으로 같은 inputs 객체의 설정집, 그림 목록, 낭독 목록이나 책의 콘텐츠를 다른 객체로 바꾸면 낡은 문맥이 된다.
// 문맥을 만들 때 읽은 객체를 함께 두고, 다시 쓰기 전에 지금의 객체와 같은지 본다. 다르면 새로 만든다.
const contexts = new WeakMap<ReleaseInputs, Map<BookId, CachedContext>>()

// 책의 장 문맥. 책 묶음(buildBundle)과 같은 만들기라 꾸러미에도 그 책까지 나온 승인된 장소·인물만 들어간다.
// 설정집은 책 전체의 본문으로 거르고(뒤 책에서 끝나는 시대의 끝이 그 본문의 마지막 절이다), 원어와 퀴즈도 책 전체의 파일을 넘긴다(buildChapter가 그 장의 것을 찾는다).
function bookContext(inputs: ReleaseInputs, book: BookId): ChapterContext {
  let books = contexts.get(inputs)
  if (!books) {
    books = new Map()
    contexts.set(inputs, books)
  }
  // buildPack이 chapterInputsOf로 본문이 있는 책인지 먼저 봤다.
  const content = inputs.byBook.get(book)!
  const { canon, catalog, audio } = inputs
  const cached = books.get(book)
  if (cached && cached.content === content && cached.canon === canon && cached.catalog === catalog && cached.audio === audio) {
    return cached.context
  }
  const { source, original, quizzes } = content
  const context = chapterContextOf(bookCanonOf(book, source, canon), audio, catalog, { original, quizzes })
  books.set(book, { context, content, canon, catalog, audio })
  return context
}

// 장 꾸러미를 메모리에서 만든다. 파일은 쓰지 않는다(publish 단계가 쓴다).
// - 장 모양은 책 묶음과 같은 buildChapter로 만든다. 장면 검사에 걸리면 책 이름을 밝힌 그 오류를 그대로 던진다.
// - 절 낭독은 null이다(앱은 장면 낭독을 재생한다). 절 낭독 길이(audioMs)는 남긴다.
// - 장면 그림: 공개 꾸러미는 기본 그림 버전(버전 목록의 마지막) 하나, 미리 보기 꾸러미는 모든 버전이다. 파일 바이트의 해시로 media/ 경로를 짓는다.
// - 장면 낭독: 절 낭독을 이은 바이트의 해시로 media/ 경로를 짓는다. 길이는 묶음처럼 절 낭독 길이의 합이다.
// - 미리 보기 꾸러미의 미디어 경로는 preview/ 아래다.
// 시각이나 폴더 목록 순서를 쓰지 않아, 같은 콘텐츠면 어느 컴퓨터에서 만들어도 같은 바이트와 해시가 나온다.
export async function buildPack(inputs: ReleaseInputs, book: BookId, chapter: number, options: { preview: boolean }): Promise<BuiltPack> {
  const { preview } = options
  const { source, sceneFile } = chapterInputsOf(inputs, book, chapter)
  const built = buildChapter(book, source, sceneFile, bookContext(inputs, book))
  const defaultVersion = inputs.catalog.versions.at(-1)?.id
  const media: PackMedia[] = []
  const scenes: BundleScene[] = []
  for (const scene of built.scenes) {
    const images: Record<string, string> = {}
    for (const [version, file] of Object.entries(scene.images)) {
      if (!preview && version !== defaultVersion) continue
      const image = await imageMedia(inputs.imagesDir, scene.id, version, file, preview)
      images[version] = image.to
      media.push(image)
    }
    // 장면 낭독은 절 낭독 경로가 아직 붙어 있는 묶음의 절로 찾는다. 꾸러미의 절 낭독은 아래에서 null로 바꾼다.
    const narration = scene.audio === null ? null : await narrationMedia(inputs.audioDir, scene, built.verses, preview)
    if (narration) media.push(narration)
    // 장면 객체는 장면 파일과 배열을 함께 쓰므로 고치지 않고 새로 만든다.
    scenes.push({ ...scene, images, audio: narration?.to ?? null })
  }
  const pack: ChapterPack = ChapterPackSchema.parse({
    schemaVersion: PUBLISH_SCHEMA_VERSION,
    bookId: book,
    chapter: built.chapter,
    verses: built.verses.map((verse) => ({ ...verse, audio: null })),
    scenes,
    original: built.original,
    quiz: built.quiz,
  })
  const bytes = jsonBytes(pack)
  return { pack, bytes, hash: contentHash(bytes), parts: partsOf(pack), media: uniqueMedia(media) }
}

// 묶음 경로(content/images/<버전>/<파일 이름>)의 그림을 이 컴퓨터의 그림 폴더에서 읽어 미디어를 만든다.
// 묶음 경로를 저장소 경로로 쓰지 않는다(그림 폴더를 바꿔 주면 맞지 않는다). 파일 이름만 떼어 그림 폴더의 그 버전 폴더에서 찾는다.
// 읽지 못하면 어느 장면의 어느 버전 그림인지 밝혀 던진다(장이 많아도 어느 파일 때문인지 바로 보인다).
async function imageMedia(imagesDir: string, sceneId: string, version: string, file: string, preview: boolean): Promise<PackMedia> {
  const name = path.posix.basename(file)
  const ext = sceneImageExt(sceneId, name)
  const from = path.join(versionDir({ id: version }, imagesDir), name)
  let bytes: Buffer
  try {
    bytes = await readFile(from)
  } catch (error) {
    // 시스템 오류 글에는 읽은 경로가 이 컴퓨터의 절대 경로로 들어 있다. 다른 오류 글처럼 displayPath로 보이게 한다.
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`${sceneId}: ${version} 그림을 읽지 못했습니다(${name}): ${message.replaceAll(from, displayPath(from))}`)
  }
  return { from, to: mediaPath(sceneId, contentHash(bytes), ext, preview), size: bytes.length }
}

// 그 장면 그림 파일의 확장자. 묶음의 imagesFor가 sceneImageStem으로 고른 파일이라 늘 맞다. 같은 규칙으로 다시 보며 확장자의 형을 좁힌다.
function sceneImageExt(sceneId: string, name: string): MediaExt {
  const ext = name.slice(name.lastIndexOf('.') + 1)
  if (sceneImageStem(name) !== sceneId || !isMediaExt(ext)) throw new Error(`${sceneId}: 장면 그림 파일이 아닙니다: ${name}`)
  return ext
}

// 장면 낭독 미디어. 원본 파일이 없어 이은 바이트를 들고 있는다.
async function narrationMedia(audioDir: string, scene: BundleScene, verses: BundleChapter['verses'], preview: boolean): Promise<PackMedia> {
  const bytes = await joinSceneAudio(scene, verses, audioDir)
  return { bytes, to: mediaPath(scene.id, contentHash(bytes), 'mp3', preview), size: bytes.length }
}

// 부분 해시. 공개 화면이 다시 공개할 때 무엇이 바뀌었는지(글, 그림, 낭독, 퀴즈, 원어) 보이는 데 쓴다.
// 꾸러미의 값이 모두 어느 한 부분에 드는 것은 아니다. schemaVersion, bookId, chapter는 어느 부분에도 들지 않고(책과 장은 공개 상태 파일의 자리가 가리킨다),
// 절의 audio도 늘 null이라 넣지 않는다. 나머지는 모두 어느 한 부분에 든다.
// 그래서 PUBLISH_SCHEMA_VERSION을 올리면 부분은 하나도 바뀌지 않는데 꾸러미 해시는 바뀐다.
function partsOf(pack: ChapterPack): ReleaseParts {
  const hashOf = (value: unknown) => contentHash(jsonBytes(value))
  return {
    // 절 본문과, 장면에서 그림·낭독을 뺀 모든 것(절 범위, 제목, 해설, 낱말 풀이, 역사 배경, 장소, 인물, 검수 상태)
    text: hashOf({
      verses: pack.verses.map(({ verse, text }) => ({ verse, text })),
      scenes: pack.scenes.map(({ images: _images, audio: _audio, audioMs: _audioMs, ...rest }) => rest),
    }),
    // 장면마다 그림 버전 → media/ 경로
    images: hashOf(pack.scenes.map(({ id, images }) => ({ id, images }))),
    // 절 낭독 길이(앱이 장면 낭독 안의 절 구간을 이 길이로 정한다)와 장면 낭독의 media/ 경로와 길이
    audio: hashOf({
      verses: pack.verses.map(({ verse, audioMs }) => ({ verse, audioMs: audioMs ?? null })),
      scenes: pack.scenes.map(({ id, audio, audioMs }) => ({ id, audio, audioMs })),
    }),
    quiz: hashOf(pack.quiz),
    original: hashOf(pack.original),
  }
}

// 같은 경로(같은 장면, 같은 내용, 같은 확장자)는 한 번만 둔다. 두 그림 버전의 파일 내용이 같으면 생긴다.
function uniqueMedia(media: PackMedia[]): PackMedia[] {
  const seen = new Set<string>()
  return media.filter((item) => {
    if (seen.has(item.to)) return false
    seen.add(item.to)
    return true
  })
}
