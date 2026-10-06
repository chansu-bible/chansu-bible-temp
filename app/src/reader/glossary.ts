import type { Gloss } from '../content/types.ts'

export type TextPart = { text: string; gloss?: Gloss }

// 절 본문을 풀이한 낱말 자리에서 잘라, 낱말 조각에는 풀이를 붙인다.
// 같은 낱말이 여러 번 나오면 처음 나온 곳만, 겹치는 낱말은 먼저 나오는 것만 표시한다.
export function splitByGlosses(text: string, glosses: Gloss[]): TextPart[] {
  const hits = glosses
    .map((gloss) => ({ gloss, start: text.indexOf(gloss.word) }))
    .filter((hit) => hit.start >= 0)
    .sort((a, b) => a.start - b.start || b.gloss.word.length - a.gloss.word.length)

  const parts: TextPart[] = []
  let cursor = 0
  for (const { gloss, start } of hits) {
    if (start < cursor) continue
    if (start > cursor) parts.push({ text: text.slice(cursor, start) })
    parts.push({ text: gloss.word, gloss })
    cursor = start + gloss.word.length
  }
  if (cursor < text.length || parts.length === 0) parts.push({ text: text.slice(cursor) })
  return parts
}
