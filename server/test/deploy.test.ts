import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// 맥미니 배포 파일(deploy/)이 지켜야 할 것. 리포가 공개라 비밀 값과 시험 계정이 들어가지 않게 막는다.
const repoDir = path.resolve(import.meta.dirname, '../..')
const read = (file: string) => readFileSync(path.join(repoDir, file), 'utf8')
const git = (...args: string[]) => execFileSync('git', args, { cwd: repoDir, encoding: 'utf8' })
// git이 없거나 리포 밖(압축 파일로 받은 소스 등)에서 돌면 git으로 보는 시험은 건너뛴다.
const hasGit = (() => {
  try {
    return git('rev-parse', '--is-inside-work-tree').trim() === 'true'
  } catch {
    return false
  }
})()

describe('운영용 키클락 realm', () => {
  const realm = JSON.parse(read('deploy/keycloak/chansu-bible-realm.json'))

  it('키클락이 읽는 폴더에는 이 realm 파일 하나만 있다', () => {
    // --import-realm은 폴더의 JSON을 모두 읽는다. 다른 파일이 들면 계정이나 realm이 몰래 더해진다.
    expect(readdirSync(path.join(repoDir, 'deploy/keycloak'))).toEqual(['chansu-bible-realm.json'])
  })

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
    expect(app.attributes['post.logout.redirect.uris']).toBe('chansubible://*')
  })

  it('누구나 가입하고, 메일이 필요한 기능은 끄고, 로그인 실패를 막는다', () => {
    expect(realm).toMatchObject({
      realm: 'chansu-bible',
      registrationAllowed: true,
      resetPasswordAllowed: false,
      verifyEmail: false,
      bruteForceProtected: true,
      // 누구나 가입하는 곳에서 영구 잠금이면 아무나 남의 계정을 영영 잠글 수 있다.
      permanentLockout: false,
      failureFactor: 5,
      offlineSessionIdleTimeout: 2592000,
      sslRequired: 'external',
      defaultLocale: 'ko',
    })
    expect(realm.passwordPolicy).toBe('length(8) and notUsername and notEmail')
  })
})

describe('서버 이미지', () => {
  it('빌드 맥락에서 .env와 node_modules를 뺀다', () => {
    const ignore = read('.dockerignore').split('\n').map((line) => line.trim())
    for (const pattern of ['**/.env', '**/.env.*', '**/*.env', '**/.npmrc', '**/node_modules']) expect(ignore).toContain(pattern)
    // 다시 넣는 것은 비밀 값이 없는 견본(.env.example)뿐이다.
    expect(ignore.filter((line) => line.startsWith('!') && line.includes('.env'))).toEqual(['!**/.env.example'])
  })
})

