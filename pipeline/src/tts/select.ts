import type { Verse } from '../schema.ts'

export type SpeakOptions = { force: boolean; limit?: number }

export function audioName(chapter: number, verse: number): string {
  return `genesis-${String(chapter).padStart(2, '0')}-${String(verse).padStart(3, '0')}.mp3`
}

export function selectVersesToSpeak(
  chapter: number,
  verses: Verse[],
  existing: ReadonlySet<string>,
  options: SpeakOptions,
): Verse[] {
  const selected = verses.filter((verse) => options.force || !existing.has(audioName(chapter, verse.verse)))
  return options.limit === undefined ? selected : selected.slice(0, options.limit)
}
