// 앱(iOS, 안드로이드)은 로그인 창을 앱 안 브라우저로 열고 결과를 바로 받는다(promptAsync). 웹만 쓰는 창 이동은 없다.
// 웹은 redirect.web.ts를 쓴다.
export type ReturnedLogin = { code: string; codeVerifier: string; redirectUri: string } | { error: string }

export const webRedirect = {
  supported: false,
  start(_url: string, _pending: { state: string; codeVerifier: string; redirectUri: string }): void {
    // 앱에서는 부르지 않는다.
  },
  take(): ReturnedLogin | null {
    return null
  },
}
