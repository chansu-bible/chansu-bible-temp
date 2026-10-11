import { createHash } from 'node:crypto'

// 내용의 SHA-256 앞 12자리(소문자 16진수). 파일 이름에 붙여 내용이 바뀐 파일만 새 이름이 되게 한다.
// 글자는 UTF-8 바이트로 해시한다.
export function contentHash(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex').slice(0, 12)
}

// 꾸러미·목록을 쓰는 바이트(공백 없는 JSON, BOM 없는 UTF-8). 해시도 이 바이트로 한다.
// 키 차례는 값이 가진 그대로라, 같은 내용이 같은 바이트가 되려면 만드는 쪽이 키 차례를 일정하게 만들어야 한다.
export function jsonBytes(value: unknown): Buffer {
  // JSON.stringify는 undefined·함수·심벌이면 글자 대신 undefined를 준다(타입은 string이라고 하지만).
  const text: string | undefined = JSON.stringify(value)
  if (text === undefined) throw new Error('JSON으로 쓸 수 없는 값입니다')
  return Buffer.from(text, 'utf8')
}
