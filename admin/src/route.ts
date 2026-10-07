// 해시 라우팅. #/, #/canon/characters[/id], #/scenes/1[/sceneId], #/images, #/jobs, #/queue, #/repo
import { CANON_KINDS, type CanonKind } from './types.ts'

export type Route =
  | { page: 'dashboard' }
  | { page: 'canon'; kind: CanonKind; id: string | null }
  | { page: 'scenes'; chapter: number; sceneId: string | null }
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
    default:
      return `#/${route.page}`
  }
}

export function navigate(route: Route): void {
  window.location.hash = routeHref(route)
}
