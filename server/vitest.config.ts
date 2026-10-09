import { defineConfig } from 'vitest/config'

// 시험마다 PGlite(메모리 Postgres)를 새로 띄우므로 넉넉히 기다린다.
export default defineConfig({ test: { testTimeout: 30_000 } })
