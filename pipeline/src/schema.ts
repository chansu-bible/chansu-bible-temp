import { z } from 'zod'

// 본문
export const VerseSchema = z.object({
  verse: z.number().int().positive(),
  text: z.string().min(1),
})

export const SourceChapterSchema = z.object({
  chapter: z.number().int().positive(),
  verses: z.array(VerseSchema).min(1),
})

export const SourceSchema = z.object({
  book: z.string(),
  translation: z.string(),
  chapters: z.array(SourceChapterSchema),
})

// 설정집
export const PlaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  estimated: z.boolean(),
  lat: z.number().min(-90).max(90).nullable(),
  lng: z.number().min(-180).max(180).nullable(),
})

export const StyleSchema = z.object({
  description: z.string(),
  promptPrefix: z.string().min(1),
  promptRules: z.string().min(1),
  // 화풍 참고 이미지. content/story-bible/refs/ 아래의 파일 이름이다.
  references: z.array(z.string()).default([]),
  referenceInstruction: z.string().default(''),
})

// 장면
export const TermSchema = z.object({ word: z.string(), meaning: z.string() })

export const BackgroundSchema = z.object({
  what: z.string(),
  who: z.string(),
  where: z.string(),
  terms: z.array(TermSchema),
})

export const HistoryNoteSchema = z.object({
  text: z.string(),
  basis: z.string(),
  certainty: z.enum(['확실', '추정', '견해 갈림']),
  sources: z.array(z.string()),
})

export const ReviewStatusSchema = z.enum(['draft', 'reviewed', 'flagged', 'approved'])

export const VerdictSchema = z.object({
  verdict: z.enum(['pass', 'fail']),
  issues: z.array(z.string()),
})

export const SceneSchema = z.object({
  id: z.string(),
  chapter: z.number().int().positive(),
  verseStart: z.number().int().positive(),
  verseEnd: z.number().int().positive(),
  title: z.string(),
  commentary: z.string(),
  background: BackgroundSchema,
  history: z.array(HistoryNoteSchema),
  visual: z.object({
    description: z.string(),
    characters: z.array(z.string()),
    // 거리, 시점, 시간대, 여백 같은 구도 지시. 장면마다 다르게 준다.
    shot: z.string().optional(),
  }),
  placeId: z.string().nullable(),
  image: z.string().nullable(),
  review: z.object({
    status: ReviewStatusSchema,
    text: VerdictSchema.nullable(),
    facts: VerdictSchema.nullable(),
    image: VerdictSchema.nullable(),
    attempts: z.number().int().min(0),
  }),
})

export const SceneFileSchema = z.object({
  chapter: z.number().int().positive(),
  scenes: z.array(SceneSchema),
})

// 그림 버전. content/images/<id>/ 폴더 하나가 한 버전이다.
export const ImageVersionSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  label: z.string(),
  note: z.string(),
})

// 앱용 묶음
export const BundleVerseSchema = VerseSchema.extend({ audio: z.string().nullable() })

export const BundleSceneSchema = z.object({
  id: z.string(),
  verseStart: z.number().int().positive(),
  verseEnd: z.number().int().positive(),
  title: z.string(),
  commentary: z.string().nullable(),
  background: BackgroundSchema.nullable(),
  history: z.array(HistoryNoteSchema),
  placeId: z.string().nullable(),
  // 그림 버전 id → 그림 경로. 그 버전에 그림이 없는 장면은 키가 없다.
  images: z.record(z.string(), z.string()),
  reviewStatus: z.enum(['none', 'draft', 'reviewed', 'flagged', 'approved']),
})

export const BundleSchema = z.object({
  book: z.string(),
  translation: z.string(),
  places: z.array(PlaceSchema),
  imageVersions: z.array(ImageVersionSchema),
  defaultImageVersion: z.string().nullable(),
  chapters: z.array(
    z.object({
      chapter: z.number().int().positive(),
      verses: z.array(BundleVerseSchema).min(1),
      scenes: z.array(BundleSceneSchema).min(1),
    }),
  ),
})

export type Verse = z.infer<typeof VerseSchema>
export type SourceChapter = z.infer<typeof SourceChapterSchema>
export type Source = z.infer<typeof SourceSchema>
export type Place = z.infer<typeof PlaceSchema>
export type Style = z.infer<typeof StyleSchema>
export type ImageVersion = z.infer<typeof ImageVersionSchema>
export type Scene = z.infer<typeof SceneSchema>
export type SceneFile = z.infer<typeof SceneFileSchema>
export type BundleScene = z.infer<typeof BundleSceneSchema>
export type Bundle = z.infer<typeof BundleSchema>
