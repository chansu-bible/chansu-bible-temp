// 액세스 토큰(JWT)의 내용만 읽는다. 서명 검증은 서버가 한다.
export type TokenClaims = { sub: string; name?: string; preferred_username?: string; email?: string }

export function readClaims(token: string): TokenClaims | null {
  const part = token.split('.')[1]
  if (!part) return null
  try {
    const base64 = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=')
    // atob는 바이트를 글자 하나씩 준다. 한글 이름이 깨지지 않게 UTF-8로 다시 읽는다.
    const json = decodeURIComponent(
      Array.from(atob(base64), (char) => `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`).join(''),
    )
    const claims = JSON.parse(json) as Partial<TokenClaims>
    return typeof claims.sub === 'string' && claims.sub !== '' ? (claims as TokenClaims) : null
  } catch {
    return null
  }
}
