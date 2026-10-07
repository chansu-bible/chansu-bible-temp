import { approvedCanon } from '../canon/approved.ts'
import { readCanon } from '../canon/files.ts'
import { readStyle } from '../images/style.ts'
import { createLlm, type Llm } from '../llm/client.ts'
import { reviewerModel, writerModel } from '../llm/models.ts'
import {
  scenesDir as defaultScenesDir,
  sourceFile as defaultSourceFile,
  storyBibleDir as defaultStoryBibleDir,
  styleFile as defaultStyleFile,
} from '../paths.ts'
import type { Scene, SceneFile, SourceChapter } from '../schema.ts'
import { assembleRevision } from '../scenario/assemble.ts'
import { canonIds, glossaryProblem, refProblems, type CanonIds } from '../scenario/checks.ts'
import { ReviseOutputSchema, TextVerdictSchema, type TextVerdict } from '../scenario/output.ts'
import { buildRevisePrompt } from '../scenario/prompt.ts'
import { readSourceChapter } from '../scenario/runScenario.ts'
import { findCoverageProblems } from '../scenes/coverage.ts'
import { readSceneFile, writeSceneFile } from '../scenes/files.ts'
import { buildReviewTextPrompt } from './prompt.ts'

export type ReviewTextOptions = {
  dryRun?: boolean
  // 이 장면만 검수한다. 비우면 장 전체
  sceneIds?: string[]
  // 시험용. 비우면 검수 모델·작성 모델로 부른다.
  reviewer?: Llm
  writer?: Llm
  // 불합격 때 다시 쓰는 최대 횟수(장면의 review.attempts 기준). 기본 2
  maxAttempts?: number
  storyBibleDir?: string
  sourceFile?: string
  scenesDir?: string
  styleFile?: string
}

export type ReviewTextResult = {
  chapter: number
  dryRun: boolean
  reviewed: string[]
  flagged: string[]
  skipped: string[]
  warnings: string[]
}

// 장면 파일 전체로 본 절 범위 문제 가운데 이 장면에 걸린 것. 장면 하나를 다시 써서는 고칠 수 없다.
function coverageIssues(sceneFile: SceneFile, index: number, verseCount: number): string[] {
  const scene = sceneFile.scenes[index]!
  const isLast = index === sceneFile.scenes.length - 1
  return findCoverageProblems(sceneFile.scenes, verseCount).filter(
    (problem) => problem.startsWith(`${scene.id}:`) || (isLast && problem.startsWith('마지막 장면')),
  )
}

// 코드로 볼 수 있는 문제: 낱말이 본문에 있는지, 참조 id가 승인된 설정집에 있는지
function codeIssues(scene: Scene, chapter: SourceChapter, ids: CanonIds): string[] {
  const issues: string[] = []
  for (const gloss of scene.glossary) {
    const problem = glossaryProblem(gloss, scene, chapter)
    if (problem) issues.push(`${chapter.chapter}:${gloss.verse} ${problem}`)
  }
  issues.push(...refProblems(scene, ids))
  return issues
}

