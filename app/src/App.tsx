import { useEffect, useState } from 'react'
import { loadBundle } from './content/loadBundle.ts'
import type { Bundle } from './content/types.ts'

type State = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; bundle: Bundle }

export default function App() {
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    loadBundle().then(
      (bundle) => {
        if (!cancelled) setState({ kind: 'ready', bundle })
      },
      () => {
        if (!cancelled) setState({ kind: 'error' })
      },
    )
    return () => {
      cancelled = true
    }
  }, [attempt])

  function retry() {
    setState({ kind: 'loading' })
    setAttempt((n) => n + 1)
  }

  if (state.kind === 'loading') return <p className="status">불러오는 중이에요</p>

  if (state.kind === 'error') {
    return (
      <div className="status">
        <p>콘텐츠를 불러오지 못했어요</p>
        <button type="button" onClick={retry}>
          다시 시도
        </button>
      </div>
    )
  }

  return (
    <p className="status">
      {state.bundle.book} {state.bundle.chapters.length}장을 불러왔어요
    </p>
  )
}
