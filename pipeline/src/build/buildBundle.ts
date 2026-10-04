import type { Bundle, BundleScene, Place, Scene, SceneFile, Source } from '../schema.ts'
import { findCoverageProblems } from '../scenes/coverage.ts'

export function buildBundle(source: Source, sceneFiles: SceneFile[], places: Place[]): Bundle {
  const placeIds = new Set(places.map((place) => place.id))

  const chapters = source.chapters.map((sourceChapter) => {
    const { chapter, verses } = sourceChapter
    const sceneFile = sceneFiles.find((file) => file.chapter === chapter)
    if (!sceneFile) return { chapter, verses, scenes: [fallbackScene(chapter, verses.length)] }

    const problems = findCoverageProblems(sceneFile.scenes, verses.length)
    if (problems.length > 0) {
      throw new Error(`${chapter}장 장면의 절 범위가 맞지 않습니다:\n${problems.join('\n')}`)
    }
    for (const scene of sceneFile.scenes) {
      if (scene.placeId && !placeIds.has(scene.placeId)) {
        throw new Error(`${scene.id}: 장소 ${scene.placeId}가 places.json에 없습니다`)
      }
    }
    return { chapter, verses, scenes: sceneFile.scenes.map(toBundleScene) }
  })

  return { book: source.book, translation: source.translation, places, chapters }
}

function fallbackScene(chapter: number, verseCount: number): BundleScene {
  return {
    id: `genesis-${String(chapter).padStart(2, '0')}-00`,
    verseStart: 1,
    verseEnd: verseCount,
    title: `창세기 ${chapter}장`,
    commentary: null,
    background: null,
    history: [],
    placeId: null,
    image: null,
    reviewStatus: 'none',
  }
}

function toBundleScene(scene: Scene): BundleScene {
  return {
    id: scene.id,
    verseStart: scene.verseStart,
    verseEnd: scene.verseEnd,
    title: scene.title,
    commentary: scene.commentary,
    background: scene.background,
    history: scene.history,
    placeId: scene.placeId,
    image: scene.image ? `content/images/${scene.image}` : null,
    reviewStatus: scene.review.status,
  }
}
