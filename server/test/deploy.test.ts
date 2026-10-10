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
