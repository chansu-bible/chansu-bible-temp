import { existsSync } from 'node:fs'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { audioDir, sourceFile } from '../paths.ts'
import { SourceSchema, type Verse } from '../schema.ts'
import { audioName, selectVersesToSpeak } from './select.ts'

export type Speak = (text: string) => Promise<Uint8Array>

export type SpeechOptions = { chapter: number; force: boolean; dryRun: boolean; limit?: number }

export type SpeechResult = { selected: number; spoken: number; failed: { verse: number; reason: string }[] }

// 한 번에 보내는 요청 수
const concurrency = 4

export async function generateSpeech(
  options: SpeechOptions,
  speak: Speak,
  log: (line: string) => void,
): Promise<SpeechResult> {
  const source = SourceSchema.parse(JSON.parse(await readFile(sourceFile, 'utf8')))
  const chapter = source.chapters.find((c) => c.chapter === options.chapter)
  if (!chapter) throw new Error(`${options.chapter}장은 본문에 없습니다`)

  await mkdir(audioDir, { recursive: true })
  const existing = existsSync(audioDir) ? new Set(await readdir(audioDir)) : new Set<string>()
  const queue = selectVersesToSpeak(options.chapter, chapter.verses, existing, options)
  const result: SpeechResult = { selected: queue.length, spoken: 0, failed: [] }
  if (options.dryRun) return result

  async function speakVerse(verse: Verse): Promise<void> {
    try {
      const bytes = await speak(verse.text)
      await writeFile(path.join(audioDir, audioName(options.chapter, verse.verse)), bytes)
      result.spoken++
    } catch (error) {
      result.failed.push({ verse: verse.verse, reason: error instanceof Error ? error.message : String(error) })
    }
  }

  // 절마다 파일을 바로 저장하므로, 중간에 멈춰도 다시 실행하면 남은 절만 만든다.
  async function worker(): Promise<void> {
    for (let verse = queue.shift(); verse; verse = queue.shift()) await speakVerse(verse)
  }
  log(`${options.chapter}장 ${result.selected}절의 음성을 만드는 중`)
  await Promise.all(Array.from({ length: concurrency }, worker))
  return result
}
