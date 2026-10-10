import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { bookOrder, isBookId, type BookId } from 'reader-core'
import { buildPassages, type AskBundle } from './passages.ts'
import { buildIndex, type PassageIndex } from './retrieve.ts'

// 질문하기가 쓰는 목록이 없으면 책 묶음이 아니다. 목록 안의 모양까지는 보지 않는다(대목을 만들다 나는 오류는 loadAskIndex가 받는다).
function isBundle(value: unknown): value is AskBundle {
  if (typeof value !== 'object' || value === null) return false
  const bundle = value as Partial<Record<keyof AskBundle, unknown>>
  return typeof bundle.book === 'string' && [bundle.chapters, bundle.characters, bundle.places, bundle.things].every(Array.isArray)
}

// 책 묶음 하나를 읽는다. 읽지 못하거나 모양이 다르면 그 파일 이름을 넣은 오류를 던진다.
function readBundle(file: string, id: BookId): AskBundle {
  let bundle: unknown
  try {
    bundle = JSON.parse(readFileSync(file, 'utf8'))
  } catch (error) {
    throw new Error(`${file}을 읽지 못했습니다: ${error instanceof Error ? error.message : String(error)}`, { cause: error })
  }
  if (!isBundle(bundle)) throw new Error(`${file}은 책 묶음 모양이 아닙니다`)
  // 책은 파일 이름이 정한다. 묶음 안의 bookId가 다르면 잘못 복사한 파일이라, 대목 id가 겹치지 않게 멈춘다.
  if (bundle.bookId !== undefined && bundle.bookId !== id) {
    throw new Error(`${file}의 bookId(${String(bundle.bookId)})가 파일 이름과 다릅니다`)
  }
  return { ...bundle, bookId: id }
}

// 묶음 폴더의 책 묶음(<책 id>.json)을 성경 순서로 읽는다. 책 id가 아닌 이름의 파일(notes.json)과 폴더(audio, images)는 읽지 않는다.
// 링크도 받는다. 읽을 때 따라가고, 가리키는 파일이 없으면 읽지 못한 오류가 된다.
// 폴더가 없으면 빈 목록이다. 하나라도 읽지 못하면 오류를 던진다(일부만 읽으면 설정집 중복 정리가 달라진다).
export function readBundles(dir: string): AskBundle[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => (entry.isFile() || entry.isSymbolicLink()) && entry.name.endsWith('.json'))
    .map((entry) => entry.name.slice(0, -'.json'.length))
    .filter(isBookId)
    .sort((a, b) => bookOrder(a) - bookOrder(b))
    .map((id) => readBundle(path.join(dir, `${id}.json`), id))
}

// 묶음 폴더에서 질문하기의 색인을 만든다. 질문하기는 덤이라, 책 묶음이 없거나 잘못되어 있으면
// 이유를 warn으로 알리고 null을 돌려준다(동기화 서버는 그대로 뜬다). 경고에는 폴더가 들고,
// 묶음을 읽거나 대목을 만들다 실패했으면 그 묶음 파일 이름도 든다.
// 읽는 것과 대목을 만드는 것을 한꺼번에 지킨다. 잘못된 묶음만 건너뛰면 설정집 중복 정리가 조용히 달라진다.
export function loadAskIndex(dir: string, warn: (message: string) => void): PassageIndex | null {
  let bundles: AskBundle[]
  let index: PassageIndex
  try {
    bundles = readBundles(dir)
    index = buildIndex(buildPassages(bundles))
  } catch (error) {
    warn(`묶음 폴더(${dir})의 책 묶음을 쓰지 못해 질문하기를 끕니다. ${error instanceof Error ? error.message : String(error)}`)
    return null
  }
  if (bundles.length === 0) {
    warn(`묶음 폴더(${dir})에 책 묶음이 없어 질문하기를 끕니다. 먼저 npm run pipeline -- build를 하세요.`)
    return null
  }
  return index
}
