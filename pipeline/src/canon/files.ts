import { existsSync } from 'node:fs'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import { repoRoot, storyBibleDir } from '../paths.ts'
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
import { validateCanon } from './validate.ts'

// 종류별 항목 스키마. 관리 서버도 항목 하나를 검증할 때 쓴다.
export const canonItemSchemas = {
  characters: CharacterSchema,
  places: PlaceSchema,
  eras: EraSchema,
  things: ThingSchema,
} as const

export type CanonItem<K extends CanonKind> = Canon[K][number]

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

function displayName(file: string): string {
  const relative = path.relative(repoRoot, file)
  return (relative.startsWith('..') ? file : relative).split(path.sep).join('/')
}

async function readList(key: FileKey, dir: string): Promise<unknown[]> {
  const file = canonFilePath(key, dir)
  if (!existsSync(file)) return []
  try {
    return listSchemas[key].parse(JSON.parse(await readFile(file, 'utf8')))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`${displayName(file)}: ${message}`)
  }
}

// 교차 검증 문제를 파일 이름과 함께 묶어 오류로 낸다.
function assertValid(canon: Canon, dir: string): void {
  const problems = validateCanon(canon)
  if (problems.length === 0) return
  const lines = problems.map((problem) => {
    const key = problem.slice(0, problem.indexOf('/')) as FileKey
    return `${displayName(canonFilePath(key, dir))}: ${problem}`
  })
  throw new Error(`설정집에 문제가 있습니다:\n${lines.join('\n')}`)
}

async function readLists(dir: string): Promise<Canon> {
  const [characters, places, eras, things, proposals] = await Promise.all(fileKeys.map((key) => readList(key, dir)))
  return { characters, places, eras, things, proposals } as Canon
}

// 설정집 전체를 읽는다. 없는 파일은 빈 목록이다. 스키마나 교차 검증을 통과하지 못하면 오류를 낸다.
export async function readCanon(dir: string = storyBibleDir): Promise<Canon> {
  const canon = await readLists(dir)
  assertValid(canon, dir)
  return canon
}

// 쓰기 전에 바뀐 설정집 전체를 검증한다(지금 파일의 문제를 고치는 쓰기도 되게, 바꾼 뒤의 상태만 본다).
// 중간에 끊겨도 파일이 반쯤 쓰이지 않게 임시 파일을 거친다.
async function writeList(key: FileKey, items: unknown[], dir: string): Promise<void> {
  const parsed = listSchemas[key].parse(items)
  const canon = { ...(await readLists(dir)), [key]: parsed } as Canon
  assertValid(canon, dir)

  const file = canonFilePath(key, dir)
  await mkdir(dir, { recursive: true })
  await writeFile(`${file}.tmp`, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8')
  await rename(`${file}.tmp`, file)
}

export async function writeCanonKind<K extends CanonKind>(
  kind: K,
  items: CanonItem<K>[],
  dir: string = storyBibleDir,
): Promise<void> {
  await writeList(kind, items, dir)
}

export async function writeProposals(items: Proposal[], dir: string = storyBibleDir): Promise<void> {
  await writeList('proposals', items, dir)
}
