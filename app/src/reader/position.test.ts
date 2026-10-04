import { describe, expect, it } from 'vitest'
import { parsePosition } from './position.ts'

describe('parsePosition', () => {
  it('장과 절이 있으면 위치로 읽는다', () => {
    expect(parsePosition('{"chapter":2,"verse":5}')).toEqual({ chapter: 2, verse: 5 })
  })

  it('저장된 값이 없으면 null이다', () => {
    expect(parsePosition(null)).toBeNull()
  })

  it('예전 형식(장면 id)은 무시한다', () => {
    expect(parsePosition('{"chapter":2,"sceneId":"gen-02-a"}')).toBeNull()
  })

  it('JSON이 아니면 null이다', () => {
    expect(parsePosition('{')).toBeNull()
    expect(parsePosition('null')).toBeNull()
  })
})
