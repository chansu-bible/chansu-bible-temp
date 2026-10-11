import { getBook, type BookId } from 'reader-core'

// 위키문헌에는 요한일서·요한이서·요한삼서가 요한1서·요한2서·요한3서라는 쪽 이름으로 있다. 나머지 63권은 책 이름 그대로다.
// 본문 파일의 책 이름은 쪽 이름과 상관없이 개역한글 이름(요한일서)이다.
const pageNames: Partial<Record<BookId, string>> = {
  '1-john': '요한1서',
  '2-john': '요한2서',
  '3-john': '요한3서',
}

// 그 책의 개역한글판 본문이 있는 위키문헌 쪽 이름(예: "개역한글판/창세기")
export function wikisourcePageTitle(book: BookId): string {
  return `개역한글판/${pageNames[book] ?? getBook(book).name}`
}
