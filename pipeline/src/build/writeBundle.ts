import { existsSync } from 'node:fs'
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { BookId } from 'reader-core'
import { appContentDir, audioDir, displayPath, imagesDir, lexiconFile, originalFilePath, styleFile } from '../paths.ts'
import { BundleSchema, LexiconFileSchema, OriginalFileSchema, type Bundle, type QuizFile, type SceneFile } from '../schema.ts'
import { readStyle } from '../images/style.ts'
import { readCanon } from '../canon/files.ts'
import { readImageCatalog } from '../images/versions.ts'
import { listQuizChapters, readQuizFile } from '../quiz/files.ts'
import { listSceneChapters, readSceneFile } from '../scenes/files.ts'
import { readSource } from '../source/files.ts'
import { joinMp3, mp3DurationMs } from '../tts/mp3.ts'
import { buildBundle, sceneAudioParts, type ImageCatalog } from './buildBundle.ts'
import { buildSources } from './sources.ts'

async function readJson<T>(file: string, parse: (value: unknown) => T): Promise<T> {
  try {
    return parse(JSON.parse(await readFile(file, 'utf8')))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`${displayPath(file)}: ${message}`)
  }
}

// 그 책의 장면 파일(content/scenes/genesis-NN.json)을 모두 읽는다.
async function readSceneFiles(book: BookId): Promise<SceneFile[]> {
  const files = await Promise.all((await listSceneChapters(book)).map((chapter) => readSceneFile(book, chapter)))
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
async function readAudioCatalog(): Promise<Map<string, number | null>> {
  if (!existsSync(audioDir)) return new Map()
  const names = (await readdir(audioDir)).filter((name) => name.endsWith('.mp3'))
  const entries = await Promise.all(
    names.map(async (name) => [name, mp3DurationMs(await readFile(path.join(audioDir, name)))] as const),
  )
  return new Map(entries)
}

// 그 책의 퀴즈 파일(content/quiz/genesis-NN.json)을 모두 읽는다.
async function readQuizFiles(book: BookId): Promise<QuizFile[]> {
  const files = await Promise.all((await listQuizChapters(book)).map((chapter) => readQuizFile(book, chapter)))
  return files.filter((file): file is QuizFile => file !== null)
}

// 책마다 앱 묶음(app/public/content/<책 id>.json)과 장면 낭독을 쓴다.
// 앱 콘텐츠 폴더는 모든 책의 묶음을 검증한 뒤 한 번만 비우고, 그림·낭독도 한 번만 복사한다(책마다 비우면 마지막 책만 남는다).
export async function writeBundles(books: BookId[]): Promise<Bundle[]> {
  if (books.length === 0) throw new Error('본문이 있는 책이 없습니다. 먼저 source --book <책 id>를 실행하세요.')
  const { characters, places, eras, things } = await readCanon()
  const audio = await readAudioCatalog()
  const catalog = await readImageCatalog()
  const lexicon = existsSync(lexiconFile) ? await readJson(lexiconFile, (value) => LexiconFileSchema.parse(value)) : null
  const style = existsSync(styleFile) ? await readStyle(styleFile, { requireFiles: false }) : null

  const built: { book: BookId; bundle: Bundle }[] = []
  for (const book of books) {
    const source = await readSource(book)
    const sceneFiles = await readSceneFiles(book)
    const originalFile = originalFilePath(book)
    const original = existsSync(originalFile) ? await readJson(originalFile, (value) => OriginalFileSchema.parse(value)) : null
    const quizzes = await readQuizFiles(book)
    const bundle = BundleSchema.parse(
      buildBundle(source, sceneFiles, { characters, places, eras, things }, audio, catalog, {
        original,
        lexicon,
        quizzes,
        sources: buildSources(style),
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
