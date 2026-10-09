import { bookOrder, findBook, getBook, type BookId } from './books.ts'

// 절 참조. 책이 붙은 "genesis 4:1-5"는 책을 넘나드는 곳(설정집)에, 책 없는 "4:1"은 한 책 안(장면, 책 묶음)에 쓴다.
export type VerseRef = { book: BookId | null; chapter: number; verse: number; verseEnd: number }

const PATTERN = /^(?:([a-z0-9-]+) )?(\d{1,3}):(\d{1,3})(?:-(\d{1,3}))?$/

export function parseRef(text: string): VerseRef | null {
  const match = PATTERN.exec(text.trim())
  if (!match) return null
  let book: BookId | null = null
  if (match[1] !== undefined) {
    const found = findBook(match[1])
    if (!found) return null
    book = found.id
  }
  const chapter = Number(match[2])
  const verse = Number(match[3])
  const verseEnd = match[4] === undefined ? verse : Number(match[4])
  if (chapter < 1 || verse < 1 || verseEnd < verse) return null
  return { book, chapter, verse, verseEnd }
}

// 'id': "genesis 4:1-5"(저장), 'name': "창세기 4:1-5"(화면), 'bare': "4:1-5"
export function formatRef(ref: VerseRef, style: 'id' | 'name' | 'bare' = 'id'): string {
  const bare = ref.verseEnd === ref.verse ? `${ref.chapter}:${ref.verse}` : `${ref.chapter}:${ref.verse}-${ref.verseEnd}`
  if (style === 'bare' || ref.book === null) return bare
  return `${style === 'name' ? getBook(ref.book).name : ref.book} ${bare}`
}

// 책 없는 참조에 책을 붙인다. 이미 책이 있으면 그대로(정리한 모양으로) 돌려준다. 읽을 수 없으면 null
export function qualifyRef(text: string, book: BookId): string | null {
  const ref = parseRef(text)
  return ref ? formatRef({ ...ref, book: ref.book ?? book }) : null
}

// 그 책 안의 참조로 바꾼다. 다른 책을 가리키면 null
export function localRef(text: string, book: BookId): string | null {
  const ref = parseRef(text)
  if (!ref || (ref.book !== null && ref.book !== book)) return null
  return formatRef(ref, 'bare')
}

// 책 순서, 장, 절 순서. 책이 없는 참조는 fallback 책으로 본다(없으면 같은 책으로 친다).
export function compareRefs(a: VerseRef, b: VerseRef, fallback?: BookId): number {
  const bookA = a.book ?? fallback ?? null
  const bookB = b.book ?? fallback ?? null
  const byBook = bookA !== null && bookB !== null ? bookOrder(bookA) - bookOrder(bookB) : 0
  return byBook || a.chapter - b.chapter || a.verse - b.verse
}
