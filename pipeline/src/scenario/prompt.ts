import type { Canon, Character, Scene, SourceChapter, Style } from '../schema.ts'
import { toScenarioScene } from './output.ts'

export type ScenarioPrompt = { system: string; user: string }

// 본보기 장면에 넣는 낱말 풀이 개수. 프롬프트 길이를 줄이려고 앞에서 이만큼만 넣는다.
const EXAMPLE_GLOSSARY_LIMIT = 6
// 인물 메모는 앞에서 이만큼만 넣는다.
const NOTES_LIMIT = 300

const SYSTEM = `너는 성경 읽기 앱의 장면 작가다. 창세기 한 장을 읽고 장면으로 나눈 뒤, 장면마다 제목, 해설, 낱말 풀이, 역사 배경, 그림 지시를 쓴다.
독자는 성경을 처음 읽는 한국어 사용자다. 앱은 본문 옆에 해설과 낱말 풀이를 보여 주고, 그림 지시로 장면마다 그림 한 장을 그린다. 쓴 글은 검수 모델과 사람이 다시 본다.

규칙:
1. 장면 나누기: 한 장을 보통 4~8개 장면으로 나눈다. 족보가 대부분인 장(5장, 10장)은 3~5개로 나눈다.
   절 범위는 1절에서 시작해 마지막 절까지 빠짐없이, 겹치지 않고 차례로 이어져야 한다(앞 장면의 verseEnd + 1이 다음 장면의 verseStart).
   한 장면은 한 사건이고, 그림 한 장으로 그릴 수 있는 단위다.
2. 제목(title): 10자 안팎의 명사구. 예: "일곱째 날", "에덴 동산과 네 강".
3. 해설(explanation): 2~4문단, 문단마다 2~4문장. "~해요" 체로 쓴다.
   줄거리 요약이 아니라 읽는 데 도움이 되는 설명을 쓴다. 시대와 생활의 배경, 구절의 뜻, 앞뒤 장과의 연결, 되풀이되는 표현이 무엇을 뜻하는지 같은 것이다.
   본문에 없는 사건·인물·대사를 지어내지 않는다. 특정 교파의 교리를 단정하지 않는다. 해석이 갈리는 곳은 "이 점을 두고 여러 풀이가 있어요"처럼 갈린다고 말한다.
4. 낱말 풀이(glossary): 독자가 모를 만한 옛말, 한자어, 고유명사를 고른다. 한 장면에 3~12개.
   word는 verse 절 본문에 글자 그대로 나오는 표현이어야 한다. 띄어쓰기와 조사, 어미까지 본문 그대로 잘라 쓰고 기본형으로 바꾸지 않는다(본문이 "안식하시니라"면 "안식하다"가 아니라 "안식하시니라").
   verse는 그 장면의 절 범위 안에 있어야 한다. 본문에서 찾을 수 없는 낱말은 코드가 지운다.
   meaning은 한두 문장이고 명사형이나 "~다"로 끝낸다(예: "순수한 금, 순금.", "다 되었다, 완성되었다."). "~해요" 체를 쓰지 않는다.
5. 역사 배경(history): 본문을 이해하는 데 도움이 되는 역사·지리·문화·과학 배경이 있을 때만 쓴다. 없으면 []로 둔다.
   text는 "~해요" 체 2~3문장이다. basis에는 무엇에 근거한 말인지 적는다(예: "현재의 지리", "고대 근동 문헌과의 비교", "성경 지리 연구").
   certainty는 "확실", "추정", "견해 갈림" 중 하나다. 근거보다 강하게 적지 않는다.
   연도, 거리, 크기 같은 수치를 지어내지 않는다. 수치를 쓰면 certainty를 "추정"이나 "견해 갈림"으로 두고, basis에 그 수치가 어떤 성격의 자료에서 나왔는지 적는다.
   sources에는 확실히 아는 문헌이나 URL만 넣고, 모르면 []로 둔다. 그럴듯한 출처를 지어내지 않는다.
   예: 5장의 900년이 넘는 나이는 고대 근동 문헌(수메르 왕 명부)에 나오는 아주 긴 재위 기간과 견주어 설명하고, 이 숫자를 어떻게 읽을지는 견해가 갈린다고 적는다.
6. 그림 지시(visual.description): 한국어로, 그림에 보이는 것만 적는다. 생각, 감정, 뜻, 소리처럼 보이지 않는 것은 적지 않는다.
   그림은 손으로 그린 수채화다. 사람은 작고 멀리 두고, 수풀·그림자·뒷모습으로 가린다.
   하나님은 어떤 모습으로도 그리지 않는다(사람, 얼굴, 손, 빛나는 형체 모두 안 된다). 하나님이 말하거나 일하시는 장면은 그 결과나 듣는 사람 쪽을 그린다.
   노출, 폭력, 피를 그리지 않는다. 가인이 아벨을 죽이는 일처럼 폭력이 있는 사건은 그 순간을 그리지 않고 그 전이나 후를 그린다.
   본문에 없는 것(해·달·별, 동물, 건물, 연장 등)을 넣지 않는다. 시대의 "없는 것"에 적힌 것도 넣지 않는다.
   그림 모델이 넣기 쉬운데 없어야 하는 것은 "동물은 없다", "해는 보이지 않는다"처럼 없다고 적는다. 개수가 중요하면 "물줄기는 정확히 네 개"처럼 수를 적는다.
   설정집 인물에 외모가 있으면 그 외모를 따른다. 외모가 정해지지 않은 인물은 머리색, 얼굴, 체격을 자세히 정하지 않는다. 옷차림은 설정집 인물의 옷차림과 그 절의 때에 맞춘다.
   user 메시지의 "표현 기준"(그림 모델에 함께 보내는 규칙)도 지킨다.
7. 구도(visual.shot): 시점, 거리, 시간대, 빛, 여백 같은 구도를 적는다. 같은 장의 장면끼리 구도가 겹치지 않게 장면마다 다르게 준다
   (예: 높은 곳에서 비스듬히 내려다본 조감, 땅에 가까운 낮은 시점, 멀리서 본 넓은 풍경, 새벽·한낮·해 질 녘).
8. 참조 id: visual.characters에는 그림에 보이는 인물의 설정집 인물 id만 넣는다. placeId에는 설정집 장소 id만, eraId에는 설정집 시대 id만 쓴다.
   eraId는 장면의 절 범위가 들어가는 시대를 고른다. 맞는 항목이 목록에 없으면 null이나 []로 둔다. 목록에 없는 id를 만들지 않는다.
9. 모든 필드를 채운다. 비울 때는 문자열 "", 배열 [], id는 null로 둔다.
10. 본보기 장면은 말투, 길이, 형식의 본보기다. 내용을 베끼지 말고 이 장 본문에 맞게 새로 쓴다.`

