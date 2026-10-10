import type { BookId } from 'reader-core'
import type { BundleSource, Style } from '../schema.ts'
import { wikisourcePageTitle } from '../source/wikisource.ts'

// 출처 글에 적힌 이용 조건. 이름이 null이면 글에 적힌 대로(대문자로) 쓴다.
const LICENSES: [RegExp, string | null][] = [
  [/퍼블릭 도메인|public domain/i, '퍼블릭 도메인'],
  [/\bCC0(?: 1\.0)?/i, 'CC0'],
  [/\bCC BY(?:-SA)?(?: \d\.\d)?/i, null],
]

// "작가, 작품 (연도). 소장처. 퍼블릭 도메인. https://…" → 설명, 이용 조건, 주소
function referenceSource(source: string, index: number): BundleSource {
  const url = /https?:\/\/\S+/.exec(source)?.[0] ?? null
  let detail = url === null ? source : source.replace(url, ' ')
  let license = '출처에 적힌 대로'
  for (const [pattern, name] of LICENSES) {
    const match = pattern.exec(detail)
    if (!match) continue
    license = name ?? match[0].toUpperCase()
    let start = match.index
    let end = start + match[0].length
    // 이용 조건 뒤의 마침표와 앞의 쉼표도 함께 뺀다.
    if (/[.,;]/.test(detail[end] ?? '')) end++
    const before = detail.slice(0, start).trimEnd()
    if (before.endsWith(',')) start = before.length - 1
    detail = detail.slice(0, start) + detail.slice(end)
    break
  }
  return {
    id: `reference-${index + 1}`,
    title: '그림 참고 작품',
    detail: detail.replace(/\s+/g, ' ').replace(/[\s,;]+$/, '').trim(),
    license,
    url,
  }
}

// 책 묶음의 자료 출처 화면에 보일 목록. 본문 출처는 그 책을 받은 위키문헌 쪽이고, 그림 참고 작품은 style.json의 출처에서 모은다.
export function buildSources(book: BookId, style: Style | null): BundleSource[] {
  const title = wikisourcePageTitle(book)
  const references = [...new Set((style?.references ?? []).map((reference) => reference.source))]
  return [
    {
      id: 'krv',
      title: '개역한글판 성경',
      detail: `본문. 위키문헌의 "${title}"에서 받았어요.`,
      license: '2012년에 저작권이 끝난 저작물(위키문헌 PD-old-60)',
      url: `https://ko.wikisource.org/wiki/${title}`,
    },
    {
      id: 'wlc',
      title: '웨스트민스터 레닌그라드 사본(WLC)',
      detail: '원어 보기의 히브리어 본문',
      license: '퍼블릭 도메인',
      url: 'https://tanach.us',
    },
    {
      id: 'oshb',
      title: 'Open Scriptures Hebrew Bible',
      detail: '히브리어 낱말의 원형과 형태 분석(품사, 어간, 활용)',
      license: 'CC BY 4.0',
      url: 'https://hb.openscriptures.org',
    },
    {
      id: 'strongs',
      title: '스트롱 히브리어 사전(1894)',
      detail:
        '사전 번호, 음역, 영어 정의. XML판은 David Troidl, David Instone-Brewer가 정리해 Open Scriptures가 공개했어요. 한국어 뜻은 이 앱이 쓰고 사람이 검수했어요.',
      license: '퍼블릭 도메인',
      url: 'https://github.com/openscriptures/strongs',
    },
    {
      id: 'natural-earth',
      title: 'Natural Earth',
      detail: '여정 지도의 해안선, 강, 호수',
      license: '퍼블릭 도메인',
      url: 'https://www.naturalearthdata.com',
    },
    ...references.map((source, index) => referenceSource(source, index)),
    {
      id: 'ai',
      title: 'AI가 만든 것',
      detail:
        '장면 그림, 낭독 음성, 장면 제목·해설·낱말 풀이·역사 배경, 한국어 뜻 초안, 퀴즈 초안은 OpenAI 모델로 만들었어요. 글은 검수 모델과 사람이 검수한 뒤 앱에 나가요.',
      license: '이 앱의 자료',
      url: null,
    },
  ]
}
