import { describe, expect, it } from 'vitest'
import { approvedCanon } from '../src/canon/approved.ts'
import { buildReviewTextPrompt } from '../src/review/prompt.ts'
import { assembleScenes } from '../src/scenario/assemble.ts'
import { buildRevisePrompt, buildScenarioPrompt } from '../src/scenario/prompt.ts'
import { canon, chapter3, outScene, style } from './scenarioFixtures.ts'

describe('approvedCanon', () => {
  it('네 종류 모두 승인된 항목만 남기고 변경 제안은 그대로 둔다', () => {
    const proposals = [
      {
        id: 'p1',
        createdAt: '2026-10-07T00:00:00.000Z',
        target: 'characters/adam',
        field: 'facts.notes',
        value: 'x',
        reason: '',
        sources: [],
        status: 'open' as const,
      },
    ]
    const result = approvedCanon({ ...canon, proposals })
    expect(result.characters.map((item) => item.id)).toEqual(['adam'])
    expect(result.places.map((item) => item.id)).toEqual(['eden'])
    expect(result.eras.map((item) => item.id)).toEqual(['eden-era'])
    expect(result.things).toEqual([])
    expect(result.proposals).toBe(proposals)
  })
})

const approved = approvedCanon(canon)
const [example] = assembleScenes(
  { ...chapter3, chapter: 2 },
  {
    scenes: [
      outScene({
        glossary: [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ verse: 1, word: '뱀', meaning: `뜻${n}` })),
      }),
    ],
  },
  approved,
).scenes

describe('buildScenarioPrompt', () => {
  it('system에 장면 작가의 규칙을 담는다', () => {
    const { system } = buildScenarioPrompt(chapter3, approved, style, [])
    for (const text of ['장면 작가', '4~8개', '3~5개', '10자 안팎', '~해요', '글자 그대로', '견해 갈림', '수메르 왕 명부', '하나님은 어떤 모습으로도', '그 전이나 후', '목록에 없는 id를 만들지 않는다', '모든 필드를 채운다']) {
      expect(system).toContain(text)
    }
  })

  it('user에 절 번호 본문, 승인된 설정집, 표현 기준, 본보기를 넣는다', () => {
    const { user } = buildScenarioPrompt(chapter3, approved, style, [example!])
    expect(user).toContain('창세기 3장 (1~4절)')
    expect(user).toContain('3:1 여호와 하나님의 지으신 들짐승 중에 뱀이 가장 간교하더라')
    expect(user).toContain('- adam 아담 (별칭: 사람), 성별 남')
    expect(user).toContain('관계: 유혹한 자 serpent')
    expect(user).toContain('옷차림: 3:21부터 가죽옷')
    expect(user).toContain('외모: 머리 짧은 검은 곱슬머리')
    expect(user).toContain('- eden 에덴: 동산이 있던 땅')
    expect(user).toContain('- eden-era 에덴 (2:4~3:24)')
    expect(user).toContain('없는 것: 성읍')
    // 승인되지 않은 항목은 넣지 않는다
    expect(user).not.toContain('serpent 뱀')
    expect(user).not.toContain('nod 놋')
    expect(user).toContain(style.promptRules)
    // 본보기는 출력 모양으로, 낱말 풀이는 앞 6개만
    expect(user).toContain('"뜻6"')
    expect(user).not.toContain('"뜻7"')
    expect(user).not.toContain('"review"')
    expect(user).toContain('마지막 장면은 3:4에서 끝난다')
  })

  it('인물 메모는 앞 300자만 넣는다', () => {
    const long = { ...approved, characters: [{ ...approved.characters[0]!, facts: { ...approved.characters[0]!.facts, notes: '가'.repeat(400) } }] }
    const { user } = buildScenarioPrompt(chapter3, long, style, [])
    expect(user).toContain(`${'가'.repeat(300)}…`)
    expect(user).not.toContain('가'.repeat(301))
  })
})

describe('buildRevisePrompt', () => {
  it('장면 하나와 지적 사항을 넣고 절 범위를 지키게 한다', () => {
    const [scene] = assembleScenes(chapter3, { scenes: [outScene()] }, approved).scenes
    const prompt = buildRevisePrompt(chapter3, approved, style, scene!, ['3:1 해설이 요약에 그칩니다'])
    expect(prompt.system).toContain('장면 하나를 고쳐 쓴다')
    expect(prompt.user).toContain('genesis-03-01, 3:1~4')
    expect(prompt.user).toContain('- 3:1 해설이 요약에 그칩니다')
    expect(prompt.user).toContain('"title": "간교한 뱀"')
  })
})

describe('buildReviewTextPrompt', () => {
  it('검수 항목과 장면, 본문, 설정집을 넣는다', () => {
    const [scene] = assembleScenes(chapter3, { scenes: [outScene({ verseEnd: 2 }), outScene({ verseStart: 3 })] }, approved).scenes
    const prompt = buildReviewTextPrompt(chapter3, approved, style, scene!)
    for (const text of ['검수', '지어냄', '요약', '교파', '낱말 풀이', '확실성', '없는 것', '하나님을', '~해요', '사소한 문체', '절 번호', 'issues는 []']) {
      expect(prompt.system).toContain(text)
    }
    expect(prompt.user).toContain('genesis-03-01 "간교한 뱀" (3:1~2)')
    expect(prompt.user).toContain('## 이 장면의 본문 (3:1~2)')
    expect(prompt.user).toContain('3:4 뱀이 여자에게')
    expect(prompt.user).toContain('- adam 아담')
    expect(prompt.user).toContain(style.promptRules)
    expect(prompt.user).toContain('"id": "genesis-03-01"')
  })
})
