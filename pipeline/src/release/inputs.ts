import { existsSync } from 'node:fs'
import { getBook, hasChapter, type BookId } from 'reader-core'
import { readCanon } from '../canon/files.ts'
import type { ImageCatalog } from '../build/buildBundle.ts'
import type { BundleDirs } from '../build/writeBundle.ts'
import { readStyle } from '../images/style.ts'
import { assertUniqueImageStems, readImageCatalog } from '../images/versions.ts'
import { readLexicon, readOriginal } from '../original/files.ts'
import {
  audioDir as defaultAudioDir,
  imageVersionsFile as defaultImageVersionsFile,
  imagesDir as defaultImagesDir,
  lexiconFile as defaultLexiconFile,
  originalDir as defaultOriginalDir,
  originalFilePath,
  quizDir as defaultQuizDir,
  scenesDir as defaultScenesDir,
  sourceDir as defaultSourceDir,
  storyBibleDir as defaultStoryBibleDir,
  styleFile as defaultStyleFile,
} from '../paths.ts'
import { listQuizChapters, readQuizFile } from '../quiz/files.ts'
import type { Canon, LexiconFile, OriginalFile, QuizFile, SceneFile, Source, SourceChapter, Style } from '../schema.ts'
import { listSceneChapters, readSceneFile } from '../scenes/files.ts'
import { listSourceBooks, readSource } from '../source/files.ts'
import { readAudioCatalog } from '../tts/audioCatalog.ts'

// 읽는 폴더와 파일. 이름과 뜻은 묶음을 만들 때의 BundleDirs와 같고(묶음을 쓰는 appContentDir만 없다), 비우면 저장소의 content다.
// 하나만 바꾸면 나머지는 저장소 것을 그대로 읽으므로, 시험은 모두 임시 폴더로 바꿔 준다.
export type ReleaseInputsOptions = Omit<BundleDirs, 'appContentDir'>

// 책 하나의 콘텐츠
export type BookInputs = {
  source: Source
  // 장면 파일들(장 번호 오름차순)
  sceneFiles: SceneFile[]
  // 퀴즈 파일들(장 번호 오름차순)
  quizzes: QuizFile[]
  // 책의 원어 파일. 원어 자료가 없는 책은 null
  original: OriginalFile | null
}

// 점검과 꾸러미를 만드는 데 쓰는 콘텐츠. 한 번 읽어 두고 읽기만 한다.
// 같은 콘텐츠는 어느 컴퓨터에서 읽어도 같은 값이 된다. 폴더 목록은 이름순이고, 책과 장은 성경 순서와 장 번호 순서다.
export type ReleaseInputs = {
  // 본문이 있는 책(성경 순서)
  books: BookId[]
  // 책 id → 그 책의 콘텐츠. books의 책마다 하나 있다.
  byBook: ReadonlyMap<BookId, BookInputs>
  // 설정집 전체. 승인 전 항목도 든다(승인된 것만 거르는 일은 묶음과 꾸러미를 만들 때 한다).
  canon: Canon
  // 그림 버전 목록과, 버전마다 그 폴더의 그림 파일 이름(이름순). 한 버전 폴더에 한 장면의 그림이 둘 이상이면 읽을 때 오류를 낸다.
  catalog: ImageCatalog
  // 낭독 파일 이름(이름순) → 재생 길이(ms). 길이를 잴 수 없는 파일은 null이다.
  audio: ReadonlyMap<string, number | null>
  // 모든 책이 함께 쓰는 원어 사전. 파일이 없으면 null
  lexicon: LexiconFile | null
  // 화풍. 파일이 없으면 null(공개 목록의 자료 출처에 쓴다)
  style: Style | null
  // 그림과 낭독 파일이 있는 폴더. 꾸러미를 만들 때 파일 내용을 여기서 읽는다.
  imagesDir: string
  audioDir: string
}

// 그 책의 장면 파일(content/scenes/genesis-NN.json)을 모두 읽는다. 장 번호 오름차순이다.
async function readSceneFiles(book: BookId, dir: string): Promise<SceneFile[]> {
  const files = await Promise.all((await listSceneChapters(book, dir)).map((chapter) => readSceneFile(book, chapter, dir)))
  return files.filter((file): file is SceneFile => file !== null)
}

// 그 책의 퀴즈 파일(content/quiz/genesis-NN.json)을 모두 읽는다. 장 번호 오름차순이다.
async function readQuizFiles(book: BookId, dir: string): Promise<QuizFile[]> {
  const files = await Promise.all((await listQuizChapters(book, dir)).map((chapter) => readQuizFile(book, chapter, dir)))
  return files.filter((file): file is QuizFile => file !== null)
}

