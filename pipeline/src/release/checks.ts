import { verseAudioName, type BookId, type ReleaseChecks } from 'reader-core'
import { sceneImageIndex } from '../images/versions.ts'
import { chapterInputsOf, type ReleaseInputs } from './inputs.ts'

// 장 하나의 공개 점검. 필수 셋이 모두 참이어야 공개할 수 있고, 선택은 승인된 만큼 나가는 개수다.
// 본문에 그 장이 없으면 던진다(공개 상태를 보는 쪽이 본문부터 확인한다).
// - scenesApproved: 장면 파일이 있고 장면이 하나 이상이며 모두 사람이 승인했다.
// - imagesComplete: 기본 그림 버전(그림 버전 목록의 마지막)에 장면마다 그림(sceneImageStem이 장면 id인 파일)이 있다. 장면이 없으면 거짓이다.
// - audioComplete: 장의 모든 절에 낭독 파일이 있고 그 길이를 잴 수 있다.
//   꾸러미의 절 낭독 경로는 늘 null이고, 앱은 절의 길이(audioMs)로 그 절이 장면 낭독에 들었는지를 가린다.
//   그래서 길이를 잴 수 없는 절이 공개되면 그 절은 낭독에서 빠진다.
// - quizApproved: 승인된 문제 수
// - glossesTotal: 그 장 원어의 서로 다른 스트롱 번호 수, glossesApproved: 그 가운데 한국어 뜻이 승인된 수
export function chapterChecks(inputs: ReleaseInputs, book: BookId, chapter: number): ReleaseChecks {
  const { source, sceneFile, quiz, original } = chapterInputsOf(inputs, book, chapter)
  const scenes = sceneFile?.scenes ?? []

  const scenesApproved = scenes.length > 0 && scenes.every((scene) => scene.review.status === 'approved')

  // 기본 그림 버전의 장면 그림 표. 카탈로그마다 한 번 만든 표를 장마다 다시 쓴다(꾸러미와 묶음이 쓰는 표와 같다).
  const defaultVersion = inputs.catalog.versions.at(-1)
  const defaultImages = defaultVersion ? sceneImageIndex(inputs.catalog).get(defaultVersion.id) : undefined
  const imagesComplete = scenes.length > 0 && scenes.every((scene) => defaultImages?.has(scene.id) === true)

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
