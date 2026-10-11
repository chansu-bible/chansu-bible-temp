// 히브리어 낱말 표시: 칸틸레이션 부호(U+0591~U+05AF), 메테그(U+05BD), 파섹(U+05C0), 위·아래 점(U+05C4, U+05C5)과
// 형태소 구분 '/'를 뺀다. 자음과 모음 부호(니쿠드), 신·쉰 점은 둔다.
export function cleanHebrew(text: string): string {
  return text.replace(/[֑-ֽ֯׀ׅׄ/]/g, '').normalize('NFC')
}

// OSHB 원형(lemma)에서 스트롱 번호. "b/7225", "1254 a", "c/d/776" → H7225, H1254, H776. 접두사뿐("l")이면 null
export function strongOf(lemma: string): string | null {
  const numbers = lemma.match(/\d+/g)
  return numbers ? `H${Number(numbers[numbers.length - 1])}` : null
}
