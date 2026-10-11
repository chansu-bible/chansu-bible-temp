import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { Canon, Era, LexiconFile, Place, QuizFile, QuizQuestion, Scene, SceneFile, Source, Style } from 'pipeline'
import { expect, vi } from 'vitest'
import type { JobOptions, JobQueue, Stage } from '../server/jobs.ts'

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

// 장마다 절 수만 맞춘 본문. name은 책의 한국어 이름, verseCounts는 장 번호 → 절 수다.
export function sourceWith(name: string, verseCounts: Record<number, number>): Source {
  return {
    book: name,
    translation: '개역한글',
    chapters: Object.entries(verseCounts).map(([chapter, count]) => ({
      chapter: Number(chapter),
      verses: Array.from({ length: count }, (_, index) => ({ verse: index + 1, text: `${chapter}장 ${index + 1}절` })),
    })),
  }
}

// 창세기 1장(3절)과 2장(2절)
export const source: Source = sourceWith('창세기', { 1: 3, 2: 2 })

export const sceneFiles: SceneFile[] = [
  {
    chapter: 1,
    scenes: [
      withStatus(scene('genesis-01-01', 1), 'draft'),
      withStatus(scene('genesis-01-02', 1), 'approved'),
      withStatus(scene('genesis-01-03', 1), 'flagged'),
    ],
  },
]

export const eden: Place = {
  id: 'eden',
  name: '에덴',
  aliases: [],
  status: 'approved',
  facts: { firstAppearance: 'genesis 2:8', description: '동산', sources: ['genesis 2:8'] },
  location: { lat: 31.02, lng: 47.43, certainty: '추정' },
  design: { landscape: '평야', notes: '' },
}

