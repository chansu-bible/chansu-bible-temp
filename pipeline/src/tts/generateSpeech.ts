import { existsSync } from 'node:fs'
import { mkdir, readdir, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { verseAudioName, type BookId } from 'reader-core'
import { audioDir as defaultAudioDir, sourceDir as defaultSourceDir } from '../paths.ts'
import type { Verse } from '../schema.ts'
import { readSource } from '../source/files.ts'
import { selectVersesToSpeak } from './select.ts'

export type Speak = (text: string) => Promise<Uint8Array>

export type SpeechOptions = { book: BookId; chapter: number; force: boolean; dryRun: boolean; limit?: number }

export type SpeechResult = { selected: number; spoken: number; failed: { verse: number; reason: string }[] }

// 읽고 쓰는 폴더. 이름은 paths.ts의 경로와 같고, 비우면 저장소의 content 아래 폴더다. 시험은 임시 폴더로 바꿔 준다.
export type SpeechDirs = { sourceDir?: string; audioDir?: string }

// 한 번에 보내는 요청 수
const concurrency = 4

export async function generateSpeech(
  options: SpeechOptions,
  speak: Speak,
  log: (line: string) => void,
  dirs: SpeechDirs = {},
): Promise<SpeechResult> {
  const { sourceDir = defaultSourceDir, audioDir = defaultAudioDir } = dirs
  const source = await readSource(options.book, sourceDir)
  const chapter = source.chapters.find((c) => c.chapter === options.chapter)
  if (!chapter) throw new Error(`${options.chapter}장은 본문에 없습니다`)

  await mkdir(audioDir, { recursive: true })
  const existing = existsSync(audioDir) ? new Set(await readdir(audioDir)) : new Set<string>()
  const queue = selectVersesToSpeak(options.book, options.chapter, chapter.verses, existing, options)
  const result: SpeechResult = { selected: queue.length, spoken: 0, failed: [] }
  if (options.dryRun) return result

  async function speakVerse(verse: Verse): Promise<void> {
    const file = path.join(audioDir, verseAudioName(options.book, options.chapter, verse.verse))
    try {
      const bytes = await speak(verse.text)
      // 임시 파일에 다 쓴 뒤 이름을 바꿔 둔다. 끊겨도 반쯤 쓰인 낭독이 남지 않는다.
      // select.ts는 있는 파일을 건너뛰므로, 반쪽 파일이 남으면 다시 실행해도 그 절을 다시 만들지 않는다.
      await writeFile(`${file}.tmp`, bytes)
      await rename(`${file}.tmp`, file)
      result.spoken++
    } catch (error) {
      // 쓰다 만 임시 파일을 치운다. 치우다 난 오류는 원래 오류를 가리지 않게 버린다.
      await rm(`${file}.tmp`, { force: true }).catch(() => undefined)
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
