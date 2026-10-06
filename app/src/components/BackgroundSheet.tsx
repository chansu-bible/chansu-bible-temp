import type { Scene } from '../content/types.ts'
import Icon from './Icon.tsx'

export default function BackgroundSheet({ scene, onClose }: { scene: Scene; onClose: () => void }) {
  const { background, history } = scene

  return (
    <div className="overlay sheet-backdrop" onClick={onClose}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sheet-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sheet-head">
          <h2 id="sheet-title" className="sheet-title">
            {scene.title}
          </h2>
          <button type="button" className="icon-button" aria-label="해설 닫기" autoFocus onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>

        {background ? (
          <>
            <dl>
              <div>
                <dt>무슨 일</dt>
                <dd>{background.what}</dd>
              </div>
              <div>
                <dt>누가</dt>
                <dd>{background.who}</dd>
              </div>
              <div>
                <dt>어디서</dt>
                <dd>{background.where}</dd>
              </div>
            </dl>
          </>
        ) : (
          <p className="empty">이 장면의 해설은 아직 준비 중이에요.</p>
        )}

        {scene.glossary.length > 0 && (
          <>
            <h3>낱말 풀이</h3>
            {scene.glossary.map((gloss, index) => (
              <div key={index} className="term">
                <span className="term-verse">{gloss.verse}절</span>
                <b>{gloss.word}</b>
                {gloss.meaning}
              </div>
            ))}
          </>
        )}

        {history.length > 0 && (
          <>
            <h3>역사 배경</h3>
            {history.map((note, index) => (
              <div key={index} className="history-note">
                <span className="certainty">{note.certainty}</span>
                <span>{note.text}</span>
                <span className="history-basis">근거: {note.basis}</span>
                {note.sources.length > 0 && (
                  <span className="history-sources">
                    {note.sources.map((url, index) => (
                      <a key={`${index}-${url}`} href={url} target="_blank" rel="noreferrer">
                        출처 {index + 1}
                      </a>
                    ))}
                  </span>
                )}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}
