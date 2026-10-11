import { PGlite } from '@electric-sql/pglite'
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose'
import { createApp } from '../src/app.ts'
import { createVerifier } from '../src/auth.ts'
import { migrate, type Query, type Sql } from '../src/db.ts'

export const ISSUER = 'http://localhost:8080/realms/chansu-bible'

type Queryable = { query<T>(text: string, params?: unknown[]): Promise<{ rows: T[] }> }
const wrap =
  (target: Queryable): Query =>
  async <T>(text: string, params: unknown[] = []) =>
    (await target.query<T>(text, params)).rows

// 메모리 안의 Postgres(PGlite)로 서버를 시험한다. 도커가 없어도 된다.
export async function memorySql(): Promise<Sql> {
  const db = new PGlite()
  const sql: Sql = {
    query: wrap(db),
    transaction: <T>(fn: (query: Query) => Promise<T>) => db.transaction((tx) => fn(wrap(tx))),
  }
  await migrate(sql)
  return sql
}

type PrivateKey = Awaited<ReturnType<typeof generateKeyPair>>['privateKey']

export async function testKeys() {
  const { publicKey, privateKey } = await generateKeyPair('RS256')
  const jwk = { ...(await exportJWK(publicKey)), kid: 'test', alg: 'RS256', use: 'sig' }
  return { privateKey, jwks: createLocalJWKSet({ keys: [jwk] }) }
}

// 키클락 액세스 토큰과 같은 모양의 토큰을 시험용 키로 서명한다.
export async function token(
  privateKey: PrivateKey,
  claims: { sub: string; azp?: string; name?: string; preferred_username?: string },
  options: { issuer?: string; expiresIn?: string } = {},
): Promise<string> {
  return new SignJWT({ azp: 'chansu-bible-app', ...claims })
    .setProtectedHeader({ alg: 'RS256', kid: 'test' })
    .setIssuer(options.issuer ?? ISSUER)
    .setIssuedAt()
    .setExpirationTime(options.expiresIn ?? '5m')
    .sign(privateKey)
}

async function createTestApp() {
  const sql = await memorySql()
  const { privateKey, jwks } = await testKeys()
  const verify = createVerifier({ issuers: [ISSUER], clients: ['chansu-bible-app', 'chansu-bible-test'], jwks })
  return { app: createApp({ sql, verify, corsOrigins: ['http://localhost:8081'] }), sql, privateKey }
}

// PGlite는 띄우는 데 몇 초 걸려서 시험 파일마다 하나를 같이 쓴다. 시험마다 newUser()로 다른 사용자를 써서 섞이지 않게 한다.
let shared: ReturnType<typeof createTestApp> | null = null
export function testApp(): ReturnType<typeof createTestApp> {
  shared ??= createTestApp()
  return shared
}

let users = 0
export const newUser = (): string => `user-${++users}`
