import { useMemo } from 'react'
import {
  DEFAULT_PLAN,
  isEmptyMark,
  markId,
  parseMark,
  parsePlan,
  parsePosition,
  sortMarks,
  type Mark,
  type Position,
  type ReadingPlan,
} from 'reader-core'
import { store, useStoreVersion } from './store'

// 읽은 장면: id → 읽은 날('YYYY-MM-DD', 모르면 null)
export type ReadScenes = { ids: Set<string>; days: Map<string, string | null> }

function readScenes(): ReadScenes {
  const days = new Map<string, string | null>()
  for (const item of store.list<{ day?: unknown }>('readScenes')) {
    days.set(item.id, typeof item.data?.day === 'string' ? item.data.day : null)
  }
  return { ids: new Set(days.keys()), days }
}

export function useReadScenes(): ReadScenes {
  const version = useStoreVersion()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(readScenes, [version])
}

export function markSceneRead(sceneId: string, day: string): void {
  if (store.get('readScenes', sceneId) === null) store.put('readScenes', sceneId, { day })
}

export function savedPosition(): Position | null {
  return parsePosition(JSON.stringify(store.get('position', 'current')))
}

export function useSavedPosition(): Position | null {
  const version = useStoreVersion()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(savedPosition, [version])
}

export function savePositionRecord(position: Position): void {
  const current = savedPosition()
  if (current && current.chapter === position.chapter && current.verse === position.verse) return
  store.put('position', 'current', position)
}

export function usePlan(): ReadingPlan {
  const version = useStoreVersion()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => parsePlan(store.get('plan', 'current') ?? DEFAULT_PLAN), [version])
}

export function savePlan(plan: ReadingPlan): void {
  store.put('plan', 'current', plan)
}

export function useMarks(): Mark[] {
  const version = useStoreVersion()
  return useMemo(
    () => sortMarks(store.list('marks').flatMap((item) => parseMark(item.data) ?? [])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [version],
  )
}

export function getMark(book: string, chapter: number, verse: number): Mark | null {
  return parseMark(store.get('marks', markId(book, chapter, verse)))
}

// 빈 기록(색·메모·즐겨찾기 모두 없음)이면 지운다.
export function saveMark(mark: Mark): void {
  const id = markId(mark.book, mark.chapter, mark.verse)
  if (isEmptyMark(mark)) store.remove('marks', id)
  else store.put('marks', id, mark)
}

// 끝까지 푼 퀴즈: id는 '책:장'(genesis:4), 값은 푼 날. 점수는 남기지 않는다.
export function quizDoneId(book: string, chapter: number): string {
  return `${book}:${chapter}`
}

export function useQuizDone(book: string): Set<number> {
  const version = useStoreVersion()
  return useMemo(
    () =>
      new Set(
        store.list('quizDone').flatMap((item) => {
          const [itemBook, chapter] = item.id.split(':')
          return itemBook === book && Number(chapter) > 0 ? [Number(chapter)] : []
        }),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [version, book],
  )
}

export function markQuizDone(book: string, chapter: number, day: string): void {
  store.put('quizDone', quizDoneId(book, chapter), { day })
}
