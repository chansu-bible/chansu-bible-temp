import { existsSync } from 'node:fs'
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
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
import { BundleSchema, LexiconFileSchema, type Bundle, type SceneFile } from '../schema.ts'
import { readStyle } from '../images/style.ts'
import { readCanon } from '../canon/files.ts'
import { readImageCatalog, versionDir } from '../images/versions.ts'
import { readOriginal } from '../original/files.ts'
import { readQuizFiles } from '../quiz/files.ts'
import { readSceneFiles } from '../scenes/files.ts'
import { readSource } from '../source/files.ts'
import { readAudioCatalog } from '../tts/audioCatalog.ts'
import { buildBundle, type ImageCatalog } from './buildBundle.ts'
import { joinSceneAudio } from './sceneAudio.ts'
import { buildSources } from './sources.ts'

// 묶음을 만들며 읽고 쓰는 폴더와 파일. 이름은 paths.ts의 경로와 같고, 비운 것은 그 경로(저장소의 content)다.
// 읽기 함수가 받는 이름은 다를 수 있다(imageVersionsFile은 readImageCatalog에 file로 넘긴다).
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
  // 묶음을 쓰는 폴더. 모든 책의 묶음을 검증하고 장면 낭독을 이어 본 뒤에만 비우고 다시 쓴다.
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

// 장면 파일의 image는 지금 만들고 있는 버전(목록의 마지막) 폴더 안의 파일 이름이다.
// 오류 글에는 그 폴더를 imagesDir에서 찾은 경로로 적는다.
function checkImages(sceneFiles: SceneFile[], catalog: ImageCatalog, imagesDir: string): void {
  const active = catalog.versions.at(-1)
  const names = new Set(active ? catalog.files[active.id] : [])
  const folder = displayPath(active ? versionDir(active, imagesDir) : imagesDir)
  for (const file of sceneFiles) {
    for (const scene of file.scenes) {
      if (scene.image && !names.has(scene.image)) {
        throw new Error(`${scene.id}: 그림 파일 ${scene.image}이 ${folder}에 없습니다`)
      }
    }
  }
}

// 장면 낭독으로 쓸 파일: 쓸 곳(앱 콘텐츠 폴더 안)과 이어 붙인 내용
type SceneAudio = { target: string; bytes: Uint8Array }

// 묶음의 장면 낭독을 모두 이어 둔다(이어 붙이는 일은 sceneAudio.ts의 joinSceneAudio가 한다).
// 앱 콘텐츠 폴더를 비우기 전에 잇지 못하는 절 낭독이 드러나야 하므로 미리 이어 두고, 쓸 파일을 돌려준다.
// 낭독 전부를 메모리에 두며 지금은 30MB쯤이다. 크게 늘면 여기서는 이어 보기만 하고 쓸 때 다시 잇는 쪽으로 바꾼다.
async function joinBundleAudio(bundle: Bundle, audioDir: string, appContentDir: string): Promise<SceneAudio[]> {
  const joined: SceneAudio[] = []
  for (const chapter of bundle.chapters) {
    for (const scene of chapter.scenes) {
      if (!scene.audio) continue
      const bytes = await joinSceneAudio(scene, chapter.verses, audioDir)
      joined.push({ target: path.join(appContentDir, 'audio', 'scenes', `${scene.id}.mp3`), bytes })
    }
  }
  return joined
}

// 책마다 앱 묶음(app/public/content/<책 id>.json)과 장면 낭독을 쓴다.
// 모든 책의 묶음을 검증하고 장면 낭독을 이어 본 뒤에야 앱 콘텐츠 폴더를 한 번만 비운다. 검증에 걸리면 폴더는 그대로다.
// 그림·낭독도 한 번만 복사한다(책마다 비우면 마지막 책만 남는다).
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
    checkImages(sceneFiles, catalog, imagesDir)
    built.push({ book, bundle })
  }
  // 값싼 검증이 모두 끝난 뒤에 장면 낭독을 이어 본다(파일을 많이 읽는다).
  const sceneAudios: SceneAudio[] = []
  for (const { bundle } of built) sceneAudios.push(...(await joinBundleAudio(bundle, audioDir, appContentDir)))

  // 여기서부터는 쓰기만 한다.
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
      // 숨김 파일, 버전 목록 파일, 끊긴 작업이 남긴 임시 파일(<파일>.tmp)은 앱에 필요 없다.
      filter: (src) => {
        const name = path.basename(src)
        return src === from || !(name.startsWith('.') || name === 'versions.json' || name.endsWith('.tmp'))
      },
    })
  }
  for (const { target, bytes } of sceneAudios) {
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, bytes)
  }
  return built.map(({ bundle }) => bundle)
}
