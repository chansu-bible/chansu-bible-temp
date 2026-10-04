import { existsSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { writeBundle } from './build/writeBundle.ts'
import { generateImages } from './images/generateImages.ts'
import { createOpenAiDraw } from './images/openaiDraw.ts'
import { envFile } from './paths.ts'
import { fetchSource } from './source/fetchSource.ts'
import { generateSpeech } from './tts/generateSpeech.ts'
import { createOpenAiSpeak } from './tts/openaiSpeak.ts'

type Flags = {
  chapter?: string
  limit?: string
  scene?: string[]
  'allow-draft': boolean
  force: boolean
  'dry-run': boolean
}

function positiveInteger(value: string | undefined, name: string): number | undefined {
  if (value === undefined) return undefined
  const number = Number(value)
  if (!Number.isInteger(number) || number < 1) throw new Error(`--${name}은 1 이상의 정수여야 합니다`)
  return number
}

const commands: Record<string, (flags: Flags) => Promise<void>> = {
  async source() {
    const source = await fetchSource()
    const verseCount = source.chapters.reduce((sum, chapter) => sum + chapter.verses.length, 0)
    console.log(`본문 저장 완료: ${source.chapters.length}장 ${verseCount}절`)
  },
  async images(flags) {
    const chapter = positiveInteger(flags.chapter, 'chapter')
    if (chapter === undefined) throw new Error('--chapter <장 번호>가 필요합니다')
    const dryRun = flags['dry-run']
    const draw = dryRun
      ? async () => {
          throw new Error('dry-run에서는 그리지 않습니다')
        }
      : createOpenAiDraw()

    const result = await generateImages(
      {
        chapter,
        allowDraft: flags['allow-draft'],
        force: flags.force,
        dryRun,
        limit: positiveInteger(flags.limit, 'limit'),
        sceneIds: flags.scene,
      },
      draw,
      console.log,
    )

    if (result.selected === 0) {
      console.log('그릴 장면이 없습니다. 검수 전 장면도 그리려면 --allow-draft를 붙이세요.')
      return
    }
    if (dryRun) {
      console.log(`그릴 장면 ${result.selected}개 (dry-run이라 API를 부르지 않았습니다)`)
      return
    }
    console.log(`그림 생성 완료: 성공 ${result.drawn.length}개, 실패 ${result.failed.length}개`)
    for (const failure of result.failed) console.error(`- ${failure.id}: ${failure.reason}`)
    if (result.failed.length > 0) process.exitCode = 1
  },
  async tts(flags) {
    const chapter = positiveInteger(flags.chapter, 'chapter')
    if (chapter === undefined) throw new Error('--chapter <장 번호>가 필요합니다')
    const dryRun = flags['dry-run']
    const speak = dryRun
      ? async () => {
          throw new Error('dry-run에서는 음성을 만들지 않습니다')
        }
      : createOpenAiSpeak()

    const result = await generateSpeech(
      { chapter, force: flags.force, dryRun, limit: positiveInteger(flags.limit, 'limit') },
      speak,
      console.log,
    )

    if (dryRun) {
      console.log(`음성을 만들 절 ${result.selected}개 (dry-run이라 API를 부르지 않았습니다)`)
      return
    }
    console.log(`음성 생성 완료: 성공 ${result.spoken}개, 실패 ${result.failed.length}개`)
    for (const failure of result.failed) console.error(`- ${chapter}:${failure.verse} ${failure.reason}`)
    if (result.failed.length > 0) process.exitCode = 1
  },
  async build() {
    const bundle = await writeBundle()
    const sceneCount = bundle.chapters.reduce((sum, chapter) => sum + chapter.scenes.length, 0)
    console.log(`묶음 생성 완료: ${bundle.chapters.length}장, 장면 ${sceneCount}개`)
  },
}

try {
  if (existsSync(envFile)) process.loadEnvFile(envFile)

  const { positionals, values } = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    options: {
      chapter: { type: 'string' },
      limit: { type: 'string' },
      scene: { type: 'string', multiple: true },
      'allow-draft': { type: 'boolean', default: false },
      force: { type: 'boolean', default: false },
      'dry-run': { type: 'boolean', default: false },
    },
  })

  const command = commands[positionals[0] ?? '']
  if (!command) throw new Error(`사용법: npm run pipeline -- <${Object.keys(commands).join(' | ')}>`)
  await command(values)
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}
