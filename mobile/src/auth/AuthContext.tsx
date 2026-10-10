import * as AuthSession from 'expo-auth-session'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AppState } from 'react-native'
import { authConfig } from './config'
import { readClaims } from './jwt'
import { webRedirect } from './redirect'
import { tokenStore } from './tokenStore'

export type AuthUser = { sub: string; name: string | null; username: string | null; email: string | null }

export type AuthState =
  | { status: 'loading' }
  | { status: 'signedOut'; message: string | null }
  | { status: 'signedIn'; user: AuthUser }

type AuthValue = {
  state: AuthState
  // 로그인 창(키클락)을 연다. 회원 가입도 그 창에서 한다.
  signIn: () => Promise<void>
  // 갱신 토큰을 무르고 로그인 정보를 지운다(기기 기록 지우기는 부른 쪽이 한다).
  signOut: () => Promise<void>
  // 쓸 수 있는 액세스 토큰. 만료가 가까우면 갱신한다. 로그인이 끝났으면 로그아웃 상태로 바꾸고, 연결이 안 되면 null이다.
  accessToken: () => Promise<string | null>
}

type Tokens = { access: string; refresh: string; expiresAt: number }

const AuthContext = createContext<AuthValue | null>(null)

const unreachable = '로그인 서버에 연결하지 못했어요'
const failed = '로그인하지 못했어요'

// 토큰은 받았지만 쓸 수 없을 때(사용자 정보나 갱신 토큰이 없음)
class UnusableTokenError extends Error {}

function userOf(accessToken: string): AuthUser | null {
  const claims = readClaims(accessToken)
  return claims
    ? { sub: claims.sub, name: claims.name ?? null, username: claims.preferred_username ?? null, email: claims.email ?? null }
    : null
}

function sameUser(a: AuthUser, b: AuthUser): boolean {
  return a.sub === b.sub && a.name === b.name && a.username === b.username && a.email === b.email
}

