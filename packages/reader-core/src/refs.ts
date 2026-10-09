import { bookOrder, findBook, getBook, type Book, type BookId } from './books.ts'

// 절 참조. 책이 붙은 "genesis 4:1-5"는 책을 넘나드는 곳(설정집)에, 책 없는 "4:1"은 한 책 안(장면, 책 묶음)에 쓴다.
export type VerseRef = { book: BookId | null; chapter: number; verse: number; verseEnd: number }

const PATTERN = /^(?:([a-z0-9-]+) )?(\d{1,3}):(\d{1,3})(?:-(\d{1,3}))?$/

// 읽을 수 없으면 null이다. 책이 붙은 참조는 그 책에 있는 장이어야 한다(책 없는 참조는 장 수를 볼 책이 없다).
export function parseRef(text: string): VerseRef | null {
  const match = PATTERN.exec(text.trim())
  if (!match) return null
  let book: Book | null = null
  if (match[1] !== undefined) {
    const found = findBook(match[1])
    if (!found) return null
    book = found
  }
  const chapter = Number(match[2])
  const verse = Number(match[3])
  const verseEnd = match[4] === undefined ? verse : Number(match[4])
  if (chapter < 1 || verse < 1 || verseEnd < verse) return null
  if (book !== null && chapter > book.chapters) return null
  return { book: book?.id ?? null, chapter, verse, verseEnd }
}

// 'id': "genesis 4:1-5"(저장), 'name': "창세기 4:1-5"(화면), 'bare': "4:1-5"
export function formatRef(ref: VerseRef, style: 'id' | 'name' | 'bare' = 'id'): string {
  const bare = ref.verseEnd === ref.verse ? `${ref.chapter}:${ref.verse}` : `${ref.chapter}:${ref.verse}-${ref.verseEnd}`
  if (style === 'bare' || ref.book === null) return bare
  return `${style === 'name' ? getBook(ref.book).name : ref.book} ${bare}`
}

// 책 없는 참조에 책을 붙인다. 이미 책이 있으면 그대로(정리한 모양으로) 돌려준다.
// 읽을 수 없거나, 붙인 책에 없는 장이면(창세기 51장) null이다.
export function qualifyRef(text: string, book: BookId): string | null {
  const ref = parseRef(text)
  if (!ref) return null
  const qualified = formatRef({ ...ref, book: ref.book ?? book })
  return parseRef(qualified) ? qualified : null
}

// 그 책 안의 참조("4:1")로 바꾼다. 읽을 수 없는 글이거나 다른 책을 가리키면 둘 다 null이다.
export function localRef(text: string, book: BookId): string | null {
  const ref = parseRef(text)
  if (!ref || (ref.book !== null && ref.book !== book)) return null
  return formatRef(ref, 'bare')
}

// 화면에 보이는 참조. book은 지금 보고 있는 책이다. 이 책의 절이면 책 없이("3:21"), 다른 책의 절이면 책 이름을 붙여("창세기 3:21") 보인다.
// 책 없는 참조는 이 책의 것으로 본다. 읽을 수 없는 글은 그대로 둔다.
export function displayRef(text: string, book: BookId): string {
  const local = localRef(text, book)
  if (local !== null) return local
  const ref = parseRef(text)
  return ref ? formatRef(ref, 'name') : text
}

// 두 참조를 "~"로 이은 범위(시대의 절 범위 등)를 화면에 보인다. book은 지금 보고 있는 책이다.
// - 두 끝이 모두 이 책 안이면 책 없이("2:4~3:24")
// - 두 끝이 같은 다른 책 안이면 책 이름을 앞에 한 번만("창세기 2:4~3:24")
// - 두 끝이 서로 다른 책이면 끝마다 책 이름을("창세기 50:26~출애굽기 1:1"). 한 끝이 이 책이어도 이름을 쓴다.
// - 한 끝이라도 읽을 수 없으면 끝마다 displayRef로 보인다.
export function displayRange(from: string, to: string, book: BookId): string {
  const start = parseRef(from)
  const end = parseRef(to)
  if (!start || !end) return `${displayRef(from, book)}~${displayRef(to, book)}`
  // 책 없는 끝은 이 책의 절이다.
  const startBook = start.book ?? book
  const endBook = end.book ?? book
  if (startBook !== endBook) {
    return `${formatRef({ ...start, book: startBook }, 'name')}~${formatRef({ ...end, book: endBook }, 'name')}`
  }
  const bare = `${formatRef(start, 'bare')}~${formatRef(end, 'bare')}`
  return startBook === book ? bare : `${getBook(startBook).name} ${bare}`
}

// 시작 위치(책 순서, 장, 시작 절)로 비교한다. 끝 절(verseEnd)은 보지 않는다.
// 책 없는 참조는 fallback 책으로 보고, 둘 다 책이 없으면 같은 책으로 친다.
// 한쪽만 책이 있는데 fallback도 없으면 어느 책인지 알 수 없어 오류를 던진다.
export function compareRefs(a: VerseRef, b: VerseRef, fallback?: BookId): number {
  const bookA = a.book ?? fallback ?? null
  const bookB = b.book ?? fallback ?? null
  if ((bookA === null) !== (bookB === null)) {
    throw new Error('책이 있는 참조와 책 없는 참조를 비교하려면 fallback 책이 필요합니다')
  }
  const byBook = bookA !== null && bookB !== null ? bookOrder(bookA) - bookOrder(bookB) : 0
  return byBook || a.chapter - b.chapter || a.verse - b.verse
}

// "4:17"이나 "genesis 4:17" → 4. 읽을 수 없으면 0이다.
// 책 묶음 안의 참조용이다. 책이 붙어 있어도 책은 보지 않는다.
export function chapterOfReference(reference: string): number {
  return parseRef(reference)?.chapter ?? 0
}

// "4:17"이나 "genesis 4:17" → 17. 읽을 수 없으면 0이다.
// 책 묶음 안의 참조용이다. 책이 붙어 있어도 책은 보지 않는다.
export function verseOfReference(reference: string): number {
  return parseRef(reference)?.verse ?? 0
}
