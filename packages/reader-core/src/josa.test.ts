import { describe, expect, it } from 'vitest'
import { hasBatchim, josa, particle } from './josa.ts'

describe('josa', () => {
  it('받침에 따라 조사를 고른다', () => {
    expect(hasBatchim('놋')).toBe(true)
    expect(hasBatchim('노아')).toBe(false)
    expect(josa('놋', '은는')).toBe('놋은')
    expect(josa('노아', '은는')).toBe('노아는')
    expect(josa('라멕', '이에요예요')).toBe('라멕이에요')
    expect(josa('에덴', '을를')).toBe('에덴을')
    expect(josa('셈', '과와')).toBe('셈과')
    expect(josa('아벨', '이가')).toBe('아벨이')
  })

  it("'으로로'는 받침이 없거나 ㄹ 받침이면 '로'다", () => {
    expect(josa('놋', '으로로')).toBe('놋으로')
    expect(josa('제물과 죄의 경고', '으로로')).toBe('제물과 죄의 경고로')
    expect(josa('바벨', '으로로')).toBe('바벨로')
  })

  it('조사만 따로 꺼낸다', () => {
    expect(particle('땅의 소산', '이에요예요')).toBe('이에요')
    expect(particle('칠 배', '은는')).toBe('는')
  })

  it('한글이 아니면 받침 없음으로 본다', () => {
    expect(josa('H430', '은는')).toBe('H430는')
    expect(hasBatchim('')).toBe(false)
  })
})
