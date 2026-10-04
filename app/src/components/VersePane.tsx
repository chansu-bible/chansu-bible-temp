import { useLayoutEffect, useRef } from 'react'
import type { Chapter } from '../content/types.ts'
import { findActiveIndex } from '../reader/activeScene.ts'

// 스크롤 영역의 위에서 이만큼 내려온 곳이 기준선이다.
const lineOffset = 24

type Props = {
  chapter: Chapter
  chapterNumbers: number[]
  restoreSceneId: string | null
  activeIndex: number
  onActiveIndexChange: (index: number) => void
  onChapterChange: (chapter: number) => void
}

export default function VersePane({
  chapter,
  chapterNumbers,
  restoreSceneId,
  activeIndex,
  onActiveIndexChange,
  onChapterChange,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const blockRefs = useRef<(HTMLElement | null)[]>([])
  const nextChapter = chapterNumbers.find((number) => number > chapter.chapter)

  // 마지막으로 읽던 장면으로 스크롤을 옮긴다.
  useLayoutEffect(() => {
    const index = chapter.scenes.findIndex((scene) => scene.id === restoreSceneId)
    const block = blockRefs.current[index]
    if (index > 0 && block && scrollRef.current) {
      scrollRef.current.scrollTop = block.offsetTop - lineOffset + 1
    }
  }, [chapter.scenes, restoreSceneId])

  function handleScroll() {
    const scroller = scrollRef.current
    if (!scroller) return
    const offsets = blockRefs.current.slice(0, chapter.scenes.length).map((block) => block?.offsetTop ?? 0)
    const atBottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1
    const next = findActiveIndex(offsets, scroller.scrollTop, lineOffset, atBottom)
    if (next !== activeIndex) onActiveIndexChange(next)
  }

  return (
    <section className="verse-pane" aria-label="본문">
      <header className="verse-header">
        <label>
          <span className="sr-only">장 선택</span>
          <select value={chapter.chapter} onChange={(event) => onChapterChange(Number(event.target.value))}>
            {chapterNumbers.map((number) => (
              <option key={number} value={number}>
                창세기 {number}장
              </option>
            ))}
          </select>
        </label>
      </header>

      <div className="verse-scroll" ref={scrollRef} onScroll={handleScroll}>
        {chapter.scenes.map((scene, index) => (
          <section
            key={scene.id}
            ref={(element) => {
              blockRefs.current[index] = element
            }}
            className={index === activeIndex ? 'scene-block active' : 'scene-block'}
          >
            {chapter.verses
              .filter((verse) => verse.verse >= scene.verseStart && verse.verse <= scene.verseEnd)
              .map((verse) => (
                <p key={verse.verse} className="verse">
                  <span className="verse-number">{verse.verse}</span>
                  {verse.text}
                </p>
              ))}
            {scene.commentary && <p className="commentary">{scene.commentary}</p>}
          </section>
        ))}

        {nextChapter !== undefined && (
          <button type="button" className="next-chapter" onClick={() => onChapterChange(nextChapter)}>
            창세기 {nextChapter}장으로
          </button>
        )}
      </div>
    </section>
  )
}
