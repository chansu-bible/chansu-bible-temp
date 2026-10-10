// 머리에서 고른 책. 브라우저에 기억해 두고, 기억한 책의 본문이 없어졌으면 첫 책을 쓴다.
import type { BookId, BookSummary } from './types.ts'

// 고를 수 있는 책: 본문을 읽은 책. 본문 파일이 깨진 책(error)은 목록에는 보이되 고르지 못한다.
export function readableBooks(books: readonly BookSummary[]): BookSummary[] {
  return books.filter((book) => !book.error)
}

// 머리의 책 고르기에 보이는 이름: "창세기 · 10/50장", 본문을 읽지 못한 책은 "출애굽기 · 읽지 못함"
export function bookOptionLabel(book: BookSummary): string {
  return book.error ? `${book.name} · 읽지 못함` : `${book.name} · ${book.sourceChapters}/${book.chapters}장`
}

// 책마다 모으는 화면(검수 대기열, 그림) 위에 보일 한 줄. where는 빠지는 곳("이 목록", "그림 수")이다.
// 책 목록을 받지 못했으면 그 오류를, 본문을 읽지 못한 책(unreadable, 책 이름)이 있으면 그 책들을 알린다. 없으면 null
export function skippedBooksNote(unreadable: readonly string[], listError: string | null, where: string): string | null {
  if (listError) return `책 목록을 읽지 못해 ${where}에서 모든 책이 빠졌어요: ${listError}`
  if (unreadable.length === 0) return null
  return `${unreadable.join(', ')} 본문을 읽지 못해 ${where}에서 빠졌어요`
}

const STORAGE_KEY = 'admin.book'

// 기억해 둔 책 id. 저장소를 쓸 수 없으면(막힌 브라우저 등) null이다.
export function readStoredBook(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

export function storeBook(book: BookId): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, book)
  } catch {
    // 기억하지 못해도 이번 화면에서는 고른 책을 쓴다.
  }
}

// 고를 책: 기억한 책이 목록(본문이 있는 책)에 있으면 그 책, 아니면 첫 책. 목록이 비면 null이다.
export function chooseBook(books: readonly BookId[], stored: string | null): BookId | null {
  return books.find((book) => book === stored) ?? books[0] ?? null
}
