import type { Bundle, BundleScene, Place, Scene, SceneFile, Source } from '../schema.ts'
import { findCoverageProblems } from '../scenes/coverage.ts'
import { audioName } from '../tts/select.ts'

export function buildBundle(
  source: Source,
  sceneFiles: SceneFile[],
  places: Place[],
  audioNames: ReadonlySet<string> = new Set(),
): Bundle {
  const placeIds = new Set(places.map((place) => place.id))

  const seenChapters = new Set<number>()
  for (const file of sceneFiles) {
    if (seenChapters.has(file.chapter)) throw new Error(`${file.chapter}장의 장면 파일이 둘 이상입니다`)
    seenChapters.add(file.chapter)
    if (!source.chapters.some((sourceChapter) => sourceChapter.chapter === file.chapter)) {
      throw new Error(`${file.chapter}장은 본문에 없습니다`)
    }
  }

  const chapters = source.chapters.map((sourceChapter) => {
    const { chapter } = sourceChapter
    // 본문은 원본 그대로 두고, 음성 파일이 있는 절에만 경로를 붙인다.
    const verses = sourceChapter.verses.map((verse) => {
      const name = audioName(chapter, verse.verse)
      return { ...verse, audio: audioNames.has(name) ? `content/audio/${name}` : null }
    })
    const sceneFile = sceneFiles.find((file) => file.chapter === chapter)
    if (!sceneFile) return { chapter, verses, scenes: [fallbackScene(chapter, verses.length)] }

    checkSceneIds(sceneFile)

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

function checkSceneIds(file: SceneFile): void {
  file.scenes.forEach((scene, index) => {
    if (scene.chapter !== file.chapter) {
      throw new Error(`${scene.id}: chapter가 ${scene.chapter}인데 ${file.chapter}장 파일에 들어 있습니다`)
    }
    const expectedId = `genesis-${String(file.chapter).padStart(2, '0')}-${String(index + 1).padStart(2, '0')}`
    if (scene.id !== expectedId) throw new Error(`${scene.id}: id가 ${expectedId}여야 합니다`)
  })
}
