import { useState } from 'react'
import { api } from '../api.ts'
import { NumberField, SelectField, TextAreaField } from '../components/Fields.tsx'
import { Empty, ErrorBox, Loading } from '../components/Notice.tsx'
import StatusBadge from '../components/StatusBadge.tsx'
import { STATUS_LABEL } from '../labels.ts'
import {
  countStatuses,
  formToEdit,
  questionToForm,
  QUIZ_TARGET,
  revertStatus,
  toEdit,
  type QuizForm,
} from '../quizForm.ts'
import { navigate } from '../route.ts'
import type { QuizEdit, QuizQuestion, Verse } from '../types.ts'
import { errorMessage, useLoad } from '../useLoad.ts'

const FALLBACK_CHAPTERS = Array.from({ length: 10 }, (_, i) => i + 1)

// 퀴즈 화면. quiz 단계가 쓰고 검수 모델이 본 문제를 하나씩 승인하거나 버리고, 고쳐 저장한다.
export default function Quiz({ chapter }: { chapter: number }) {
  const summary = useLoad(api.quizSummary, 'quiz-summary')
  const data = useLoad(() => api.quiz(chapter), String(chapter))
  const [questions, setQuestions] = useState<QuizQuestion[] | null>(null)
  const { reload: reloadSummary } = summary

  // 새로 읽으면(장을 바꾸면) 문제 목록을 바꾼다. 저장한 문제는 replaceQuestion이 목록 안에서 바꾼다.
  const [prevData, setPrevData] = useState(data.data)
  if (data.data !== prevData) {
    setPrevData(data.data)
    setQuestions(data.data?.questions ?? null)
  }

  const chapters = summary.data?.length ? summary.data.map((s) => s.chapter) : FALLBACK_CHAPTERS
  const options = chapters.includes(chapter) ? chapters : [...chapters, chapter].sort((a, b) => a - b)
  const approvedIn = (n: number) => summary.data?.find((s) => s.chapter === n)?.counts.approved

  function replaceQuestion(saved: QuizQuestion) {
    setQuestions((list) => list && list.map((q) => (q.id === saved.id ? saved : q)))
    reloadSummary()
  }

  const counts = countStatuses(questions ?? [])
  const others = (['reviewed', 'flagged', 'draft', 'rejected'] as const).filter((s) => counts[s] > 0)

  return (
    <div className="page">
      <header className="page-head">
        <h1>퀴즈</h1>
        <div className="page-actions">
          <SelectField
            label="장"
            value={String(chapter)}
            onChange={(v) => navigate({ page: 'quiz', chapter: Number(v) })}
            options={options.map((n) => {
              const approved = approvedIn(n)
              return {
                value: String(n),
                label: approved === undefined ? `${n}장` : `${n}장 · 승인 ${approved} / ${QUIZ_TARGET}`,
              }
            })}
          />
          <button
            type="button"
            className="btn"
            onClick={() => {
              data.reload()
              reloadSummary()
            }}
            disabled={data.loading}
          >
            새로 고침
          </button>
        </div>
      </header>

      <p className="muted">
        quiz 단계가 쓰고 검수 모델이 근거 절을 확인한 문제예요. 사람이 승인한 문제만 앱에 나가요. 장마다 {QUIZ_TARGET}
        문제를 승인해요.
      </p>

      {summary.error && <ErrorBox message={`장별 승인 수를 읽지 못했어요: ${summary.error}`} onRetry={reloadSummary} />}
      {data.error && <ErrorBox message={data.error} onRetry={data.reload} />}
      {!questions && !data.error && <Loading />}
      {questions && data.data && (
        <>
          <p className="quiz-tally">
            <strong className={counts.approved >= QUIZ_TARGET ? 'text-approved' : undefined}>
              {chapter}장 승인 {counts.approved} / {QUIZ_TARGET}
            </strong>
            {others.map((s) => (
              <span key={s} className="muted">
                {' '}
                · {STATUS_LABEL[s]} {counts[s]}
              </span>
            ))}
          </p>
          {questions.length === 0 ? (
            <Empty>{chapter}장에는 아직 퀴즈가 없어요. 작업 화면에서 quiz를 실행하세요.</Empty>
          ) : (
            <div className="quiz-list">
              {questions.map((q) => (
                <QuestionCard
                  key={q.id}
                  chapter={chapter}
                  question={q}
                  verses={data.data?.verses ?? []}
                  onSaved={replaceQuestion}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// 문제 카드 하나. 읽을 때는 승인·버림·되돌리기·고치기 단추를, 고칠 때는 입력 칸과 저장·취소를 보여 준다.
function QuestionCard({
  chapter,
  question,
  verses,
  onSaved,
}: {
  chapter: number
  question: QuizQuestion
  verses: Verse[]
  onSaved: (question: QuizQuestion) => void
}) {
  // null이면 읽는 중, 값이 있으면 고치는 중
  const [form, setForm] = useState<QuizForm | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const verseText = (n: number) => verses.find((v) => v.verse === n)?.text
  const decided = question.status === 'approved' || question.status === 'rejected'

  async function save(edit: QuizEdit, done: string) {
    setBusy(true)
    setError(null)
    setNote(null)
    try {
      const saved = await api.quizSave(chapter, question.id, edit)
      setForm(null)
      setNote(done)
      onSaved(saved)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  function startEdit() {
    setForm(questionToForm(question))
    setError(null)
    setNote(null)
  }

  function cancelEdit() {
    setForm(null)
    setError(null)
  }

  function submit(current: QuizForm) {
    const built = formToEdit(current, question.status)
    if (!built.ok) {
      setError(built.error)
      return
    }
    void save(built.edit, '저장했어요')
  }

  return (
    <article className={`card quiz-card quiz-${question.status}`} aria-label={`${question.id} 문제`}>
      <header className="quiz-head">
        <code className="muted">{question.id}</code>
        <StatusBadge status={question.status} />
      </header>

      {form ? (
        <>
          <Issues issues={question.issues} />
          <QuestionEditor
            id={question.id}
            form={form}
            initial={questionToForm(question)}
            verseText={verseText}
            verseCount={verses.length}
            busy={busy}
            onChange={setForm}
            onSubmit={submit}
            onCancel={cancelEdit}
          />
        </>
      ) : (
        <>
          <p className="quiz-question">{question.question}</p>
          <ol className="quiz-options">
            {question.options.map((option, i) => (
              <li key={i} className={i === question.answer ? 'correct' : undefined}>
                {option}
                {i === question.answer && <span className="tag tag-answer">정답</span>}
              </li>
            ))}
          </ol>
          <h4>해설</h4>
          <p>{question.explanation}</p>
          <h4>
            근거 절 {chapter}:{question.verse}
          </h4>
          <blockquote className="evidence">
            {verseText(question.verse) ?? <span className="text-rejected">이 장에 없는 절이에요</span>}
          </blockquote>
          <Issues issues={question.issues} />
        </>
      )}

      {error && (
        <p className="form-error" role="alert">
          저장하지 못했어요: {error}
        </p>
      )}

      {!form && (
        <div className="button-row">
          <button
            type="button"
            className="btn btn-approve"
            onClick={() => void save(toEdit(question, 'approved'), '승인했어요')}
            disabled={busy || question.status === 'approved'}
          >
            승인
          </button>
          <button
            type="button"
            className="btn btn-reject"
            onClick={() => void save(toEdit(question, 'rejected'), '버렸어요')}
            disabled={busy || question.status === 'rejected'}
          >
            버림
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => void save(toEdit(question, revertStatus(question)), '되돌렸어요')}
            disabled={busy || !decided}
            title="승인이나 버림을 취소하고 검수 결과로 돌려요"
          >
            되돌리기
          </button>
          <button type="button" className="btn" onClick={startEdit} disabled={busy}>
            고치기
          </button>
          {note && (
            <span className="saved-note" role="status">
              {note}
            </span>
          )}
        </div>
      )}
    </article>
  )
}

// 검수 모델과 코드 검사의 지적. 고칠 때도 보이게 읽기·고치기 양쪽에 둔다.
function Issues({ issues }: { issues: string[] }) {
  if (issues.length === 0) return null
  return (
    <div className="quiz-issues">
      <h4>검수 지적</h4>
      <ul>
        {issues.map((issue, i) => (
          <li key={i}>{issue}</li>
        ))}
      </ul>
    </div>
  )
}

// 문제 고치기 폼. 상태는 그대로 두고 저장한다(승인은 저장한 뒤 따로 누른다).
function QuestionEditor({
  id,
  form,
  initial,
  verseText,
  verseCount,
  busy,
  onChange,
  onSubmit,
  onCancel,
}: {
  id: string
  form: QuizForm
  initial: QuizForm
  verseText: (verse: number) => string | undefined
  verseCount: number
  busy: boolean
  onChange: (form: QuizForm) => void
  onSubmit: (form: QuizForm) => void
  onCancel: () => void
}) {
  const dirty = JSON.stringify(form) !== JSON.stringify(initial)
  const verse = Number(form.verse)
  const preview = Number.isInteger(verse) && verse > 0 ? verseText(verse) : undefined
  const change = (patch: Partial<QuizForm>) => onChange({ ...form, ...patch })

  return (
    <form
      className="quiz-form"
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit(form)
      }}
    >
      <TextAreaField label="질문" value={form.question} onChange={(v) => change({ question: v })} disabled={busy} rows={2} />
      <fieldset className="quiz-options-edit" disabled={busy}>
        <legend>보기 · 정답을 고르세요</legend>
        {form.options.map((option, i) => (
          <div key={i} className="quiz-option-edit">
            <input
              type="radio"
              name={`${id}-answer`}
              checked={form.answer === i}
              onChange={() => change({ answer: i })}
              aria-label={`${i + 1}번 보기를 정답으로`}
            />
            <input
              type="text"
              value={option}
              onChange={(e) => change({ options: form.options.map((o, at) => (at === i ? e.target.value : o)) })}
              aria-label={`${i + 1}번 보기`}
            />
          </div>
        ))}
      </fieldset>
      <TextAreaField
        label="해설"
        value={form.explanation}
        onChange={(v) => change({ explanation: v })}
        disabled={busy}
        rows={4}
      />
      <NumberField
        label="근거 절"
        value={form.verse}
        onChange={(v) => change({ verse: v })}
        step="1"
        min={1}
        max={verseCount || undefined}
        disabled={busy}
      />
      <blockquote className="evidence">
        {preview ?? <span className="text-rejected">이 장에 없는 절이에요</span>}
      </blockquote>
      <div className="button-row">
        <button type="submit" className="btn btn-primary" disabled={busy || !dirty}>
          저장
        </button>
        <button type="button" className="btn" onClick={onCancel} disabled={busy}>
          취소
        </button>
        {dirty && <span className="dirty-note">저장하지 않은 변경</span>}
      </div>
    </form>
  )
}
