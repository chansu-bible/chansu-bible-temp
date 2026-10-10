import { existsSync } from 'node:fs'
import path from 'node:path'
import { serve } from '@hono/node-server'
import { createRemoteJWKSet } from 'jose'
import { createApp, type AskDeps } from './app.ts'
import { loadAskIndex } from './ask/bundles.ts'
import { createOpenAiAskModel } from './ask/openaiModel.ts'
import { createVerifier } from './auth.ts'
import { readConfig } from './config.ts'
import { migrate, pgSql } from './db.ts'

// 리포 루트의 .env(OpenAI 키 등). 키는 서버에만 두고 기록에 남기지 않는다.
const envFile = path.resolve(import.meta.dirname, '../../.env')
if (existsSync(envFile)) process.loadEnvFile(envFile)

const config = readConfig()
const sql = pgSql(config.databaseUrl)
try {
  await migrate(sql)
} catch (error) {
  console.error(`Postgres(${new URL(config.databaseUrl).host})에 연결하지 못했습니다. 개발에서는 npm run infra:up으로 띄웠는지, 맥미니에서는 deploy/.env의 DB_PASSWORD와 db 컨테이너를 확인하세요.`)
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}

const verify = createVerifier({ issuers: config.issuers, clients: config.clients, jwks: createRemoteJWKSet(new URL(config.jwksUrl)) })
// 질문하기: 키와 책 묶음이 있을 때만 켠다. 책 묶음이 잘못되어도 질문하기만 끄고 동기화 서버는 띄운다.
function loadAsk(): AskDeps | null {
  if (!config.openaiApiKey) {
    console.warn('OPENAI_API_KEY가 없어 질문하기를 끕니다.')
    return null
  }
  const index = loadAskIndex(config.bundleDir, console.warn)
  if (!index) return null
  console.log(
    `질문하기: 책 ${index.books.length}권, 대목 ${index.passages.length}개, 모델 ${config.askModel}, 하루 ${config.askDailyLimit}번, 서버 전체 하루 ${config.askGlobalDailyLimit}번`,
  )
  return {
    index,
    model: createOpenAiAskModel(config.openaiApiKey, config.askModel),
    dailyLimit: config.askDailyLimit,
    globalDailyLimit: config.askGlobalDailyLimit,
  }
}

const app = createApp({ sql, verify, corsOrigins: config.corsOrigins, ask: loadAsk() })

const server = serve({ fetch: app.fetch, hostname: config.host, port: config.port }, (info) => {
  console.log(`동기화 서버 http://${info.address}:${info.port} · DB ${new URL(config.databaseUrl).host} · 발급자 ${config.issuers.join(', ')}`)
})

// 끌 때 연결을 정리한다.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close()
    void sql.end().finally(() => process.exit(0))
  })
}
