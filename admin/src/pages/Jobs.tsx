import { useCallback, useEffect, useRef, useState } from 'react'
import { api, openJobEvents } from '../api.ts'
import DataTable, { type Column } from '../components/DataTable.tsx'
import { CheckboxField, NumberField, SelectField, TextField } from '../components/Fields.tsx'
import { Empty, ErrorBox, Loading } from '../components/Notice.tsx'
import StatusBadge from '../components/StatusBadge.tsx'
import { buildJobOptions, describeOptions, EMPTY_JOB_FORM, STAGE_OPTIONS, type JobForm } from '../jobForm.ts'
import { formatTime, STAGE_LABEL } from '../labels.ts'
import { STAGES, type Job, type JobStatus, type RunsResponse, type Stage } from '../types.ts'
import { errorMessage, useLoad } from '../useLoad.ts'

type Live = { id: string; lines: string[]; status: JobStatus; error: string | null }

const isActive = (s: JobStatus) => s === 'queued' || s === 'running'

export default function Jobs() {
  const jobs = useLoad(api.jobs, 'jobs')
  const runs = useLoad(() => api.runs(7), 'runs')
  const [stage, setStage] = useState<Stage>('build')
  const [form, setForm] = useState<JobForm>(EMPTY_JOB_FORM)
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)
  const [live, setLive] = useState<Live | null>(null)
  const [viewId, setViewId] = useState<string | null>(null)
  const closeRef = useRef<(() => void) | null>(null)
  const endedRef = useRef(new Set<string>())
  const { reload: reloadJobs } = jobs
  const { reload: reloadRuns } = runs

  // 작업 로그를 SSE로 받는다. 끝나면 저장된 로그로 바꾸고 목록을 다시 읽는다.
  const attach = useCallback(
    (id: string) => {
      closeRef.current?.()
      setLive({ id, lines: [], status: 'running', error: null })
      setViewId(id)
      closeRef.current = openJobEvents(
        id,
        (line) => setLive((l) => (l && l.id === id ? { ...l, lines: [...l.lines, line] } : l)),
        (status) => {
          endedRef.current.add(id)
          closeRef.current = null
          setLive((l) => (l && l.id === id ? { ...l, status } : l))
          api.job(id).then(
            (job) => {
              setLive((l) => (l && l.id === id ? { id, lines: job.lines, status: job.status, error: job.error } : l))
              // 연결만 끊기고 작업은 아직 돌고 있으면 잠시 뒤 다시 붙는다.
              if (isActive(job.status)) {
                endedRef.current.delete(id)
                window.setTimeout(reloadJobs, 2000)
              }
            },
            () => {},
          )
          reloadJobs()
          reloadRuns()
        },
      )
    },
    [reloadJobs, reloadRuns],
  )

  useEffect(() => () => closeRef.current?.(), [])

  // 화면을 열었을 때 이미 돌고 있는 작업이 있으면 그 로그에 붙는다.
  useEffect(() => {
    const running = jobs.data?.find((j) => isActive(j.status))
    if (!running || endedRef.current.has(running.id)) return
    if (live?.id === running.id && closeRef.current) return
    attach(running.id)
  }, [jobs.data, live?.id, attach])

  // 지켜보는 작업은 SSE로 받은 상태를, 나머지는 목록의 상태를 믿는다.
  const otherRunning = jobs.data?.some((j) => isActive(j.status) && j.id !== live?.id) ?? false
  const busy = starting || (live !== null && isActive(live.status)) || otherRunning

  async function start() {
    const built = buildJobOptions(stage, form)
    if (!built.ok) {
      setStartError(built.error)
      return
    }
    setStarting(true)
    setStartError(null)
    try {
      const { id } = await api.startJob(stage, built.options)
      attach(id)
      reloadJobs()
    } catch (err) {
      setStartError(errorMessage(err))
    } finally {
      setStarting(false)
    }
  }

  const keys = STAGE_OPTIONS[stage]
  const set = <K extends keyof JobForm>(key: K, value: JobForm[K]) => setForm((f) => ({ ...f, [key]: value }))

  const columns: Column<Job>[] = [
    { key: 'stage', header: '단계', cell: (j) => <code>{j.stage}</code> },
    { key: 'options', header: '옵션', cell: (j) => describeOptions(j.options) },
    { key: 'status', header: '상태', cell: (j) => <StatusBadge status={j.status} /> },
    { key: 'created', header: '시작', cell: (j) => formatTime(j.startedAt ?? j.createdAt) },
    { key: 'took', header: '걸린 시간', numeric: true, cell: (j) => duration(j.startedAt, j.endedAt) },
  ]

  return (
    <div className="page">
      <header className="page-head">
        <h1>작업</h1>
      </header>

      <div className="split split-wide">
        <div className="stack">
          <section className="card">
            <h2>실행</h2>
            <form
              className="job-form"
              onSubmit={(e) => {
                e.preventDefault()
                void start()
              }}
            >
              <div className="form-grid">
                <SelectField
                  label="단계"
                  value={stage}
                  onChange={(v) => setStage(v as Stage)}
                  options={STAGES.map((s) => ({ value: s, label: STAGE_LABEL[s] }))}
                />
                {keys.includes('chapter') && (
                  <NumberField label="장 *" value={form.chapter} onChange={(v) => set('chapter', v)} step="1" min={1} />
                )}
                {keys.includes('scenes') && (
                  <TextField
                    label="장면 id"
                    value={form.scenes}
                    onChange={(v) => set('scenes', v)}
                    hint="여러 개는 쉼표나 공백으로. 비우면 장 전체"
                  />
                )}
                {keys.includes('limit') && (
                  <NumberField
                    label="최대 개수"
                    value={form.limit}
                    onChange={(v) => set('limit', v)}
                    step="1"
                    min={1}
                    hint="비우면 제한 없음"
                  />
                )}
              </div>
              <div className="check-row">
                {keys.includes('force') && (
                  <CheckboxField label="이미 있어도 다시 만들기 (force)" checked={form.force} onChange={(v) => set('force', v)} />
                )}
                {keys.includes('allowDraft') && (
                  <CheckboxField
                    label="초안 장면도 허용 (allowDraft)"
                    checked={form.allowDraft}
                    onChange={(v) => set('allowDraft', v)}
                  />
                )}
                {keys.includes('dryRun') && (
                  <CheckboxField
                    label="미리 보기만 (dryRun, API 호출 없음)"
                    checked={form.dryRun}
                    onChange={(v) => set('dryRun', v)}
                  />
                )}
                {keys.length === 0 && <p className="muted">이 단계는 옵션이 없어요.</p>}
              </div>
              <div className="button-row">
                <button type="submit" className="btn btn-primary" disabled={busy}>
                  {busy ? '실행 중' : '실행'}
                </button>
                {busy && (
                  <span className="muted" role="status">
                    작업은 한 번에 하나만 돌아요
                  </span>
                )}
              </div>
              {startError && (
                <p className="form-error" role="alert">
                  {startError}
                </p>
              )}
            </form>
          </section>

          <LogPanel live={live} viewId={viewId} />

          <section className="card">
            <h2>최근 작업</h2>
            {jobs.error && <ErrorBox message={jobs.error} onRetry={reloadJobs} />}
            {!jobs.data && !jobs.error && <Loading />}
            {jobs.data && (
              <DataTable
                caption="최근 작업 50개"
                columns={columns}
                rows={jobs.data}
                rowKey={(j) => j.id}
                selectedKey={viewId}
                onSelect={(j) => setViewId(j.id)}
                empty="아직 실행한 작업이 없어요"
              />
            )}
          </section>
        </div>

        <aside className="card side-card" aria-label="최근 7일 LLM 호출">
          <h2>최근 7일 LLM 호출</h2>
          {runs.error && <ErrorBox message={runs.error} onRetry={reloadRuns} />}
          {!runs.data && !runs.error && <Loading />}
          {runs.data && <RunsSummary data={runs.data} />}
          <button type="button" className="btn btn-small" onClick={reloadRuns}>
            새로 고침
          </button>
        </aside>
      </div>
    </div>
  )
}

