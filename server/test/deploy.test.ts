import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// 맥미니 배포 파일(deploy/)이 지켜야 할 것. 리포가 공개라 비밀 값과 시험 계정이 들어가지 않게 막는다.
const repoDir = path.resolve(import.meta.dirname, '../..')
const read = (file: string) => readFileSync(path.join(repoDir, file), 'utf8')

describe('운영용 키클락 realm', () => {
  const realm = JSON.parse(read('deploy/keycloak/chansu-bible-realm.json'))

  it('시험 계정과 개발용 클라이언트가 없다', () => {
    expect(realm.users ?? []).toEqual([])
    expect(realm.clients.map((client: { clientId: string }) => client.clientId)).toEqual(['chansu-bible-app'])
  })

  it('앱 클라이언트는 PKCE 공개 클라이언트이고 앱으로만 돌아온다', () => {
    const [app] = realm.clients
    expect(app).toMatchObject({ publicClient: true, standardFlowEnabled: true, implicitFlowEnabled: false, directAccessGrantsEnabled: false })
    expect(app.redirectUris).toEqual(['chansubible://*'])
    expect(app.webOrigins ?? []).toEqual([])
    expect(app.attributes['pkce.code.challenge.method']).toBe('S256')
    expect(app.optionalClientScopes).toContain('offline_access')
  })

  it('누구나 가입하고, 메일이 필요한 기능은 끄고, 로그인 실패를 막는다', () => {
    expect(realm).toMatchObject({
      realm: 'chansu-bible',
      registrationAllowed: true,
      resetPasswordAllowed: false,
      verifyEmail: false,
      bruteForceProtected: true,
      sslRequired: 'external',
      defaultLocale: 'ko',
    })
    expect(realm.passwordPolicy).toContain('length(8)')
  })
})

describe('서버 이미지', () => {
  it('빌드 맥락에서 .env와 node_modules를 뺀다', () => {
    const ignore = read('.dockerignore').split('\n').map((line) => line.trim())
    expect(ignore).toContain('**/.env')
    expect(ignore).toContain('**/node_modules')
  })
})

describe('Compose와 입구', () => {
  const compose = read('deploy/compose.yaml')

  it('포트는 맥미니 자신(127.0.0.1)에만 연다', () => {
    const lines = compose.split('\n')
    const published = lines.flatMap((line, at) => (lines[at - 1]?.trim() === 'ports:' ? [line.trim()] : []))
    expect(published).toHaveLength(2)
    for (const line of published) expect(line.startsWith("- '127.0.0.1:")).toBe(true)
  })

  it('비밀번호는 deploy/.env에서만 받는다', () => {
    // 비밀번호 키(POSTGRES_PASSWORD 등)의 값은 모두 ${...}로 받아야 한다.
    const passwords = compose.split('\n').filter((line) => /^\s*\w*PASSWORD:/.test(line))
    expect(passwords).toHaveLength(3)
    for (const line of passwords) expect(line).toMatch(/PASSWORD:\s*\$\{/)
  })

  it('입구는 키클락 관리 화면을 먼저 막고, 공개 스킴을 알린다', () => {
    const caddy = read('deploy/Caddyfile')
    const block = caddy.indexOf('handle @kcadmin')
    const keycloak = caddy.indexOf('handle @keycloak')
    expect(block).toBeGreaterThan(-1)
    expect(block).toBeLessThan(keycloak)
    expect(caddy).toContain('header_up X-Forwarded-Proto {$PUBLIC_SCHEME}')
  })

  it('설정 견본에는 비밀 값이 비어 있다', () => {
    const example = read('deploy/.env.example')
    for (const key of ['DB_PASSWORD', 'KC_ADMIN_PASSWORD', 'OPENAI_API_KEY']) expect(example).toMatch(new RegExp(`^${key}=$`, 'm'))
  })
})
