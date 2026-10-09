import { existsSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { isBookId, type BookId } from 'reader-core'
import { writeBundles } from './build/writeBundle.ts'
import { runCanon } from './canon/runCanon.ts'
import { runGloss } from './original/runGloss.ts'
import { runOriginal } from './original/runOriginal.ts'
import { runQuiz } from './quiz/runQuiz.ts'
import { generateImages } from './images/generateImages.ts'
import { createOpenAiDraw } from './images/openaiDraw.ts'
import { envFile } from './paths.ts'
import { runReviewText } from './review/reviewText.ts'
import { runScenario } from './scenario/runScenario.ts'
import { fetchSource, parseChapterRange } from './source/fetchSource.ts'
import { listSourceBooks } from './source/files.ts'
import { generateSpeech } from './tts/generateSpeech.ts'
import { createOpenAiSpeak } from './tts/openaiSpeak.ts'

type Flags = {
  book?: string
  chapter?: string
  chapters?: string
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

function requireBook(flags: Flags): BookId {
  if (flags.book === undefined) throw new Error('--book <책 id>가 필요합니다(예: --book genesis)')
  if (!isBookId(flags.book)) throw new Error(`알 수 없는 책입니다: ${flags.book}. 책 id는 reader-core의 books.ts에 있습니다.`)
  return flags.book
}

// 본문이 있는 모든 책을 성경 순서로 돌려준다. 하나도 없으면 오류를 낸다.
async function allSourceBooks(): Promise<BookId[]> {
  const books = await listSourceBooks()
  if (books.length === 0) throw new Error('본문이 있는 책이 없습니다. 먼저 source --book <책 id>를 실행하세요.')
  return books
}

// --book이 있으면 그 책 하나를, 없으면 본문이 있는 모든 책을 돌려준다.
async function booksOrAll(flags: Flags): Promise<BookId[]> {
  return flags.book === undefined ? allSourceBooks() : [requireBook(flags)]
}

function requireChapter(flags: Flags): number {
  const chapter = positiveInteger(flags.chapter, 'chapter')
  if (chapter === undefined) throw new Error('--chapter <장 번호>가 필요합니다')
  return chapter
}

const commands: Record<string, (flags: Flags) => Promise<void>> = {
  async source(flags) {
    // --chapter를 그냥 두면 책 전체를 받아, 있던 본문 파일이 그 책 전체로 바뀐다.
    if (flags.chapter !== undefined) throw new Error('source는 --chapter 대신 --chapters를 씁니다(예: --chapters 3, --chapters 1-10)')
    // --chapters 3-7처럼 받을 장을 고른다. 없으면 책 전체를 받는다.
    const source = await fetchSource(requireBook(flags), flags.chapters === undefined ? {} : parseChapterRange(flags.chapters))
    const verseCount = source.chapters.reduce((sum, chapter) => sum + chapter.verses.length, 0)
    console.log(`본문 저장 완료: ${source.chapters.length}장 ${verseCount}절`)
  },
  async canon(flags) {
    const book = requireBook(flags)
    await runCanon(book, requireChapter(flags), { dryRun: flags['dry-run'] }, console.log)
  },
  async scenario(flags) {
    const book = requireBook(flags)
    await runScenario(book, requireChapter(flags), { dryRun: flags['dry-run'], force: flags.force }, console.log)
  },
  async 'review-text'(flags) {
    const book = requireBook(flags)
    const result = await runReviewText(book, requireChapter(flags), { dryRun: flags['dry-run'], sceneIds: flags.scene }, console.log)
    if (result.flagged.length > 0) console.log(`확인 필요: ${result.flagged.join(', ')}`)
  },
  async images(flags) {
    const book = requireBook(flags)
    const chapter = requireChapter(flags)
    const dryRun = flags['dry-run']
    const draw = dryRun
      ? async () => {
          throw new Error('dry-run에서는 그리지 않습니다')
        }
      : createOpenAiDraw()

    const result = await generateImages(
      {
        book,
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
    const book = requireBook(flags)
    const chapter = requireChapter(flags)
    const dryRun = flags['dry-run']
    const speak = dryRun
      ? async () => {
          throw new Error('dry-run에서는 음성을 만들지 않습니다')
        }
      : createOpenAiSpeak()

    const result = await generateSpeech(
      { book, chapter, force: flags.force, dryRun, limit: positiveInteger(flags.limit, 'limit') },
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
  async original(flags) {
    for (const book of await booksOrAll(flags)) {
      const result = await runOriginal(book, {}, console.log)
      console.log(
        `원어 저장 완료: ${result.chapters}장, 낱말 ${result.words}개, 사전 항목 ${result.entries}개(한국어 뜻 있음 ${result.withKorean}개)`,
      )
    }
  },
  async 'original-gloss'(flags) {
    if (flags.book !== undefined) throw new Error('original-gloss는 모든 책이 함께 쓰는 사전을 채웁니다. --book은 받지 않습니다.')
    const result = await runGloss(
      { limit: positiveInteger(flags.limit, 'limit'), force: flags.force, dryRun: flags['dry-run'] },
      console.log,
    )
    if (result.dryRun) {
      console.log(`한국어 뜻을 쓸 사전 항목 ${result.selected}개 (dry-run이라 API를 부르지 않았습니다)`)
      return
    }
    console.log(`한국어 뜻 초안: ${result.written}/${result.selected}개. 관리 도구의 "원어 뜻"에서 검수하세요.`)
    if (result.missing.length > 0) {
      console.error(`돌려받지 못한 항목: ${result.missing.join(', ')}`)
      process.exitCode = 1
    }
  },
  async quiz(flags) {
    const book = requireBook(flags)
    const chapter = requireChapter(flags)
    const result = await runQuiz(book, chapter, { force: flags.force, dryRun: flags['dry-run'] }, console.log)
    if (result.skipped || result.dryRun) return
    console.log(`${chapter}장 퀴즈: ${result.written}문제(검수 통과 ${result.reviewed}, 지적 ${result.flagged}). 관리 도구의 "퀴즈"에서 승인하세요.`)
  },
  async build(flags) {
    // 앱 콘텐츠 폴더를 비우고 다시 쓰므로 한 책만 만들면 다른 책 묶음이 지워진다.
    if (flags.book !== undefined) throw new Error('build는 본문이 있는 모든 책을 함께 만듭니다. --book은 받지 않습니다.')
    const bundles = await writeBundles(await listSourceBooks())
    for (const bundle of bundles) {
      const sceneCount = bundle.chapters.reduce((sum, chapter) => sum + chapter.scenes.length, 0)
      // 책이 여럿이면 어느 책인지 앞에 적는다.
      const label = bundles.length > 1 ? `${bundle.book} ` : ''
      console.log(`${label}묶음 생성 완료: ${bundle.chapters.length}장, 장면 ${sceneCount}개`)
    }
  },
}

try {
  if (existsSync(envFile)) process.loadEnvFile(envFile)

  const { positionals, values } = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    options: {
      book: { type: 'string' },
      chapter: { type: 'string' },
      chapters: { type: 'string' },
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