export const flood: Era = {
  id: 'flood',
  name: '홍수',
  status: 'draft',
  range: { from: 'genesis 6:9', to: 'genesis 8:22' },
  years: { from: 1656, to: 1657 },
  facts: { description: '홍수', present: ['방주'], absent: [], sources: ['genesis 6:14-16'] },
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

// 원어 사전: 초안, 승인, 뜻 없음 하나씩
export const lexicon: LexiconFile = {
  entries: [
    {
      strong: 'H1',
      lemma: 'אָב',
      xlit: 'ʼâb',
      pos: 'n-m',
      definition: 'father',
      usage: 'chief, (fore-) father(-less)',
      count: 9,
      korean: { meaning: '아버지, 조상', note: '창세기 4:20에서는 조상을 뜻해요.', status: 'draft' },
    },
    {
      strong: 'H776',
      lemma: 'אֶרֶץ',
      xlit: 'ʼerets',
      pos: 'n-f',
      definition: 'the earth',
      usage: 'common, country, earth',
      count: 90,
      korean: { meaning: '땅', note: '', status: 'approved' },
    },
    {
      strong: 'H7225',
      lemma: 'רֵאשִׁית',
      xlit: 'rêʼshîyth',
      pos: 'n-f',
      definition: 'the first, in place, time, order or rank',
      usage: 'beginning, chief(-est), first(-fruits, part, time)',
      count: 1,
      korean: null,
    },
  ],
}

// 시험용 퀴즈 문제. 필요한 필드만 바꿔 쓴다.
export function quizQuestion(id: string, overrides: Partial<QuizQuestion> = {}): QuizQuestion {
  return {
    id,
    question: `${id} 질문인가요?`,
    options: ['가', '나', '다', '라'],
    answer: 0,
    explanation: `${id} 해설이에요.`,
    verse: 1,
    status: 'reviewed',
    issues: [],
    ...overrides,
  }
}

// 1장 퀴즈: 검수 통과, 지적(근거 절이 장 밖), 승인 하나씩
export const quizFile: QuizFile = {
  chapter: 1,
  questions: [
    quizQuestion('genesis-01-q1'),
    quizQuestion('genesis-01-q2', { verse: 9, status: 'flagged', issues: ['근거 절 1:9이 이 장에 없어요.'] }),
    quizQuestion('genesis-01-q3', { answer: 2, verse: 3, status: 'approved' }),
  ],
}

export type TempContent = {
  root: string
  storyBibleDir: string
  styleFile: string
  refsDir: string
  imagesDir: string
  imageVersionsFile: string
  scenesDir: string
  sourceDir: string
  audioDir: string
  lexiconFile: string
  quizDir: string
}

// 파이프라인과 같은 모양으로 쓴다(들여쓰기 2칸, 끝에 줄바꿈).
export const pretty = (value: unknown) => JSON.stringify(value, null, 2) + '\n'

// 임시 폴더에 화풍·참고 이미지·그림 버전·장면·본문(창세기)·원어 사전·퀴즈를 만든다. 설정집과 음성 폴더는 비어 있다.
// 끝나면 root를 지운다.
export async function makeTempContent(): Promise<TempContent> {
  const root = await mkdtemp(path.join(tmpdir(), 'admin-content-'))
  const dirs: TempContent = {
    root,
    storyBibleDir: path.join(root, 'story-bible'),
    styleFile: path.join(root, 'story-bible', 'style.json'),
    refsDir: path.join(root, 'story-bible', 'refs'),
    imagesDir: path.join(root, 'images'),
    imageVersionsFile: path.join(root, 'images', 'versions.json'),
    scenesDir: path.join(root, 'scenes'),
    sourceDir: path.join(root, 'source'),
    audioDir: path.join(root, 'audio'),
    lexiconFile: path.join(root, 'original', 'lexicon.json'),
    quizDir: path.join(root, 'quiz'),
  }
  await mkdir(dirs.refsDir, { recursive: true })
  await mkdir(path.join(dirs.imagesDir, 'v1'), { recursive: true })
  await mkdir(path.join(dirs.imagesDir, 'v2'), { recursive: true })
  await mkdir(dirs.scenesDir, { recursive: true })
  await mkdir(dirs.sourceDir, { recursive: true })
  await mkdir(dirs.audioDir, { recursive: true })
  await mkdir(path.dirname(dirs.lexiconFile), { recursive: true })
  await mkdir(dirs.quizDir, { recursive: true })

  await writeFile(dirs.styleFile, JSON.stringify(testStyle))
  await writeFile(path.join(dirs.refsDir, 'brush.jpg'), JPEG)
  await writeFile(
    dirs.imageVersionsFile,
    JSON.stringify([
      { id: 'v1', label: '1차', note: '' },
      { id: 'v2', label: '2차', note: '' },
    ]),
  )
  await writeFile(path.join(dirs.imagesDir, 'v1', 'genesis-01-01.jpg'), JPEG)
  await writeFile(path.join(dirs.imagesDir, 'v1', 'genesis-01-02.png'), PNG)
  await writeFile(path.join(dirs.imagesDir, 'v2', 'genesis-01-01.png'), PNG)
  await writeFile(path.join(dirs.scenesDir, 'genesis-01.json'), JSON.stringify(sceneFiles[0]))
  await writeFile(path.join(dirs.sourceDir, 'genesis.json'), JSON.stringify(source))
  await writeFile(dirs.lexiconFile, pretty(lexicon))
  await writeFile(path.join(dirs.quizDir, 'genesis-01.json'), pretty(quizFile))
  return dirs
}

// 큐가 작업을 시작할 때까지(runner를 부를 때까지) 기다린다.
// 큐는 setImmediate 뒤에 작업을 시작하므로 정해진 틱 수만큼 기다리면 시작 전일 수 있다.
export async function waitUntilRunning(queue: JobQueue, id: string): Promise<void> {
  await vi.waitFor(() => expect(queue.get(id)?.status).toBe('running'))
}

// release를 부를 때까지 도는 가짜 작업을 넣는다. release는 작업이 시작하기를 기다렸다가 끝내고, 끝날 때까지 기다린다.
export function holdJob(queue: JobQueue, stage: Stage, options: JobOptions) {
  let finish: (() => void) | undefined
  const job = queue.enqueue(stage, options, () => new Promise<void>((resolve) => (finish = resolve)))
  return {
    job,
    release: async () => {
      await waitUntilRunning(queue, job.id)
      finish!()
      await queue.wait(job.id)
    },
  }
}
