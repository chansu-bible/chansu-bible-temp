import type { ReactNode } from 'react'
import Svg, { Circle, G, Path } from 'react-native-svg'

export type IconName =
  | 'map'
  | 'question'
  | 'close'
  | 'back'
  | 'play'
  | 'pause'
  | 'subtitles'
  | 'list'
  | 'gear'
  | 'person'
  | 'clock'
  | 'pin'
  | 'chevronDown'
  | 'plus'
  | 'minus'
  | 'home'
  | 'search'
  | 'flame'
  | 'note'
  | 'bookmark'
  | 'share'
  | 'timeline'
  | 'tree'
  | 'book'
  | 'check'
  | 'account'

// 웹 목업(app/src/components/Icon.tsx)과 같은 선 아이콘
const shapes: Record<IconName, ReactNode> = {
  map: (
    <>
      <Path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z" />
      <Path d="M9 4v14M15 6v14" />
    </>
  ),
  question: (
    <>
      <Path d="M9 9a3 3 0 1 1 4.5 2.6c-.9.6-1.5 1.2-1.5 2.4" />
      <Path d="M12 18h.01" />
    </>
  ),
  close: <Path d="M6 6l12 12M18 6 6 18" />,
  back: <Path d="M15 5l-7 7 7 7" />,
  play: <Path d="M8 5v14l11-7z" />,
  pause: <Path d="M9 5v14M15 5v14" />,
  subtitles: (
    <>
      <Path d="M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" />
      <Path d="M7 15h4M14 15h3M7 11h10" />
    </>
  ),
  list: <Path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" />,
  gear: (
    <>
      <Circle cx={12} cy={12} r={3} />
      <Path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </>
  ),
  person: (
    <>
      <Circle cx={12} cy={8} r={4} />
      <Path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
  clock: (
    <>
      <Circle cx={12} cy={12} r={9} />
      <Path d="M12 7v5l3 2" />
    </>
  ),
  pin: (
    <>
      <Path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z" />
      <Circle cx={12} cy={10} r={2.5} />
    </>
  ),
  chevronDown: <Path d="M6 9l6 6 6-6" />,
  plus: <Path d="M12 5v14M5 12h14" />,
  minus: <Path d="M5 12h14" />,
  home: <Path d="M3 11 12 4l9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />,
  search: (
    <>
      <Circle cx={11} cy={11} r={7} />
      <Path d="m20 20-3.5-3.5" />
    </>
  ),
  flame: <Path d="M12 2c1 4 5 6 5 11a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 1-3-1-6 1-10z" />,
  note: (
    <>
      <Path d="M5 4h11l3 3v13H5z" />
      <Path d="M8 10h8M8 14h5" />
    </>
  ),
  bookmark: <Path d="M6 4h12v17l-6-4-6 4z" />,
  share: (
    <>
      <Path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" />
      <Path d="M12 3v13M7 8l5-5 5 5" />
    </>
  ),
  timeline: <Path d="M4 12h16M8 6v12M16 6v12" />,
  tree: <Path d="M12 3v6M5 13V9h14v4M5 13v4M19 13v4M12 9v8" />,
  book: (
    <>
      <Path d="M4 5h6a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H4z" />
      <Path d="M20 5h-6a3 3 0 0 0-3 3v12a2 2 0 0 1 2-2h7z" />
    </>
  ),
  check: <Path d="M4 12l5 5L20 6" />,
  account: (
    <>
      <Circle cx={12} cy={12} r={9} />
      <Circle cx={12} cy={10} r={3} />
      <Path d="M6.5 18.5a6.5 6.5 0 0 1 11 0" />
    </>
  ),
}

// filled: 안을 칠한다(즐겨찾기, 불꽃)
export default function Icon({
  name,
  size = 22,
  color,
  filled = false,
}: {
  name: IconName
  size?: number
  color: string
  filled?: boolean
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <G fill={filled ? color : 'none'} stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        {shapes[name]}
      </G>
    </Svg>
  )
}
