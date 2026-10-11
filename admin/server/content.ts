import { existsSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import {
  paths,
  readSceneFile as readPipelineSceneFile,
  readSource as readPipelineSource,
  type SceneFile,
  type Source,
} from 'pipeline'
import { getBook, type BookId } from 'reader-core'

// 책의 본문. 아직 source 단계를 돌리지 않았으면 장이 없는 본문을 돌려준다.
export async function readSource(book: BookId, dir: string = paths.sourceDir): Promise<Source> {
  if (!existsSync(paths.sourceFilePath(book, dir))) return { book: getBook(book).name, translation: '개역한글', chapters: [] }
  return readPipelineSource(book, dir)
}

// 장면 파일 하나. 없으면 null. 스키마·장 번호·id 중복을 검증한다.
export async function readSceneFile(book: BookId, chapter: number, dir: string = paths.scenesDir): Promise<SceneFile | null> {
  return readPipelineSceneFile(book, chapter, dir)
}

// 본문에 있는 장의 장면 파일들. 없는 장은 건너뛴다.
export async function readSceneFiles(book: BookId, source: Source, dir: string = paths.scenesDir): Promise<SceneFile[]> {
  const files = await Promise.all(source.chapters.map((chapter) => readSceneFile(book, chapter.chapter, dir)))
  return files.filter((file): file is SceneFile => file !== null)
}

export async function readAudioNames(dir: string = paths.audioDir): Promise<Set<string>> {
  return existsSync(dir) ? new Set(await readdir(dir)) : new Set<string>()
}
