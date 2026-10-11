// 받기 오류의 이유 글. undici는 진짜 이유를 error.cause에 담으므로(fetch failed: getaddrinfo ENOTFOUND ko.wikisource.org) 같이 적는다.
// 원인에 글이 없으면(주소가 여럿인 곳에 연결하지 못한 AggregateError) 오류 부호(ECONNREFUSED)를 적는다.
export function fetchErrorReason(error: unknown): string {
  if (!(error instanceof Error)) return String(error)
  const cause = error.cause
  const detail = cause instanceof Error ? cause.message || String((cause as NodeJS.ErrnoException).code ?? '') : ''
  return detail === '' ? error.message : `${error.message}: ${detail}`
}
