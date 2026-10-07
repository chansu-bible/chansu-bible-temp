import { readFile } from 'node:fs/promises'
import { createLlm, type Llm } from '../llm/client.ts'
import { writerModel } from '../llm/models.ts'
import { sourceFile as defaultSourceFile, storyBibleDir as defaultStoryBibleDir } from '../paths.ts'
import { SourceSchema, type Canon, type CanonKind, type Proposal } from '../schema.ts'
import { readCanon, writeCanonKind, writeProposals } from './files.ts'
import { CanonOutputSchema, mergeCanon, type CanonRef } from './merge.ts'
import { buildCanonPrompt, type CanonPrompt } from './prompt.ts'

export type CanonRunOptions = {
  dryRun?: boolean
  // 시험용. 비우면 작성 모델로 부른다.
  llm?: Llm
  storyBibleDir?: string
  sourceFile?: string
}

export type CanonRunResult = {
  chapter: number
  dryRun: boolean
  prompt: CanonPrompt
  added: CanonRef[]
  updated: CanonRef[]
  proposals: Proposal[]
  warnings: string[]
}

const KINDS: readonly CanonKind[] = ['characters', 'places', 'eras', 'things']

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

// 장 본문에서 설정집 초안을 뽑는다. dryRun이면 프롬프트만 출력하고 모델을 부르지 않는다.
export async function runCanon(
  chapter: number,
  { dryRun = false, llm, storyBibleDir = defaultStoryBibleDir, sourceFile = defaultSourceFile }: CanonRunOptions = {},
  log: (line: string) => void = console.log,
): Promise<CanonRunResult> {
  const source = SourceSchema.parse(JSON.parse(await readFile(sourceFile, 'utf8')))
  const sourceChapter = source.chapters.find((item) => item.chapter === chapter)
  if (!sourceChapter) throw new Error(`본문에 ${chapter}장이 없습니다. 먼저 source 단계를 실행하세요.`)

  const canon = await readCanon(storyBibleDir)
  const prompt = buildCanonPrompt(sourceChapter, canon)
  const empty = { chapter, prompt, added: [], updated: [], proposals: [], warnings: [] }

  if (dryRun) {
    log('=== system ===')
    log(prompt.system)
    log('=== user ===')
    log(prompt.user)
    log(`(dry-run이라 ${writerModel()}를 부르지 않았습니다)`)
    return { ...empty, dryRun: true }
  }

  log(`${chapter}장 설정집 추출: ${writerModel()} 호출 중`)
  const model = llm ?? createLlm({ stage: 'canon', chapter, log })
  const output = await model.parse(CanonOutputSchema, { ...prompt, name: 'canon' })

  const merged = mergeCanon(canon, output, new Date().toISOString())
  await save(canon, merged.canon, storyBibleDir)

  const label = (ref: CanonRef) => `${ref.kind}/${ref.id}`
  log(`추가 ${merged.added.length}개, 갱신 ${merged.updated.length}개, 제안 ${merged.proposals.length}개, 경고 ${merged.warnings.length}개`)
  if (merged.added.length > 0) log(`추가: ${merged.added.map(label).join(', ')}`)
  if (merged.updated.length > 0) log(`갱신: ${merged.updated.map(label).join(', ')}`)
  for (const proposal of merged.proposals) log(`제안: ${proposal.target} ${proposal.field}`)
  for (const warning of merged.warnings) log(`경고: ${warning}`)

  return {
    ...empty,
    dryRun: false,
    added: merged.added,
    updated: merged.updated,
    proposals: merged.proposals,
    warnings: merged.warnings,
  }
}

// 바뀐 파일만 쓴다. 인물 관계는 인물 파일 안에서만 이어지므로 종류별로 차례로 써도 중간 상태가 검증을 통과한다.
async function save(before: Canon, after: Canon, dir: string): Promise<void> {
  for (const kind of KINDS) {
    if (!same(before[kind], after[kind])) await writeCanonKind(kind, after[kind], dir)
  }
  if (!same(before.proposals, after.proposals)) await writeProposals(after.proposals, dir)
}
