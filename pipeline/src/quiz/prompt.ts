import { getBook, type BookId } from 'reader-core'
import { verseLines } from '../scenario/prompt.ts'
import type { Scene, SourceChapter } from '../schema.ts'

export type QuizPrompt = { system: string; user: string }
export type QuizDraft = { question: string; options: string[]; answer: number; explanation: string; verse: number }

const WRITE_SYSTEM = `너는 성경 읽기 앱의 이해 확인 문제를 쓰는 사람이다. 성경 한 장을 다 읽은 독자에게 내는 4지선다 문제 다섯을 쓴다. 독자는 성경을 처음 읽는 한국어 사용자다.

규칙:
- 본문(개역한글)과 주어진 장면 해설에 있는 것만 묻는다. 본문 밖의 지식, 교파마다 다른 해석, 해설의 의견은 묻지 않는다.
- 숫자나 이름을 외웠는지보다 장면의 흐름, 누가 무엇을 왜 했는지, 낱말의 뜻을 묻는다. 장 전체에서 고르게 낸다.
- 보기는 넷이다. 정답은 본문으로 하나만 확인되어야 하고, 나머지 셋은 그럴듯하지만 본문을 읽으면 틀린 것을 알 수 있어야 한다. "모두 맞다", "답 없음" 같은 보기는 쓰지 않는다.
- answer는 정답 보기의 번호(0~3)다. 다섯 문제의 정답 자리를 섞는다.
- verse는 정답의 근거가 되는 절 번호 하나다.
- question은 "~나요?"로 끝나는 쉬운 말로 쓴다. explanation은 왜 그 답인지 두세 문장, "~해요" 체로 쓴다.
- 한국어로 쓴다.`

const REVIEW_SYSTEM = `너는 성경 읽기 앱의 이해 확인 문제를 검수한다. 성경 한 장의 본문과, 작성 모델이 쓴 4지선다 문제들을 본다.

문제마다 볼 것:
1. 정답이 근거 절(verse)의 본문으로 확인되는가.
2. 정답이 아닌 보기 가운데 본문으로 보아 맞을 수도 있는 것이 있는가(정답이 둘 이상인가).
3. 본문 밖의 지식, 교파마다 다른 해석, 해설의 의견을 묻는가.
4. 해설(explanation)이 본문과 맞는가.
5. 질문과 보기가 성경을 처음 읽는 사람에게 너무 어렵거나 헷갈리게 쓰였는가.

판정:
- 하나라도 걸리면 verdict는 "fail", 아니면 "pass"다. 사소한 문체 차이는 지적하지 않는다.
- issues에는 고칠 것을 한 항목에 하나씩, 무엇이 왜 문제인지 구체적으로 쓴다. pass면 []로 둔다.
- results에는 문제마다 하나씩, 문제 번호 index(0부터)를 붙여 돌려준다.
- 한국어로 쓴다.`

// 작성: 장 본문 전체와 검수된 장면 해설
export function buildQuizPrompt(book: BookId, chapter: SourceChapter, scenes: Scene[]): QuizPrompt {
  const sceneLines = scenes.flatMap((scene) => [
    `### 장면 "${scene.title}" (${chapter.chapter}:${scene.verseStart}~${scene.verseEnd})`,
    ...(scene.commentary ? [scene.commentary] : []),
    ...scene.explanation,
    '',
  ])
  const user = [
    `${getBook(book).name} ${chapter.chapter}장`,
    '',
    '## 본문',
    ...verseLines(chapter),
    '',
    '## 검수된 장면 해설',
    ...(sceneLines.length > 0 ? sceneLines : ['(이 장에는 아직 검수된 해설이 없다. 본문에서만 낸다.)']),
  ].join('\n')
  return { system: WRITE_SYSTEM, user }
}

// 검수: 장 본문 전체와 문제들(정답 표시)
export function buildQuizReviewPrompt(book: BookId, chapter: SourceChapter, questions: QuizDraft[]): QuizPrompt {
  const user = [
    `${getBook(book).name} ${chapter.chapter}장`,
    '',
    '## 본문',
    ...verseLines(chapter),
    '',
    '## 검수할 문제',
    '```json',
    JSON.stringify(
      questions.map((question, index) => ({ index, ...question })),
      null,
      2,
    ),
    '```',
  ].join('\n')
  return { system: REVIEW_SYSTEM, user }
}
