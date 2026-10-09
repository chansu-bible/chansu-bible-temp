import path from 'node:path'

// 서버 설정. 기본값은 infra/docker-compose.yml의 개발용 값이다. 운영에서는 환경 변수로 바꾼다.
const list = (value: string | undefined, fallback: string[]) =>
  value ? value.split(',').map((item) => item.trim()).filter(Boolean) : fallback

// 양의 정수만 받고, 비었거나 틀린 값이면 기본값이다(빈 ASK_DAILY_LIMIT=이 한도 0이 되지 않게).
const positiveInt = (value: string | undefined, fallback: number) => {
  const parsed = Number(value)
  return value && Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

export type Config = {
  host: string
  port: number
  databaseUrl: string
  // 받아들일 토큰 발급자. 키클락 개발 모드는 요청한 주소로 발급자를 정해서, 에뮬레이터(10.0.2.2)용도 넣는다.
  issuers: string[]
  // 서명 키를 받을 주소(서버가 키클락에 직접 붙는 주소)
  jwksUrl: string
  // 받아들일 클라이언트(토큰의 azp)
  clients: string[]
  corsOrigins: string[]
  // 질문하기: 대목을 만들 앱 묶음, OpenAI 키(리포 루트 .env), 모델, 하루 한도
  bundleFile: string
  openaiApiKey: string | null
  askModel: string
  askDailyLimit: number
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    host: env.HOST ?? '127.0.0.1',
    port: positiveInt(env.PORT, 8790),
    databaseUrl: env.DATABASE_URL ?? 'postgres://chansu:chansu-dev@127.0.0.1:5433/chansu',
    issuers: list(env.AUTH_ISSUERS, [
      'http://localhost:8080/realms/chansu-bible',
      'http://127.0.0.1:8080/realms/chansu-bible',
      'http://10.0.2.2:8080/realms/chansu-bible',
    ]),
    jwksUrl: env.AUTH_JWKS_URL ?? 'http://127.0.0.1:8080/realms/chansu-bible/protocol/openid-connect/certs',
    clients: list(env.AUTH_CLIENTS, ['chansu-bible-app', 'chansu-bible-test']),
    corsOrigins: list(env.CORS_ORIGINS, ['http://localhost:8081']),
    bundleFile: env.BUNDLE_FILE ?? path.resolve(import.meta.dirname, '../../app/public/content/genesis.json'),
    openaiApiKey: env.OPENAI_API_KEY || null,
    askModel: env.ASK_MODEL || env.OPENAI_WRITER_MODEL || 'gpt-6.1-sol',
    askDailyLimit: positiveInt(env.ASK_DAILY_LIMIT, 20),
  }
}
