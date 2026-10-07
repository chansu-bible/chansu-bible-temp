import { describe, expect, it } from 'vitest'
import { approvedCanon } from '../src/canon/approved.ts'
import { assembleRevision, assembleScenes } from '../src/scenario/assemble.ts'
import { canon, chapter3, outScene } from './scenarioFixtures.ts'

const approved = approvedCanon(canon)

describe('assembleScenes', () => {
  it('순서대로 id를 붙이고 저장용 기본값을 채운다', () => {
    const result = assembleScenes(
      chapter3,
      { scenes: [outScene({ verseEnd: 2 }), outScene({ verseStart: 3, verseEnd: 4, glossary: [] })] },
      approved,
    )
    expect(result.problems).toEqual([])
    expect(result.warnings).toEqual([])
    expect(result.scenes.map((scene) => scene.id)).toEqual(['genesis-03-01', 'genesis-03-02'])
    expect(result.scenes[0]).toMatchObject({
      chapter: 3,
      verseStart: 1,
      verseEnd: 2,
      commentary: null,
      image: null,
      placeId: 'eden',
      eraId: 'eden-era',
      visual: { description: '동산의 나무 사이.', shot: '낮은 시점', characters: ['adam'] },
      review: { status: 'draft', text: null, facts: null, image: null, attempts: 0 },
    })
  })

  it('범위 밖이거나 본문에 없는 낱말은 빼고 경고한다', () => {
    const result = assembleScenes(
      chapter3,
      {
        scenes: [
          outScene({
            verseEnd: 2,
            glossary: [
              { verse: 1, word: '간교하더라', meaning: '꾀가 많았다.' },
              { verse: 1, word: '간교하다', meaning: '기본형은 본문에 없다.' },
              { verse: 4, word: '결코', meaning: '범위 밖.' },
            ],
          }),
          outScene({ verseStart: 3, glossary: [] }),
        ],
      },
      approved,
    )
    expect(result.scenes[0]!.glossary.map((gloss) => gloss.word)).toEqual(['간교하더라'])
    expect(result.warnings).toHaveLength(2)
    expect(result.warnings.join('\n')).toContain("'간교하다'")
    expect(result.warnings.join('\n')).toContain('범위 밖')
  })

  it('승인되지 않았거나 모르는 id는 빼거나 null로 하고 경고한다', () => {
    const result = assembleScenes(
      chapter3,
      {
        scenes: [
          outScene({
            visual: { description: '뱀', shot: '', characters: ['adam', 'serpent', 'nobody'] },
            placeId: 'nod',
            eraId: 'flood',
          }),
        ],
      },
      approved,
    )
    const [scene] = result.scenes
    expect(scene!.visual.characters).toEqual(['adam'])
    expect(scene!.placeId).toBeNull()
    expect(scene!.eraId).toBeNull()
    // 빈 구도는 필드를 뺀다
    expect('shot' in scene!.visual).toBe(false)
    expect(result.warnings).toHaveLength(4)
  })

  it('절 범위 문제는 problems로 따로 보고한다', () => {
    const result = assembleScenes(chapter3, { scenes: [outScene({ verseEnd: 2 }), outScene({ verseStart: 4 })] }, approved)
    expect(result.problems).toEqual(['genesis-03-02: 3절에서 시작해야 하는데 4절에서 시작합니다'])
    expect(assembleScenes(chapter3, { scenes: [] }, approved).problems).toEqual(['장면이 하나도 없습니다'])
  })
})

describe('assembleRevision', () => {
  it('id, 절 범위, image, review는 기존 값을 두고 나머지를 바꾼다', () => {
    const [before] = assembleScenes(chapter3, { scenes: [outScene()] }, approved).scenes
    before!.image = 'genesis-03-01.jpg'
    before!.review.attempts = 1
    const { scene, warnings } = assembleRevision(
      chapter3,
      before!,
      outScene({ verseStart: 2, title: '새 제목', placeId: 'nod' }),
      approved,
    )
    expect(scene).toMatchObject({
      id: 'genesis-03-01',
      verseStart: 1,
      verseEnd: 4,
      title: '새 제목',
      image: 'genesis-03-01.jpg',
      placeId: null,
      review: { status: 'draft', attempts: 1 },
    })
    expect(warnings).toHaveLength(2)
    expect(warnings[0]).toContain('절 범위')
    // 기존 장면의 review 객체를 같이 쓰지 않는다
    scene.review.attempts = 2
    expect(before!.review.attempts).toBe(1)
  })
})