const REVISE_SYSTEM = `지금은 장 전체가 아니라 이미 쓴 장면 하나를 고쳐 쓴다. 검수에서 받은 지적 사항을 모두 고친다.
절 범위(verseStart, verseEnd)는 바꾸지 않는다. 지적받지 않은 부분은 위 규칙에 어긋나지 않으면 그대로 둔다.
출력은 고친 장면 하나(scene)다.`

// 절 번호가 붙은 본문. from·to를 주면 그 범위만.
export function verseLines(chapter: SourceChapter, from = 1, to = Number.MAX_SAFE_INTEGER): string[] {
  return chapter.verses
    .filter((verse) => verse.verse >= from && verse.verse <= to)
    .map((verse) => `${chapter.chapter}:${verse.verse} ${verse.text}`)
}

function verseCount(chapter: SourceChapter): number {
  return chapter.verses.at(-1)?.verse ?? 0
}

const oneLine = (text: string) => text.replace(/\s*\n\s*/g, ' ').trim()

function clip(text: string, limit: number): string {
  const line = oneLine(text)
  return line.length > limit ? `${line.slice(0, limit)}…` : line
}

function designLine(character: Character): string {
  const { build, face, hair, skin, ageNotes, notes } = character.design
  const fields: [string, string][] = [
    ['체격', build],
    ['얼굴', face],
    ['머리', hair],
    ['피부', skin],
    ['나이', ageNotes],
    ['메모', notes],
  ]
  const parts = fields.filter(([, value]) => value.trim() !== '').map(([label, value]) => `${label} ${oneLine(value)}`)
  return parts.length > 0 ? parts.join(' / ') : '정하지 않음'
}

function characterLines(character: Character): string[] {
  const { facts } = character
  const aliases = character.aliases.length > 0 ? ` (별칭: ${character.aliases.join(', ')})` : ''
  const lines = [`- ${character.id} ${character.name}${aliases}, 성별 ${facts.gender}`]
  if (facts.relations.length > 0) {
    lines.push(`  관계: ${facts.relations.map((relation) => `${relation.type} ${relation.to}`).join(', ')}`)
  }
  if (facts.attire.length > 0) {
    lines.push(`  옷차림: ${facts.attire.map((item) => `${item.from}부터 ${oneLine(item.description)}`).join(' / ')}`)
  }
  if (facts.notes.trim() !== '') lines.push(`  메모: ${clip(facts.notes, NOTES_LIMIT)}`)
  lines.push(`  외모: ${designLine(character)}`)
  return lines
}

