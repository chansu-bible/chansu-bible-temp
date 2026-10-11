import { describe, expect, it } from 'vitest'
import { approvedCanon } from '../src/canon/approved.ts'
import { buildReviewTextPrompt } from '../src/review/prompt.ts'
import { assembleScenes } from '../src/scenario/assemble.ts'
import { buildRevisePrompt, buildScenarioPrompt, canonSummary } from '../src/scenario/prompt.ts'
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
  'genesis',
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
    const { system } = buildScenarioPrompt('genesis', chapter3, approved, style, [])
    for (const text of ['장면 작가', '4~8개', '3~5개', '10자 안팎', '~해요', '글자 그대로', '견해 갈림', '수메르 왕 명부', '하나님은 어떤 모습으로도', '그 전이나 후', '목록에 없는 id를 만들지 않는다', '모든 필드를 채운다']) {
      expect(system).toContain(text)
    }
  })

  it('system은 책을 가리지 않고, 창세기 예에는 책 이름을 붙인다', () => {
    const { system } = buildScenarioPrompt('genesis', chapter3, approved, style, [])
    expect(system).toContain('성경 한 장을 읽고 장면으로 나눈 뒤')
    expect(system).not.toContain('창세기 한 장')
    expect(system).toContain('족보가 대부분인 장(창세기 5장, 10장 등)은 3~5개로 나눈다')
    expect(system).toContain('예: 창세기 5장의 900년이 넘는 나이는')
    // 책 이름은 user에만 들어가므로 어느 책이든 system은 같다
    expect(buildScenarioPrompt('exodus', chapter3, approved, style, []).system).toBe(system)
  })

  it('user에 절 번호 본문, 승인된 설정집, 표현 기준, 본보기를 넣는다', () => {
    const { user } = buildScenarioPrompt('genesis', chapter3, approved, style, [example!])
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

  it('창세기로 부르면 머리와 쓸 것의 글이 책 이름을 붙이기 전과 같다', () => {
    const { user } = buildScenarioPrompt('genesis', chapter3, approved, style, [])
    expect(user.split('\n')[0]).toBe('창세기 3장 (1~4절)')
    expect(user).toContain('## 쓸 것\n창세기 3장 전체를 장면으로 나눠 scenes 배열로 낸다. 첫 장면은 3:1에서 시작하고 마지막 장면은 3:4에서 끝난다.')
  })

  it('다른 책이면 머리와 쓸 것에 그 책 이름을 쓴다', () => {
    const { user } = buildScenarioPrompt('exodus', chapter3, approved, style, [])
    expect(user.split('\n')[0]).toBe('출애굽기 3장 (1~4절)')
    expect(user).toContain('## 쓸 것\n출애굽기 3장 전체를 장면으로 나눠 scenes 배열로 낸다. 첫 장면은 3:1에서 시작하고 마지막 장면은 3:4에서 끝난다.')
    expect(user).not.toContain('창세기 3장')
    // 설정집의 인용은 창세기 절이므로 이 책에서는 책 이름이 붙는다
    expect(user).toContain('옷차림: 창세기 3:21부터 가죽옷')
  })

  it('인물 메모는 앞 300자만 넣는다', () => {
    const long = { ...approved, characters: [{ ...approved.characters[0]!, facts: { ...approved.characters[0]!.facts, notes: '가'.repeat(400) } }] }
    const { user } = buildScenarioPrompt('genesis', chapter3, long, style, [])
    expect(user).toContain(`${'가'.repeat(300)}…`)
    expect(user).not.toContain('가'.repeat(301))
  })

  // 스냅숏은 책 이름을 붙이기 전 코드가 같은 입력으로 낸 글과 바이트까지 같다. 창세기 글이 바뀌면 여기서 걸린다.
  it('창세기로 부르면 user 글 전체가 스냅숏과 같다', async () => {
    const { user } = buildScenarioPrompt('genesis', chapter3, approved, style, [example!])
    await expect(user).toMatchFileSnapshot('./__snapshots__/scenario-genesis-3.user.txt')
  })

  it('다른 책이면 user 글 전체가 스냅숏과 같다(머리와 다른 책 인용만 창세기와 다르다)', async () => {
    const { user } = buildScenarioPrompt('exodus', chapter3, approved, style, [example!])
    await expect(user).toMatchFileSnapshot('./__snapshots__/scenario-exodus-3.user.txt')
  })
})

describe('canonSummary', () => {
  it('같은 책 인용은 책 없이, 다른 책 인용은 책 이름을 붙여 보인다', () => {
    const genesis = canonSummary(approved, 'genesis')
    expect(genesis).toContain('옷차림: 3:21부터 가죽옷')
    expect(genesis).toContain('- eden-era 에덴 (2:4~3:24)')
    const exodus = canonSummary(approved, 'exodus')
    expect(exodus).toContain('옷차림: 창세기 3:21부터 가죽옷')
    // 두 끝이 같은 다른 책이면 책 이름은 앞에 한 번만 쓴다.
    expect(exodus).toContain('- eden-era 에덴 (창세기 2:4~3:24)')
  })

  it('끝 절이 있는 인용은 그대로 보이고, 읽을 수 없는 글은 그대로 둔다', () => {
    const adam = approved.characters[0]!
    const attire = [
      { from: 'genesis 4:1-2', description: '겉옷' },
      { from: '알 수 없는 인용', description: '띠' },
    ]
    const odd = { ...approved, characters: [{ ...adam, facts: { ...adam.facts, attire } }] }
    expect(canonSummary(odd, 'genesis')).toContain('옷차림: 4:1-2부터 겉옷 / 알 수 없는 인용부터 띠')
    expect(canonSummary(odd, 'exodus')).toContain('옷차림: 창세기 4:1-2부터 겉옷 / 알 수 없는 인용부터 띠')
  })

  it('시대 범위의 두 끝이 서로 다른 책이면 끝마다 책 이름을 쓴다(이 책이 한 끝이어도)', () => {
    const era = approved.eras[0]!
    const across = { ...approved, eras: [{ ...era, range: { from: 'genesis 50:26', to: 'exodus 1:1' } }] }
    for (const book of ['genesis', 'exodus', 'leviticus'] as const) {
      expect(canonSummary(across, book)).toContain('- eden-era 에덴 (창세기 50:26~출애굽기 1:1)')
    }
  })

  it('시대 범위의 한 끝이 읽을 수 없는 글이면 끝마다 보인다', () => {
    const era = approved.eras[0]!
    const odd = { ...approved, eras: [{ ...era, range: { from: '알 수 없는 인용', to: 'genesis 3:24' } }] }
    expect(canonSummary(odd, 'genesis')).toContain('- eden-era 에덴 (알 수 없는 인용~3:24)')
    expect(canonSummary(odd, 'exodus')).toContain('- eden-era 에덴 (알 수 없는 인용~창세기 3:24)')
  })
})

