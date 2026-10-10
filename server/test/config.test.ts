import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { readConfig } from '../src/config.ts'

describe('readConfig', () => {
  it('빈 값은 기본값으로 둔다(.env.example을 그대로 복사한 경우)', () => {
    const config = readConfig({ PORT: '', ASK_MODEL: '', ASK_DAILY_LIMIT: '', OPENAI_API_KEY: '', BUNDLE_DIR: '' })
    expect(config.port).toBe(8790)
    expect(config.askModel).toBe('gpt-6.1-sol')
    expect(config.askDailyLimit).toBe(20)
    expect(config.openaiApiKey).toBeNull()
    expect(config.bundleDir).toBe(readConfig({}).bundleDir)
  })

  it('하루 한도와 포트는 양의 정수만 받는다', () => {
    expect(readConfig({ ASK_DAILY_LIMIT: '5', PORT: '9000' })).toMatchObject({ askDailyLimit: 5, port: 9000 })
    expect(readConfig({ ASK_DAILY_LIMIT: '0' }).askDailyLimit).toBe(20)
    expect(readConfig({ ASK_DAILY_LIMIT: 'many' }).askDailyLimit).toBe(20)
  })

  it('서버 전체 하루 한도는 ASK_GLOBAL_DAILY_LIMIT이고, 비었거나 틀리면 200이다', () => {
    expect(readConfig({ ASK_GLOBAL_DAILY_LIMIT: '50' }).askGlobalDailyLimit).toBe(50)
    expect(readConfig({ ASK_GLOBAL_DAILY_LIMIT: '' }).askGlobalDailyLimit).toBe(200)
    expect(readConfig({ ASK_GLOBAL_DAILY_LIMIT: '0' }).askGlobalDailyLimit).toBe(200)
    expect(readConfig({}).askGlobalDailyLimit).toBe(200)
  })

  it('책 묶음 폴더는 BUNDLE_DIR이고, 없으면 app/public/content다', () => {
    expect(readConfig({ BUNDLE_DIR: '/data/content' }).bundleDir).toBe('/data/content')
    expect(readConfig({}).bundleDir.endsWith(path.join('app', 'public', 'content'))).toBe(true)
  })
})
