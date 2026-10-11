import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AppState } from 'react-native'
import { useAuth } from '../auth/AuthContext'
import { apiUrl } from '../auth/config'
import { store } from '../data/store'
import { kv } from '../storage/kv'
import { SyncHttpError, syncOnce } from './syncOnce'

// 어디까지 받아 갔는지(서버 순번), 기기 기록이 어느 계정 것인지, 마지막으로 맞춘 때
const sinceKey = 'sync-since'
const ownerKey = 'sync-owner'
const lastKey = 'sync-last-at'

function readKv(key: string): string | null {
  try {
    return kv.getItem(key)
  } catch {
    return null
  }
}

function writeKv(key: string, value: string): void {
  try {
    kv.setItem(key, value)
  } catch {
    // 적지 못해도 다음 동기화가 처음부터 받으면 합치기 규칙 때문에 결과는 같다.
  }
}

export type SyncStatus = { state: 'idle' | 'syncing' | 'error'; lastAt: number | null; message: string | null }

type SyncValue = {
  status: SyncStatus
  // 아직 올리지 않은 기록 수
  pending: number
  // 지금 맞춘다. 끝난 뒤에도 남은(못 올린) 기록 수를 돌려준다.
  syncNow: () => Promise<number>
}

const SyncContext = createContext<SyncValue | null>(null)

// 로그아웃할 때: 기기 기록과 받아 간 위치, 주인을 지운다.
export function clearLocalRecords(): void {
  store.clear()
  writeKv(sinceKey, '0')
  writeKv(ownerKey, '')
  writeKv(lastKey, '')
}

// 로그인해 있으면 기록을 맞춘다: 로그인한 때, 앱이 앞으로 올 때, 기록이 바뀌고 3초 뒤.
export function SyncProvider({ children }: { children: ReactNode }) {
  const { state, accessToken } = useAuth()
  const userSub = state.status === 'signedIn' ? state.user.sub : null
  const [status, setStatus] = useState<SyncStatus>(() => ({ state: 'idle', lastAt: Number(readKv(lastKey)) || null, message: null }))
  const [pending, setPending] = useState(() => store.dirtyRows().length)
  const inflight = useRef<Promise<number> | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const later = useRef<() => void>(() => undefined)

  const run = useCallback(
    async (sub: string): Promise<number> => {
      setStatus((current) => ({ ...current, state: 'syncing', message: null }))
      let ok = false
      try {
        // 로그인이 풀린 뒤 다른 계정으로 들어왔으면 앞 계정의 기록은 올리지 않고 비운다(그 기록은 앞 계정에 있다).
        // 주인이 없는 기록(로그인 전에 쌓은 것)은 이 계정으로 올린다.
        const owner = readKv(ownerKey)
        if (owner && owner !== sub) clearLocalRecords()
        const token = await accessToken()
        if (token === null) {
          setStatus((current) => ({ ...current, state: 'error', message: '로그인 서버에 연결하지 못했어요' }))
        } else {
          const since = readKv(ownerKey) === sub ? Number(readKv(sinceKey) ?? 0) || 0 : 0
          const result = await syncOnce(store, apiUrl, token, since)
          const at = Date.now()
          writeKv(sinceKey, String(result.since))
          writeKv(ownerKey, sub)
          writeKv(lastKey, String(at))
          setStatus({ state: 'idle', lastAt: at, message: null })
          ok = true
        }
      } catch (error) {
        const message = error instanceof SyncHttpError && error.status === 401 ? '다시 로그인해 주세요' : '동기화 서버에 연결하지 못했어요'
        setStatus((current) => ({ ...current, state: 'error', message }))
      }
      const left = store.dirtyRows().length
      setPending(left)
      // 맞추는 사이 고친 기록은 조금 뒤 다시 올린다.
      if (ok && left > 0) later.current()
      return left
    },
    [accessToken],
  )

  const syncNow = useCallback((): Promise<number> => {
    if (userSub === null) return Promise.resolve(store.dirtyRows().length)
    if (!inflight.current) {
      inflight.current = run(userSub).finally(() => {
        inflight.current = null
      })
    }
    return inflight.current
  }, [userSub, run])

  later.current = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void syncNow(), 3000)
  }

  // 로그인하거나, 앱을 다시 열어 로그인이 이어지면 맞춘다.
  useEffect(() => {
    if (userSub !== null) void syncNow()
  }, [userSub, syncNow])

  // 앱이 앞으로 오면 맞춘다(다른 기기에서 읽은 것을 받아 온다).
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') void syncNow()
    })
    return () => subscription.remove()
  }, [syncNow])

  // 기록이 바뀌면 3초 뒤 올린다(이어서 바뀌면 마지막 변경에서 3초 뒤).
  useEffect(
    () =>
      store.subscribe(() => {
        const dirty = store.dirtyRows().length
        setPending(dirty)
        if (userSub !== null && dirty > 0 && !inflight.current) later.current()
      }),
    [userSub],
  )

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  const value = useMemo(() => ({ status, pending, syncNow }), [status, pending, syncNow])
  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>
}

export function useSync(): SyncValue {
  const value = useContext(SyncContext)
  if (!value) throw new Error('SyncProvider 밖에서 useSync를 불렀습니다')
  return value
}
