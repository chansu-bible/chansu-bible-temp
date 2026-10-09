import type { Passage } from './passages.ts'

const plain = (text: string): string => text.replace(/[\s\p{P}\p{S}]/gu, '')

// 띄어쓰기와 문장 부호를 지운 글자 두 개 단위(바이그램). 조사가 붙어 낱말이 조금 달라도 겹침을 센다(보조 점수).
export function bigrams(text: string): string[] {
  const letters = plain(text)
  const result: string[] = []
  for (let index = 0; index + 2 <= letters.length; index++) result.push(letters.slice(index, index + 2))
  return result
}

// 질문 끝말과 조사. 긴 것부터 뗀다.
const SUFFIXES = [
  '이에요',
  '예요',
  '인가요',
  '이었어요',
  '였어요',
  '에게서',
  '에게',
  '에서',
  '으로',
  '이라는',
  '라는',
  '이란',
  '란',
  '이나',
  '은',
  '는',
  '이',
  '가',
  '을',
  '를',
  '의',
  '에',
  '로',
  '와',
  '과',
  '도',
  '만',
  '나',
]
// 묻는 말과 뜻이 옅은 말. 대목을 고르는 데 쓰지 않는다.
const STOPWORDS = new Set([
  '무엇',
  '뭐',
  '뭔',
  '무슨',
  '누구',
  '누가',
  '어디',
  '언제',
  '왜',
  '어떻게',
  '어떤',
  '얼마',
  '얼마나',
  '뜻',
  '의미',
  '다른',
  '같은',
  '사람',
  '것',
  '이유',
  '했어요',
  '했나요',
  '되나요',
  '있어요',
  '있나요',
  '하나요',
  '그',
  '이',
  '저',
  '두',
])

// 질문의 낱말 줄기(조사를 뗀 것)와, 이웃한 낱말을 붙인 말(예: "칠 배" → "칠배")
export function keywords(question: string): { stems: string[]; phrases: string[] } {
  const stems: string[] = []
  for (const token of question.split(/[\s\p{P}\p{S}]+/u).filter(Boolean)) {
    let stem = token
    for (const suffix of SUFFIXES) {
      if (stem.length > suffix.length && stem.endsWith(suffix)) {
        stem = stem.slice(0, -suffix.length)
        break
      }
    }
    if (!STOPWORDS.has(stem) && !STOPWORDS.has(token)) stems.push(stem)
  }
  const phrases: string[] = []
  for (let index = 0; index + 1 < stems.length; index++) phrases.push(stems[index]! + stems[index + 1]!)
  return { stems: [...new Set(stems)], phrases: [...new Set(phrases)] }
}

export type PassageIndex = {
  passages: Passage[]
  // 대목마다 띄어쓰기를 지운 글(낱말 줄기를 찾는다)
  plains: string[]
  // 대목마다 바이그램 → 횟수
  counts: Map<string, number>[]
  // 바이그램 → 그것이 든 대목 수
  documentFrequency: Map<string, number>
}

export function buildIndex(passages: Passage[]): PassageIndex {
  const counts = passages.map((passage) => {
    const map = new Map<string, number>()
    for (const gram of bigrams(passage.text)) map.set(gram, (map.get(gram) ?? 0) + 1)
    return map
  })
  const documentFrequency = new Map<string, number>()
  for (const map of counts) for (const gram of map.keys()) documentFrequency.set(gram, (documentFrequency.get(gram) ?? 0) + 1)
  return { passages, plains: passages.map((passage) => plain(passage.text)), counts, documentFrequency }
}

export type Scored = { passage: Passage; score: number }

// 점수: 질문의 낱말 줄기와 붙인 말이 대목에 들어 있으면 드물수록(idf) 크게 센다. 바이그램 겹침은 보조로 더한다.
// 긴 대목은 조금 덜 세고, 질문한 장의 대목은 1.5배, 질문의 낱말이 이름 그대로인 설정집 항목은 크게 올린다.
export function retrieve(index: PassageIndex, question: string, options: { chapter?: number; limit?: number } = {}): Scored[] {
  const total = index.passages.length
  const idf = (documents: number) => Math.log(1 + total / Math.max(documents, 1))
  const { stems, phrases } = keywords(question)
  const terms = [
    ...stems.map((term) => ({ term, weight: term.length >= 2 ? 2 : 1.5 })),
    ...phrases.map((term) => ({ term, weight: 3 })),
  ].map(({ term, weight }) => ({ term, weight, idf: idf(index.plains.filter((text) => text.includes(term)).length) }))
  const asked = [...new Set(bigrams(question))]

  const scored: Scored[] = []
  index.passages.forEach((passage, at) => {
    const text = index.plains[at]!
    let score = 0
    for (const { term, weight, idf: termIdf } of terms) if (text.includes(term)) score += weight * termIdf
    const counts = index.counts[at]!
    for (const gram of asked) {
      const count = counts.get(gram)
      if (count) score += 0.5 * idf(index.documentFrequency.get(gram) ?? 1) * Math.min(count, 2)
    }
    if (score === 0) return
    score /= 1 + Math.log(1 + text.length / 120)
    if (options.chapter !== undefined && passage.chapter === options.chapter) score *= 1.5
    if (passage.kind === 'canon' && stems.includes(plain(passage.label.replace(/^설정집 · /, '')))) score += 8
    scored.push({ passage, score })
  })
  return scored.sort((a, b) => b.score - a.score).slice(0, options.limit ?? 10)
}
