import { findSceneIndex, initialPosition } from './readingPosition.ts'
import { readingStreak } from './streak.ts'
import type { Position } from './position.ts'
import type { Bundle } from './types.ts'

// 홈 화면 위젯 "오늘의 장면"(목업 15)에 그릴 것. 앱 홈의 이어 읽기 카드와 같은 장면(저장된 읽기 위치의 장면)이다.
// 안드로이드 위젯은 이것을 바로 그리고, iOS 위젯은 App Group에 JSON으로 받아 그린다.
export type WidgetSnapshot = {
  sceneId: string
  // 기본 그림 버전의 그림(묶음 안 경로). 없으면 null
  image: string | null
  // '오늘의 장면 · 창세기 4장'
  kicker: string
  title: string
  // '4:13~16절 · 12일째 이어 읽는 중'
  detail: string
}

export function widgetSnapshot(bundle: Bundle, saved: Position | null, readDays: Iterable<string>, today: string): WidgetSnapshot {
  const position = initialPosition(bundle.chapters, saved)
  const chapter = bundle.chapters.find((item) => item.chapter === position.chapter) ?? bundle.chapters[0]!
  const scene = chapter.scenes[findSceneIndex(chapter.scenes, position.verse)]!
  const range =
    scene.verseStart === scene.verseEnd
      ? `${chapter.chapter}:${scene.verseStart}절`
      : `${chapter.chapter}:${scene.verseStart}~${scene.verseEnd}절`
  const streak = readingStreak(new Set(readDays), today)
  return {
    sceneId: scene.id,
    image: bundle.defaultImageVersion ? (scene.images[bundle.defaultImageVersion] ?? null) : null,
    kicker: `오늘의 장면 · ${bundle.book} ${chapter.chapter}장`,
    title: scene.title,
    detail: streak > 0 ? `${range} · ${streak}일째 이어 읽는 중` : range,
  }
}
