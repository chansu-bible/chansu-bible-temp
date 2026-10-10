// 설정집의 절 인용. 저장 모양은 책 id가 붙은 "genesis 2:7"이고, 화면에는 책 이름으로 "창세기 2:7"이 보인다.
import { bookByName, formatRef, parseRef, qualifyRef } from 'reader-core'
import type { BookId } from './types.ts'

// 저장된 절 인용을 화면에 보이는 모양으로 바꾼다: "genesis 2:7" → "창세기 2:7". 읽을 수 없는 글은 그대로 둔다.
export function citationLabel(text: string): string {
  const ref = parseRef(text)
  return ref ? formatRef(ref, 'name') : text
}

// 입력한 절 인용을 저장 모양(책 id가 붙은 "genesis 2:7")으로 바꾼다.
// "genesis 2:7", 책 이름이 붙은 "창세기 2:7", 책 없는 "2:7"을 받고, 책 없는 인용에는 book(고른 책)을 붙인다.
// "02:07"과 "2:7-7"은 "2:7"로 쓴다. 읽을 수 없거나, 붙일 책이 없거나, 그 책에 없는 장이면 null이다.
export function toStoredCitation(text: string, book: BookId | null): string | null {
  const words = text.trim().split(/\s+/)
  // 책 이름(공백이 없다)이나 책 id 뒤에 장:절. 책 이름은 id로 바꾸고 사이를 한 칸으로 맞춘다.
  const input = words.length === 2 ? `${bookByName(words[0]!)?.id ?? words[0]} ${words[1]}` : words.join(' ')
  const ref = parseRef(input)
  if (!ref) return null
  if (ref.book !== null) return formatRef(ref)
  return book === null ? null : qualifyRef(input, book)
}

// value 안에서 paths가 가리키는 글(절 인용)을 화면 모양으로 바꾼 값. field는 value가 항목 안에서 놓인 자리(점 경로)다.
// paths는 인용이 든 자리이고, 배열의 칸은 *로 적는다(예: "facts.sources.*", "facts.attire.*.from").
// field가 인용 자리이거나 그 위(예: "range"는 "range.from"과 "range.to"의 위)일 때만 바꾸고, 모양이 다른 값은 그대로 둔다.
export function citationValueLabel(paths: readonly string[], field: string, value: unknown): unknown {
  const at = field.split('.')
  let result = value
  for (const path of paths) {
    const keys = path.split('.')
    if (keys.length < at.length || !at.every((key, index) => keys[index] === '*' || keys[index] === key)) continue
    result = labelAt(result, keys.slice(at.length))
  }
  return result
}

// value의 rest 자리에 있는 글을 바꾼 새 값. 자리가 없거나 모양이 다르면 그대로 둔다.
function labelAt(value: unknown, rest: string[]): unknown {
  if (rest.length === 0) return typeof value === 'string' ? citationLabel(value) : value
  const [key, ...more] = rest as [string, ...string[]]
  if (key === '*') return Array.isArray(value) ? value.map((item) => labelAt(item, more)) : value
  if (typeof value !== 'object' || value === null || Array.isArray(value) || !(key in value)) return value
  const record = value as Record<string, unknown>
  return { ...record, [key]: labelAt(record[key], more) }
}