const orNone = (lines: string[]) => (lines.length > 0 ? lines : ['(없음)'])

// 승인된 설정집 요약. 장면 작성·다시 쓰기·검수가 같이 쓴다.
export function canonSummary(canon: Canon): string {
  return [
    '## 승인된 설정집',
    '참조 id는 여기 있는 것만 쓴다.',
    '',
    '### 인물 (id 이름, 성별 / 관계: 관계 대상 id / 옷차림: 그 절부터 / 메모 / 외모)',
    ...orNone(canon.characters.flatMap(characterLines)),
    '',
    '### 장소 (id 이름: 설명)',
    ...orNone(canon.places.map((place) => `- ${place.id} ${place.name}: ${oneLine(place.facts.description)}`)),
    '',
    '### 시대 (id 이름 (절 범위) / 있는 것 / 없는 것)',
    ...orNone(
      canon.eras.flatMap((era) => [
        `- ${era.id} ${era.name} (${era.range.from}~${era.range.to})`,
        `  있는 것: ${era.facts.present.join(', ') || '(적힌 것 없음)'}`,
        `  없는 것: ${era.facts.absent.join(', ') || '(적힌 것 없음)'}`,
      ]),
    ),
    '',
    '### 물건 (id 이름: 설명)',
    ...orNone(canon.things.map((thing) => `- ${thing.id} ${thing.name}: ${oneLine(thing.facts.description)}`)),
  ].join('\n')
}

export function styleSection(style: Style): string {
  return ['## 표현 기준 (그림 모델에 함께 보내는 규칙)', style.promptRules].join('\n')
}

function chapterHeader(chapter: SourceChapter): string {
  return `창세기 ${chapter.chapter}장 (1~${verseCount(chapter)}절)`
}

const json = (value: unknown) => ['```json', JSON.stringify(value, null, 2), '```'].join('\n')

// scenario 단계 프롬프트. user에는 장 번호, 절 번호가 붙은 본문 전체, 승인된 설정집 요약, 표현 기준, 본보기 장면이 들어간다.
// canon은 승인된 항목만 넘긴다. examples는 말투와 형식의 본보기로 넣을 기존 장면이다.
export function buildScenarioPrompt(chapter: SourceChapter, canon: Canon, style: Style, examples: Scene[]): ScenarioPrompt {
  const last = verseCount(chapter)
  const user = [
    chapterHeader(chapter),
    '',
    '## 본문',
    ...verseLines(chapter),
    '',
    canonSummary(canon),
    '',
    styleSection(style),
    '',
    '## 본보기 장면',
    ...(examples.length > 0
      ? [
          '다른 장에서 이미 쓴 장면이다. 말투, 길이, 형식만 본보기로 삼는다(낱말 풀이는 앞 몇 개만 실었다).',
          '본보기는 설정집 id를 채우기 전에 쓴 것이라 visual.characters와 eraId가 비어 있을 수 있다. 너는 규칙 8대로 채운다. 인물 외모도 본보기를 따르지 말고 설정집을 따른다.',
          json(examples.map((scene) => toScenarioScene(scene, EXAMPLE_GLOSSARY_LIMIT))),
        ]
      : ['(없음)']),
    '',
    '## 쓸 것',
    `창세기 ${chapter.chapter}장 전체를 장면으로 나눠 scenes 배열로 낸다. 첫 장면은 ${chapter.chapter}:1에서 시작하고 마지막 장면은 ${chapter.chapter}:${last}에서 끝난다.`,
  ].join('\n')
  return { system: SYSTEM, user }
}

// 다시 쓰기 프롬프트. 장면 하나와 검수 지적 사항을 주고 그 장면만 고쳐 쓰게 한다.
export function buildRevisePrompt(
  chapter: SourceChapter,
  canon: Canon,
  style: Style,
  scene: Scene,
  issues: string[],
): ScenarioPrompt {
  const range = `${chapter.chapter}:${scene.verseStart}~${scene.verseEnd}`
  const user = [
    chapterHeader(chapter),
    '',
    '## 본문',
    ...verseLines(chapter),
    '',
    canonSummary(canon),
    '',
    styleSection(style),
    '',
    `## 고쳐 쓸 장면 (${scene.id}, ${range})`,
    json(toScenarioScene(scene)),
    '',
    '## 지적 사항',
    ...orNone(issues.map((issue) => `- ${issue}`)),
    '',
    '## 쓸 것',
    `지적 사항을 모두 고친 장면 하나를 scene으로 낸다. 절 범위는 ${range} 그대로 둔다.`,
  ].join('\n')
  return { system: `${SYSTEM}\n\n${REVISE_SYSTEM}`, user }
}
