import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { BookId } from 'reader-core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { approvedCanon } from '../src/canon/approved.ts'
import type { Llm, ParseRequest } from '../src/llm/client.ts'
import { sceneFilePath } from '../src/paths.ts'
import { assembleScenes } from '../src/scenario/assemble.ts'
import type { ScenarioOutput } from '../src/scenario/output.ts'
import { runScenario } from '../src/scenario/runScenario.ts'
import type { SourceChapter } from '../src/schema.ts'
import { readSceneFile } from '../src/scenes/files.ts'
import { canon, chapter3, outScene, source, storedCanon, style } from './scenarioFixtures.ts'

describe('runScenario', () => {
  let dir: string
  let paths: { storyBibleDir: string; sourceDir: string; scenesDir: string; styleFile: string }
  const lines: string[] = []
  const log = (line: string) => lines.push(line)

  beforeEach(async () => {
    lines.length = 0
    dir = await mkdtemp(path.join(tmpdir(), 'run-scenario-'))
    paths = {
      storyBibleDir: path.join(dir, 'story-bible'),
      sourceDir: dir,
      scenesDir: path.join(dir, 'scenes'),
      styleFile: path.join(dir, 'story-bible', 'style.json'),
    }
    await mkdir(paths.storyBibleDir, { recursive: true })
    for (const key of ['characters', 'places', 'eras', 'things', 'proposals'] as const) {
      await writeFile(path.join(paths.storyBibleDir, `${key}.json`), JSON.stringify(storedCanon[key]), 'utf8')
    }
    await writeFile(paths.styleFile, JSON.stringify(style), 'utf8')
    await writeFile(path.join(dir, 'genesis.json'), JSON.stringify(source), 'utf8')
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
    const result = await runScenario('genesis', 3, { ...paths, dryRun: true, llm: fakeLlm([good], calls) }, log)
    expect(calls).toEqual([])
    expect(result.dryRun).toBe(true)
    expect(result.prompt.user).toContain('3:1 여호와')
    expect(lines.join('\n')).toContain(result.prompt.system)
    expect(await readSceneFile('genesis', 3, paths.scenesDir)).toBeNull()
  })

  it('장면을 써서 저장하고 장면마다 요약을 남긴다', async () => {
    const calls: ParseRequest[] = []
    const result = await runScenario('genesis', 3, { ...paths, llm: fakeLlm([good], calls) }, log)
    expect(calls).toHaveLength(1)
    expect(calls[0]!.name).toBe('scenario')
    // 승인되지 않은 인물은 설정집 요약에 없다
    expect(calls[0]!.user).not.toContain('serpent 뱀')
    expect(result.scenes.map((scene) => scene.id)).toEqual(['genesis-03-01', 'genesis-03-02'])

    const saved = await readSceneFile('genesis', 3, paths.scenesDir)
    expect(saved!.scenes).toHaveLength(2)
    expect(saved!.scenes[0]!.eraId).toBe('eden-era')
    expect(lines).toContain('genesis-03-01 간교한 뱀 (3:1-2) 낱말 1 역사 0')
  })

  it('본보기 파일의 1번째·3번째 장면을 넣는다', async () => {
    const examples = { chapter: 2, scenes: [] as unknown[] }
    const first = await runScenario('genesis', 3, { ...paths, llm: fakeLlm([good], []) }, log)
    examples.scenes = [0, 1, 2].map((n) => ({ ...first.scenes[0]!, id: `genesis-02-0${n + 1}`, chapter: 2, title: `본보기${n + 1}` }))
    await writeFile(path.join(paths.scenesDir, 'genesis-02.json'), JSON.stringify(examples), 'utf8')

    const result = await runScenario('genesis', 3, { ...paths, dryRun: true }, log)
    expect(result.prompt.user).toContain('본보기1')
    expect(result.prompt.user).not.toContain('본보기2')
    expect(result.prompt.user).toContain('본보기3')
  })

  // 본보기 장면 파일을 쓴다. 장면 셋의 제목은 `${label}1`~`${label}3`이다.
  async function writeExamples(book: BookId, chapter: number, label: string): Promise<void> {
    const [scene] = assembleScenes('genesis', chapter3, { scenes: [outScene()] }, approvedCanon(canon)).scenes
    const scenes = [1, 2, 3].map((n) => ({ ...scene!, id: `${book}-${chapter}-0${n}`, chapter, title: `${label}${n}` }))
    await mkdir(paths.scenesDir, { recursive: true })
    await writeFile(sceneFilePath(book, chapter, paths.scenesDir), JSON.stringify({ chapter, scenes }), 'utf8')
  }

  // 같은 폴더에 다른 책의 본문을 쓴다.
  async function writeBookSource(book: BookId, name: string, chapters: SourceChapter[] = [chapter3]): Promise<void> {
    await writeFile(path.join(dir, `${book}.json`), JSON.stringify({ ...source, book: name, chapters }), 'utf8')
  }

  const noExamples = '## 본보기 장면\n(없음)\n\n## 쓸 것'

  it('그 책에 본보기로 볼 장면 파일이 없으면 창세기 2장 장면을 본보기로 쓴다', async () => {
    await writeBookSource('exodus', '출애굽기')
    const none = await runScenario('exodus', 3, { ...paths, dryRun: true }, log)
    expect(none.prompt.user).toContain('출애굽기 3장 (1~4절)')
    expect(none.prompt.user).toContain(noExamples)

    await writeExamples('genesis', 2, '창세기 본보기')
    const result = await runScenario('exodus', 3, { ...paths, dryRun: true }, log)
    expect(result.prompt.user).toContain('출애굽기 3장 (1~4절)')
    expect(result.prompt.user).toContain('"title": "창세기 본보기1"')
    expect(result.prompt.user).not.toContain('"title": "창세기 본보기2"')
    expect(result.prompt.user).toContain('"title": "창세기 본보기3"')
  })

  it('한 장뿐인 책(오바댜)에도 창세기 2장 장면을 본보기로 쓴다', async () => {
    await writeBookSource('obadiah', '오바댜', [{ ...chapter3, chapter: 1 }])
    await writeExamples('genesis', 2, '창세기 본보기')
    const result = await runScenario('obadiah', 1, { ...paths, dryRun: true }, log)
    expect(result.prompt.user).toContain('오바댜 1장 (1~4절)')
    expect(result.prompt.user).toContain('"title": "창세기 본보기1"')
  })

  it('그 책에 2장 장면 파일이 있으면 창세기 2장 대신 그 파일을 쓴다', async () => {
    await writeBookSource('exodus', '출애굽기')
    await writeExamples('genesis', 2, '창세기 본보기')
    await writeExamples('exodus', 2, '출애굽기 본보기')
    const result = await runScenario('exodus', 3, { ...paths, dryRun: true }, log)
    expect(result.prompt.user).toContain('"title": "출애굽기 본보기1"')
    expect(result.prompt.user).toContain('"title": "출애굽기 본보기3"')
    expect(result.prompt.user).not.toContain('창세기 본보기')
  })

  it('2장을 쓸 때는 그 책의 1장 파일을 쓰고, 없으면 창세기 2장 파일을 쓴다', async () => {
    await writeBookSource('exodus', '출애굽기', [{ ...chapter3, chapter: 2 }])
    await writeExamples('genesis', 2, '창세기 본보기')
    const fallback = await runScenario('exodus', 2, { ...paths, dryRun: true }, log)
    expect(fallback.prompt.user).toContain('"title": "창세기 본보기1"')

    await writeExamples('exodus', 1, '출애굽기 본보기')
    const own = await runScenario('exodus', 2, { ...paths, dryRun: true }, log)
    expect(own.prompt.user).toContain('"title": "출애굽기 본보기1"')
    expect(own.prompt.user).not.toContain('창세기 본보기')
  })

  it('창세기 2장을 쓸 때는 2장 파일을 본보기로 삼지 않고, 1장 파일이 있으면 그것을 쓴다', async () => {
    await writeFile(path.join(dir, 'genesis.json'), JSON.stringify({ ...source, chapters: [{ ...chapter3, chapter: 2 }, chapter3] }), 'utf8')
    await writeExamples('genesis', 2, '창세기 2장 본보기')
    const none = await runScenario('genesis', 2, { ...paths, dryRun: true }, log)
    expect(none.prompt.user).toContain(noExamples)

    await writeExamples('genesis', 1, '창세기 1장 본보기')
    const result = await runScenario('genesis', 2, { ...paths, dryRun: true }, log)
    expect(result.prompt.user).toContain('"title": "창세기 1장 본보기1"')
    expect(result.prompt.user).not.toContain('창세기 2장 본보기')
  })

  it('examplesFile을 주면 그 파일이 우선한다', async () => {
    await writeBookSource('exodus', '출애굽기')
    await writeExamples('genesis', 2, '창세기 본보기')
    await writeExamples('exodus', 2, '출애굽기 본보기')
    await writeExamples('exodus', 1, '지정한 본보기')
    const examplesFile = sceneFilePath('exodus', 1, paths.scenesDir)
    const result = await runScenario('exodus', 3, { ...paths, dryRun: true, examplesFile }, log)
    expect(result.prompt.user).toContain('"title": "지정한 본보기1"')
    expect(result.prompt.user).not.toContain('창세기 본보기')
    expect(result.prompt.user).not.toContain('출애굽기 본보기')
  })

  it('장면 파일이 있으면 force 없이 덮어쓰지 않는다', async () => {
    await runScenario('genesis', 3, { ...paths, llm: fakeLlm([good], []) }, log)
    await expect(runScenario('genesis', 3, { ...paths, llm: fakeLlm([good], []) }, log)).rejects.toThrow('--force')
    const calls: ParseRequest[] = []
    await runScenario('genesis', 3, { ...paths, force: true, llm: fakeLlm([good], calls) }, log)
    expect(calls).toHaveLength(1)
  })

  it('절 범위 문제가 있으면 문제를 붙여 한 번 더 부른다', async () => {
    const calls: ParseRequest[] = []
    const result = await runScenario('genesis', 3, { ...paths, llm: fakeLlm([gap, good], calls) }, log)
    expect(calls).toHaveLength(2)
    expect(calls[1]!.user).toContain('## 고칠 것')
    expect(calls[1]!.user).toContain('3절에서 시작해야 하는데 4절에서 시작합니다')
    expect(result.scenes).toHaveLength(2)
  })

  it('두 번째에도 절 범위가 맞지 않으면 저장하지 않고 오류를 낸다', async () => {
    await expect(runScenario('genesis', 3, { ...paths, llm: fakeLlm([gap, gap], []) }, log)).rejects.toThrow('절 범위')
    expect(await readSceneFile('genesis', 3, paths.scenesDir)).toBeNull()
  })

  it('없는 장이면 오류를 낸다', async () => {
    await expect(runScenario('genesis', 9, { ...paths, dryRun: true }, log)).rejects.toThrow('9장')
  })
})
