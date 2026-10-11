// offsets: 장면 블록마다 스크롤 영역 안에서의 위쪽 위치(px). 작은 값부터 순서대로다.
export function findActiveIndex(offsets: number[], scrollTop: number, lineOffset: number, atBottom: boolean): number {
  if (offsets.length === 0) return 0
  if (atBottom) return offsets.length - 1

  const line = scrollTop + lineOffset
  let active = 0
  for (let index = 0; index < offsets.length; index++) {
    if (offsets[index] > line) break
    active = index
  }
  return active
}
