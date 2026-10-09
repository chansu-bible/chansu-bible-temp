import { apiUrl } from '../auth/config'

// 서버(server/src/ask)의 답 형식
export type AskCitation = {
  id: string
  kind: 'verse' | 'scene' | 'canon'
  // "본문 4:15", "해설 · 가인의 표와 떠남", "설정집 · 가인"
  label: string
  chapter: number | null
  verse: number | null
  sceneId: string | null
  entity: { kind: 'character' | 'place' | 'thing'; id: string } | null
}

export type AskReply = { status: 'answer' | 'none'; text: string; citations: AskCitation[]; remaining: number }

export type AskUsage = { available: boolean; limit: number; remaining: number }

// 화면에 그대로 보일 오류 글. status가 null이면 서버에 닿지 못했다.
export class AskError extends Error {
  readonly status: number | null
  readonly remaining: number | null
  constructor(message: string, status: number | null, remaining: number | null = null) {
    super(message)
    this.status = status
    this.remaining = remaining
  }
}

async function call<T>(path: string, token: string, init: { method?: string; body?: string } = {}): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${apiUrl}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    })
  } catch {
    throw new AskError('서버에 연결하지 못했어요. 잠시 뒤에 다시 물어 주세요.', null)
  }
  const body = (await response.json().catch(() => null)) as { error?: unknown; remaining?: unknown } | null
  if (!response.ok) {
    const message = typeof body?.error === 'string' ? body.error : `서버가 ${response.status}로 답했어요.`
    throw new AskError(message, response.status, typeof body?.remaining === 'number' ? body.remaining : null)
  }
  return body as T
}

export function fetchAskUsage(token: string): Promise<AskUsage> {
  return call('/ask/usage', token)
}

// 질문은 기기에도 서버에도 남기지 않는다(서버는 하루 횟수만 센다).
export function postQuestion(token: string, question: string, chapter: number): Promise<AskReply> {
  return call('/ask', token, { method: 'POST', body: JSON.stringify({ question, chapter }) })
}
