import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

export type Load<T> = {
  data: T | null
  error: string | null
  loading: boolean
  reload: () => void
  setData: (data: T) => void
}

type Result<T> = { key: string; tick: number; data: T | null; error: string | null }

// 비동기 읽기 한 건. key가 바뀌면 다시 읽고, reload로 직접 다시 읽는다.
// 같은 key로 다시 읽는 동안에는 이전 데이터를 그대로 보여 준다.
export function useLoad<T>(fn: () => Promise<T>, key: string): Load<T> {
  const [result, setResult] = useState<Result<T> | null>(null)
  const [tick, setTick] = useState(0)
  const fnRef = useRef(fn)
  useLayoutEffect(() => {
    fnRef.current = fn
  })

  useEffect(() => {
    let cancelled = false
    fnRef.current().then(
      (data) => {
        if (!cancelled) setResult({ key, tick, data, error: null })
      },
      (err: unknown) => {
        if (cancelled) return
        setResult((prev) => ({ key, tick, data: prev?.key === key ? prev.data : null, error: errorMessage(err) }))
      },
    )
    return () => {
      cancelled = true
    }
  }, [key, tick])

  const reload = useCallback(() => setTick((n) => n + 1), [])
  const setData = useCallback((data: T) => setResult({ key, tick, data, error: null }), [key, tick])
  const current = result?.key === key ? result : null
  return {
    data: current?.data ?? null,
    error: current?.error ?? null,
    loading: current === null || current.tick !== tick,
    reload,
    setData,
  }
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
