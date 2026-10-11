import { isMediaExt, mediaKind, verseAudioName, type BookId, type ReleaseChecks } from 'reader-core'
import { chapterInputsOf, type ReleaseInputs } from './inputs.ts'

// 확장자를 뗀 파일 이름. 그림 확장자(꾸러미가 받는 jpg, jpeg, png, webp)의 파일이 아니면 null이다.
// 끊긴 작업이 남긴 .tmp, 대문자 확장자, 그림이 아닌 파일은 장면의 그림이 아니다.
function imageStemOf(name: string): string | null {
  const dot = name.lastIndexOf('.')
  if (dot <= 0 || !isMediaExt(name.slice(dot + 1)) || mediaKind(name) !== 'image') return null
  return name.slice(0, dot)
}

// 장 하나의 공개 점검. 필수 셋이 모두 참이어야 공개할 수 있고, 선택은 승인된 만큼 나가는 개수다.
// 본문에 그 장이 없으면 던진다(공개 상태를 보는 쪽이 본문부터 확인한다).
// - scenesApproved: 장면 파일이 있고 장면이 하나 이상이며 모두 사람이 승인했다.
// - imagesComplete: 기본 그림 버전(그림 버전 목록의 마지막)에 장면마다 그림이 있다. 장면이 없으면 거짓이다.
// - audioComplete: 장의 모든 절에 낭독 파일이 있고 그 길이를 잴 수 있다.
//   꾸러미의 절 낭독 경로는 늘 null이고, 앱은 절의 길이(audioMs)로 그 절이 장면 낭독에 들었는지를 가린다.
//   그래서 길이를 잴 수 없는 절이 공개되면 그 절은 낭독에서 빠진다.
// - quizApproved: 승인된 문제 수
// - glossesTotal: 그 장 원어의 서로 다른 스트롱 번호 수, glossesApproved: 그 가운데 한국어 뜻이 승인된 수
export function chapterChecks(inputs: ReleaseInputs, book: BookId, chapter: number): ReleaseChecks {
  const { source, sceneFile, quiz, original } = chapterInputsOf(inputs, book, chapter)
  const scenes = sceneFile?.scenes ?? []

  const scenesApproved = scenes.length > 0 && scenes.every((scene) => scene.review.status === 'approved')

  const defaultVersion = inputs.catalog.versions.at(-1)
  const imageStems = new Set(
    (defaultVersion ? (inputs.catalog.files[defaultVersion.id] ?? []) : []).flatMap((name) => imageStemOf(name) ?? []),
  )
  const imagesComplete = scenes.length > 0 && scenes.every((scene) => imageStems.has(scene.id))

  const audioComplete = source.verses.every((verse) => typeof inputs.audio.get(verseAudioName(book, chapter, verse.verse)) === 'number')

  const strongs = new Set<string>()
  for (const verse of original?.verses ?? []) {
    for (const word of verse.words) if (word.strong !== null) strongs.add(word.strong)
  }
  const approvedStrongs = new Set(
    (inputs.lexicon?.entries ?? []).filter((entry) => entry.korean?.status === 'approved').map((entry) => entry.strong),
  )

  return {
    required: { scenesApproved, imagesComplete, audioComplete },
    optional: {
      quizApproved: (quiz?.questions ?? []).filter((question) => question.status === 'approved').length,
      glossesApproved: [...strongs].filter((strong) => approvedStrongs.has(strong)).length,
      glossesTotal: strongs.size,
    },
  }
}
