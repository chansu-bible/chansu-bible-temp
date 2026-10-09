import { describe, expect, it } from 'vitest'
import { readConfig } from '../src/config.ts'

describe('readConfig', () => {
  it('빈 값은 기본값으로 둔다(.env.example을 그대로 복사한 경우)', () => {
    const config = readConfig({ PORT: '', ASK_MODEL: '', ASK_DAILY_LIMIT: '', OPENAI_API_KEY: '' })
    expect(config.port).toBe(8790)
    expect(config.askModel).toBe('gpt-6.1-sol')
    expect(config.askDailyLimit).toBe(20)
    expect(config.openaiApiKey).toBeNull()
  })

  it('하루 한도와 포트는 양의 정수만 받는다', () => {
    expect(readConfig({ ASK_DAILY_LIMIT: '5', PORT: '9000' })).toMatchObject({ askDailyLimit: 5, port: 9000 })
    expect(readConfig({ ASK_DAILY_LIMIT: '0' }).askDailyLimit).toBe(20)
    expect(readConfig({ ASK_DAILY_LIMIT: 'many' }).askDailyLimit).toBe(20)
  })
})