describe('buildRevisePrompt', () => {
  it('장면 하나와 지적 사항을 넣고 절 범위를 지키게 한다', () => {
    const [scene] = assembleScenes('genesis', chapter3, { scenes: [outScene()] }, approved).scenes
    const prompt = buildRevisePrompt('genesis', chapter3, approved, style, scene!, ['3:1 해설이 요약에 그칩니다'])
    expect(prompt.system).toContain('장면 하나를 고쳐 쓴다')
    expect(prompt.user.split('\n')[0]).toBe('창세기 3장 (1~4절)')
    expect(prompt.user).toContain('genesis-03-01, 3:1~4')
    expect(prompt.user).toContain('- 3:1 해설이 요약에 그칩니다')
    expect(prompt.user).toContain('"title": "간교한 뱀"')
  })

  it('다른 책이면 머리에 그 책 이름을 쓴다', () => {
    const [scene] = assembleScenes('exodus', chapter3, { scenes: [outScene()] }, approved).scenes
    const prompt = buildRevisePrompt('exodus', chapter3, approved, style, scene!, ['3:1 해설이 요약에 그칩니다'])
    expect(prompt.user.split('\n')[0]).toBe('출애굽기 3장 (1~4절)')
    expect(prompt.user).toContain('exodus-03-01, 3:1~4')
    expect(prompt.user).not.toContain('창세기 3장')
  })

  it('창세기로 부르면 user 글 전체가 스냅숏(책 이름을 붙이기 전 글)과 같다', async () => {
    const [scene] = assembleScenes('genesis', chapter3, { scenes: [outScene()] }, approved).scenes
    const { user } = buildRevisePrompt('genesis', chapter3, approved, style, scene!, ['3:1 해설이 요약에 그칩니다'])
    await expect(user).toMatchFileSnapshot('./__snapshots__/revise-genesis-3-1.user.txt')
  })
})

describe('buildReviewTextPrompt', () => {
  it('검수 항목과 장면, 본문, 설정집을 넣는다', () => {
    const [scene] = assembleScenes('genesis', chapter3, { scenes: [outScene({ verseEnd: 2 }), outScene({ verseStart: 3 })] }, approved).scenes
    const prompt = buildReviewTextPrompt('genesis', chapter3, approved, style, scene!)
    for (const text of ['검수', '지어냄', '요약', '교파', '낱말 풀이', '확실성', '없는 것', '하나님을', '~해요', '사소한 문체', '절 번호', 'issues는 []']) {
      expect(prompt.system).toContain(text)
    }
    expect(prompt.system).toContain('작성 모델이 성경 한 장면에 쓴')
    expect(prompt.system).not.toContain('창세기')
    expect(prompt.user.split('\n')[0]).toBe('창세기 3장, 검수할 장면 genesis-03-01 "간교한 뱀" (3:1~2)')
    expect(prompt.user).toContain('genesis-03-01 "간교한 뱀" (3:1~2)')
    expect(prompt.user).toContain('## 이 장면의 본문 (3:1~2)')
    expect(prompt.user).toContain('3:4 뱀이 여자에게')
    expect(prompt.user).toContain('- adam 아담')
    expect(prompt.user).toContain('옷차림: 3:21부터 가죽옷')
    expect(prompt.user).toContain(style.promptRules)
    expect(prompt.user).toContain('"id": "genesis-03-01"')
  })

  it('다른 책이면 머리에 그 책 이름을 쓰고, system은 같다', () => {
    const [scene] = assembleScenes('exodus', chapter3, { scenes: [outScene({ verseEnd: 2 })] }, approved).scenes
    const prompt = buildReviewTextPrompt('exodus', chapter3, approved, style, scene!)
    expect(prompt.user.split('\n')[0]).toBe('출애굽기 3장, 검수할 장면 exodus-03-01 "간교한 뱀" (3:1~2)')
    expect(prompt.user).not.toContain('창세기 3장')
    expect(prompt.user).toContain('옷차림: 창세기 3:21부터 가죽옷')
    expect(prompt.system).toBe(buildReviewTextPrompt('genesis', chapter3, approved, style, scene!).system)
  })

  it('창세기로 부르면 user 글 전체가 스냅숏(책 이름을 붙이기 전 글)과 같다', async () => {
    const [scene] = assembleScenes('genesis', chapter3, { scenes: [outScene({ verseEnd: 2 }), outScene({ verseStart: 3 })] }, approved).scenes
    const { user } = buildReviewTextPrompt('genesis', chapter3, approved, style, scene!)
    await expect(user).toMatchFileSnapshot('./__snapshots__/review-genesis-3-1.user.txt')
  })
})
