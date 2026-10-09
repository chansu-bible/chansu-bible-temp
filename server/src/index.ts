import { serve } from '@hono/node-server'
import { createRemoteJWKSet } from 'jose'
import { createApp } from './app.ts'
import { createVerifier } from './auth.ts'
import { readConfig } from './config.ts'
import { migrate, pgSql } from './db.ts'

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
const app = createApp({ sql, verify, corsOrigins: config.corsOrigins })

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
