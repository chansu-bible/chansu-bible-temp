// 한국어 조사: 앞말에 받침이 있으면 앞 것, 없으면 뒤 것을 붙인다. 한글이 아니면(숫자·영문) 받침 없음으로 본다.

// 마지막 글자의 받침 번호(0은 받침 없음, 8은 ㄹ)
function finalConsonant(word: string): number {
  const code = word.trim().slice(-1).charCodeAt(0) - 0xac00
  return code >= 0 && code <= 11171 ? code % 28 : 0
}

export function hasBatchim(word: string): boolean {
  return finalConsonant(word) !== 0
}

// '으로로'는 받침이 없거나 ㄹ 받침이면 '로'다(서울로, 놋으로).
export type JosaPair = '은는' | '이가' | '을를' | '이에요예요' | '과와' | '으로로'

const PAIRS: Record<JosaPair, [string, string]> = {
  은는: ['은', '는'],
  이가: ['이', '가'],
  을를: ['을', '를'],
  이에요예요: ['이에요', '예요'],
  과와: ['과', '와'],
  으로로: ['으로', '로'],
}

// 낱말 뒤에 붙일 조사만. 따옴표로 묶은 낱말에 붙일 때 쓴다: `'${word}'${particle(word, '은는')}`
export function particle(word: string, pair: JosaPair): string {
  const [withBatchim, without] = PAIRS[pair]
  const final = finalConsonant(word)
  if (pair === '으로로') return final === 0 || final === 8 ? without : withBatchim
  return final !== 0 ? withBatchim : without
}

export function josa(word: string, pair: JosaPair): string {
  return word + particle(word, pair)
}
