// 절 단위 밑줄·메모·즐겨찾기. 한 절에 기록 하나다. 글자 단위 범위는 본문이 고쳐지면 어긋나서 쓰지 않는다.
export type MarkColor = 'yellow' | 'green' | 'blue'
export const MARK_COLORS: MarkColor[] = ['yellow', 'green', 'blue']

export type Mark = {
  book: string
  chapter: number
  verse: number
  // 밑줄 색. null이면 밑줄 없음
  color: MarkColor | null
  note: string
  bookmark: boolean
}

export function markId(book: string, chapter: number, verse: number): string {
  return `${book}:${chapter}:${verse}`
}

export function emptyMark(book: string, chapter: number, verse: number): Mark {
  return { book, chapter, verse, color: null, note: '', bookmark: false }
}

export function isEmptyMark(mark: Mark): boolean {
  return mark.color === null && mark.note.trim() === '' && !mark.bookmark
}

// 저장된 값을 읽는다. 장·절이 없으면 null, 모르는 색은 밑줄 없음으로 본다.
export function parseMark(value: unknown): Mark | null {
  if (typeof value !== 'object' || value === null) return null
  const saved = value as Record<string, unknown>
  if (typeof saved.book !== 'string' || typeof saved.chapter !== 'number' || typeof saved.verse !== 'number') return null
  return {
    book: saved.book,
    chapter: saved.chapter,
    verse: saved.verse,
    color: MARK_COLORS.includes(saved.color as MarkColor) ? (saved.color as MarkColor) : null,
    note: typeof saved.note === 'string' ? saved.note : '',
    bookmark: saved.bookmark === true,
  }
}

export type MarkCounts = { highlights: number; notes: number; bookmarks: number }

export function countMarks(marks: Mark[]): MarkCounts {
  return {
    highlights: marks.filter((mark) => mark.color !== null).length,
    notes: marks.filter((mark) => mark.note.trim() !== '').length,
    bookmarks: marks.filter((mark) => mark.bookmark).length,
  }
}

export function sortMarks(marks: Mark[]): Mark[] {
  return [...marks].sort((a, b) => a.chapter - b.chapter || a.verse - b.verse)
}
