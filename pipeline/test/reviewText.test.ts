import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { approvedCanon } from '../src/canon/approved.ts'
import type { Llm, ParseRequest } from '../src/llm/client.ts'
import { runReviewText } from '../src/review/reviewText.ts'
import { assembleScenes } from '../src/scenario/assemble.ts'
import type { ReviseOutput, TextVerdict } from '../src/scenario/output.ts'
import type { Scene } from '../src/schema.ts'
import { readSceneFile, writeSceneFile } from '../src/scenes/files.ts'
import { canon, chapter3, outScene, source, style } from './scenarioFixtures.ts'

const PASS: TextVerdict = { verdict: 'pass', issues: [] }
const FAIL: TextVerdict = { verdict: 'fail', issues: ['3:1 해설이 요약에 그칩니다'] }

describe('runReviewText', () => {
  let dir: string
  let paths: { storyBibleDir: string; sourceFile: string; scenesDir: string; styleFile: string }
  const lines: string[] = []
  const log = (line: string) => lines.push(line)

  beforeEach(async () => {
    lines.length = 0
    dir = await mkdtemp(path.join(tmpdir(), 'review-text-'))
    paths = {
      storyBibleDir: path.join(dir, 'story-bible'),
      sourceFile: path.join(dir, 'genesis.json'),
      scenesDir: path.join(dir, 'scenes'),
      styleFile: path.join(dir, 'story-bible', 'style.json'),
    }
    await mkdir(paths.storyBibleDir, { recursive: true })
    for (const key of ['characters', 'places', 'eras', 'things', 'proposals'] as const) {
      await writeFile(path.join(paths.storyBibleDir, `${key}.json`), JSON.stringify(canon[key]), 'utf8')
    }
    await writeFile(paths.styleFile, JSON.stringify(style), 'utf8')
    await writeFile(paths.sourceFile, JSON.stringify(source), 'utf8')
  })
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  // 3장 장면 두 개(1~2절, 3~4절)를 저장한다. change로 장면을 고칠 수 있다.
  async function saveScenes(change: (scenes: Scene[]) => void = () => {}): Promise<void> {
    const { scenes } = assembleScenes(
      chapter3,
      { scenes: [outScene({ verseEnd: 2 }), outScene({ verseStart: 3, glossary: [] })] },
      approvedCanon(canon),
    )
    change(scenes)
    await writeSceneFile({ chapter: 3, scenes }, paths.scenesDir)
  }

  // 차례로 outputs를 돌려주는 가짜 모델
  function fake<T>(outputs: T[], calls: ParseRequest[]): Llm {
    return {
      async parse(schema, request) {
        calls.push(request)
        const output = outputs[calls.length - 1]
        if (output === undefined) throw new Error('더 부를 출력이 없습니다')
        return schema.parse(output)
      },
    }
  }

  const revised: ReviseOutput = { scene: outScene({ verseEnd: 2, title: '고친 제목' }) }

  it('통과하면 reviewed로 두고 판정을 남긴다', async () => {
    await saveScenes()
    const reviewerCalls: ParseRequest[] = []
    const writerCalls: ParseRequest[] = []
    const result = await runReviewText(
      3,
      { ...paths, reviewer: fake([PASS, PASS], reviewerCalls), writer: fake([], writerCalls) },
      log,
    )
    expect(result.reviewed).toEqual(['genesis-03-01', 'genesis-03-02'])
    expect(reviewerCalls).toHaveLength(2)
    expect(reviewerCalls[0]!.name).toBe('review_text')
    expect(reviewerCalls[0]!.model).toBeTruthy()
    expect(writerCalls).toEqual([])
    const saved = await readSceneFile(3, paths.scenesDir)
    expect(saved!.scenes[0]!.review).toMatchObject({ status: 'reviewed', text: PASS, attempts: 0 })
  })

  it('불합격이면 다시 쓰고 다시 검수한다', async () => {
    await saveScenes()
    const writerCalls: ParseRequest[] = []
    const result = await runReviewText(
      3,
      { ...paths, sceneIds: ['genesis-03-01'], reviewer: fake([FAIL, PASS], []), writer: fake([revised], writerCalls) },
      log,
    )
    expect(result.reviewed).toEqual(['genesis-03-01'])
    expect(writerCalls).toHaveLength(1)
    expect(writerCalls[0]!.user).toContain('3:1 해설이 요약에 그칩니다')
    const scene = (await readSceneFile(3, paths.scenesDir))!.scenes[0]!
    expect(scene.title).toBe('고친 제목')
    expect(scene.review).toMatchObject({ status: 'reviewed', attempts: 1 })
  })

  it('다시 써도 계속 불합격이면 flagged로 두고 마지막 판정을 남긴다', async () => {
    await saveScenes()
    const writerCalls: ParseRequest[] = []
    const result = await runReviewText(
      3,
      {
        ...paths,
        sceneIds: ['genesis-03-01'],
        reviewer: fake([FAIL, FAIL, FAIL], []),
        writer: fake([revised, revised], writerCalls),
      },
      log,
    )
    expect(result.flagged).toEqual(['genesis-03-01'])
    expect(writerCalls).toHaveLength(2)
    const scene = (await readSceneFile(3, paths.scenesDir))!.scenes[0]!
    expect(scene.review).toMatchObject({ status: 'flagged', text: FAIL, attempts: 2 })
  })

  it('코드 검사에 걸리면 검수 모델을 부르지 않는다', async () => {
    // 낱말이 본문에 없음 → 검수 모델 없이 불합격, 다시 쓰면 코드가 걸러 내고 검수 모델이 본다
    await saveScenes((scenes) => {
      scenes[0]!.glossary.push({ verse: 1, word: '없는말', meaning: '본문에 없다.' })
    })
    const reviewerCalls: ParseRequest[] = []
    const writerCalls: ParseRequest[] = []
    await runReviewText(
      3,
      { ...paths, sceneIds: ['genesis-03-01'], reviewer: fake([PASS], reviewerCalls), writer: fake([revised], writerCalls) },
      log,
    )
    expect(writerCalls).toHaveLength(1)
    expect(writerCalls[0]!.user).toContain("'없는말'")
    expect(reviewerCalls).toHaveLength(1)

    // 절 범위 문제는 다시 써도 고칠 수 없으므로 어느 모델도 부르지 않고 flagged
    await saveScenes((scenes) => {
      scenes[1]!.verseStart = 4
    })
    const calls: ParseRequest[] = []
    const result = await runReviewText(
      3,
      { ...paths, sceneIds: ['genesis-03-02'], reviewer: fake([PASS], calls), writer: fake([revised], calls) },
      log,
    )
    expect(calls).toEqual([])
    expect(result.flagged).toEqual(['genesis-03-02'])
    const scene = (await readSceneFile(3, paths.scenesDir))!.scenes[1]!
    expect(scene.review.status).toBe('flagged')
    expect(scene.review.text!.issues[0]).toContain('3절에서 시작해야')
  })

  it('승인된 장면은 건너뛴다', async () => {
    await saveScenes((scenes) => {
      scenes[0]!.review.status = 'approved'
    })
    const calls: ParseRequest[] = []
    const result = await runReviewText(3, { ...paths, reviewer: fake([PASS], calls), writer: fake([], []) }, log)
    expect(result.skipped).toEqual(['genesis-03-01'])
    expect(result.reviewed).toEqual(['genesis-03-02'])
    expect(calls).toHaveLength(1)
  })

  it('장면 하나가 끝날 때마다 저장한다', async () => {
    await saveScenes()
    // 두 번째 장면에서 모델이 실패해도 첫 장면 결과는 남는다
    await expect(
      runReviewText(3, { ...paths, reviewer: fake([PASS], []), writer: fake([], []) }, log),
    ).rejects.toThrow('더 부를 출력이 없습니다')
    const saved = await readSceneFile(3, paths.scenesDir)
    expect(saved!.scenes[0]!.review.status).toBe('reviewed')
    expect(saved!.scenes[1]!.review.status).toBe('draft')
  })

  it('dry-run이면 첫 장면의 검수 프롬프트만 출력한다', async () => {
    await saveScenes()
    const calls: ParseRequest[] = []
    const result = await runReviewText(3, { ...paths, dryRun: true, reviewer: fake([PASS], calls), writer: fake([], calls) }, log)
    expect(calls).toEqual([])
    expect(result.dryRun).toBe(true)
    expect(lines.join('\n')).toContain('genesis-03-01 "간교한 뱀"')
    expect(lines.join('\n')).not.toContain('genesis-03-02 "')
  })

  it('장면 파일이 없거나 없는 장면을 고르면 오류', async () => {
    await expect(runReviewText(3, { ...paths, dryRun: true }, log)).rejects.toThrow('장면 파일이 없습니다')
    await saveScenes()
    await expect(runReviewText(3, { ...paths, dryRun: true, sceneIds: ['genesis-03-09'] }, log)).rejects.toThrow(
      'genesis-03-09',
    )
  })
})