function LogPanel({ live, viewId }: { live: Live | null; viewId: string | null }) {
  const isLive = live !== null && live.id === viewId
  const stored = useLoad(
    () => (viewId && !isLive ? api.job(viewId) : Promise.resolve(null)),
    viewId && !isLive ? viewId : '',
  )
  const job = isLive ? live : stored.data
  const lines = job?.lines ?? []
  const preRef = useRef<HTMLPreElement>(null)

  // 줄이 붙으면 맨 아래로 내린다.
  useEffect(() => {
    const el = preRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [lines.length])

  return (
    <section className="card" aria-label="작업 로그">
      <header className="card-head">
        <h2>로그</h2>
        {job && (
          <span className="muted">
            <code>{viewId}</code> <StatusBadge status={job.status} />
          </span>
        )}
      </header>
      {!viewId && <Empty>작업을 실행하거나 아래 목록에서 하나를 고르세요.</Empty>}
      {viewId && !isLive && stored.error && <ErrorBox message={stored.error} onRetry={stored.reload} />}
      {viewId && !job && !stored.error && <Loading />}
      {job && (
        <>
          <pre ref={preRef} className="log" aria-live={isLive ? 'polite' : undefined}>
            {lines.length ? lines.join('\n') : isActive(job.status) ? '기다리는 중…' : '(로그 없음)'}
          </pre>
          {job.error && (
            <p className="form-error" role="alert">
              {job.error}
            </p>
          )}
        </>
      )}
    </section>
  )
}

function RunsSummary({ data }: { data: RunsResponse }) {
  const { runs, totals } = data
  if (runs.length === 0) return <Empty>최근 7일 동안 LLM 호출이 없어요</Empty>
  const failed = runs.filter((r) => !r.ok).length
  const byStage = new Map<string, number>()
  for (const r of runs) byStage.set(r.stage, (byStage.get(r.stage) ?? 0) + 1)

  return (
    <>
      <dl className="stats">
        <div>
          <dt>호출</dt>
          <dd>
            {runs.length.toLocaleString('ko-KR')}
            {failed > 0 && <span className="text-rejected"> (실패 {failed})</span>}
          </dd>
        </div>
        <div>
          <dt>입력 토큰</dt>
          <dd>{totals.inputTokens.toLocaleString('ko-KR')}</dd>
        </div>
        <div>
          <dt>출력 토큰</dt>
          <dd>{totals.outputTokens.toLocaleString('ko-KR')}</dd>
        </div>
        <div>
          <dt>추정 비용</dt>
          <dd>{totals.estimatedUsd === null ? '알 수 없음' : `$${totals.estimatedUsd.toFixed(2)}`}</dd>
        </div>
      </dl>
      <h3>단계별 호출</h3>
      <ul className="plain-list">
        {[...byStage].map(([s, n]) => (
          <li key={s}>
            <code>{s}</code> {n}
          </li>
        ))}
      </ul>
    </>
  )
}

function duration(from: string | null, to: string | null): string {
  if (!from || !to) return '—'
  const ms = new Date(to).getTime() - new Date(from).getTime()
  if (!Number.isFinite(ms) || ms < 0) return '—'
  if (ms < 1000) return `${ms}ms`
  const s = Math.round(ms / 1000)
  return s < 60 ? `${s}초` : `${Math.floor(s / 60)}분 ${s % 60}초`
}
