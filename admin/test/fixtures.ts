import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { Canon, Era, Place, Scene, SceneFile, Source, Style } from 'pipeline'

// 시험용 장면. 필요한 필드만 바꿔 쓴다.
export function scene(id: string, chapter: number, overrides: Partial<Scene> = {}): Scene {
  return {
    id,
    chapter,
    verseStart: 1,
    verseEnd: 1,
    title: `${id} 제목`,
    commentary: null,
    explanation: [],
    history: [],
    glossary: [],
    visual: { description: '', characters: [] },
    placeId: null,
    eraId: null,
    image: null,
    review: { status: 'draft', text: null, facts: null, image: null, attempts: 0 },
    ...overrides,
  }
}

export function withStatus(item: Scene, status: Scene['review']['status']): Scene {
  return { ...item, review: { ...item.review, status } }
}

export const source: Source = {
  book: '창세기',
  translation: '개역한글',
  chapters: [
    { chapter: 1, verses: [1, 2, 3].map((verse) => ({ verse, text: `1장 ${verse}절` })) },
    { chapter: 2, verses: [1, 2].map((verse) => ({ verse, text: `2장 ${verse}절` })) },
  ],
}

export const sceneFiles: SceneFile[] = [
  {
    chapter: 1,
    scenes: [
      withStatus(scene('g1-s1', 1), 'draft'),
      withStatus(scene('g1-s2', 1), 'approved'),
      withStatus(scene('g1-s3', 1), 'flagged'),
    ],
  },
]

export const eden: Place = {
  id: 'eden',
  name: '에덴',
  aliases: [],
  status: 'approved',
  facts: { firstAppearance: '2:8', description: '동산', sources: ['2:8'] },
  location: { lat: 31.02, lng: 47.43, certainty: '추정' },
  design: { landscape: '평야', notes: '' },
}

export const flood: Era = {
  id: 'flood',
  name: '홍수',
  status: 'draft',
  range: { from: '6:9', to: '8:22' },
  years: { from: 1656, to: 1657 },
  facts: { description: '홍수', present: ['방주'], absent: [], sources: ['6:14-16'] },
  design: { visualNotes: '' },
}

export function canon(overrides: Partial<Canon> = {}): Canon {
  return { characters: [], places: [eden], eras: [flood], things: [], proposals: [], ...overrides }
}

// 작은 그림 바이트. 형식 판별은 앞 몇 바이트만 본다.
export const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4])
export const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 5, 6, 7])

export const testStyle: Style = {
  description: '수채화풍',
  promptPrefix: 'Watercolor illustration.',
  promptRules: 'No text in the image.',
  references: [{ file: 'brush.jpg', label: '붓질', source: '퍼블릭 도메인' }],
  referenceInstruction: 'Images are style references.',
}

export type TempContent = {
  root: string
  styleFile: string
  refsDir: string
  imagesDir: string
  imageVersionsFile: string
  scenesDir: string
  sourceFile: string
}

// 임시 폴더에 화풍·참고 이미지·그림 버전·장면·본문을 만든다. 끝나면 root를 지운다.
export async function makeTempContent(): Promise<TempContent> {
  const root = await mkdtemp(path.join(tmpdir(), 'admin-content-'))
  const dirs: TempContent = {
    root,
    styleFile: path.join(root, 'story-bible', 'style.json'),
    refsDir: path.join(root, 'story-bible', 'refs'),
    imagesDir: path.join(root, 'images'),
    imageVersionsFile: path.join(root, 'images', 'versions.json'),
    scenesDir: path.join(root, 'scenes'),
    sourceFile: path.join(root, 'source', 'genesis.json'),
  }
  await mkdir(dirs.refsDir, { recursive: true })
  await mkdir(path.join(dirs.imagesDir, 'v1'), { recursive: true })
  await mkdir(path.join(dirs.imagesDir, 'v2'), { recursive: true })
  await mkdir(dirs.scenesDir, { recursive: true })
  await mkdir(path.dirname(dirs.sourceFile), { recursive: true })

  await writeFile(dirs.styleFile, JSON.stringify(testStyle))
  await writeFile(path.join(dirs.refsDir, 'brush.jpg'), JPEG)
  await writeFile(
    dirs.imageVersionsFile,
    JSON.stringify([
      { id: 'v1', label: '1차', note: '' },
      { id: 'v2', label: '2차', note: '' },
    ]),
  )
  await writeFile(path.join(dirs.imagesDir, 'v1', 'g1-s1.jpg'), JPEG)
  await writeFile(path.join(dirs.imagesDir, 'v1', 'g1-s2.png'), PNG)
  await writeFile(path.join(dirs.imagesDir, 'v2', 'g1-s1.png'), PNG)
  await writeFile(path.join(dirs.scenesDir, 'genesis-01.json'), JSON.stringify(sceneFiles[0]))
  await writeFile(dirs.sourceFile, JSON.stringify(source))
  return dirs
}
