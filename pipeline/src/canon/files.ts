import { existsSync } from 'node:fs'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import { displayPath, storyBibleDir } from '../paths.ts'
import {
  CharacterSchema,
  EraSchema,
  PlaceSchema,
  ProposalSchema,
  ThingSchema,
  type Canon,
  type CanonKind,
  type Proposal,
} from '../schema.ts'
import { readVerseCounts } from '../source/files.ts'
import { validateCanon, type VerseCounts } from './validate.ts'

// 종류별 항목 스키마. 관리 서버도 항목 하나를 검증할 때 쓴다.
export const canonItemSchemas = {
  characters: CharacterSchema,
  places: PlaceSchema,
  eras: EraSchema,
  things: ThingSchema,
} as const

export type CanonItem<K extends CanonKind> = Canon[K][number]

// 절 인용은 sourceDir(비우면 content/source)의 본문 절 수로 검증한다.
type SourceOptions = { sourceDir?: string }

const fileKeys = ['characters', 'places', 'eras', 'things', 'proposals'] as const
type FileKey = (typeof fileKeys)[number]

const listSchemas: Record<FileKey, z.ZodType<unknown[]>> = {
  characters: z.array(CharacterSchema),
  places: z.array(PlaceSchema),
  eras: z.array(EraSchema),
  things: z.array(ThingSchema),
  proposals: z.array(ProposalSchema),
}

export function canonFilePath(key: FileKey, dir: string = storyBibleDir): string {
  return path.join(dir, `${key}.json`)
}

// 파일 하나를 다루다 난 오류에 파일 이름을 붙인다.
function fileError(file: string, error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error)
  return new Error(`${displayPath(file)}: ${message}`)
}

// 파일을 JSON으로만 읽는다. 없는 파일은 빈 목록이다.
async function readJson(key: FileKey, dir: string): Promise<unknown> {
  const file = canonFilePath(key, dir)
  if (!existsSync(file)) return []
  try {
    return JSON.parse(await readFile(file, 'utf8'))
  } catch (error) {
    throw fileError(file, error)
  }
}

function parseList(key: FileKey, value: unknown, dir: string): unknown[] {
  try {
    return listSchemas[key].parse(value)
  } catch (error) {
    throw fileError(canonFilePath(key, dir), error)
  }
}

// 교차 검증 문제를 파일 이름과 함께 묶어 오류로 낸다.
function assertValid(canon: Canon, dir: string, verseCounts: VerseCounts): void {
  const problems = validateCanon(canon, verseCounts)
  if (problems.length === 0) return
  const lines = problems.map((problem) => {
    const key = problem.slice(0, problem.indexOf('/')) as FileKey
    return `${displayPath(canonFilePath(key, dir))}: ${problem}`
  })
  throw new Error(`설정집에 문제가 있습니다:\n${lines.join('\n')}`)
}

async function readLists(dir: string): Promise<Canon> {
  const [characters, places, eras, things, proposals] = await Promise.all(
    fileKeys.map(async (key) => parseList(key, await readJson(key, dir), dir)),
  )
  return { characters, places, eras, things, proposals } as Canon
}

// 설정집 전체를 읽는다. 없는 파일은 빈 목록이다. 스키마나 교차 검증을 통과하지 못하면 오류를 낸다.
export async function readCanon(dir: string = storyBibleDir, { sourceDir }: SourceOptions = {}): Promise<Canon> {
  const canon = await readLists(dir)
  assertValid(canon, dir, await readVerseCounts(sourceDir))
  return canon
}

// 스키마도 교차 검증도 거치지 않고 JSON 그대로 읽는다. 없는 파일은 빈 목록이다.
// 지금 스키마로는 읽을 수 없는 옛 형식의 파일을 옮길 때(migrate-canon-refs) 쓴다.
export async function readCanonRaw(dir: string = storyBibleDir): Promise<Canon> {
  const [characters, places, eras, things, proposals] = await Promise.all(fileKeys.map((key) => readJson(key, dir)))
  return { characters, places, eras, things, proposals } as Canon
}

const fileText = (items: unknown[]) => `${JSON.stringify(items, null, 2)}\n`

// 목록들을 임시 파일(<파일>.tmp)에 모두 쓴 뒤 이름을 바꿔 제자리에 둔다. 중간에 끊겨도 파일이 반쯤 쓰이지 않는다.
// 도중에 실패하면 이 호출이 쓰던 임시 파일을 치우고 오류를 다시 던진다.
async function replaceFiles(dir: string, lists: { key: FileKey; items: unknown[] }[]): Promise<void> {
  await mkdir(dir, { recursive: true })
  const temps: string[] = []
  try {
    for (const { key, items } of lists) {
      const temp = `${canonFilePath(key, dir)}.tmp`
      temps.push(temp)
      await writeFile(temp, fileText(items), 'utf8')
    }
    // 이름을 바꾸다 실패하면 이미 바꾼 파일은 새 것, 나머지는 옛 것으로 섞여 남는다. 이전(migrate-canon-refs)을 다시 돌리면 맞춰진다.
    for (const { key } of lists) await rename(`${canonFilePath(key, dir)}.tmp`, canonFilePath(key, dir))
  } catch (error) {
    // 이름을 바꾼 것은 이미 없다. 치우다 난 오류는 원래 오류를 가리지 않게 버린다(임시 파일 자리에 폴더가 있으면 rm은 지우지 않고 실패한다).
    await Promise.all(temps.map((temp) => rm(temp, { force: true }).catch(() => undefined)))
    throw error
  }
}

// 쓰기 전에 바뀐 설정집 전체를 검증한다(지금 파일의 문제를 고치는 쓰기도 되게, 바꾼 뒤의 상태만 본다).
async function writeList(key: FileKey, items: unknown[], dir: string, sourceDir: string | undefined): Promise<void> {
  const parsed = listSchemas[key].parse(items)
  const canon = { ...(await readLists(dir)), [key]: parsed } as Canon
  assertValid(canon, dir, await readVerseCounts(sourceDir))
  await replaceFiles(dir, [{ key, items: parsed }])
}

export async function writeCanonKind<K extends CanonKind>(
  kind: K,
  items: CanonItem<K>[],
  dir: string = storyBibleDir,
  { sourceDir }: SourceOptions = {},
): Promise<void> {
  await writeList(kind, items, dir, sourceDir)
}

export async function writeProposals(
  items: Proposal[],
  dir: string = storyBibleDir,
  { sourceDir }: SourceOptions = {},
): Promise<void> {
  await writeList('proposals', items, dir, sourceDir)
}

// 다섯 파일을 한 번에 쓴다. 다섯 목록의 스키마와 설정집 전체를 먼저 검증하고, 하나라도 틀리면 아무것도 쓰지 않는다.
// 지금 파일은 읽지 않으므로 지금 파일이 옛 형식이어도 통째로 바꿀 수 있다(목록마다 쓰면 아직 옮기지 않은 파일에서 걸린다).
export async function writeCanon(canon: Canon, dir: string = storyBibleDir, { sourceDir }: SourceOptions = {}): Promise<void> {
  const parsed = Object.fromEntries(fileKeys.map((key) => [key, parseList(key, canon[key], dir)])) as Canon
  assertValid(parsed, dir, await readVerseCounts(sourceDir))
  await replaceFiles(dir, fileKeys.map((key) => ({ key, items: parsed[key] })))
}
