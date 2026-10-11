// 해시 라우팅.
// 책을 가리는 화면: #/<책 id>/dashboard, #/<책 id>/scenes/1[/sceneId], #/<책 id>/quiz/1
// 모든 책이 함께 쓰는 화면: #/canon/characters[/id], #/lexicon[/draft|approved|none|all], #/images, #/jobs, #/queue, #/repo
// 옛 주소(#/, #/scenes/1, #/quiz/1)와 고를 수 없는 책이 든 주소는 고른 책의 주소로 바꿔 쓴다(redirectHref).
import { CANON_KINDS, type BookId, type CanonKind } from './types.ts'

// 원어 뜻 화면의 거르기: 한국어 뜻 초안, 승인, 뜻 없음, 전체. 주소에 없으면 초안이다.
export type LexiconFilter = 'draft' | 'approved' | 'none' | 'all'
export const LEXICON_FILTERS: LexiconFilter[] = ['draft', 'approved', 'none', 'all']

export type Route =
  | { page: 'dashboard'; book: BookId }
  | { page: 'canon'; kind: CanonKind; id: string | null }
  | { page: 'scenes'; book: BookId; chapter: number; sceneId: string | null }
  | { page: 'lexicon'; filter: LexiconFilter }
  | { page: 'quiz'; book: BookId; chapter: number }
  | { page: 'images' }
  | { page: 'jobs' }
  | { page: 'queue' }
  | { page: 'repo' }

export type PageName = Route['page']

// 책을 가리는 화면의 경로
export type BookRoute = Extract<Route, { book: BookId }>

const BOOK_PAGES: readonly string[] = ['dashboard', 'scenes', 'quiz']

export function isBookRoute(route: Route): route is BookRoute {
  return 'book' in route
}

// 1 이상의 정수가 아니면 1장
function chapterOf(raw: string | undefined): number {
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? n : 1
}

// 책 뒤의 주소(dashboard, scenes/4/id, quiz/4)를 읽는다. 모르는 화면은 대시보드다.
function bookPage(book: BookId, [page, a, b]: string[]): BookRoute {
  switch (page) {
    case 'scenes': {
      const chapter = chapterOf(a)
      return { page: 'scenes', book, chapter, sceneId: chapter === Number(a) && b ? b : null }
    }
    case 'quiz':
      return { page: 'quiz', book, chapter: chapterOf(a) }
    default:
      return { page: 'dashboard', book }
  }
}

// 해시를 읽는다. books는 고를 수 있는 책(본문이 있는 책), book은 고른 책이다.
// 책을 가리는 화면의 주소에 책이 없거나(옛 주소) books에 없는 책이 있으면 고른 책으로 본다.
export function parseRoute(hash: string, books: readonly BookId[], book: BookId): Route {
  const parts = hash
    .replace(/^#?\/?/, '')
    .split('/')
    .filter(Boolean)
    .map((p) => decodeURIComponent(p))
  const [head, a, b] = parts

  switch (head) {
    case 'canon': {
      const kind = CANON_KINDS.includes(a as CanonKind) ? (a as CanonKind) : 'characters'
      return { page: 'canon', kind, id: kind === a && b ? b : null }
    }
    case 'lexicon':
      return { page: 'lexicon', filter: LEXICON_FILTERS.includes(a as LexiconFilter) ? (a as LexiconFilter) : 'draft' }
    case 'images':
    case 'jobs':
    case 'queue':
    case 'repo':
      return { page: head }
    // 옛 주소: #/scenes/4[/id], #/quiz/4
    case 'scenes':
    case 'quiz':
      return bookPage(book, parts)
  }

  const known = books.find((id) => id === head)
  if (known) return bookPage(known, parts.slice(1))
  // #/<모르는 책>/scenes/4는 고른 책의 같은 화면, 나머지(#/, #/nothing)는 고른 책의 대시보드다.
  return bookPage(book, BOOK_PAGES.includes(a ?? '') ? parts.slice(1) : [])
}

export function routeHref(route: Route): string {
  switch (route.page) {
    case 'dashboard':
      return `#/${route.book}/dashboard`
    case 'canon':
      return `#/canon/${route.kind}${route.id ? `/${encodeURIComponent(route.id)}` : ''}`
    case 'scenes':
      return `#/${route.book}/scenes/${route.chapter}${route.sceneId ? `/${encodeURIComponent(route.sceneId)}` : ''}`
    case 'lexicon':
      return `#/lexicon/${route.filter}`
    case 'quiz':
      return `#/${route.book}/quiz/${route.chapter}`
    default:
      return `#/${route.page}`
  }
}

// 책을 가리는 화면인데 주소가 그 화면의 주소와 다르면(옛 주소, 고를 수 없는 책, 빠지거나 틀린 장 번호) 바꿔 쓸 주소, 아니면 null.
// 모든 책이 함께 쓰는 화면의 주소는 그대로 둔다.
export function redirectHref(hash: string, route: Route): string | null {
  if (!isBookRoute(route)) return null
  const href = routeHref(route)
  return hash === href ? null : href
}

// 머리에서 책을 바꿨을 때 갈 화면. 화면 종류는 그대로이고, 장면·퀴즈는 새 책의 1장으로 간다.
// 모든 책이 함께 쓰는 화면은 그대로다.
export function switchBook(route: Route, book: BookId): Route {
  switch (route.page) {
    case 'dashboard':
      return { page: 'dashboard', book }
    case 'scenes':
      return { page: 'scenes', book, chapter: 1, sceneId: null }
    case 'quiz':
      return { page: 'quiz', book, chapter: 1 }
    default:
      return route
  }
}

export function navigate(route: Route): void {
  window.location.hash = routeHref(route)
}
