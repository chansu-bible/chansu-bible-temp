import { existsSync } from 'node:fs'
import { serve } from '@hono/node-server'
import { paths } from 'pipeline'
import { createApp } from './app.ts'

// 파이프라인을 부르기 전에 .env를 읽는다(CLI와 같은 방식).
if (existsSync(paths.envFile)) process.loadEnvFile(paths.envFile)

const hostname = '127.0.0.1'
const port = 8787

// 이 컴퓨터에서만 쓰는 도구라 127.0.0.1에만 묶는다.
serve({ fetch: createApp().fetch, hostname, port }, (info) => {
  console.log(`관리 서버: http://${hostname}:${info.port}`)
})
