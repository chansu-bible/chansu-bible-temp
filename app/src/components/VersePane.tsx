import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Chapter, Gloss } from '../content/types.ts'
import { findActiveIndex } from '../reader/activeScene.ts'
import { splitByGlosses } from '../reader/glossary.ts'
import Icon from './Icon.tsx'
import { findSceneIndex } from '../reader/readingPosition.ts'

// 스크롤 영역의 위에서 이만큼 내려온 곳이 기준선이다.
const lineOffset = 24

type Props = {
  chapter: Chapter
  chapterNumbers: number[]
  verse: number
  // 낭독 중에는 스크롤이 현재 절을 따라가고, 스크롤로 현재 절을 바꾸지 않는다.
  following: boolean
  onVerseChange: (verse: number) => void
  onChapterChange: (chapter: number) => void
}

export default function VersePane({ chapter, chapterNumbers, verse, following, onVerseChange, onChapterChange }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  // 본문에서 누른 낱말의 풀이. 다른 낱말을 누르면 바뀌고, 닫기를 누르면 사라진다.
  const [openGloss, setOpenGloss] = useState<Gloss | null>(null)
  const verseRefs = useRef(new Map<number, HTMLElement>())
  const nextChapter = chapterNumbers.find((number) => number > chapter.chapter)
  const blocks = chapter.scenes.map((scene) => ({
    scene,
    verses: chapter.verses.filter((v) => v.verse >= scene.verseStart && v.verse <= scene.verseEnd),
  }))
  // 화면에 놓인 순서대로의 절 번호
  const order = blocks.flatMap((block) => block.verses.map((v) => v.verse))
  const activeScene = findSceneIndex(chapter.scenes, verse)

  // 처음 그릴 때(장을 바꾸면 key 때문에 새로 그려진다) 현재 절을 기준선으로 옮긴다.
  const initialVerse = useRef(verse)
  useLayoutEffect(() => {
    const top = scrollTopFor(verseRefs.current, order[0], initialVerse.current)
    if (top !== null && scrollRef.current) scrollRef.current.scrollTop = top
    // 처음 한 번만 옮긴다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 낭독 중에는 현재 절이 바뀔 때마다 기준선까지 부드럽게 따라간다.
  const firstVerse = order[0]
  useEffect(() => {
    if (!following) return
    const top = scrollTopFor(verseRefs.current, firstVerse, verse)
    if (top === null || !scrollRef.current) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    scrollRef.current.scrollTo({ top, behavior: reduce ? 'auto' : 'smooth' })
  }, [following, verse, firstVerse])

  function handleScroll() {
    const scroller = scrollRef.current
    if (!scroller || following) return
    const offsets = order.map((number) => verseRefs.current.get(number)?.offsetTop ?? 0)
    const atBottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1
    const next = order[findActiveIndex(offsets, scroller.scrollTop, lineOffset, atBottom)]
    if (next !== undefined && next !== verse) onVerseChange(next)
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
        {blocks.map(({ scene, verses }, index) => (
          <section key={scene.id} className={index === activeScene ? 'scene-block active' : 'scene-block'}>
            {verses.map((v) => (
              <p
                key={v.verse}
                ref={(element) => {
                  if (element) verseRefs.current.set(v.verse, element)
                  else verseRefs.current.delete(v.verse)
                }}
                className={v.verse === verse ? 'verse current' : 'verse'}
              >
                <span className="verse-number">{v.verse}</span>
                {splitByGlosses(
                  v.text,
                  scene.glossary.filter((gloss) => gloss.verse === v.verse),
                ).map((part, partIndex) =>
                  part.gloss ? (
                    <button
                      key={partIndex}
                      type="button"
                      className="gloss"
                      aria-label={`${part.text} 뜻 보기`}
                      onClick={() => setOpenGloss(part.gloss ?? null)}
                    >
                      {part.text}
                    </button>
                  ) : (
                    <span key={partIndex}>{part.text}</span>
                  ),
                )}
              </p>
            ))}
          </section>
        ))}

        {nextChapter !== undefined && (
          <button type="button" className="next-chapter" onClick={() => onChapterChange(nextChapter)}>
            창세기 {nextChapter}장으로
          </button>
        )}

        {/* 마지막 절도 기준선까지 올라올 수 있도록 끝에 빈 공간을 둔다. */}
        <div style={{ height: `calc(100% - ${lineOffset}px)` }} aria-hidden="true" />
      </div>

      {openGloss && (
        <div className="gloss-card" role="status">
          <p className="gloss-body">
            <b>{openGloss.word}</b>
            {openGloss.meaning}
          </p>
          <button type="button" className="icon-button" aria-label="낱말 풀이 닫기" onClick={() => setOpenGloss(null)}>
            <Icon name="close" />
          </button>
        </div>
      )}
    </section>
  )
}

// 절을 기준선에 맞추는 scrollTop. 첫 절이면 맨 위로 간다.
function scrollTopFor(refs: Map<number, HTMLElement>, firstVerse: number | undefined, verse: number): number | null {
  if (verse === firstVerse) return 0
  const element = refs.get(verse)
  return element ? element.offsetTop - lineOffset + 1 : null
}
