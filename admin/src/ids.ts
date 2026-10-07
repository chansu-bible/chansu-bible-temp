// id 목록 입력 칸의 글을 나눈다. 쉼표·공백·줄바꿈 어느 것으로 띄워도 되고 빈 칸은 버린다.
export function splitIds(text: string): string[] {
  return text.split(/[\s,]+/).filter(Boolean)
}
