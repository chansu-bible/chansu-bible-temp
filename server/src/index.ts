import { existsSync } from 'node:fs'
import path from 'node:path'
import { serve } from '@hono/node-server'
import { createRemoteJWKSet } from 'jose'
import { createApp, type AskDeps } from './app.ts'
import { readBundles } from './ask/bundles.ts'
import { createOpenAiAskModel } from './ask/openaiModel.ts'
import { buildPassages } from './ask/passages.ts'
import { buildIndex } from './ask/retrieve.ts'
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
  console.error(`Postgres(${new URL(config.databaseUrl).host})에 연결하지 못했습니다. npm run infra:up으로 띄웠는지 확인하세요.`)
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}

const verify = createVerifier({ issuers: config.issuers, clients: config.clients, jwks: createRemoteJWKSet(new URL(config.jwksUrl)) })
// 질문하기: 키와 책 묶음이 있을 때만 켠다.
function loadAsk(): AskDeps | null {
  if (!config.openaiApiKey) {
    console.warn('OPENAI_API_KEY가 없어 질문하기를 끕니다.')
    return null
  }
  const bundles = readBundles(config.bundleDir)
  if (bundles.length === 0) {
    console.warn(`묶음 폴더(${config.bundleDir})에 책 묶음이 없어 질문하기를 끕니다. 먼저 npm run pipeline -- build를 하세요.`)
    return null
  }
  const index = buildIndex(buildPassages(bundles))
  console.log(`질문하기: 책 ${bundles.length}권, 대목 ${index.passages.length}개, 모델 ${config.askModel}, 하루 ${config.askDailyLimit}번`)
  return { index, model: createOpenAiAskModel(config.openaiApiKey, config.askModel), dailyLimit: config.askDailyLimit }
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