async function readBookInputs(
  book: BookId,
  { sourceDir, scenesDir, quizDir, originalDir }: Required<Pick<ReleaseInputsOptions, 'sourceDir' | 'scenesDir' | 'quizDir' | 'originalDir'>>,
): Promise<BookInputs> {
  const source = await readSource(book, sourceDir)
  const [sceneFiles, quizzes, original] = await Promise.all([
    readSceneFiles(book, scenesDir),
    readQuizFiles(book, quizDir),
    existsSync(originalFilePath(book, originalDir)) ? readOriginal(book, originalDir) : null,
  ])
  return { source, sceneFiles, quizzes, original }
}

// 점검과 꾸러미에 쓰는 콘텐츠(본문이 있는 책의 본문·장면·퀴즈·원어, 설정집, 그림 목록, 낭독 길이, 사전, 화풍)를 한 번 읽는다.
// 폴더는 모두 options로 바꿀 수 있다. 비우면 저장소의 content다.
// 파일이 없으면 던지지 않고 빈 값(없는 책은 목록에서 빠지고, 사전·화풍은 null)으로 둔다. 있는데 틀린 파일은 파일 이름을 밝혀 던진다.
export async function readReleaseInputs(options: ReleaseInputsOptions = {}): Promise<ReleaseInputs> {
  const {
    sourceDir = defaultSourceDir,
    scenesDir = defaultScenesDir,
    quizDir = defaultQuizDir,
    originalDir = defaultOriginalDir,
    lexiconFile = defaultLexiconFile,
    storyBibleDir = defaultStoryBibleDir,
    styleFile = defaultStyleFile,
    imagesDir = defaultImagesDir,
    imageVersionsFile = defaultImageVersionsFile,
    audioDir = defaultAudioDir,
  } = options
  const books = await listSourceBooks(sourceDir)
  const canon = await readCanon(storyBibleDir, { sourceDir })
  const audio = await readAudioCatalog(audioDir)
  const catalog = await readImageCatalog({ file: imageVersionsFile, imagesDir })
  assertUniqueImageStems(catalog, imagesDir)
  const lexicon = existsSync(lexiconFile) ? await readLexicon(lexiconFile) : null
  const style = existsSync(styleFile) ? await readStyle(styleFile, { requireFiles: false }) : null

  const byBook = new Map<BookId, BookInputs>()
  for (const book of books) byBook.set(book, await readBookInputs(book, { sourceDir, scenesDir, quizDir, originalDir }))
  return { books, byBook, canon, catalog, audio, lexicon, style, imagesDir, audioDir }
}

// 한 장의 콘텐츠
export type ChapterInputs = {
  // 본문의 그 장
  source: SourceChapter
  // 그 장의 장면 파일. 없으면 null
  sceneFile: SceneFile | null
  // 그 장의 퀴즈 파일. 없으면 null
  quiz: QuizFile | null
  // 그 장의 원어. 원어 자료가 없으면 null
  original: OriginalFile['chapters'][number] | null
}

// 그 장의 콘텐츠를 모은다. 본문에 그 책이나 그 장이 없으면 null이다.
export function findChapterInputs(inputs: ReleaseInputs, book: BookId, chapter: number): ChapterInputs | null {
  const content = inputs.byBook.get(book)
  const source = content?.source.chapters.find((item) => item.chapter === chapter)
  if (!content || !source) return null
  return {
    source,
    sceneFile: content.sceneFiles.find((file) => file.chapter === chapter) ?? null,
    quiz: content.quizzes.find((file) => file.chapter === chapter) ?? null,
    original: content.original?.chapters.find((item) => item.chapter === chapter) ?? null,
  }
}

// findChapterInputs와 같지만, 본문에 그 장이 없으면 무엇을 해야 하는지 알리는 오류를 던진다.
export function chapterInputsOf(inputs: ReleaseInputs, book: BookId, chapter: number): ChapterInputs {
  const { name } = getBook(book)
  if (!hasChapter(book, chapter)) throw new Error(`${name}에는 ${chapter}장이 없습니다`)
  const found = findChapterInputs(inputs, book, chapter)
  if (found) return found
  if (!inputs.byBook.has(book)) throw new Error(`${name} 본문이 없습니다. 먼저 source --book ${book}를 실행하세요.`)
  throw new Error(`${name} 본문에 ${chapter}장이 없습니다. 먼저 source --book ${book}를 실행하세요.`)
}
