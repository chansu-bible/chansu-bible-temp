export type VerseRange = { id: string; verseStart: number; verseEnd: number }

export function findCoverageProblems(scenes: VerseRange[], verseCount: number): string[] {
  if (scenes.length === 0) return ['장면이 하나도 없습니다']

  const problems: string[] = []
  let expectedStart = 1

  for (const scene of scenes) {
    if (scene.verseEnd < scene.verseStart) {
      problems.push(`${scene.id}: 끝 절(${scene.verseEnd})이 시작 절(${scene.verseStart})보다 앞입니다`)
    }
    if (scene.verseStart !== expectedStart) {
      problems.push(`${scene.id}: ${expectedStart}절에서 시작해야 하는데 ${scene.verseStart}절에서 시작합니다`)
    }
    expectedStart = scene.verseEnd + 1
  }

  if (expectedStart !== verseCount + 1) {
    problems.push(`마지막 장면이 ${verseCount}절에서 끝나야 하는데 ${expectedStart - 1}절에서 끝납니다`)
  }

  return problems
}
