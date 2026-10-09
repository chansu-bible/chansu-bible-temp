// 서버 설정. 기본값은 infra/docker-compose.yml의 개발용 값이다. 운영에서는 환경 변수로 바꾼다.
const list = (value: string | undefined, fallback: string[]) =>
  value ? value.split(',').map((item) => item.trim()).filter(Boolean) : fallback

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
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    host: env.HOST ?? '127.0.0.1',
    port: Number(env.PORT ?? 8790),
    databaseUrl: env.DATABASE_URL ?? 'postgres://chansu:chansu-dev@127.0.0.1:5433/chansu',
    issuers: list(env.AUTH_ISSUERS, [
      'http://localhost:8080/realms/chansu-bible',
      'http://127.0.0.1:8080/realms/chansu-bible',
      'http://10.0.2.2:8080/realms/chansu-bible',
    ]),
    jwksUrl: env.AUTH_JWKS_URL ?? 'http://127.0.0.1:8080/realms/chansu-bible/protocol/openid-connect/certs',
    clients: list(env.AUTH_CLIENTS, ['chansu-bible-app', 'chansu-bible-test']),
    corsOrigins: list(env.CORS_ORIGINS, ['http://localhost:8081']),
  }
}
