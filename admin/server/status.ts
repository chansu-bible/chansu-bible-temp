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
import { verseAudioName, type BookId } from 'reader-core'
import { readAudioNames, readSceneFiles, readSource } from './content.ts'
import type { AppContext } from './context.ts'
import { errorMessage } from './errors.ts'

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
  // 설정집을 읽지 못하면(설정집이 깨졌거나, 설정집이 인용한 책의 본문을 읽지 못할 때) canon과 proposalsOpen은 null이고 canonError에 까닭이 있다.
  canon: Record<CanonKind, StateCounts> | null
  proposalsOpen: number | null
  canonError: string | null
  imageVersions: ImageVersion[]
}

// 상태를 읽을 폴더. 비우면 pipeline의 paths 기본값을 쓴다.
export type StatusDirs = Pick<
  AppContext,
  'storyBibleDir' | 'sourceDir' | 'scenesDir' | 'imagesDir' | 'imageVersionsFile' | 'audioDir'
>

// 확장자를 뗀 파일 이름. "g1-s1.jpeg" → "g1-s1"
function stem(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot <= 0 ? name : name.slice(0, dot)
}

// 책의 장마다 장면·그림·음성이 얼마나 갖춰졌는지 센다. 본문에 있는 장만 돌려준다.
export function computeChapterStatus(
  book: BookId,
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

    const have = sourceChapter.verses.filter((verse) =>
      audioNames.has(verseAudioName(book, sourceChapter.chapter, verse.verse)),
    )

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

// content/를 읽어 책 하나의 대시보드 상태를 만든다. 설정집 요약과 그림 버전은 모든 책이 함께 쓰는 것이다.
// 설정집 검증은 인용한 책의 본문으로 절을 확인하므로, 그런 책의 본문이 깨져도 이 책의 진행은 보이게 설정집 오류는 따로 담는다.
export async function readStatus(book: BookId, dirs: StatusDirs = {}): Promise<StatusResponse> {
  const source = await readSource(book, dirs.sourceDir)
  const [sceneFiles, catalog, audioNames, canonResult] = await Promise.all([
    readSceneFiles(book, source, dirs.scenesDir),
    readImageCatalog({ file: dirs.imageVersionsFile, imagesDir: dirs.imagesDir }),
    readAudioNames(dirs.audioDir),
    readCanon(dirs.storyBibleDir, { sourceDir: dirs.sourceDir }).then(
      (canon) => ({ canon, error: null }),
      (error: unknown) => ({ canon: null, error: errorMessage(error, '설정집을 읽지 못했습니다') }),
    ),
  ])
  const { canon, error } = canonResult
  return {
    chapters: computeChapterStatus(book, source, sceneFiles, catalog, audioNames),
    canon: canon ? summarizeCanon(canon) : null,
    proposalsOpen: canon ? canon.proposals.filter((proposal) => proposal.status === 'open').length : null,
    canonError: error,
    imageVersions: catalog.versions,
  }
}
