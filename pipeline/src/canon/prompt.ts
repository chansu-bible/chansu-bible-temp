import type { Canon, CanonKind, SourceChapter } from '../schema.ts'

export type CanonPrompt = { system: string; user: string }

const KIND_LABELS: Record<CanonKind, string> = { characters: '인물', places: '장소', eras: '시대', things: '물건' }

const SYSTEM = `너는 성경 본문에서 설정집을 뽑는 편집자다. 창세기 한 장을 읽고 그 장에 나오는 인물, 장소, 시대, 물건을 설정집 항목으로 정리한다.
설정집은 그림과 해설을 만들 때 기준으로 쓴다. 항목은 사람이 검수한 뒤에 쓰인다.

규칙:
1. facts에는 본문에 적힌 것만 쓴다. 추측이나 전승, 해석을 넣지 않는다. 항목마다 근거 절을 facts.sources에 단다(firstAppearance, attire.from도 절 인용).
   절 인용은 "장:절" 또는 "장:절-절" 형식이다(예: "1:26", "2:7-8"). 창세기 1~10장 안의 절만 쓴다.
2. design(인상착의, 풍경, 시대 메모)은 본문에 없으므로 "제작 제안"이다. 고대 근동 배경에 맞게 짧게 쓴다. 정할 근거가 약하면 ""로 둔다.
3. 이미 있는 항목 목록을 준다. 같은 인물·장소·시대·물건을 새 id로 다시 만들지 않는다. 같은 것이면 같은 id를 쓴다.
   이미 있는 항목은 이 장이 새 사실을 더할 때만 낸다. 그때는 이 장에서 새로 알게 된 사실만 적는다(배열은 코드가 기존 값과 합친다).
4. id는 영문 소문자, 숫자, 하이픈이다. 개역한글 이름의 통용 영문 표기를 쓴다(예: adam, eve, cain, abel, seth, enoch, noah, shem, ham, japheth, eden, nod, ararat, shinar, ark).
5. 한국어로 쓴다. 이름은 개역한글 본문의 표기를 따른다.
6. 모든 필드를 채운다. 모르는 값은 문자열 "", 배열 [], 숫자 null로 둔다. 성별을 알 수 없으면 "불명", 장소의 위치를 모르면 lat·lng null과 certainty "불명".
7. 연도(years)는 창조 원년 기준 햇수다. 5장 같은 족보로 계산할 수 있을 때만 쓴다.
8. 인물의 relations.to는 인물 id만 가리킨다. 이미 있는 인물이나 이번에 함께 내는 인물이어야 한다.
9. 시대(eras)는 본문이 새 시대를 열 때만 낸다. 대개는 이미 있는 시대를 쓴다.`

function existingLines(canon: Canon): string[] {
  const lines: string[] = []
  for (const kind of Object.keys(KIND_LABELS) as CanonKind[]) {
    for (const item of canon[kind]) {
      const aliases = 'aliases' in item && item.aliases.length > 0 ? ` (별칭: ${item.aliases.join(', ')})` : ''
      lines.push(`- ${kind}/${item.id} ${KIND_LABELS[kind]} ${item.name}${aliases} [${item.status}]`)
    }
  }
  return lines
}

// canon 단계 프롬프트. user에는 장 번호, 절 번호가 붙은 본문 전체, 기존 항목 목록이 들어간다.
export function buildCanonPrompt(chapter: SourceChapter, canon: Canon): CanonPrompt {
  const verses = chapter.verses.map((verse) => `${chapter.chapter}:${verse.verse} ${verse.text}`)
  const existing = existingLines(canon)
  const user = [
    `창세기 ${chapter.chapter}장`,
    '',
    '## 본문',
    ...verses,
    '',
    '## 이미 있는 항목 (kind/id 종류 이름 (별칭) [검수 상태])',
    ...(existing.length > 0 ? existing : ['(없음)']),
  ].join('\n')
  return { system: SYSTEM, user }
}
