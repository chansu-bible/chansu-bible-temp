import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Llm, ParseRequest } from '../src/llm/client.ts'
import type { ScenarioOutput } from '../src/scenario/output.ts'
import { runScenario } from '../src/scenario/runScenario.ts'
import { readSceneFile } from '../src/scenes/files.ts'
import { canon, outScene, source, style } from './scenarioFixtures.ts'

describe('runScenario', () => {
  let dir: string
  let paths: { storyBibleDir: string; sourceFile: string; scenesDir: string; styleFile: string }
  const lines: string[] = []
  const log = (line: string) => lines.push(line)

  beforeEach(async () => {
    lines.length = 0
    dir = await mkdtemp(path.join(tmpdir(), 'run-scenario-'))
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

  // 차례로 outputs를 돌려주는 가짜 모델
  function fakeLlm(outputs: ScenarioOutput[], calls: ParseRequest[]): Llm {
    return {
      async parse(schema, request) {
        calls.push(request)
        const output = outputs[calls.length - 1]
        if (!output) throw new Error('더 부를 출력이 없습니다')
        return schema.parse(output)
      },
    }
  }

  const good: ScenarioOutput = { scenes: [outScene({ verseEnd: 2 }), outScene({ verseStart: 3, glossary: [] })] }
  const gap: ScenarioOutput = { scenes: [outScene({ verseEnd: 2 }), outScene({ verseStart: 4, glossary: [] })] }

  it('dry-run이면 프롬프트만 출력하고 모델을 부르지 않는다', async () => {
    const calls: ParseRequest[] = []
    const result = await runScenario(3, { ...paths, dryRun: true, llm: fakeLlm([good], calls) }, log)
    expect(calls).toEqual([])
    expect(result.dryRun).toBe(true)
    expect(result.prompt.user).toContain('3:1 여호와')
    expect(lines.join('\n')).toContain(result.prompt.system)
    expect(await readSceneFile(3, paths.scenesDir)).toBeNull()
  })

  it('장면을 써서 저장하고 장면마다 요약을 남긴다', async () => {
    const calls: ParseRequest[] = []
    const result = await runScenario(3, { ...paths, llm: fakeLlm([good], calls) }, log)
    expect(calls).toHaveLength(1)
    expect(calls[0]!.name).toBe('scenario')
    // 승인되지 않은 인물은 설정집 요약에 없다
    expect(calls[0]!.user).not.toContain('serpent 뱀')
    expect(result.scenes.map((scene) => scene.id)).toEqual(['genesis-03-01', 'genesis-03-02'])

    const saved = await readSceneFile(3, paths.scenesDir)
    expect(saved!.scenes).toHaveLength(2)
    expect(saved!.scenes[0]!.eraId).toBe('eden-era')
    expect(lines).toContain('genesis-03-01 간교한 뱀 (3:1-2) 낱말 1 역사 0')
  })

  it('본보기 파일의 1번째·3번째 장면을 넣는다', async () => {
    const examples = { chapter: 2, scenes: [] as unknown[] }
    const first = await runScenario(3, { ...paths, llm: fakeLlm([good], []) }, log)
    examples.scenes = [0, 1, 2].map((n) => ({ ...first.scenes[0]!, id: `genesis-02-0${n + 1}`, chapter: 2, title: `본보기${n + 1}` }))
    await writeFile(path.join(paths.scenesDir, 'genesis-02.json'), JSON.stringify(examples), 'utf8')

    const result = await runScenario(3, { ...paths, dryRun: true }, log)
    expect(result.prompt.user).toContain('본보기1')
    expect(result.prompt.user).not.toContain('본보기2')
    expect(result.prompt.user).toContain('본보기3')
  })

  it('장면 파일이 있으면 force 없이 덮어쓰지 않는다', async () => {
    await runScenario(3, { ...paths, llm: fakeLlm([good], []) }, log)
    await expect(runScenario(3, { ...paths, llm: fakeLlm([good], []) }, log)).rejects.toThrow('--force')
    const calls: ParseRequest[] = []
    await runScenario(3, { ...paths, force: true, llm: fakeLlm([good], calls) }, log)
    expect(calls).toHaveLength(1)
  })

  it('절 범위 문제가 있으면 문제를 붙여 한 번 더 부른다', async () => {
    const calls: ParseRequest[] = []
    const result = await runScenario(3, { ...paths, llm: fakeLlm([gap, good], calls) }, log)
    expect(calls).toHaveLength(2)
    expect(calls[1]!.user).toContain('## 고칠 것')
    expect(calls[1]!.user).toContain('3절에서 시작해야 하는데 4절에서 시작합니다')
    expect(result.scenes).toHaveLength(2)
  })

  it('두 번째에도 절 범위가 맞지 않으면 저장하지 않고 오류를 낸다', async () => {
    await expect(runScenario(3, { ...paths, llm: fakeLlm([gap, gap], []) }, log)).rejects.toThrow('절 범위')
    expect(await readSceneFile(3, paths.scenesDir)).toBeNull()
  })

  it('없는 장이면 오류를 낸다', async () => {
    await expect(runScenario(9, { ...paths, dryRun: true }, log)).rejects.toThrow('9장')
  })
})