// 로그인 서버(키클락)의 발견 문서를 받는다. AuthSession.useAutoDiscovery는 실패를 잡지 않아서
// 서버가 꺼져 있으면 처리되지 않은 오류가 나므로 직접 받는다.
// 못 받으면 discovery는 null로 남고 onFailed를 부른다(바뀌지 않는 함수를 줘야 한다).
// retry를 부르면 다시 받고, 앞서 보낸 요청의 답은 버린다(매달린 요청이 다시 받기를 막지 않게). 이미 받았으면 부르지 않는다.
function useDiscovery(issuer: string, onFailed: () => void) {
  const [discovery, setDiscovery] = useState<AuthSession.DiscoveryDocument | null>(null)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let alive = true
    void AuthSession.fetchDiscoveryAsync(issuer).then(
      (found) => {
        if (alive) setDiscovery(found)
      },
      () => {
        if (alive) onFailed()
      },
    )
    return () => {
      alive = false
    }
  }, [issuer, onFailed, attempt])
  const retry = useCallback(() => setAttempt((count) => count + 1), [])
  return { discovery, retry }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' })
  // 로그인 서버에 닿지 못했다. 아직 확인 중이면 그 자리에 머물지 않고 로그아웃 상태로 둔다.
  const markUnreachable = useCallback(() => {
    setState((current) => (current.status === 'loading' ? { status: 'signedOut', message: unreachable } : current))
  }, [])
  const { discovery, retry: retryDiscovery } = useDiscovery(authConfig.issuer, markUnreachable)
  const redirectUri = AuthSession.makeRedirectUri({ scheme: 'chansubible', path: 'auth' })
  const [request, , promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: authConfig.clientId,
      redirectUri,
      scopes: authConfig.scopes,
      usePKCE: true,
      // 로그아웃한 뒤 다른 계정으로 들어갈 수 있게 늘 로그인 양식을 보인다.
      prompt: AuthSession.Prompt.Login,
    },
    discovery,
  )
  const tokens = useRef<Tokens | null>(null)
  const restored = useRef(false)

  // 받은 토큰을 기억하고 로그인 상태로 둔다. 갱신 토큰은 기기 보안 저장소에 둔다.
  const keep = useCallback(async (response: AuthSession.TokenResponse) => {
    const user = userOf(response.accessToken)
    const refresh = response.refreshToken ?? tokens.current?.refresh
    if (!user || !refresh) throw new UnusableTokenError('토큰에 사용자나 갱신 토큰이 없습니다')
    tokens.current = { access: response.accessToken, refresh, expiresAt: Date.now() + (response.expiresIn ?? 300) * 1000 }
    await tokenStore.save(refresh)
    setState((current) => (current.status === 'signedIn' && sameUser(current.user, user) ? current : { status: 'signedIn', user }))
  }, [])

  // 로그인 창이 돌려준 코드를 토큰으로 바꾼다(PKCE 검증값과 함께).
  const exchange = useCallback(
    async (code: string, codeVerifier: string | undefined, returnUri: string) => {
      if (!discovery) throw new Error('발견 문서가 없습니다')
      await keep(
        await AuthSession.exchangeCodeAsync(
          {
            clientId: authConfig.clientId,
            code,
            redirectUri: returnUri,
            extraParams: codeVerifier ? { code_verifier: codeVerifier } : undefined,
          },
          discovery,
        ),
      )
    },
    [discovery, keep],
  )

  // 갱신 토큰으로 새 액세스 토큰을 받는다. invalid는 로그인이 끝난 것(다시 로그인해야 한다), offline은 연결 실패다.
  const refresh = useCallback(
    async (refreshToken: string): Promise<'ok' | 'invalid' | 'offline'> => {
      if (!discovery) return 'offline'
      try {
        await keep(await AuthSession.refreshAsync({ clientId: authConfig.clientId, refreshToken }, discovery))
        return 'ok'
      } catch (error) {
        return error instanceof AuthSession.TokenError || error instanceof UnusableTokenError ? 'invalid' : 'offline'
      }
    },
    [discovery, keep],
  )

  // 앱을 열 때: 웹에서 로그인 창을 거쳐 돌아왔으면 코드를 토큰으로 바꾸고,
  // 아니면 저장해 둔 갱신 토큰으로 조용히 다시 로그인한다.
  useEffect(() => {
    if (!discovery || restored.current) return
    restored.current = true
    void (async () => {
      const returned = webRedirect.take()
      if (returned !== null) {
        if ('error' in returned) {
          setState({ status: 'signedOut', message: failed })
          return
        }
        try {
          await exchange(returned.code, returned.codeVerifier, returned.redirectUri)
        } catch {
          setState({ status: 'signedOut', message: failed })
        }
        return
      }
      const saved = await tokenStore.load().catch(() => null)
      if (saved === null) {
        setState({ status: 'signedOut', message: null })
        return
      }
      const result = await refresh(saved)
      if (result === 'invalid') await tokenStore.clear().catch(() => undefined)
      if (result !== 'ok') setState({ status: 'signedOut', message: result === 'offline' ? unreachable : null })
    })()
  }, [discovery, exchange, refresh])

  // 키클락에 닿지 않으면 확인 중에 머물지 않고 로그아웃 상태로 둔다.
  // 발견 문서를 받다 실패하면 바로 그렇게 하고(useDiscovery), 연결이 매달려 아무 답이 없을 때를 위해 8초 뒤에도 한다.
  useEffect(() => {
    const timer = setTimeout(markUnreachable, 8000)
    return () => clearTimeout(timer)
  }, [markUnreachable])

  // 앱이 앞으로 돌아왔는데 발견 문서를 아직 못 받았으면 다시 받는다. 받으면 위의 '앱을 열 때'가 저장된 로그인을 이어 준다.
  useEffect(() => {
    if (discovery) return
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') retryDiscovery()
    })
    return () => subscription.remove()
  }, [discovery, retryDiscovery])

  const signIn = useCallback(async () => {
    // 발견 문서를 못 받았으면 다시 받아 본다. 이번에는 닿지 못했다고 알리고, 받고 난 뒤 다시 누르면 된다.
    if (!discovery) retryDiscovery()
    if (!request || !discovery) {
      setState({ status: 'signedOut', message: unreachable })
      return
    }
    // 웹: 이 창에서 로그인 창으로 갔다가 /auth로 돌아온다. 돌아온 뒤의 일은 위의 '앱을 열 때'가 한다.
    if (webRedirect.supported) {
      const url = await request.makeAuthUrlAsync(discovery)
      webRedirect.start(url, { state: request.state, codeVerifier: request.codeVerifier ?? '', redirectUri })
      return
    }
    // 앱: 앱 안 브라우저로 열고 결과를 바로 받는다.
    const result = await promptAsync()
    if (result.type !== 'success') {
      if (result.type === 'error') setState({ status: 'signedOut', message: failed })
      return
    }
    try {
      await exchange(result.params.code ?? '', request.codeVerifier, redirectUri)
    } catch {
      setState({ status: 'signedOut', message: failed })
    }
  }, [request, discovery, retryDiscovery, promptAsync, redirectUri, exchange])

  const signOut = useCallback(async () => {
    const current = tokens.current
    tokens.current = null
    await tokenStore.clear().catch(() => undefined)
    // 키클락 쪽 세션도 끝낸다(갱신 토큰을 무른다). 연결이 안 되면 기기에서만 로그아웃한다.
    if (current && discovery?.revocationEndpoint) {
      await AuthSession.revokeAsync(
        { clientId: authConfig.clientId, token: current.refresh, tokenTypeHint: AuthSession.TokenTypeHint.RefreshToken },
        discovery,
      ).catch(() => undefined)
    }
    setState({ status: 'signedOut', message: null })
  }, [discovery])

  const accessToken = useCallback(async () => {
    const current = tokens.current
    if (!current) return null
    if (current.expiresAt - Date.now() > 30_000) return current.access
    const result = await refresh(current.refresh)
    if (result === 'ok') return tokens.current?.access ?? null
    if (result === 'invalid') {
      tokens.current = null
      await tokenStore.clear().catch(() => undefined)
      setState({ status: 'signedOut', message: '로그인이 끝났어요. 다시 로그인해 주세요.' })
    }
    return null
  }, [refresh])

  const value = useMemo(() => ({ state, signIn, signOut, accessToken }), [state, signIn, signOut, accessToken])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('AuthProvider 밖에서 useAuth를 불렀습니다')
  return value
}
