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
// 절 인용. "장:절" 또는 "장:절-절" (예: "1:26", "2:7-8")
export const CitationSchema = z.string().regex(/^\d{1,2}:\d{1,3}(-\d{1,3})?$/)
export const ReviewStateSchema = z.enum(['draft', 'approved', 'rejected'])
export const CanonIdSchema = z.string().regex(/^[a-z][a-z0-9-]*$/)

// facts는 본문 근거가 있는 사실, design은 본문 근거 없이 사람이 정한 제작상 결정이다.
export const CharacterSchema = z.object({
  id: CanonIdSchema,
  name: z.string().min(1),
  aliases: z.array(z.string()),
  status: ReviewStateSchema,
  facts: z.object({
    firstAppearance: CitationSchema,
    gender: z.enum(['남', '여', '불명']),
    // 창조 원년 기준 햇수
    years: z.object({ born: z.number().int().nullable(), died: z.number().int().nullable() }),
    relations: z.array(z.object({ type: z.string().min(1), to: CanonIdSchema })),
    attire: z.array(z.object({ from: CitationSchema, description: z.string().min(1) })),
    notes: z.string(),
    sources: z.array(CitationSchema).min(1),
  }),
  design: z.object({
    build: z.string(),
    face: z.string(),
    hair: z.string(),
    skin: z.string(),
    ageNotes: z.string(),
    notes: z.string(),
  }),
  // content/story-bible/refs/characters/ 아래 기준 이미지
  refs: z.array(z.string()),
})

export const PlaceSchema = z.object({
  id: CanonIdSchema,
  name: z.string().min(1),
  aliases: z.array(z.string()),
  status: ReviewStateSchema,
  facts: z.object({ firstAppearance: CitationSchema, description: z.string(), sources: z.array(CitationSchema).min(1) }),
  location: z.object({
    lat: z.number().min(-90).max(90).nullable(),
    lng: z.number().min(-180).max(180).nullable(),
    certainty: z.enum(['확실', '추정', '불명']),
  }),
  design: z.object({ landscape: z.string(), notes: z.string() }),
})

export const EraSchema = z.object({
  id: CanonIdSchema,
  name: z.string().min(1),
  status: ReviewStateSchema,
  range: z.object({ from: CitationSchema, to: CitationSchema }),
  years: z.object({ from: z.number().int().nullable(), to: z.number().int().nullable() }),
  facts: z.object({
    description: z.string(),
    present: z.array(z.string()),
    absent: z.array(z.string()),
    sources: z.array(CitationSchema).min(1),
  }),
  design: z.object({ visualNotes: z.string() }),
})

export const ThingSchema = z.object({
  id: CanonIdSchema,
  name: z.string().min(1),
  aliases: z.array(z.string()),
  status: ReviewStateSchema,
  facts: z.object({ description: z.string(), details: z.array(z.string()), sources: z.array(CitationSchema).min(1) }),
  design: z.object({ visualNotes: z.string() }),
})

// 승인된 항목을 LLM이 고치고 싶을 때 남기는 변경 제안
export const ProposalSchema = z.object({
  id: z.string().min(1),
  createdAt: z.string(), // ISO 8601
  target: z.string().regex(/^(characters|places|eras|things)\/[a-z][a-z0-9-]*$/),
  field: z.string().min(1), // 점 표기 경로. 예: "facts.attire", "design.hair"
  value: z.unknown(),
  reason: z.string(),
  sources: z.array(CitationSchema),
  status: z.enum(['open', 'applied', 'dismissed']),
})

export const CanonKindSchema = z.enum(['characters', 'places', 'eras', 'things'])

// 화풍 참고 이미지 파일 이름 규칙. 폴더 구분자가 들어갈 수 없어서 refs 폴더 밖을 가리킬 수 없다.
export const REFERENCE_FILE_PATTERN = /^[a-z0-9][a-z0-9._-]{0,79}\.(jpg|jpeg|png|webp)$/
// 그림 버전 id 규칙. content/images/<id>/ 폴더 이름이 된다.
export const IMAGE_VERSION_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/
// 참고 이미지 올리기·가져오기 크기 한도
export const MAX_REFERENCE_BYTES = 15 * 1024 * 1024

// 화풍 참고 이미지. file은 content/story-bible/refs/ 아래의 파일 이름, label은 어느 부분인지, source는 출처와 권리다.
export const StyleReferenceSchema = z.object({
  file: z.string().regex(REFERENCE_FILE_PATTERN),
  label: z.string(),
  source: z.string(),
})

export const StyleSchema = z.object({
  description: z.string(),
  promptPrefix: z.string().min(1),
  promptRules: z.string().min(1),
  references: z.array(StyleReferenceSchema).default([]),
  referenceInstruction: z.string().default(''),
})

// 장면
// 낱말 풀이. word는 그 절 본문에 그대로 나오는 표현이어야 한다.
export const GlossSchema = z.object({
  verse: z.number().int().positive(),
  word: z.string().min(1),
  meaning: z.string().min(1),
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
  commentary: z.string().nullable(),
  // 장면 해설. 요약이 아니라 구절을 읽는 데 도움이 되는 설명 문단들이다.
  explanation: z.array(z.string().min(1)),
  history: z.array(HistoryNoteSchema),
  glossary: z.array(GlossSchema),
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
  id: z.string().regex(IMAGE_VERSION_ID_PATTERN),
  label: z.string().min(1),
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
  explanation: z.array(z.string()),
  history: z.array(HistoryNoteSchema),
  glossary: z.array(GlossSchema),
  placeId: z.string().nullable(),
  // 그림 버전 id → 그림 경로. 그 버전에 그림이 없는 장면은 키가 없다.
  images: z.record(z.string(), z.string()),
  reviewStatus: z.enum(['none', 'draft', 'reviewed', 'flagged', 'approved']),
})

// 앱이 지도에 쓰는 장소. 설정집의 장소에서 만든다.
export const BundlePlaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  estimated: z.boolean(),
  lat: z.number().min(-90).max(90).nullable(),
  lng: z.number().min(-180).max(180).nullable(),
})

// 묶음 형식이 바뀌면 올린다. 형식은 docs/content-bundle.md에 적는다.
export const BUNDLE_SCHEMA_VERSION = 1

export const BundleSchema = z.object({
  schemaVersion: z.literal(BUNDLE_SCHEMA_VERSION),
  book: z.string(),
  translation: z.string(),
  places: z.array(BundlePlaceSchema),
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
export type Citation = z.infer<typeof CitationSchema>
export type ReviewState = z.infer<typeof ReviewStateSchema>
export type Character = z.infer<typeof CharacterSchema>
export type Place = z.infer<typeof PlaceSchema>
export type Era = z.infer<typeof EraSchema>
export type Thing = z.infer<typeof ThingSchema>
export type Proposal = z.infer<typeof ProposalSchema>
export type CanonKind = z.infer<typeof CanonKindSchema>
export type Canon = { characters: Character[]; places: Place[]; eras: Era[]; things: Thing[]; proposals: Proposal[] }
export type BundlePlace = z.infer<typeof BundlePlaceSchema>
export type Gloss = z.infer<typeof GlossSchema>
export type StyleReference = z.infer<typeof StyleReferenceSchema>
export type Style = z.infer<typeof StyleSchema>
export type ImageVersion = z.infer<typeof ImageVersionSchema>
export type Scene = z.infer<typeof SceneSchema>
export type SceneFile = z.infer<typeof SceneFileSchema>
export type BundleScene = z.infer<typeof BundleSceneSchema>
export type Bundle = z.infer<typeof BundleSchema>