// 장면 글을 검수한다. 불합격이면 작성 모델이 지적 사항을 반영해 다시 쓰고, maxAttempts번을 넘으면 flagged로 둔다.
// dryRun이면 첫 장면의 검수 프롬프트만 출력하고 모델을 부르지 않는다.
export async function runReviewText(
  chapter: number,
  {
    dryRun = false,
    sceneIds,
    reviewer,
    writer,
    maxAttempts = 2,
    storyBibleDir = defaultStoryBibleDir,
    sourceFile = defaultSourceFile,
    scenesDir = defaultScenesDir,
    styleFile = defaultStyleFile,
  }: ReviewTextOptions = {},
  log: (line: string) => void = console.log,
): Promise<ReviewTextResult> {
  const sourceChapter = await readSourceChapter(chapter, sourceFile)
  const sceneFile = await readSceneFile(chapter, scenesDir)
  if (!sceneFile) throw new Error(`${chapter}장의 장면 파일이 없습니다. 먼저 scenario 단계를 실행하세요.`)
  for (const id of sceneIds ?? []) {
    if (!sceneFile.scenes.some((scene) => scene.id === id)) throw new Error(`${id} 장면이 ${chapter}장에 없습니다`)
  }

  const canon = approvedCanon(await readCanon(storyBibleDir))
  const style = await readStyle(styleFile, { requireFiles: false })
  const ids = canonIds(canon)
  const result: ReviewTextResult = { chapter, dryRun, reviewed: [], flagged: [], skipped: [], warnings: [] }

  const targets: number[] = []
  sceneFile.scenes.forEach((scene, index) => {
    if (sceneIds && sceneIds.length > 0 && !sceneIds.includes(scene.id)) return
    // 사람이 승인한 장면은 다시 검수하지 않는다.
    if (scene.review.status === 'approved') result.skipped.push(scene.id)
    else targets.push(index)
  })
  if (result.skipped.length > 0) log(`승인된 장면은 건너뜁니다: ${result.skipped.join(', ')}`)

  if (dryRun) {
    const first = targets[0]
    if (first === undefined) {
      log('검수할 장면이 없습니다')
      return result
    }
    const prompt = buildReviewTextPrompt(sourceChapter, canon, style, sceneFile.scenes[first]!)
    log('=== system ===')
    log(prompt.system)
    log('=== user ===')
    log(prompt.user)
    log(`(dry-run이라 ${reviewerModel()}를 부르지 않았습니다. 검수할 장면 ${targets.length}개)`)
    return result
  }

  const shared = reviewer && writer ? null : createLlm({ stage: 'review-text', chapter, log })
  const reviewLlm = reviewer ?? shared!
  const writeLlm = writer ?? shared!
  const verseCount = sourceChapter.verses.length

  for (const index of targets) {
    let scene = sceneFile.scenes[index]!
    log(`${scene.id} ${scene.title}: 검수 중`)
    let verdict: TextVerdict

    for (;;) {
      const coverage = coverageIssues(sceneFile, index, verseCount)
      if (coverage.length > 0) {
        // 절 범위는 장면 하나를 다시 써서 고칠 수 없으므로 모델을 부르지 않고 바로 확인 필요로 둔다.
        verdict = { verdict: 'fail', issues: coverage }
        scene.review.status = 'flagged'
        break
      }

      const issues = codeIssues(scene, sourceChapter, ids)
      if (issues.length > 0) {
        verdict = { verdict: 'fail', issues }
        log(`코드 검사 불합격 (${issues.length}개)`)
      } else {
        const prompt = buildReviewTextPrompt(sourceChapter, canon, style, scene)
        verdict = await reviewLlm.parse(TextVerdictSchema, { ...prompt, model: reviewerModel(), name: 'review_text' })
      }

      if (verdict.verdict === 'pass') {
        scene.review.status = 'reviewed'
        break
      }
      for (const issue of verdict.issues) log(`- ${issue}`)
      if (scene.review.attempts >= maxAttempts) {
        scene.review.status = 'flagged'
        break
      }

      log(`다시 쓰는 중 (${scene.review.attempts + 1}/${maxAttempts}): ${writerModel()}`)
      const revisePrompt = buildRevisePrompt(sourceChapter, canon, style, scene, verdict.issues)
      const output = await writeLlm.parse(ReviseOutputSchema, { ...revisePrompt, name: 'revise' })
      const revision = assembleRevision(sourceChapter, scene, output.scene, canon)
      for (const warning of revision.warnings) log(`경고: ${warning}`)
      result.warnings.push(...revision.warnings)
      scene = revision.scene
      scene.review.attempts += 1
      sceneFile.scenes[index] = scene
    }

    scene.review.text = verdict
    if (scene.review.status === 'reviewed') {
      result.reviewed.push(scene.id)
      log(`${scene.id}: 통과`)
    } else {
      result.flagged.push(scene.id)
      log(`${scene.id}: 확인 필요 (지적 ${verdict.issues.length}개)`)
    }
    // 중간에 멈춰도 이어서 할 수 있게 장면마다 바로 저장한다.
    await writeSceneFile(sceneFile, scenesDir)
  }

  log(`검수 ${targets.length}개: 통과 ${result.reviewed.length}개, 확인 필요 ${result.flagged.length}개, 건너뜀 ${result.skipped.length}개`)
  return result
}
