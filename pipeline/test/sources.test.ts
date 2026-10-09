import { describe, expect, it } from 'vitest'
import { buildSources } from '../src/build/sources.ts'
import type { Style } from '../src/schema.ts'

const style = (sources: string[]) =>
  ({ references: sources.map((source, index) => ({ file: `ref-${index}.jpg`, label: '참고', source })) }) as unknown as Style

describe('buildSources', () => {
  it('고정 출처 다음에 그림 참고 작품, 마지막에 AI 표기를 둔다', () => {
    expect(buildSources(null).map((source) => source.id)).toEqual(['krv', 'wlc', 'oshb', 'strongs', 'natural-earth', 'ai'])
  })

  it('그림 참고 작품의 출처 글에서 주소와 이용 조건을 떼어 낸다', () => {
    const sargent =
      'John Singer Sargent, Olive Trees, Corfu (1909). Art Institute of Chicago, Olivia Shaler Swan Memorial Collection. 퍼블릭 도메인. https://www.artic.edu/artworks/14792'
    const references = buildSources(
      style([sargent, sargent, 'Thomas Cole, The Oxbow (1836). The Met, CC0. https://www.metmuseum.org/art/collection/search/10497', '손으로 그린 참고 그림']),
    ).filter((source) => source.id.startsWith('reference-'))
    expect(references).toEqual([
      {
        id: 'reference-1',
        title: '그림 참고 작품',
        detail: 'John Singer Sargent, Olive Trees, Corfu (1909). Art Institute of Chicago, Olivia Shaler Swan Memorial Collection.',
        license: '퍼블릭 도메인',
        url: 'https://www.artic.edu/artworks/14792',
      },
      {
        id: 'reference-2',
        title: '그림 참고 작품',
        detail: 'Thomas Cole, The Oxbow (1836). The Met',
        license: 'CC0',
        url: 'https://www.metmuseum.org/art/collection/search/10497',
      },
      { id: 'reference-3', title: '그림 참고 작품', detail: '손으로 그린 참고 그림', license: '출처에 적힌 대로', url: null },
    ])
  })
})
