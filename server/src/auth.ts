import { jwtVerify, type JWTVerifyGetKey } from 'jose'

export type User = { sub: string; name: string | null; username: string | null }
export type Verify = (token: string) => Promise<User>

export class AuthError extends Error {}

// 키클락이 서명한 액세스 토큰을 검증한다: 서명(JWKS), 발급자, 만료, 그리고 우리 앱(azp)이 받은 토큰인지.
export function createVerifier(options: { issuers: string[]; clients: string[]; jwks: JWTVerifyGetKey }): Verify {
  return async (token) => {
    let payload
    try {
      ;({ payload } = await jwtVerify(token, options.jwks, { issuer: options.issuers, algorithms: ['RS256'] }))
    } catch {
      throw new AuthError('토큰을 확인하지 못했습니다')
    }
    if (typeof payload.sub !== 'string' || payload.sub === '') throw new AuthError('사용자가 없는 토큰입니다')
    if (typeof payload.azp !== 'string' || !options.clients.includes(payload.azp)) throw new AuthError('다른 앱의 토큰입니다')
    return {
      sub: payload.sub,
      name: typeof payload.name === 'string' ? payload.name : null,
      username: typeof payload.preferred_username === 'string' ? payload.preferred_username : null,
    }
  }
}
