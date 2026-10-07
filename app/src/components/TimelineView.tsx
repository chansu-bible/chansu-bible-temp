import type { CSSProperties } from 'react'
import type { Character, Era } from '../content/types.ts'
import type { Entity } from '../reader/names.ts'
import { timelineLayout } from '../reader/timeline.ts'

// 연표 그림 부분의 높이(px)
const plotHeight = 360

type Props = {
  characters: Character[]
  eras: Era[]
  // 지금 장면에 나오는 인물 id. 진한 색으로 그린다.
  sceneCharacters: string[]
  onOpenEntity: (entity: Entity) => void
}

// 세로 연표: 위에서 아래로 창조 원년부터 햇수가 흐르고, 인물마다 산 기간을 막대로 그린다.
export default function TimelineView({ characters, eras, sceneCharacters, onOpenEntity }: Props) {
  const layout = timelineLayout(characters, eras, { height: plotHeight })

  if (layout.bars.length === 0) {
    return <p className="empty timeline-empty">연표에 놓을 인물이 아직 없어요.</p>
  }

  return (
    <div className="timeline">
      <div className="timeline-grid" style={{ '--plot-height': `${plotHeight}px` } as CSSProperties}>
        {layout.ticks.map((tick) => (
          <div key={tick.year} className="timeline-tick" style={{ top: tick.top }} aria-hidden="true">
            <span>{tick.year}년</span>
          </div>
        ))}
        {layout.bands.map((band) => (
          <div
            key={band.id}
            className={band.flood ? 'timeline-band flood' : 'timeline-band'}
            style={{ top: band.top, height: band.height }}
            aria-hidden="true"
          >
            <span>
              {band.name} {band.from === band.to ? `${band.from}년` : `${band.from}~${band.to}년`}
            </span>
          </div>
        ))}

        {layout.bars.map((bar) => {
          const strong = sceneCharacters.includes(bar.id)
          const span = bar.died === null ? `${bar.born}년에 태어나 데려감` : `${bar.born}년 ~ ${bar.died}년`
          const open = () => onOpenEntity({ kind: 'character', id: bar.id })
          return (
            <div key={bar.id} className={strong ? 'timeline-column strong' : 'timeline-column'}>
              <div className="timeline-track">
                <button
                  type="button"
                  tabIndex={-1}
                  aria-hidden="true"
                  className={bar.open ? 'timeline-bar open' : 'timeline-bar'}
                  style={{ top: bar.top, height: bar.height }}
                  onClick={open}
                />
                {bar.open && (
                  <span className="timeline-taken" style={{ top: bar.top + bar.height }} aria-hidden="true">
                    데려감
                  </span>
                )}
              </div>
              <button
                type="button"
                className="timeline-name"
                aria-label={`${bar.name}, 창조 원년 기준 ${span}${strong ? ', 이 장면에 나와요' : ''}. 인물 카드 보기`}
                onClick={open}
              >
                {bar.name}
              </button>
            </div>
          )
        })}
      </div>
      <p className="timeline-note">창조 원년 기준. 5장의 나이를 더해 계산했고 번역·사본에 따라 다를 수 있어요.</p>
    </div>
  )
}
