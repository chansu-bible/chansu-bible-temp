import { existsSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { Hono } from 'hono'
import { KoreanGlossSchema, LexiconFileSchema, paths, readLexicon, type KoreanGloss, type LexiconFile } from 'pipeline'
import { getBook } from 'reader-core'
import type { AppContext } from '../context.ts'
import { errorMessage, HttpError, readJsonBody } from '../errors.ts'
import { createSerial } from '../files.ts'

// PUT 본문 { meaning, note, status }. 한국어 뜻과 같되 meaning은 note처럼 빈 글도 받는다(비우면 뜻을 지운다).
const GlossBodySchema = KoreanGlossSchema.extend({ meaning: KoreanGlossSchema.shape.note })

// 본문을 저장할 한국어 뜻으로 바꾼다. 앞뒤 공백은 떼고, meaning이 비면 null(뜻 없음)이다. 형식이 틀리면 400.
export function parseGloss(body: unknown): KoreanGloss | null {
  const parsed = GlossBodySchema.safeParse(body)
  if (!parsed.success) throw new HttpError(400, errorMessage(parsed.error, '한국어 뜻이 형식에 맞지 않습니다'))
  const meaning = parsed.data.meaning.trim()
  return meaning ? { meaning, note: parsed.data.note.trim(), status: parsed.data.status } : null
}

// original·original-gloss 작업은 사전 파일 전체를 읽어 두었다가 다시 쓴다.
// 작업이 도는 동안 저장하면 작업이 덮어써서 사람이 고친 뜻이 사라지므로 받지 않는다(409).
// 사전은 모든 책이 함께 쓰므로 어느 책의 작업이든 막는다.
function refuseDuringOriginalJob(ctx: AppContext): void {
  const job = ctx.queue.active()
  if (job && (job.stage === 'original' || job.stage === 'original-gloss')) {
    const label = job.options.book ? `${getBook(job.options.book).name} ${job.stage}` : job.stage
    throw new HttpError(409, `${label} 작업이 실행 중이라 저장할 수 없습니다. 작업이 끝난 뒤 다시 저장하세요`)
  }
}

export function lexiconRoutes(ctx: AppContext): Hono {
  const app = new Hono()
  const file = ctx.lexiconFile ?? paths.lexiconFile
  const serial = createSerial()

  // 깨진 파일이면 readLexicon이 파일 이름을 앞에 붙인 오류를 낸다.
  const read = async (): Promise<LexiconFile> => {
    if (!existsSync(file)) {
      throw new HttpError(404, '원어 사전이 아직 없습니다. 작업 화면에서 original 단계를 먼저 실행하세요')
    }
    return readLexicon(file)
  }

  app.get('/', async (c) => c.json(await read()))

  // 항목 하나의 한국어 뜻만 바꿔 파일을 다시 쓴다(original 단계와 같은 모양). 바뀐 항목을 돌려준다.
  app.put('/:strong', async (c) => {
    const strong = c.req.param('strong')
    const korean = parseGloss(await readJsonBody(c.req.raw))
    return serial(async () => {
      refuseDuringOriginalJob(ctx)
      const lexicon = await read()
      const index = lexicon.entries.findIndex((entry) => entry.strong === strong)
      if (index < 0) throw new HttpError(404, `사전에 없는 번호입니다: ${strong}`)
      const entries = [...lexicon.entries]
      const entry = { ...entries[index]!, korean }
      entries[index] = entry
      const next = LexiconFileSchema.parse({ ...lexicon, entries })
      await writeFile(file, JSON.stringify(next, null, 2) + '\n', 'utf8')
      return c.json(entry)
    })
  })

  return app
}
