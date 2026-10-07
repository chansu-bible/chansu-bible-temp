// 관리 서버 fetch 래퍼. 서버가 { error }를 돌려주면 그 문장으로 Error를 던진다.
import type {
  CanonEntryMap,
  CanonKind,
  GitStatus,
  Job,
  JobOptions,
  JobStatus,
  Proposal,
  RunsResponse,
  ScenesResponse,
  Stage,
  StatusResponse,
  UsageResponse,
} from './types.ts'

export const OFFLINE_MESSAGE =
  '관리 서버에 연결할 수 없어요. npm run admin으로 서버를 함께 띄웠는지 확인하세요.'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, {
      ...init,
      headers: init?.body ? { 'Content-Type': 'application/json', ...init.headers } : init?.headers,
    })
  } catch {
    throw new Error(OFFLINE_MESSAGE)
  }

  const text = await res.text()
  let body: unknown = null
  if (text) {
    try {
      body = JSON.parse(text)
    } catch {
      body = null
    }
  }

  if (!res.ok) {
    if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string') {
      throw new Error(body.error)
    }
    // JSON이 아닌 5xx는 개발 서버 프록시가 관리 서버에 닿지 못한 경우다.
    if (res.status >= 500) throw new Error(OFFLINE_MESSAGE)
    throw new Error(`요청이 실패했어요 (상태 ${res.status})`)
  }
  if (body === null && text) throw new Error('서버 응답을 읽지 못했어요')
  return body as T
}

function send<T>(method: string, path: string, data?: unknown): Promise<T> {
  return request<T>(path, { method, body: data === undefined ? undefined : JSON.stringify(data) })
}

export const api = {
  status: () => request<StatusResponse>('/api/status'),

  canonList: <K extends CanonKind>(kind: K) => request<CanonEntryMap[K][]>(`/api/canon/${kind}`),
  canonCreate: <K extends CanonKind>(kind: K, entry: CanonEntryMap[K]) =>
    send<CanonEntryMap[K]>('POST', `/api/canon/${kind}`, entry),
  canonUpdate: <K extends CanonKind>(kind: K, entry: CanonEntryMap[K]) =>
    send<CanonEntryMap[K]>('PUT', `/api/canon/${kind}/${encodeURIComponent(entry.id)}`, entry),
  canonReview: <K extends CanonKind>(kind: K, id: string, action: 'approve' | 'reject') =>
    send<CanonEntryMap[K]>('POST', `/api/canon/${kind}/${encodeURIComponent(id)}/${action}`),
  canonUsage: (kind: CanonKind, id: string) =>
    request<UsageResponse>(`/api/canon/${kind}/${encodeURIComponent(id)}/usage`),

  proposals: () => request<Proposal[]>('/api/proposals'),
  proposalAction: (id: string, action: 'apply' | 'dismiss') =>
    send<unknown>('POST', `/api/proposals/${encodeURIComponent(id)}/${action}`),

  scenes: (chapter: number) => request<ScenesResponse>(`/api/scenes/${chapter}`),

  jobs: () => request<Job[]>('/api/jobs'),
  job: (id: string) => request<Job>(`/api/jobs/${encodeURIComponent(id)}`),
  startJob: (stage: Stage, options: JobOptions) => send<{ id: string }>('POST', '/api/jobs', { stage, options }),

  runs: (days: number) => request<RunsResponse>(`/api/runs?days=${days}`),
  git: () => request<GitStatus>('/api/git/status'),
}

// 작업 로그 SSE. 돌려준 함수를 부르면 연결을 닫는다.
export function openJobEvents(
  id: string,
  onLine: (line: string) => void,
  onEnd: (status: JobStatus) => void,
): () => void {
  const source = new EventSource(`/api/jobs/${encodeURIComponent(id)}/events`)
  let ended = false

  source.addEventListener('message', (event) => {
    try {
      const data = JSON.parse(event.data) as { line?: unknown }
      if (typeof data.line === 'string') onLine(data.line)
    } catch {
      onLine(String(event.data))
    }
  })

  source.addEventListener('end', (event) => {
    ended = true
    source.close()
    let status: JobStatus = 'done'
    try {
      const data = JSON.parse((event as MessageEvent<string>).data) as { status?: JobStatus }
      if (data.status) status = data.status
    } catch {
      // 상태를 읽지 못하면 완료로 본다. 호출하는 쪽이 작업을 다시 읽는다.
    }
    onEnd(status)
  })

  source.addEventListener('error', () => {
    // 서버가 연결을 닫으면 EventSource가 다시 붙으려 한다. 끝난 뒤에는 닫는다.
    if (ended || source.readyState === EventSource.CLOSED) return
    source.close()
    onEnd('failed')
  })

  return () => {
    ended = true
    source.close()
  }
}
