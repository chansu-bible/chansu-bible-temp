import type { Verse } from '../content/types.ts'
import type { FontScale, Settings, Speed, Theme } from '../reader/settings.ts'
import Icon from './Icon.tsx'

type Props = {
  settings: Settings
  onChange: (partial: Partial<Settings>) => void
  // 그림 위 자막. ScenePane의 버튼과 같은 값이다.
  subtitles: boolean
  onToggleSubtitles: () => void
  // 글자 크기 미리 보기에 쓰는 지금 절
  verse: Verse | undefined
  onClose: () => void
}

const themeOptions: { value: Theme; label: string }[] = [
  { value: 'auto', label: '기기 따름' },
  { value: 'light', label: '밝게' },
  { value: 'dark', label: '어둡게' },
]

const speedOptions: { value: Speed; label: string }[] = [
  { value: 0.8, label: '느리게' },
  { value: 1, label: '보통' },
  { value: 1.2, label: '빠르게' },
]

// 읽기 설정 시트. 바꾸면 바로 반영되고 이 기기에 저장된다.
export default function SettingsSheet({ settings, onChange, subtitles, onToggleSubtitles, verse, onClose }: Props) {
  return (
    <div className="overlay sheet-backdrop" onClick={onClose}>
      <div
        className="sheet settings-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sheet-head">
          <h2 id="settings-title" className="sheet-title">
            읽기 설정
          </h2>
          <button type="button" className="icon-button" aria-label="읽기 설정 닫기" autoFocus onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>

        <section className="settings-group" aria-labelledby="settings-text">
          <h3 id="settings-text">글</h3>
          <label className="settings-row slider-row">
            <span>글자 크기</span>
            <span className="slider">
              <span className="slider-end small" aria-hidden="true">
                가
              </span>
              <input
                type="range"
                min={1}
                max={5}
                step={1}
                value={settings.fontScale}
                aria-valuetext={`5단계 중 ${settings.fontScale}단계`}
                onChange={(event) => onChange({ fontScale: Number(event.target.value) as FontScale })}
              />
              <span className="slider-end large" aria-hidden="true">
                가
              </span>
            </span>
          </label>
          {verse && (
            <p className="verse settings-preview" aria-label="글자 크기 미리 보기">
              <span className="verse-number">{verse.verse}</span>
              {verse.text}
            </p>
          )}
          <Segments
            legend="어두운 화면"
            name="theme"
            options={themeOptions}
            value={settings.theme}
            onChange={(theme) => onChange({ theme })}
          />
        </section>

        <section className="settings-group" aria-labelledby="settings-voice">
          <h3 id="settings-voice">낭독</h3>
          <Segments
            legend="속도"
            name="speed"
            options={speedOptions}
            value={settings.speed}
            onChange={(speed) => onChange({ speed })}
          />
          <Switch label="그림 위 자막" checked={subtitles} onChange={onToggleSubtitles} />
        </section>

        <section className="settings-group" aria-labelledby="settings-map">
          <h3 id="settings-map">그림과 지도</h3>
          <Switch
            label="장소가 바뀌면 지도 보여 주기"
            checked={settings.placeFlash}
            onChange={() => onChange({ placeFlash: !settings.placeFlash })}
          />
        </section>

        <p className="settings-note">
          본문은 개역한글(퍼블릭 도메인), 그림은 이 앱에서 만든 것. 설정은 이 기기에만 저장돼요.
        </p>
      </div>
    </div>
  )
}

function Segments<T extends string | number>({
  legend,
  name,
  options,
  value,
  onChange,
}: {
  legend: string
  name: string
  options: { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
}) {
  return (
    <div className="settings-row" role="radiogroup" aria-labelledby={`settings-${name}`}>
      <span id={`settings-${name}`}>{legend}</span>
      <span className="segments">
        {options.map((option) => (
          <label key={String(option.value)} className={option.value === value ? 'segment checked' : 'segment'}>
            <input
              type="radio"
              name={name}
              value={String(option.value)}
              checked={option.value === value}
              onChange={() => onChange(option.value)}
            />
            {option.label}
          </label>
        ))}
      </span>
    </div>
  )
}

function Switch({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <label className="settings-row switch-row">
      <span>{label}</span>
      <input type="checkbox" role="switch" className="switch" checked={checked} onChange={onChange} />
    </label>
  )
}
