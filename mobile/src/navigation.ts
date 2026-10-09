import type { useRouter } from 'expo-router'
import type { Position } from 'reader-core'

type Router = ReturnType<typeof useRouter>

// 다른 화면(홈, 검색, 메모, 질문하기)이 읽기 화면에 보내는 요청: 이 절로 옮기기, 이 덮개 열기.
// background는 옮긴 절이 든 장면의 해설 시트다.
export type ReaderRequest = { position?: Position; overlay?: 'map' | 'timeline' | 'contents' | 'background' }

let pending: ReaderRequest | null = null
const listeners = new Set<() => void>()

export function requestReader(request: ReaderRequest): void {
  pending = request
  for (const listener of listeners) listener()
}

// 읽기 화면이 꺼내 간다. 한 번 꺼내면 비운다.
export function takeReaderRequest(): ReaderRequest | null {
  const request = pending
  pending = null
  return request
}

export function onReaderRequest(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

// 읽기 화면에서 연 화면(from=read)이면 뒤로 돌아가 요청을 건네고, 아니면 읽기 화면을 새로 연다.
export function goToReader(router: Router, from: string | undefined, request: ReaderRequest): void {
  requestReader(request)
  if (from === 'read' && router.canGoBack()) router.back()
  else router.push('/read')
}

// 쌓인 화면을 모두 닫고 홈(첫 화면)으로 간다. 홈이 쌓여 있지 않으면(바로 연 경우) 홈으로 바꾼다.
export function goHome(router: Router): void {
  if (router.canDismiss()) router.dismissAll()
  else router.replace('/')
}

export function goBack(router: Router): void {
  if (router.canGoBack()) router.back()
  else router.replace('/')
}
