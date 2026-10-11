import { memo, useCallback, useState } from 'react'
import { api } from '../api.ts'
import { Empty, ErrorBox, Loading } from '../components/Notice.tsx'
import StatusBadge from '../components/StatusBadge.tsx'
import { countByFilter, matchesFilter, matchesQuery } from '../lexiconFilter.ts'
import { LEXICON_FILTERS, navigate, type LexiconFilter } from '../route.ts'
import type { KoreanGloss, KoreanGlossStatus, LexiconEntry } from '../types.ts'
import { errorMessage, useLoad } from '../useLoad.ts'

const FILTER_LABEL: Record<LexiconFilter, string> = { draft: '초안', approved: '승인', none: '없음', all: '전체' }

const EMPTY_TEXT: Record<LexiconFilter, string> = {
  draft: '검수할 초안이 없어요',
  approved: '승인한 뜻이 아직 없어요',
  none: '한국어 뜻이 없는 항목이 없어요',
  all: '사전 항목이 없어요. 작업 화면에서 original을 먼저 실행하세요.',
}

// 표의 열 수(저장 오류 줄이 모든 열을 덮는다)
const COLUMNS = 10

// 원어 뜻 화면. original-gloss 단계가 쓴 한국어 뜻 초안을 한 줄씩 고치고 승인한다.
// 초안을 한꺼번에 승인하는 단추는 두지 않는다(하나씩 본다).
export default function Lexicon({ filter }: { filter: LexiconFilter }) {
  const lexicon = useLoad(api.lexicon, 'lexicon')
  const [entries, setEntries] = useState<LexiconEntry[] | null>(null)
  const [query, setQuery] = useState('')
  // 이 거르기에서 저장한 항목. 상태가 바뀌어도 거르기를 바꿀 때까지 제자리에 둔다(아래 줄이 올라와 잘못 누르지 않게).
  const [kept, setKept] = useState<ReadonlySet<string>>(() => new Set())

  // 새로 읽으면 목록을 바꾼다. 저장한 항목은 onSaved가 목록 안에서 바꾼다.
  const [prevData, setPrevData] = useState(lexicon.data)
  if (lexicon.data !== prevData) {
    setPrevData(lexicon.data)
    if (lexicon.data) setEntries(lexicon.data.entries)
  }
  const [prevFilter, setPrevFilter] = useState(filter)
  if (filter !== prevFilter) {
    setPrevFilter(filter)
    setKept(new Set())
  }

  const onSaved = useCallback((saved: LexiconEntry) => {
    setEntries((list) => list && list.map((entry) => (entry.strong === saved.strong ? saved : entry)))
    setKept((set) => new Set(set).add(saved.strong))
  }, [])

  const counts = countByFilter(entries ?? [])
  // 거르기·찾기에 맞지 않는 줄은 지우지 않고 숨긴다. 숨은 줄도 고치던 내용을 그대로 갖고 있다.
  const shown = new Set(
    (entries ?? [])
      .filter((entry) => (matchesFilter(entry, filter) || kept.has(entry.strong)) && matchesQuery(entry, query))
      .map((entry) => entry.strong),
  )

  return (
    <div className="page">
      <header className="page-head">
        <h1>원어 뜻</h1>
        <div className="tabs" role="group" aria-label="한국어 뜻 상태로 거르기">
          {LEXICON_FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              className="tab"
              aria-pressed={f === filter}
              onClick={() => navigate({ page: 'lexicon', filter: f })}
            >
              {FILTER_LABEL[f]}
              {entries && <span className="count">{counts[f]}</span>}
            </button>
          ))}
        </div>
      </header>

      <p className="muted">
        original-gloss 단계가 쓴 한국어 뜻 초안이에요. 한 줄씩 읽고 고친 뒤 승인하세요. 승인한 뜻만 앱에 나가요. 뜻을
        비우고 저장하면 지워져요.
      </p>

      <section className="card" aria-label="원어 사전 항목">
        <div className="list-tools">
          <label className="sr-only" htmlFor="lexicon-search">
            찾기
          </label>
          <input
            id="lexicon-search"
            type="search"
            placeholder="번호·히브리어·음역·영어·한국어로 찾기"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {entries && <span className="list-count muted">{shown.size}개</span>}
          <button type="button" className="btn" onClick={lexicon.reload} disabled={lexicon.loading}>
            새로 고침
          </button>
        </div>
        {lexicon.error && <ErrorBox message={lexicon.error} onRetry={lexicon.reload} />}
        {!entries && !lexicon.error && <Loading />}
        {entries && (
          <>
            {shown.size === 0 && <Empty>{query.trim() ? '찾는 항목이 없어요' : EMPTY_TEXT[filter]}</Empty>}
            <div className="table-wrap" hidden={shown.size === 0}>
              <table className="data-table lexicon-table">
                <caption className="sr-only">원어 사전 항목 {shown.size}개</caption>
                <thead>
                  <tr>
                    <th scope="col">번호</th>
                    <th scope="col">원형</th>
                    <th scope="col">음역</th>
                    <th scope="col">품사</th>
                    <th scope="col">영어 정의</th>
                    <th scope="col" className="num" title="원어를 받은 모든 책에 나오는 횟수">
                      횟수
                    </th>
                    <th scope="col">한국어 뜻</th>
                    <th scope="col">메모</th>
                    <th scope="col">상태</th>
                    <th scope="col">
                      <span className="sr-only">저장과 승인</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => (
                    <LexiconRow
                      key={entry.strong}
                      entry={entry}
                      hidden={!shown.has(entry.strong)}
                      onSaved={onSaved}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  )
}

const sameGloss = (a: KoreanGloss | null, b: KoreanGloss | null) =>
  a?.meaning === b?.meaning && a?.note === b?.note && a?.status === b?.status

// 사전 항목 한 줄. "저장"은 상태를 그대로 두고, "승인"은 승인 상태로 저장한다.
const LexiconRow = memo(function LexiconRow({
  entry,
  hidden,
  onSaved,
}: {
  entry: LexiconEntry
  hidden: boolean
  onSaved: (entry: LexiconEntry) => void
}) {
  const [meaning, setMeaning] = useState(entry.korean?.meaning ?? '')
  const [note, setNote] = useState(entry.korean?.note ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedNote, setSavedNote] = useState<string | null>(null)

  // 저장했거나 새로 읽어 뜻이 바뀌면 입력 칸을 새 값으로 맞춘다. 뜻이 그대로면 고치던 내용을 둔다.
  const [prevKorean, setPrevKorean] = useState(entry.korean)
  if (!sameGloss(entry.korean, prevKorean)) {
    setPrevKorean(entry.korean)
    setMeaning(entry.korean?.meaning ?? '')
    setNote(entry.korean?.note ?? '')
  }

  const status = entry.korean?.status ?? null
  const dirty = meaning !== (entry.korean?.meaning ?? '') || note !== (entry.korean?.note ?? '')
  const empty = meaning.trim() === ''

  async function save(next: KoreanGlossStatus) {
    setBusy(true)
    setError(null)
    setSavedNote(null)
    try {
      const saved = await api.lexiconSave(entry.strong, { meaning, note, status: next })
      // 서버가 앞뒤 공백을 떼므로 저장된 값으로 입력 칸을 맞춘다(뜻이 그대로여도).
      setMeaning(saved.korean?.meaning ?? '')
      setNote(saved.korean?.note ?? '')
      setSavedNote(saved.korean === null ? '지웠어요' : next === 'approved' ? '승인했어요' : '저장했어요')
      onSaved(saved)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  function edit(set: (value: string) => void, value: string) {
    set(value)
    setSavedNote(null)
  }

  return (
    <>
      <tr hidden={hidden}>
        <td>
          <code>{entry.strong}</code>
        </td>
        <td>
          <span className="hebrew" dir="rtl" lang="he">
            {entry.lemma}
          </span>
        </td>
        <td>{entry.xlit}</td>
        <td>
          <code>{entry.pos}</code>
        </td>
        <td className="lexicon-definition">
          {entry.definition}
          {entry.usage && <span className="lexicon-usage muted">KJV: {entry.usage}</span>}
        </td>
        <td className="num">{entry.count}</td>
        <td>
          <input
            type="text"
            className="lexicon-meaning"
            aria-label={`${entry.strong} 한국어 뜻`}
            value={meaning}
            disabled={busy}
            onChange={(e) => edit(setMeaning, e.target.value)}
          />
        </td>
        <td>
          <textarea
            className="lexicon-note"
            aria-label={`${entry.strong} 메모`}
            rows={3}
            value={note}
            disabled={busy}
            onChange={(e) => edit(setNote, e.target.value)}
          />
        </td>
        <td>{status ? <StatusBadge status={status} /> : <span className="muted">없음</span>}</td>
        <td className="row-actions">
          <div className="button-row lexicon-actions">
            <button
              type="button"
              className="btn btn-small"
              onClick={() => void save(status ?? 'draft')}
              disabled={busy || !dirty}
            >
              저장
            </button>
            <button
              type="button"
              className="btn btn-small btn-approve"
              onClick={() => void save('approved')}
              disabled={busy || empty || (status === 'approved' && !dirty)}
              title={empty ? '한국어 뜻을 넣어야 승인할 수 있어요' : undefined}
            >
              승인
            </button>
          </div>
          {dirty && <span className="dirty-note">저장하지 않은 변경</span>}
          {savedNote && !dirty && (
            <span className="saved-note" role="status">
              {savedNote}
            </span>
          )}
        </td>
      </tr>
      {error && !hidden && (
        <tr className="row-error">
          <td colSpan={COLUMNS}>
            <p className="form-error" role="alert">
              {entry.strong} 저장하지 못했어요: {error}
            </p>
          </td>
        </tr>
      )}
    </>
  )
})
