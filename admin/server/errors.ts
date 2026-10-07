// 라우트에서 던지면 그 상태 코드와 { error }로 답한다.
export class HttpError extends Error {
  readonly status: 400 | 404 | 409 | 500

  constructor(status: 400 | 404 | 409 | 500, message: string) {
    super(message)
    this.name = 'HttpError'
    this.status = status
  }
}

type Issue = {
  code?: string
  path?: PropertyKey[]
  message?: string
  expected?: unknown
  origin?: string
  minimum?: number | bigint
  maximum?: number | bigint
  values?: unknown[]
  format?: string
  keys?: string[]
}

// zod 검증 문제 하나를 한국어로
function issueMessage(issue: Issue): string {
  switch (issue.code) {
    case 'invalid_type':
      return `${String(issue.expected)} 형식이어야 합니다`
    case 'too_small':
      if (issue.origin === 'array') return `${String(issue.minimum)}개 이상이어야 합니다`
      if (issue.origin === 'string') return `${String(issue.minimum)}글자 이상이어야 합니다`
      return `${String(issue.minimum)} 이상이어야 합니다`
    case 'too_big':
      if (issue.origin === 'array') return `${String(issue.maximum)}개 이하여야 합니다`
      if (issue.origin === 'string') return `${String(issue.maximum)}글자 이하여야 합니다`
      return `${String(issue.maximum)} 이하여야 합니다`
    case 'invalid_format':
      return issue.format === 'regex' ? '형식이 맞지 않습니다(예: 절 인용 "1:26", id는 영문 소문자)' : '형식이 맞지 않습니다'
    case 'invalid_value':
      return `다음 중 하나여야 합니다: ${(issue.values ?? []).map((value) => JSON.stringify(value)).join(', ')}`
    case 'unrecognized_keys':
      return `모르는 필드입니다: ${(issue.keys ?? []).join(', ')}`
    default:
      return issue.message ?? '값이 맞지 않습니다'
  }
}

function isZodError(error: unknown): error is Error & { issues: Issue[] } {
  return error instanceof Error && Array.isArray((error as { issues?: unknown }).issues)
}

// 오류를 사람이 읽을 문장으로. zod 오류는 "경로: 문제" 줄로 바꾼다.
export function errorMessage(error: unknown, prefix = '항목이 형식에 맞지 않습니다'): string {
  if (isZodError(error)) {
    const lines = error.issues.map((issue) => {
      const where = (issue.path ?? []).map(String).join('.') || '(전체)'
      return `${where}: ${issueMessage(issue)}`
    })
    return `${prefix}:\n${lines.join('\n')}`
  }
  return error instanceof Error ? error.message : String(error)
}

// 요청 본문을 JSON으로 읽는다. JSON이 아니면 400.
export async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    throw new HttpError(400, '본문이 JSON이 아닙니다')
  }
}
