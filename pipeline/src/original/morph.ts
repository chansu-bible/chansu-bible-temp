// OSHB 형태 부호를 한국어 품사 이름으로 바꾼다(https://hb.openscriptures.org/parsing/HebrewMorphologyCodes.html).
// 부호는 언어(H 히브리어, A 아람어) 다음에 형태소마다 '/'로 나뉜다. 예: HC/Vqw3ms → 접속사 + 동사(칼 연속 미완료)
const PARTICLES: Record<string, string> = {
  a: '긍정어',
  d: '정관사',
  e: '권유어',
  i: '의문사',
  j: '감탄사',
  m: '지시사',
  n: '부정어',
  o: '목적어 표지',
  r: '관계사',
}
const NOUNS: Record<string, string> = { c: '명사', g: '민족 이름', p: '고유 명사' }
const SUFFIXES: Record<string, string> = { p: '접미 대명사', d: '방향 접미사', h: '덧붙은 he', n: '덧붙은 nun' }
// 히브리어 동사 어간. 한국 신학교에서 흔히 쓰는 이름
const STEMS: Record<string, string> = {
  q: '칼',
  N: '니팔',
  p: '피엘',
  P: '푸알',
  h: '히필',
  H: '호팔',
  t: '히트파엘',
  o: '폴렐',
  O: '폴랄',
  r: '히트폴렐',
  m: '포엘',
  M: '포알',
  k: '팔렐',
  K: '풀랄',
  Q: '칼 수동',
  l: '필펠',
  L: '폴팔',
  f: '히트팔펠',
  D: '니트파엘',
  j: '페알랄',
  i: '필렐',
  u: '호트팔',
  c: '티필',
  v: '히쉬타펠',
  w: '니트팔렐',
  y: '니트포엘',
  z: '히트포엘',
}
const FORMS: Record<string, string> = {
  p: '완료',
  q: '연속 완료',
  i: '미완료',
  w: '연속 미완료',
  h: '권유형',
  j: '지시형',
  v: '명령형',
  r: '능동 분사',
  s: '수동 분사',
  a: '부정사 절대형',
  c: '부정사 연계형',
}

function segmentLabel(segment: string): string {
  const kind = segment[0]
  const detail = segment[1] ?? ''
  switch (kind) {
    case 'A':
      return '형용사'
    case 'C':
      return '접속사'
    case 'D':
      return '부사'
    case 'N':
      return NOUNS[detail] ?? '명사'
    case 'P':
      return '대명사'
    case 'R':
      return '전치사'
    case 'S':
      return SUFFIXES[detail] ?? '접미사'
    case 'T':
      return PARTICLES[detail] ?? '불변사'
    case 'V': {
      const stem = STEMS[detail]
      const form = FORMS[segment[2] ?? '']
      const parts = [stem, form].filter(Boolean)
      return parts.length > 0 ? `동사(${parts.join(' ')})` : '동사'
    }
    default:
      return '기타'
  }
}

export function posLabel(morph: string): string {
  const language = morph[0] === 'A' ? '아람어 ' : ''
  const label = morph
    .slice(1)
    .split('/')
    .filter((segment) => segment !== '')
    .map(segmentLabel)
    .join(' + ')
  return language + label
}
