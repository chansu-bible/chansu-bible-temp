import { verseAudioName, type BookId } from 'reader-core'
import type { Verse } from '../schema.ts'

export type SpeakOptions = { force: boolean; limit?: number }

// 음성 파일(reader-core의 verseAudioName 이름)이 아직 없는 절을 고른다.
export function selectVersesToSpeak(
  book: BookId,
  chapter: number,
  verses: Verse[],
  existing: ReadonlySet<string>,
  options: SpeakOptions,
): Verse[] {
  const selected = verses.filter((verse) => options.force || !existing.has(verseAudioName(book, chapter, verse.verse)))
  return options.limit === undefined ? selected : selected.slice(0, options.limit)
}
