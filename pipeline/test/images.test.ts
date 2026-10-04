import { describe, expect, it } from 'vitest'
import { detectImageExtension } from '../src/images/format.ts'
import { buildImagePrompt } from '../src/images/prompt.ts'
import { selectScenesToDraw } from '../src/images/select.ts'
import type { Scene, Style } from '../src/schema.ts'

const style: Style = {
  description: '수채화풍',
  promptPrefix: 'Watercolor illustration.',
  promptRules: 'No text in the image.',
}

function scene(id: string, status: Scene['review']['status'], image: string | null = null): Scene {
  return {
    id,
    chapter: 1,
    verseStart: 1,
    verseEnd: 1,
    title: '제목',
    commentary: '해설',
    background: { what: '무슨 일', who: '누가', where: '어디서', terms: [] },
    history: [],
    visual: { description: '어두운 물 위로 빛이 퍼진다.', characters: [] },
    placeId: null,
    image,
    review: { status, text: null, facts: null, image: null, attempts: 0 },
  }
}

describe('buildImagePrompt', () => {
  it('그림체, 장면 묘사, 표현 기준 순서로 조립한다', () => {
    expect(buildImagePrompt(style, scene('genesis-01-01', 'draft'))).toBe(
      'Watercolor illustration.\n\n장면: 어두운 물 위로 빛이 퍼진다.\n\nNo text in the image.',
    )
  })
})

describe('selectScenesToDraw', () => {
  const scenes = [
    scene('genesis-01-01', 'reviewed'),
    scene('genesis-01-02', 'draft'),
    scene('genesis-01-03', 'flagged'),
    scene('genesis-01-04', 'approved', 'genesis-01-04.jpg'),
  ]
  const ids = (selected: Scene[]) => selected.map((s) => s.id)

  it('검수를 통과했고 그림이 없는 장면만 고른다', () => {
    expect(ids(selectScenesToDraw(scenes, { allowDraft: false, force: false }))).toEqual(['genesis-01-01'])
  })

  it('allowDraft면 검수 전 장면도 고른다', () => {
    expect(ids(selectScenesToDraw(scenes, { allowDraft: true, force: false }))).toEqual([
      'genesis-01-01',
      'genesis-01-02',
    ])
  })

  it('force면 이미 그림이 있는 장면도 다시 고른다', () => {
    expect(ids(selectScenesToDraw(scenes, { allowDraft: false, force: true }))).toEqual([
      'genesis-01-01',
      'genesis-01-04',
    ])
  })

  it('확인 필요 장면은 어떤 경우에도 고르지 않는다', () => {
    expect(ids(selectScenesToDraw(scenes, { allowDraft: true, force: true }))).not.toContain('genesis-01-03')
  })

  it('sceneIds를 주면 그 장면만 고르고, 그림이 있어도 다시 고른다', () => {
    const selected = selectScenesToDraw(scenes, { allowDraft: true, force: false, sceneIds: ['genesis-01-04', 'genesis-01-03'] })
    expect(ids(selected)).toEqual(['genesis-01-04'])
  })

  it('limit만큼만 고른다', () => {
    expect(ids(selectScenesToDraw(scenes, { allowDraft: true, force: false, limit: 1 }))).toEqual(['genesis-01-01'])
  })
})

describe('detectImageExtension', () => {
  it('PNG를 알아본다', () => {
    expect(detectImageExtension(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]))).toBe('png')
  })

  it('JPEG를 알아본다', () => {
    expect(detectImageExtension(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00]))).toBe('jpg')
  })

  it('WebP를 알아본다', () => {
    const bytes = new TextEncoder().encode('RIFF0000WEBPVP8 ')
    expect(detectImageExtension(bytes)).toBe('webp')
  })

  it('알 수 없는 형식이면 오류를 낸다', () => {
    expect(() => detectImageExtension(Uint8Array.from([1, 2, 3, 4]))).toThrow('그림 파일 형식을 알아볼 수 없습니다')
  })
})
