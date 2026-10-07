import {
  CanonKindSchema,
  readCanon,
  readImageCatalog,
  type Canon,
  type CanonKind,
  type ImageCatalog,
  type ImageVersion,
  type ReviewState,
  type SceneFile,
  type Source,
} from 'pipeline'
import { readAudioNames, readSceneFiles, readSource } from './content.ts'

export type SceneCounts = { total: number; draft: number; reviewed: number; flagged: number; approved: number }

export type ChapterStatus = {
  chapter: number
  verses: number
  hasSceneFile: boolean
  scenes: SceneCounts
  // 버전 id → 그림 있는 장면 수
  images: Record<string, number>
  audio: { have: number; total: number }
}

export type StateCounts = Record<ReviewState, number>

export type StatusResponse = {
  chapters: ChapterStatus[]
  canon: Record<CanonKind, StateCounts>
  proposalsOpen: number
  imageVersions: ImageVersion[]
}

// 음성 파일 이름. pipeline/src/tts/select.ts의 audioName과 같은 규칙이다.
export function audioName(chapter: number, verse: number): string {
  return `genesis-${String(chapter).padStart(2, '0')}-${String(verse).padStart(3, '0')}.mp3`
}

// 확장자를 뗀 파일 이름. "g1-s1.jpeg" → "g1-s1"
function stem(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot <= 0 ? name : name.slice(0, dot)
}

// 장마다 장면·그림·음성이 얼마나 갖춰졌는지 센다. 본문에 있는 장만 돌려준다.
export function computeChapterStatus(
  source: Source,
  sceneFiles: SceneFile[],
  imageCatalog: ImageCatalog,
  audioNames: ReadonlySet<string>,
): ChapterStatus[] {
  // 버전마다 그림 파일 이름(확장자 뺀 것) 모음
  const imageStems = new Map(
    imageCatalog.versions.map((version) => [version.id, new Set((imageCatalog.files[version.id] ?? []).map(stem))]),
  )

  return source.chapters.map((sourceChapter) => {
    const sceneFile = sceneFiles.find((file) => file.chapter === sourceChapter.chapter)
    const scenes = sceneFile?.scenes ?? []

    const counts: SceneCounts = { total: scenes.length, draft: 0, reviewed: 0, flagged: 0, approved: 0 }
    for (const scene of scenes) counts[scene.review.status] += 1

    const images: Record<string, number> = {}
    for (const version of imageCatalog.versions) {
      const names = imageStems.get(version.id)!
      images[version.id] = scenes.filter((scene) => names.has(scene.id)).length
    }

    const have = sourceChapter.verses.filter((verse) => audioNames.has(audioName(sourceChapter.chapter, verse.verse)))

    return {
      chapter: sourceChapter.chapter,
      verses: sourceChapter.verses.length,
      hasSceneFile: sceneFile !== undefined,
      scenes: counts,
      images,
      audio: { have: have.length, total: sourceChapter.verses.length },
    }
  })
}

// 설정집 종류별 검수 상태 수
export function summarizeCanon(canon: Canon): Record<CanonKind, StateCounts> {
  const summary = {} as Record<CanonKind, StateCounts>
  for (const kind of CanonKindSchema.options) {
    const counts: StateCounts = { draft: 0, approved: 0, rejected: 0 }
    for (const item of canon[kind]) counts[item.status] += 1
    summary[kind] = counts
  }
  return summary
}

// content/를 읽어 대시보드 상태를 만든다.
export async function readStatus(storyBibleDir?: string): Promise<StatusResponse> {
  const source = await readSource()
  const [sceneFiles, catalog, audioNames, canon] = await Promise.all([
    readSceneFiles(source),
    readImageCatalog(),
    readAudioNames(),
    readCanon(storyBibleDir),
  ])
  return {
    chapters: computeChapterStatus(source, sceneFiles, catalog, audioNames),
    canon: summarizeCanon(canon),
    proposalsOpen: canon.proposals.filter((proposal) => proposal.status === 'open').length,
    imageVersions: catalog.versions,
  }
}
