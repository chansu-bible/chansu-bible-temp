import { existsSync } from 'node:fs'
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { appContentDir, audioDir, imagesDir, repoRoot, scenesDir, sourceFile } from '../paths.ts'
import { BundleSchema, SceneFileSchema, SourceSchema, type Bundle, type SceneFile } from '../schema.ts'
import { readCanon } from '../canon/files.ts'
import { readImageCatalog } from '../images/versions.ts'
import { joinMp3, mp3DurationMs } from '../tts/mp3.ts'
import { buildBundle, sceneAudioParts, type ImageCatalog } from './buildBundle.ts'

function relativeName(file: string): string {
  return path.relative(repoRoot, file).split(path.sep).join('/')
}

async function readJson<T>(file: string, parse: (value: unknown) => T): Promise<T> {
  try {
    return parse(JSON.parse(await readFile(file, 'utf8')))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`${relativeName(file)}: ${message}`)
  }
}

async function readSceneFiles(): Promise<SceneFile[]> {
  if (!existsSync(scenesDir)) return []
  const names = (await readdir(scenesDir)).filter((name) => name.endsWith('.json')).sort()
  return Promise.all(
    names.map(async (name) => {
      const sceneFile = await readJson(path.join(scenesDir, name), (value) => SceneFileSchema.parse(value))
      const match = name.match(/^genesis-(\d+)\.json$/)
      if (match && Number(match[1]) !== sceneFile.chapter) {
        throw new Error(`${name}: 파일 이름과 chapter(${sceneFile.chapter})가 맞지 않습니다`)
      }
      return sceneFile
    }),
  )
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

export async function writeBundle(): Promise<Bundle> {
  const source = await readJson(sourceFile, (value) => SourceSchema.parse(value))
  const { characters, places, eras, things } = await readCanon()
  const sceneFiles = await readSceneFiles()
  const audio = await readAudioCatalog()
  const catalog = await readImageCatalog()
  const bundle = BundleSchema.parse(buildBundle(source, sceneFiles, { characters, places, eras, things }, audio, catalog))
  checkImages(sceneFiles, catalog)

  await rm(appContentDir, { recursive: true, force: true })
  await mkdir(appContentDir, { recursive: true })
  await writeFile(path.join(appContentDir, 'genesis.json'), JSON.stringify(bundle), 'utf8')
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
  return bundle
}
