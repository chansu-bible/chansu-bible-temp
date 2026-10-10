import type { ReturnedLogin } from './redirect'

// Expo 웹: 로그인 창을 팝업이 아니라 이 창에서 연다(팝업 차단이나, 팝업을 지원하지 않는 미리 보기 창에서도 되게).
// 떠나기 전에 PKCE 검증값을 sessionStorage에 두고, /auth로 돌아오면 꺼내 코드를 토큰으로 바꾼다.
const key = 'auth-pending'

type Pending = { state: string; codeVerifier: string; redirectUri: string }

// 돌아온 주소의 쿼리는 이 모듈이 읽힐 때 한 번 잡아 둔다. 로그인 서버를 못 받아 /auth에서 /account로 옮겨 간 뒤에
// 서버를 받아도 take는 그때의 주소가 아니라 이 값을 쓰므로, 돌아온 코드를 잃지 않는다.
// 앱이 시작할 때 이 모듈이 읽힌다는 것에 기댄다(Metro의 inlineRequires를 켜면 처음 쓸 때 읽혀 이 값이 늦게 잡힌다).
let returned: URLSearchParams | null = typeof window === 'undefined' ? null : new URLSearchParams(window.location.search)

export const webRedirect = {
  supported: true,
  start(url: string, pending: Pending): void {
    sessionStorage.setItem(key, JSON.stringify(pending))
    window.location.assign(url)
  },
  // 로그인 창에서 돌아왔으면 코드와 검증값을 꺼낸다(한 번만). 돌아온 것이 아니면 null.
  take(): ReturnedLogin | null {
    const params = returned
    returned = null
    if (params === null) return null
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
