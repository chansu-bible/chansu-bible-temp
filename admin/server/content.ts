import { existsSync } from 'node:fs'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { paths, readSceneFile as readPipelineSceneFile, SourceSchema, type SceneFile, type Source } from 'pipeline'

function relativeName(file: string): string {
  return path.relative(paths.repoRoot, file).split(path.sep).join('/')
}

async function readJson<T>(file: string, parse: (value: unknown) => T): Promise<T> {
  try {
    return parse(JSON.parse(await readFile(file, 'utf8')))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`${relativeName(file)}을 읽지 못했습니다: ${message}`)
  }
}

// 본문. 아직 source 단계를 돌리지 않았으면 장이 없는 본문을 돌려준다.
export async function readSource(file: string = paths.sourceFile): Promise<Source> {
  if (!existsSync(file)) return { book: '창세기', translation: '개역한글', chapters: [] }
  return readJson(file, (value) => SourceSchema.parse(value))
}

// 장면 파일 하나. 없으면 null. 스키마·장 번호·id 중복을 검증한다.
export async function readSceneFile(chapter: number, dir: string = paths.scenesDir): Promise<SceneFile | null> {
  return readPipelineSceneFile(chapter, dir)
}

// 본문에 있는 장의 장면 파일들. 없는 장은 건너뛴다.
export async function readSceneFiles(source: Source, dir: string = paths.scenesDir): Promise<SceneFile[]> {
  const files = await Promise.all(source.chapters.map((chapter) => readSceneFile(chapter.chapter, dir)))
  return files.filter((file): file is SceneFile => file !== null)
}

export async function readAudioNames(): Promise<Set<string>> {
  return existsSync(paths.audioDir) ? new Set(await readdir(paths.audioDir)) : new Set<string>()
}
