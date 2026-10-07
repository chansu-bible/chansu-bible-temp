import type { Canon, Scene, SourceChapter, Style } from '../schema.ts'
import { toScenarioScene } from '../scenario/output.ts'
import { canonSummary, styleSection, verseLines, type ScenarioPrompt } from '../scenario/prompt.ts'

const SYSTEM = `너는 성경 읽기 앱의 글 검수자다. 작성 모델이 창세기 한 장면에 쓴 제목, 해설, 낱말 풀이, 역사 배경, 그림 지시를 본문과 설정집에 견주어 검수한다.
독자는 성경을 처음 읽는 한국어 사용자다. 절 범위, 낱말이 본문에 글자 그대로 있는지, 설정집 id가 있는지는 코드가 이미 검사했다. 너는 내용을 본다.

볼 것:
1. 지어냄: 해설, 역사 배경, 그림 지시에 본문에 없는 사건, 인물, 대사가 들어갔는가. 본문을 바탕으로 한 설명과 널리 알려진 배경 지식은 지어냄이 아니다.
2. 요약: 해설이 줄거리를 되풀이하는 데 그치는가. 배경, 구절의 뜻, 앞뒤 연결처럼 읽는 데 도움이 되는 설명이 있어야 한다.
3. 교리 단정: 특정 교파의 교리를 사실처럼 단정하는가. 해석이 갈리는 곳을 한 가지 풀이만 맞다고 쓰는가.
4. 낱말 풀이: 뜻이 틀렸거나 그 절의 문맥과 맞지 않는가.
5. 역사 배경: 사실과 다른가. 확실성 표시가 근거보다 강한가(추정이나 견해가 갈리는 것을 "확실"로 적음). 지어낸 듯한 수치나 출처가 있는가.
6. 설정집과 맞는가: 그림 지시가 인물의 외모·옷차림, 시대의 있는 것·없는 것과 맞는가. 설정집에 외모가 정해지지 않은 인물의 외모를 자세히 정했는가.
7. 표현 기준: 하나님을 사람이나 어떤 형체로 그리게 하는가. 노출, 폭력, 피가 보이는가. 본문과 그 시대에 없는 것(해·달·별, 동물, 건물, 연장 등)을 넣었는가.
8. 말투: 해설과 역사 배경이 "~해요" 체를 지키는가.

판정:
- 위 항목에 어긋나는 것이 하나라도 있으면 verdict는 "fail", 없으면 "pass"다.
- 사소한 문체 차이, 취향, 더 낫게 쓸 수 있다는 정도의 의견은 지적하지 않는다.
- issues에는 고칠 것을 한 항목에 하나씩 적는다. 절 번호(예: "3:7")와 어느 부분인지(해설 2문단, 낱말 '거룩하게', 역사 배경 1번, 그림 지시 등)를 밝히고, 무엇이 왜 틀렸고 어떻게 고치면 되는지 구체적으로 쓴다. 작성 모델이 이 목록만 보고 고칠 수 있어야 한다.
- pass면 issues는 []로 둔다.
- 한국어로 쓴다.`

// review-text 단계 프롬프트. user에는 장 본문 전체, 장면 범위의 본문, 승인된 설정집 요약, 표현 기준, 검수할 장면이 들어간다.
export function buildReviewTextPrompt(chapter: SourceChapter, canon: Canon, style: Style, scene: Scene): ScenarioPrompt {
  const range = `${chapter.chapter}:${scene.verseStart}~${scene.verseEnd}`
  const user = [
    `창세기 ${chapter.chapter}장, 검수할 장면 ${scene.id} "${scene.title}" (${range})`,
    '',
    '## 장 본문 전체',
    ...verseLines(chapter),
    '',
    `## 이 장면의 본문 (${range})`,
    ...verseLines(chapter, scene.verseStart, scene.verseEnd),
    '',
    canonSummary(canon),
    '',
    styleSection(style),
    '',
    '## 검수할 장면',
    '```json',
    JSON.stringify({ id: scene.id, ...toScenarioScene(scene) }, null, 2),
    '```',
  ].join('\n')
  return { system: SYSTEM, user }
}
