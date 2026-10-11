// id 목록 입력 칸의 글을 나눈다. 쉼표·공백·줄바꿈 어느 것으로 띄워도 되고 빈 칸은 버린다.
export function splitIds(text: string): string[] {
  return text.split(/[\s,]+/).filter(Boolean)
}

// 그림 버전 id 규칙. pipeline의 IMAGE_VERSION_ID_PATTERN과 같다(화면 코드는 pipeline을 가져오지 못해 옮겨 둔다. 같은지는 test/images.test.ts가 본다).
// 영문 소문자로 시작한다. "2", "10"처럼 정수로 읽히는 id는 객체의 키 차례를 숫자순으로 바꿔 그림 버전 목록 차례가 깨진다.
const IMAGE_VERSION_ID = /^[a-z][a-z0-9-]*$/

export function isImageVersionId(id: string): boolean {
  return IMAGE_VERSION_ID.test(id)
}
