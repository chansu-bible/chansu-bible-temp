import { existsSync } from 'node:fs'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { getBook, parseSceneId, sceneIdOf, type BookId } from 'reader-core'
import { hasChapter, listChapterFiles, repoRoot, sceneFilePath, scenesDir } from '../paths.ts'
import { SceneFileSchema, type SceneFile } from '../schema.ts'

function displayName(file: string): string {
  const relative = path.relative(repoRoot, file)
  return (relative.startsWith('..') ? file : relative).split(path.sep).join('/')
}

// 스키마, 장면마다 장 번호가 파일과 같은지, id가 겹치지 않는지 본다.
function parseSceneFile(value: unknown): SceneFile {
  const sceneFile = SceneFileSchema.parse(value)
  const seen = new Set<string>()
  for (const scene of sceneFile.scenes) {
    if (scene.chapter !== sceneFile.chapter) {
      throw new Error(`${scene.id} 장면의 장 번호(${scene.chapter})가 파일의 장 번호(${sceneFile.chapter})와 다릅니다`)
    }
    if (seen.has(scene.id)) throw new Error(`장면 id가 겹칩니다: ${scene.id}`)
    seen.add(scene.id)
  }
  return sceneFile
}

// 장면 파일 하나를 읽는다. 없으면 null(책에 없는 장도), 검증에 걸리면 파일 이름과 함께 오류를 낸다.
export async function readSceneFile(book: BookId, chapter: number, dir: string = scenesDir): Promise<SceneFile | null> {
  if (!hasChapter(book, chapter)) return null
  const file = sceneFilePath(book, chapter, dir)
  if (!existsSync(file)) return null
  try {
    const sceneFile = parseSceneFile(JSON.parse(await readFile(file, 'utf8')))
    if (sceneFile.chapter !== chapter) throw new Error(`장 번호(${sceneFile.chapter})가 ${chapter}장이 아닙니다`)
    return sceneFile
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`${displayName(file)}: ${message}`)
  }
}

// 검증한 뒤 쓴다. 장면 id는 모두 그 책·그 장의 id(genesis-04-03)여야 한다.
// 중간에 끊겨도 파일이 반쯤 쓰이지 않게 임시 파일을 거친다.
export async function writeSceneFile(book: BookId, sceneFile: SceneFile, dir: string = scenesDir): Promise<void> {
  const parsed = parseSceneFile(sceneFile)
  for (const scene of parsed.scenes) {
    const id = parseSceneId(scene.id)
    if (id?.book !== book || id.chapter !== parsed.chapter) {
      const example = sceneIdOf(book, parsed.chapter, 1)
      throw new Error(`${getBook(book).name} ${parsed.chapter}장의 장면 id가 아닙니다(${example} 모양이어야 합니다): ${scene.id}`)
    }
  }
  const file = sceneFilePath(book, parsed.chapter, dir)
  await mkdir(dir, { recursive: true })
  await writeFile(`${file}.tmp`, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8')
  await rename(`${file}.tmp`, file)
}

// 그 책의 장면 파일이 있는 장 번호(오름차순)
export async function listSceneChapters(book: BookId, dir: string = scenesDir): Promise<number[]> {
  return listChapterFiles(book, dir)
}
