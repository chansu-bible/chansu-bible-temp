import type { ReactNode } from 'react'

// 읽는 중 / 오류 / 빈 상태 안내
export function Loading({ text = '불러오는 중이에요' }: { text?: string }) {
  return (
    <p className="notice" role="status">
      {text}
    </p>
  )
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="notice notice-error" role="alert">
      <p>{message}</p>
      {onRetry && (
        <button type="button" className="btn" onClick={onRetry}>
          다시 시도
        </button>
      )}
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>
}
