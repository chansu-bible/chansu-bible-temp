// 머리에서 고른 책. 브라우저에 기억해 두고, 기억한 책의 본문이 없어졌으면 첫 책을 쓴다.
import type { BookId } from './types.ts'

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
