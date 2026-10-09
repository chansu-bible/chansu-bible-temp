import type { ReturnedLogin } from './redirect'

// Expo 웹: 로그인 창을 팝업이 아니라 이 창에서 연다(팝업 차단이나, 팝업을 지원하지 않는 미리 보기 창에서도 되게).
// 떠나기 전에 PKCE 검증값을 sessionStorage에 두고, /auth로 돌아오면 꺼내 코드를 토큰으로 바꾼다.
const key = 'auth-pending'

type Pending = { state: string; codeVerifier: string; redirectUri: string }

export const webRedirect = {
  supported: true,
  start(url: string, pending: Pending): void {
    sessionStorage.setItem(key, JSON.stringify(pending))
    window.location.assign(url)
  },
  // 로그인 창에서 돌아왔으면 코드와 검증값을 꺼낸다(한 번만). 돌아온 것이 아니면 null.
  take(): ReturnedLogin | null {
    const params = new URLSearchParams(window.location.search)
    const saved = sessionStorage.getItem(key)
    if (saved === null || (!params.has('code') && !params.has('error'))) return null
    sessionStorage.removeItem(key)
    const pending = JSON.parse(saved) as Pending
    // 이 창에서 시작한 로그인의 응답인지 state로 확인한다.
    if (params.get('state') !== pending.state) return { error: 'state_mismatch' }
    const error = params.get('error')
    if (error !== null) return { error }
    return { code: params.get('code') ?? '', codeVerifier: pending.codeVerifier, redirectUri: pending.redirectUri }
  },
}
