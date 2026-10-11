import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { getBook, hasChapter, parseChapterStem, type BookId } from 'reader-core'
import { approvedCanon } from '../canon/approved.ts'
import { readCanon } from '../canon/files.ts'
import { readStyle } from '../images/style.ts'
import { createLlm, type Llm } from '../llm/client.ts'
import { writerModel } from '../llm/models.ts'
import {
  displayPath,
  sceneFilePath,
  scenesDir as defaultScenesDir,
  sourceDir as defaultSourceDir,
  storyBibleDir as defaultStoryBibleDir,
  styleFile as defaultStyleFile,
} from '../paths.ts'
import { SceneFileSchema, type Scene } from '../schema.ts'
import { writeSceneFile } from '../scenes/files.ts'
import { readSourceChapter } from '../source/files.ts'
import { assembleScenes } from './assemble.ts'
import { ScenarioOutputSchema } from './output.ts'
import { buildScenarioPrompt, type ScenarioPrompt } from './prompt.ts'

export type ScenarioRunOptions = {
  dryRun?: boolean
  // 장면 파일이 이미 있어도 새로 쓴다
  force?: boolean
  // 시험용. 비우면 작성 모델로 부른다.
  llm?: Llm
  storyBibleDir?: string
  sourceDir?: string
  scenesDir?: string
  styleFile?: string
  // 본보기 장면 파일이다. 비우면 장면 폴더에 있는 그 책의 2장 파일(2장을 쓸 때는 1장 파일)을 쓰고, 그 책에 없으면 창세기 2장 파일을 쓴다.
  examplesFile?: string
}

export type ScenarioRunResult = {
  chapter: number
  dryRun: boolean
  prompt: ScenarioPrompt
  scenes: Scene[]
  warnings: string[]
}

// 본보기 장면: 파일의 1번째·3번째 장면. 파일이 없으면 본보기 없이 간다.
async function readExamples(file: string | null): Promise<Scene[]> {
  if (file === null || !existsSync(file)) return []
  const sceneFile = SceneFileSchema.parse(JSON.parse(await readFile(file, 'utf8')))
  return [sceneFile.scenes[0], sceneFile.scenes[2]].filter((scene): scene is Scene => scene !== undefined)
}

// 본보기로 볼 장면 파일: 그 책의 2장(2장을 쓸 때는 1장) 파일이 있으면 그것이다.
// 그 책에 아직 없으면(새 책의 첫 장, 한 장뿐인 책) 다듬어 둔 창세기 2장 파일이다. 창세기 2장을 쓸 때는 자기 자신을 본보기로 삼지 않는다.
function defaultExamplesFile(book: BookId, chapter: number, scenesDir: string): string | null {
  const exampleChapter = chapter === 2 ? 1 : 2
  const own = hasChapter(book, exampleChapter) ? sceneFilePath(book, exampleChapter, scenesDir) : null
  if (own !== null && existsSync(own)) return own
  return book === 'genesis' && chapter === 2 ? null : sceneFilePath('genesis', 2, scenesDir)
}

// 본보기 파일을 로그에 남길 말로 바꾼다. 장면 파일(genesis-02.json)이면 "창세기 2장", 그 밖의 파일이면 경로다.
function exampleLabel(file: string): string {
  const stem = parseChapterStem(path.basename(file, '.json'))
  return stem ? `${getBook(stem.book).name} ${stem.chapter}장` : displayPath(file)
}

function rangeLabel(scene: Scene): string {
  return scene.verseStart === scene.verseEnd
    ? `${scene.chapter}:${scene.verseStart}`
    : `${scene.chapter}:${scene.verseStart}-${scene.verseEnd}`
}

// 장 본문과 승인된 설정집으로 장면을 쓴다. dryRun이면 프롬프트만 출력하고 모델을 부르지 않는다.
export async function runScenario(
  book: BookId,
  chapter: number,
  {
    dryRun = false,
    force = false,
    llm,
    storyBibleDir = defaultStoryBibleDir,
    sourceDir = defaultSourceDir,
    scenesDir = defaultScenesDir,
    styleFile = defaultStyleFile,
    examplesFile,
  }: ScenarioRunOptions = {},
  log: (line: string) => void = console.log,
): Promise<ScenarioRunResult> {
  const sourceChapter = await readSourceChapter(book, chapter, sourceDir)
  // dry-run은 아무것도 쓰지 않으므로 파일이 있어도 프롬프트를 보여 준다.
  if (!dryRun && !force && existsSync(sceneFilePath(book, chapter, scenesDir))) {
    throw new Error(`이미 ${chapter}장 장면 파일이 있습니다. 다시 쓰려면 --force를 붙이세요.`)
  }

  const canon = approvedCanon(await readCanon(storyBibleDir, { sourceDir }))
  const style = await readStyle(styleFile, { requireFiles: false })
  const exampleFile = examplesFile ?? defaultExamplesFile(book, chapter, scenesDir)
  const examples = await readExamples(exampleFile)
  log(`본보기: ${exampleFile !== null && examples.length > 0 ? exampleLabel(exampleFile) : '없음'}`)
  const prompt = buildScenarioPrompt(book, sourceChapter, canon, style, examples)

  if (dryRun) {
    log('=== system ===')
    log(prompt.system)
    log('=== user ===')
    log(prompt.user)
    log(`(dry-run이라 ${writerModel()}를 부르지 않았습니다)`)
    return { chapter, dryRun: true, prompt, scenes: [], warnings: [] }
  }

  const model = llm ?? createLlm({ stage: 'scenario', book, chapter, log })
  log(`${chapter}장 장면 쓰기: ${writerModel()} 호출 중`)
  let result = assembleScenes(book, sourceChapter, await model.parse(ScenarioOutputSchema, { ...prompt, name: 'scenario' }), canon)

  if (result.problems.length > 0) {
    log('절 범위가 맞지 않아 한 번 더 부릅니다:')
    for (const problem of result.problems) log(`- ${problem}`)
    const user = [
      prompt.user,
      '',
      '## 고칠 것',
      '앞서 쓴 장면 목록에 아래 문제가 있었다. 절 범위를 바로잡아 장 전체를 다시 쓴다.',
      ...result.problems.map((problem) => `- ${problem}`),
    ].join('\n')
    result = assembleScenes(
      book,
      sourceChapter,
      await model.parse(ScenarioOutputSchema, { system: prompt.system, user, name: 'scenario' }),
      canon,
    )
    if (result.problems.length > 0) {
      throw new Error(`${chapter}장 장면의 절 범위가 맞지 않습니다:\n${result.problems.join('\n')}`)
    }
  }

  await writeSceneFile(book, { chapter, scenes: result.scenes }, scenesDir)

  log(`장면 ${result.scenes.length}개를 썼습니다`)
  for (const scene of result.scenes) {
    log(`${scene.id} ${scene.title} (${rangeLabel(scene)}) 낱말 ${scene.glossary.length} 역사 ${scene.history.length}`)
  }
  for (const warning of result.warnings) log(`경고: ${warning}`)

  return { chapter, dryRun: false, prompt, scenes: result.scenes, warnings: result.warnings }
}
