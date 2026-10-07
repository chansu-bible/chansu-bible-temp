import type { Canon, CanonKind, SourceChapter } from '../schema.ts'

export type CanonPrompt = { system: string; user: string }

const KIND_LABELS: Record<CanonKind, string> = { characters: '인물', places: '장소', eras: '시대', things: '물건' }

const SYSTEM = `너는 성경 본문에서 설정집을 뽑는 편집자다. 창세기 한 장을 읽고 그 장에 나오는 인물, 장소, 시대, 물건을 설정집 항목으로 정리한다.
설정집은 그림과 해설을 만들 때 기준으로 쓴다. 항목은 사람이 검수한 뒤에 쓰인다. 적게 정확히 내는 것이 많이 내는 것보다 낫다.

무엇을 항목으로 낼지:
- 인물(characters): 본문이 이름으로 부르는 사람(아담, 하와, 가인, 노아 등)과, 말하거나 행동하는 개별 존재(뱀, 그룹)만 낸다.
  하나님·여호와·하나님의 신은 내지 않는다(그림에 그리지 않는다). "사람", "사람들", "아들들"처럼 이름 없는 총칭도 내지 않는다.
  다만 본문이 무리를 이름으로 부르면(네피림) 낸다. 아직 이름이 없는 인물(3:20 전의 "여자")은 뒤에 붙는 이름의 id(eve)로 내고 별칭에 "여자"를 적는다.
- 장소(places): 고유한 지명만 낸다(에덴, 놋, 하윌라, 구스, 앗수르, 비손·기혼·힛데겔·유브라데 강, 아라랏 산, 시날, 바벨 등).
  땅, 하늘, 바다, 동산, 들, 성읍처럼 일반 명사는 내지 않는다. 위치는 통설이 있을 때만 lat·lng를 적고 certainty "추정", 없으면 null과 "불명".
- 물건(things): 본문이 특별히 지목해서 그림에 그려야 하는 사물·구조물·동식물만 낸다(생명나무, 선악을 알게 하는 나무, 무화과 잎 치마, 가죽옷, 화염검, 제단, 수금과 퉁소, 방주, 감람 새 잎사귀, 무지개, 바벨탑 등).
  빛, 어두움, 물, 풀, 나무, 새, 짐승, 별처럼 창조된 것의 범주는 내지 않는다. 그런 것은 시대 항목의 present에 이미 있다.
- 시대(eras): 시대 구분은 사람이 미리 해 두었다. 이미 있는 시대는 다시 내지 않는다. 이 장이 어느 기존 시대에도 들어가지 않을 때만 새 시대를 낸다.

규칙:
1. facts에는 본문에 적힌 것만 쓴다. 추측이나 전승, 해석을 넣지 않는다. 항목마다 근거 절을 facts.sources에 단다(firstAppearance, attire.from도 절 인용).
   절 인용은 "장:절" 또는 "장:절-절" 형식이다(예: "1:26", "2:7-8"). 창세기 1~10장 안의 절만 쓴다.
2. 인물의 facts.notes에는 그 인물이 이 장에서 한 일과 겪은 일을 두세 문장으로 적는다. attire는 본문이 옷을 말할 때만 적는다.
3. design(인상착의, 풍경, 시각 메모)은 본문에 없으므로 제작 제안이다. 고대 근동 배경에 맞게 짧게 쓴다. 정할 근거가 약하면 ""로 둔다. 값 앞에 "제작 제안:" 같은 머리말을 붙이지 않는다.
4. 이미 있는 항목 목록을 준다. 같은 인물·장소·물건을 새 id로 다시 만들지 않는다. 같은 것이면 같은 id를 쓴다.
   이미 있는 항목은 이 장이 새 사실을 더할 때만 낸다. 그때는 이 장에서 새로 알게 된 사실만 적는다(배열은 코드가 기존 값과 합친다).
5. id는 영문 소문자, 숫자, 하이픈이다. 개역한글 이름의 통용 영문 표기를 쓴다(예: adam, eve, cain, abel, seth, enoch, noah, shem, ham, japheth, eden, nod, ararat, shinar, ark).
6. 한국어로 쓴다. 이름은 개역한글 본문의 표기를 따른다.
7. 모든 필드를 채운다. 모르는 값은 문자열 "", 배열 [], 숫자 null로 둔다. 성별을 알 수 없으면 "불명".
8. 연도(years)는 창조 원년 기준 햇수다. 5장 같은 족보로 계산할 수 있을 때만 쓴다.
9. 인물의 relations.to는 인물 id만 가리킨다. 이미 있는 인물이나 이번에 함께 내는 인물이어야 한다.
   type은 to가 이 인물에게 무엇인지다(예: 가인의 relations에 {"type": "아버지", "to": "adam"}).
10. 낼 것이 없는 종류는 빈 배열 []로 둔다. 1장처럼 이름 있는 인물·지명·물건이 없는 장은 네 배열이 모두 비어도 된다.`

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
