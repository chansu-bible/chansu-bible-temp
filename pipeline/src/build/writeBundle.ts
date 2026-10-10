import { existsSync } from 'node:fs'
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { BookId } from 'reader-core'
import {
  appContentDir as defaultAppContentDir,
  audioDir as defaultAudioDir,
  displayPath,
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
import { BundleSchema, LexiconFileSchema, type Bundle, type QuizFile, type SceneFile } from '../schema.ts'
import { readStyle } from '../images/style.ts'
import { readCanon } from '../canon/files.ts'
import { readImageCatalog } from '../images/versions.ts'
import { readOriginal } from '../original/files.ts'
import { listQuizChapters, readQuizFile } from '../quiz/files.ts'
import { listSceneChapters, readSceneFile } from '../scenes/files.ts'
import { readSource } from '../source/files.ts'
import { joinMp3, mp3DurationMs } from '../tts/mp3.ts'
import { buildBundle, sceneAudioParts, type ImageCatalog } from './buildBundle.ts'
import { buildSources } from './sources.ts'

// 묶음을 만들며 읽고 쓰는 폴더와 파일. 이름은 각 읽기 함수가 받는 옵션과 같고, 비운 것은 저장소의 경로(paths.ts)다.
// 하나만 바꾸면 나머지는 저장소 것을 그대로 읽고 쓰므로, 시험은 모두 임시 폴더로 바꿔 준다.
export type BundleDirs = {
  // 본문. 설정집 인용을 검증할 절 수도 여기서 센다.
  sourceDir?: string
  scenesDir?: string
  quizDir?: string
  // 책마다 원어 파일(<책 id>.json)이 있는 폴더와, 모든 책이 함께 쓰는 사전 파일
  originalDir?: string
  lexiconFile?: string
  // 설정집 폴더와 화풍 파일
  storyBibleDir?: string
  styleFile?: string
  // 그림 폴더(버전 폴더가 들어 있다)와 버전 목록 파일
  imagesDir?: string
  imageVersionsFile?: string
  audioDir?: string
  // 묶음을 쓰는 폴더. 모든 책의 묶음을 검증한 뒤 비우고 다시 쓴다.
  appContentDir?: string
}

async function readJson<T>(file: string, parse: (value: unknown) => T): Promise<T> {
  try {
    return parse(JSON.parse(await readFile(file, 'utf8')))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`${displayPath(file)}: ${message}`)
  }
}

// 그 책의 장면 파일(content/scenes/genesis-NN.json)을 모두 읽는다.
async function readSceneFiles(book: BookId, dir: string): Promise<SceneFile[]> {
  const files = await Promise.all((await listSceneChapters(book, dir)).map((chapter) => readSceneFile(book, chapter, dir)))
  return files.filter((file): file is SceneFile => file !== null)
}

// 장면 파일의 image는 지금 만들고 있는 버전(목록의 마지막) 폴더 안의 파일 이름이다.
function checkImages(sceneFiles: SceneFile[], catalog: ImageCatalog): void {
  const active = catalog.versions.at(-1)
  const names = new Set(active ? catalog.files[active.id] : [])
  for (const file of sceneFiles) {
    for (const scene of file.scenes) {
      if (scene.image && !names.has(scene.image)) {
        throw new Error(`${scene.id}: 그림 파일 ${scene.image}이 content/images/${active?.id ?? ''}에 없습니다`)
      }
    }
  }
}

// 낭독 파일마다 재생 길이를 잰다. 홈 화면의 "낭독으로 들으면 N분" 안내에 쓴다.
async function readAudioCatalog(dir: string): Promise<Map<string, number | null>> {
  if (!existsSync(dir)) return new Map()
  const names = (await readdir(dir)).filter((name) => name.endsWith('.mp3'))
  const entries = await Promise.all(
    names.map(async (name) => [name, mp3DurationMs(await readFile(path.join(dir, name)))] as const),
  )
  return new Map(entries)
}

