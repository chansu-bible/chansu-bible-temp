// 원어 뜻 화면의 거르기와 찾기
import type { LexiconFilter } from './route.ts'
import type { LexiconEntry } from './types.ts'

// 한국어 뜻 상태. 뜻이 없으면 none
export function glossState(entry: LexiconEntry): Exclude<LexiconFilter, 'all'> {
  return entry.korean?.status ?? 'none'
}

export function matchesFilter(entry: LexiconEntry, filter: LexiconFilter): boolean {
  return filter === 'all' || glossState(entry) === filter
}

// 거르기마다 항목 수
export function countByFilter(entries: LexiconEntry[]): Record<LexiconFilter, number> {
  const counts: Record<LexiconFilter, number> = { draft: 0, approved: 0, none: 0, all: entries.length }
  for (const entry of entries) counts[glossState(entry)] += 1
  return counts
}

// 찾기용 글자. 소문자로 바꾸고 발음 부호(히브리어 모음 점·악센트, 음역 글자 위 부호)와 ʼ ʻ를 뺀다.
// 그래서 "ראשית"로 "רֵאשִׁית"를, "reshiyth"로 "rêʼshîyth"를 찾는다.
export function searchKey(text: string): string {
  return text.normalize('NFD').replace(/[\p{M}ʼʻ]/gu, '').normalize('NFC').toLowerCase()
}

const entryKeys = new WeakMap<LexiconEntry, string>()

function entryKey(entry: LexiconEntry): string {
  let key = entryKeys.get(entry)
  if (key === undefined) {
    const { strong, lemma, xlit, definition, usage, korean } = entry
    key = searchKey([strong, lemma, xlit, definition, usage, korean?.meaning ?? '', korean?.note ?? ''].join('\n'))
    entryKeys.set(entry, key)
  }
  return key
}

// 번호, 히브리어 원형, 음역, 영어 정의·KJV 번역어, 한국어 뜻·메모 가운데 하나에 찾는 말이 들어 있으면 참
export function matchesQuery(entry: LexiconEntry, query: string): boolean {
  const q = searchKey(query.trim())
  return q === '' || entryKey(entry).includes(q)
}