describe('Compose와 입구', () => {
  const compose = read('deploy/compose.yaml')

  it('포트는 맥미니 자신(127.0.0.1)에만 연다', () => {
    const lines = compose.split('\n')
    // ports: 바로 아래 첫 줄만이 아니라 포트를 여는 줄('…:포트')을 모두 본다.
    const published = lines.filter((line) => /^\s*-\s*'[^']*:\d+'\s*$/.test(line)).map((line) => line.trim())
    expect(published).toHaveLength(2)
    for (const line of published) expect(line.startsWith("- '127.0.0.1:")).toBe(true)
    // ports: 목록에는 위 꼴의 줄만 둔다. 따옴표 없는 꼴이나 긴 꼴로 몰래 열지 못하게 한다.
    expect(lines.filter((line) => /^\s*ports:/.test(line)).map((line) => line.trim())).toEqual(['ports:', 'ports:'])
    const listed = lines.flatMap((line, at) => {
      if (line.trim() !== 'ports:') return []
      const items: string[] = []
      for (const next of lines.slice(at + 1)) {
        if (!/^\s*-/.test(next)) break
        items.push(next.trim())
      }
      return items
    })
    expect(listed).toEqual(published)
  })

  it('비밀번호는 deploy/.env에서만 받는다', () => {
    // 비밀번호 키(POSTGRES_PASSWORD 등)의 값은 모두 ${...}로 받아야 한다.
    const passwords = compose.split('\n').filter((line) => /^\s*\w*PASSWORD:/.test(line))
    expect(passwords).toHaveLength(3)
    for (const line of passwords) expect(line).toMatch(/PASSWORD:\s*\$\{/)
    // DB 주소 안의 비밀번호도 글자로 적지 않는다.
    const databaseUrl = compose.split('\n').filter((line) => /^\s*DATABASE_URL:/.test(line))
    expect(databaseUrl).toHaveLength(1)
    expect(databaseUrl[0]).toContain('://chansu:${DB_PASSWORD}@')
  })

  it('deploy/.env는 git이 뺀다', () => {
    // 루트 .gitignore의 `.env` 줄은 모든 폴더의 .env를 뺀다.
    expect(read('.gitignore').split('\n').map((line) => line.trim())).toContain('.env')
  })

  it('입구는 앱 realm과 화면 자원만 키클락에 보내고, 공개 스킴을 알린다', () => {
    const caddy = read('deploy/caddy/Caddyfile')
    const lines = caddy.split('\n').map((line) => line.trim())
    // 경로 매개변수(;)와 인코딩한 빗금(%2F)은 허용 목록을 보기 전에 막는다.
    expect(lines).toContain('@params path_regexp ;')
    expect(lines).toContain('@encodedSlash vars_regexp {http.request.uri} ^[^?]*%2[fF]')
    expect(lines).toContain('@keycloak path /auth/realms/chansu-bible /auth/realms/chansu-bible/* /auth/resources/*')
    expect(lines).toContain('@keycloakOther path /auth /auth/*')
    const order = ['handle @params {', 'handle @encodedSlash {', 'handle @keycloak {', 'handle @keycloakOther {'].map((line) => lines.indexOf(line))
    order.push(lines.lastIndexOf('handle {'))
    for (const at of order) expect(at).toBeGreaterThan(-1)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
    // 막는 블록은 404로 답한다.
    for (const block of ['handle @params {', 'handle @encodedSlash {', 'handle @keycloakOther {']) {
      expect(lines[lines.indexOf(block) + 1]).toBe('respond 404')
    }
    expect(caddy).toContain('header_up X-Forwarded-Proto {$PUBLIC_SCHEME}')
    // 파일 하나가 아니라 폴더를 붙인다. git이 새 파일로 바꿔 써도 컨테이너가 새 내용을 본다.
    expect(compose).toMatch(/^\s*- \.\/caddy:\/etc\/caddy:ro\s*$/m)
  })

  it('설정 견본에는 비밀 값이 비어 있다', () => {
    const example = read('deploy/.env.example')
    for (const key of ['DB_PASSWORD', 'KC_ADMIN_PASSWORD', 'OPENAI_API_KEY']) expect(example).toMatch(new RegExp(`^${key}=$`, 'm'))
  })
})

describe('운영 스크립트', () => {
  const scripts = ['deploy/backup.sh', 'deploy/keycloak-admin.sh', 'deploy/update.sh']

  it('올리기, 백업, 관리자 realm 설정 스크립트가 있다', () => {
    for (const file of scripts) expect(existsSync(path.join(repoDir, file))).toBe(true)
  })

  it.skipIf(!hasGit)('git에 실행 파일(100755)로 들어 있다', () => {
    // 줄마다 "<모드> <해시> <단계>\t<경로>"다.
    const modes = git('ls-files', '-s', '--', ...scripts)
      .trim()
      .split('\n')
      .map((line) => `${line.split('\t')[1]} ${line.split(' ')[0]}`)
    expect(modes).toEqual(scripts.map((file) => `${file} 100755`))
  })
})
