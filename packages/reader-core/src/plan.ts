import { addDays } from './dates.ts'
import type { Chapter, Scene } from './types.ts'

// chapter: 하루 한 장, scenes: 하루 장면 perDay개, free: 정하지 않고 읽기
export type PlanKind = 'chapter' | 'scenes' | 'free'
export type ReadingPlan = { kind: PlanKind; perDay: number }

export const PLAN_KINDS: PlanKind[] = ['chapter', 'scenes', 'free']
export const PER_DAY_CHOICES = [1, 2, 3, 4, 5]
export const DEFAULT_PLAN: ReadingPlan = { kind: 'chapter', perDay: 1 }

// 저장된 계획을 읽는다. 깨졌거나 모르는 값이면 하루 한 장이다.
export function parsePlan(value: unknown): ReadingPlan {
  if (typeof value !== 'object' || value === null) return DEFAULT_PLAN
  const saved = value as Record<string, unknown>
  if (!PLAN_KINDS.includes(saved.kind as PlanKind)) return DEFAULT_PLAN
  const perDay = PER_DAY_CHOICES.includes(saved.perDay as number) ? (saved.perDay as number) : 1
  return { kind: saved.kind as PlanKind, perDay }
}

export type PlanChapterStatus = 'done' | 'today' | 'todo'
export type PlanScene = { chapter: number; scene: Scene }

export type PlanSummary = {
  // 장마다 다 읽음 / 오늘 읽을 곳 / 아직
  chapters: { chapter: number; status: PlanChapterStatus }[]
  // 오늘 읽을 장면. 오늘 이미 읽은 장면도 들어 있다(오늘 분량은 하루 동안 바뀌지 않는다).
  today: PlanScene[]
  todayDone: boolean
  // 남은 날(자유 계획이면 null)과 다 읽는 날(남은 날이 없으면 null)
  remainingDays: number | null
  finishDay: string | null
  allDone: boolean
  // 오늘 읽을 장면의 낭독 길이 합(ms)
  todayAudioMs: number
}

// readDays: 읽은 장면 id → 읽은 날. 날을 모르면 null이고 오늘 이전으로 본다.
export function planSummary(
  plan: ReadingPlan,
  chapters: Chapter[],
  readDays: ReadonlyMap<string, string | null>,
  todayDay: string,
): PlanSummary {
  const all: PlanScene[] = chapters.flatMap((chapter) => chapter.scenes.map((scene) => ({ chapter: chapter.chapter, scene })))
  const read = (id: string) => readDays.has(id)
  // 오늘 이전에 읽은 장면. 오늘 분량은 이것으로 정해서 오늘 읽어도 바뀌지 않는다.
  const readBefore = (id: string) => {
    if (!readDays.has(id)) return false
    const day = readDays.get(id)
    return day === null || day === undefined || day < todayDay
  }
  const chapterRead = (chapter: Chapter, test: (id: string) => boolean) =>
    chapter.scenes.length > 0 && chapter.scenes.every((scene) => test(scene.id))

  let today: PlanScene[]
  if (plan.kind === 'chapter') {
    const target = chapters.find((chapter) => !chapterRead(chapter, readBefore))
    today = target ? target.scenes.map((scene) => ({ chapter: target.chapter, scene })) : []
  } else {
    today = all.filter((item) => !readBefore(item.scene.id)).slice(0, plan.kind === 'scenes' ? plan.perDay : 1)
  }

  const todayDone = today.length > 0 && today.every((item) => read(item.scene.id))
  const allDone = all.length > 0 && all.every((item) => read(item.scene.id))
  const todayChapters = new Set(today.map((item) => item.chapter))

  let remainingDays: number | null = null
  if (plan.kind === 'chapter') remainingDays = chapters.filter((chapter) => !chapterRead(chapter, read)).length
  else if (plan.kind === 'scenes') remainingDays = Math.ceil(all.filter((item) => !read(item.scene.id)).length / plan.perDay)
  // 오늘 분량을 다 읽었으면 남은 분량은 내일부터 읽는다.
  const finishDay =
    remainingDays === null || remainingDays === 0 ? null : addDays(todayDay, todayDone ? remainingDays : remainingDays - 1)

  const todayAudioMs = today.reduce((sum, item) => {
    const chapter = chapters.find((c) => c.chapter === item.chapter)
    const verses = chapter?.verses.filter((v) => v.verse >= item.scene.verseStart && v.verse <= item.scene.verseEnd) ?? []
    return sum + verses.reduce((total, verse) => total + (verse.audioMs ?? 0), 0)
  }, 0)

  return {
    chapters: chapters.map((chapter) => ({
      chapter: chapter.chapter,
      status: chapterRead(chapter, read) ? 'done' : todayChapters.has(chapter.chapter) && !todayDone ? 'today' : 'todo',
    })),
    today,
    todayDone,
    remainingDays,
    finishDay,
    allDone,
    todayAudioMs,
  }
}
