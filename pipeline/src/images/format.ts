// API가 요청한 형식과 다른 형식으로 돌려줄 수 있어서, 파일 내용으로 형식을 확인한다.
export function detectImageExtension(bytes: Uint8Array): 'png' | 'jpg' | 'webp' {
  const has = (signature: number[], offset = 0) => signature.every((byte, index) => bytes[offset + index] === byte)

  if (has([0x89, 0x50, 0x4e, 0x47])) return 'png'
  if (has([0xff, 0xd8, 0xff])) return 'jpg'
  if (has([0x52, 0x49, 0x46, 0x46]) && has([0x57, 0x45, 0x42, 0x50], 8)) return 'webp'
  throw new Error('그림 파일 형식을 알아볼 수 없습니다')
}