// 그 책의 퀴즈 파일(content/quiz/genesis-NN.json)을 모두 읽는다.
async function readQuizFiles(book: BookId, dir: string): Promise<QuizFile[]> {
  const files = await Promise.all((await listQuizChapters(book, dir)).map((chapter) => readQuizFile(book, chapter, dir)))
  return files.filter((file): file is QuizFile => file !== null)
}

// 책마다 앱 묶음(app/public/content/<책 id>.json)과 장면 낭독을 쓴다.
// 앱 콘텐츠 폴더는 모든 책의 묶음을 검증한 뒤 한 번만 비우고, 그림·낭독도 한 번만 복사한다(책마다 비우면 마지막 책만 남는다).
// dirs로 읽고 쓰는 폴더를 바꿀 수 있다. 비우면 저장소의 content와 app/public/content다.
export async function writeBundles(books: BookId[], dirs: BundleDirs = {}): Promise<Bundle[]> {
  if (books.length === 0) throw new Error('본문이 있는 책이 없습니다. 먼저 source --book <책 id>를 실행하세요.')
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
    appContentDir = defaultAppContentDir,
  } = dirs
  const { characters, places, eras, things } = await readCanon(storyBibleDir, { sourceDir })
  const audio = await readAudioCatalog(audioDir)
  const catalog = await readImageCatalog({ file: imageVersionsFile, imagesDir })
  const lexicon = existsSync(lexiconFile) ? await readJson(lexiconFile, (value) => LexiconFileSchema.parse(value)) : null
  const style = existsSync(styleFile) ? await readStyle(styleFile, { requireFiles: false }) : null

  const built: { book: BookId; bundle: Bundle }[] = []
  for (const book of books) {
    const source = await readSource(book, sourceDir)
    const sceneFiles = await readSceneFiles(book, scenesDir)
    const original = existsSync(originalFilePath(book, originalDir)) ? await readOriginal(book, originalDir) : null
    const quizzes = await readQuizFiles(book, quizDir)
    const bundle = BundleSchema.parse(
      buildBundle(book, source, sceneFiles, { characters, places, eras, things }, audio, catalog, {
        original,
        lexicon,
        quizzes,
        sources: buildSources(book, style),
      }),
    )
    checkImages(sceneFiles, catalog)
    built.push({ book, bundle })
  }

  await rm(appContentDir, { recursive: true, force: true })
  await mkdir(appContentDir, { recursive: true })
  for (const { book, bundle } of built) {
    await writeFile(path.join(appContentDir, `${book}.json`), JSON.stringify(bundle), 'utf8')
  }
  for (const [from, to] of [
    [imagesDir, 'images'],
    [audioDir, 'audio'],
  ]) {
    if (!existsSync(from)) continue
    await cp(from, path.join(appContentDir, to), {
      recursive: true,
      // 숨김 파일과 버전 목록 파일은 앱에 필요 없다.
      filter: (src) => {
        const name = path.basename(src)
        return src === from || !(name.startsWith('.') || name === 'versions.json')
      },
    })
  }
  // 장면 낭독: 절 낭독을 이어 붙인다. 모든 낭독이 같은 고정 비트레이트 MP3라 프레임을 잇기만 하면 된다.
  for (const { bundle } of built) {
    for (const chapter of bundle.chapters) {
      for (const scene of chapter.scenes) {
        if (!scene.audio) continue
        const parts = await Promise.all(
          sceneAudioParts(scene, chapter.verses).map((file) => readFile(path.join(audioDir, path.basename(file)))),
        )
        const target = path.join(appContentDir, 'audio', 'scenes', `${scene.id}.mp3`)
        await mkdir(path.dirname(target), { recursive: true })
        await writeFile(target, joinMp3(parts))
      }
    }
  }
  return built.map(({ bundle }) => bundle)
}
