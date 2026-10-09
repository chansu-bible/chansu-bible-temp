// 해시 라우팅. #/, #/canon/characters[/id], #/scenes/1[/sceneId], #/lexicon[/draft|approved|none|all], #/quiz/1,
// #/images, #/jobs, #/queue, #/repo
import { CANON_KINDS, type CanonKind } from './types.ts'

// 원어 뜻 화면의 거르기: 한국어 뜻 초안, 승인, 뜻 없음, 전체. 주소에 없으면 초안이다.
export type LexiconFilter = 'draft' | 'approved' | 'none' | 'all'
export const LEXICON_FILTERS: LexiconFilter[] = ['draft', 'approved', 'none', 'all']

export type Route =
  | { page: 'dashboard' }
  | { page: 'canon'; kind: CanonKind; id: string | null }
  | { page: 'scenes'; chapter: number; sceneId: string | null }
  | { page: 'lexicon'; filter: LexiconFilter }
  | { page: 'quiz'; chapter: number }
  | { page: 'images' }
  | { page: 'jobs' }
  | { page: 'queue' }
  | { page: 'repo' }

export type PageName = Route['page']

export function parseRoute(hash: string): Route {
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
    case 'scenes': {
      const n = Number(a)
      const chapter = Number.isInteger(n) && n > 0 ? n : 1
      return { page: 'scenes', chapter, sceneId: chapter === n && b ? b : null }
    }
    case 'lexicon':
      return { page: 'lexicon', filter: LEXICON_FILTERS.includes(a as LexiconFilter) ? (a as LexiconFilter) : 'draft' }
    case 'quiz': {
      const n = Number(a)
      return { page: 'quiz', chapter: Number.isInteger(n) && n > 0 ? n : 1 }
    }
    case 'images':
    case 'jobs':
    case 'queue':
    case 'repo':
      return { page: head }
    default:
      return { page: 'dashboard' }
  }
}

export function routeHref(route: Route): string {
  switch (route.page) {
    case 'dashboard':
      return '#/'
    case 'canon':
      return `#/canon/${route.kind}${route.id ? `/${encodeURIComponent(route.id)}` : ''}`
    case 'scenes':
      return `#/scenes/${route.chapter}${route.sceneId ? `/${encodeURIComponent(route.sceneId)}` : ''}`
    case 'lexicon':
      return `#/lexicon/${route.filter}`
    case 'quiz':
      return `#/quiz/${route.chapter}`
    default:
      return `#/${route.page}`
  }
}

export function navigate(route: Route): void {
  window.location.hash = routeHref(route)
}
