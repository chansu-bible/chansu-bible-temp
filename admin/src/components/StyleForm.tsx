import { useState } from 'react'
import { api } from '../api.ts'
import type { Style, StyleReference } from '../types.ts'
import { errorMessage } from '../useLoad.ts'
import { TextAreaField } from './Fields.tsx'
import ReferenceGrid from './ReferenceGrid.tsx'

// 화풍 폼. 프롬프트 네 칸과 참고 이미지 이름표·출처를 한 번에 저장한다(PUT /api/style).
// 올리기·가져오기·삭제는 서버가 화풍을 바로 고치므로, 돌려받은 화풍으로 폼을 갈아끼운다.
export default function StyleForm({ style, onSaved }: { style: Style; onSaved: (style: Style) => void }) {
  const [form, setForm] = useState<Style>(style)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedNote, setSavedNote] = useState(false)

  // 서버 값이 바뀌면(저장·올리기·삭제) 폼을 새 값으로 맞춘다.
  const [prevStyle, setPrevStyle] = useState(style)
  if (style !== prevStyle) {
    setPrevStyle(style)
    setForm(style)
  }

  const dirty = JSON.stringify(form) !== JSON.stringify(style)

  function change<K extends keyof Style>(key: K, value: Style[K]) {
    setForm((f) => ({ ...f, [key]: value }))
    setSavedNote(false)
  }

  function changeReference(index: number, key: 'label' | 'source', value: string) {
    setForm((f) => ({
      ...f,
      references: f.references.map((r, i): StyleReference => (i === index ? { ...r, [key]: value } : r)),
    }))
    setSavedNote(false)
  }

  async function save() {
    setBusy(true)
    setError(null)
    try {
      const saved = await api.styleSave(form)
      setSavedNote(true)
      onSaved(saved)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  // 올리기·가져오기·삭제 뒤에 서버가 돌려준 화풍
  function replaced(next: Style) {
    setSavedNote(false)
    onSaved(next)
  }

  return (
    // 참고 이미지 올리기·가져오기가 자기 form을 가지므로 바깥은 form으로 감싸지 않는다.
    <div className="stack">
      <section className="card">
        <header className="editor-head">
          <h2>화풍 프롬프트</h2>
          <div className="button-row">
            {dirty && <span className="dirty-note">저장하지 않은 변경</span>}
            {savedNote && !dirty && (
              <span className="saved-note" role="status">
                저장했어요
              </span>
            )}
            <button type="button" className="btn" onClick={() => setForm(style)} disabled={busy || !dirty}>
              되돌리기
            </button>
            <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={busy || !dirty}>
              저장
            </button>
          </div>
        </header>

        {error && (
          <p className="form-error" role="alert">
            저장하지 못했어요: {error}
          </p>
        )}

        <p className="notice">
          그림을 그릴 때 이 순서로 붙여요: 참고 지시문(참고 이미지가 있을 때) → 앞말 → 구도 → 장면 묘사 → 표현 기준
        </p>

        <div className="canon-form">
          <TextAreaField
            label="설명"
            value={form.description}
            onChange={(v) => change('description', v)}
            disabled={busy}
            hint="사람이 읽는 메모예요. 프롬프트에는 들어가지 않아요."
          />
          <TextAreaField
            label="앞말 (promptPrefix)"
            value={form.promptPrefix}
            onChange={(v) => change('promptPrefix', v)}
            disabled={busy}
          />
          <TextAreaField
            label="표현 기준 (promptRules)"
            value={form.promptRules}
            onChange={(v) => change('promptRules', v)}
            disabled={busy}
          />
          <TextAreaField
            label="참고 지시문 (referenceInstruction)"
            value={form.referenceInstruction}
            onChange={(v) => change('referenceInstruction', v)}
            disabled={busy}
            hint="참고 이미지가 하나 이상 있을 때만 맨 앞에 붙어요."
          />
        </div>
      </section>

      <section className="card">
        <h2>화풍 참고 이미지</h2>
        <ReferenceGrid
          references={form.references}
          onChange={changeReference}
          dirty={dirty}
          disabled={busy}
          onReplaced={replaced}
        />
      </section>
    </div>
  )
}
